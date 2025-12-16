const pool = require('../../config/database');
const logger = require('../../utils/logger');
const ProductCatalogService = require('../products/productCatalog.service');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

class QuoteGeneratorService {
  constructor(poolInstance = null) {
    this.pool = poolInstance || pool;
    this.productService = new ProductCatalogService(this.pool);
  }
  // ==================== QUOTE CREATION ====================

  /**
   * Create a new quote
   */
  async createQuote(quoteData) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const {
        company_id,
        lead_id,
        title,
        description,
        valid_until,
        items = [],
        discount_type = 'percentage', // 'percentage' or 'fixed'
        discount_value = 0,
        tax_rate = 0,
        notes = '',
        terms = '',
        price_list_id = null
      } = quoteData;

      // Calculate expiry date (default 30 days if not provided)
      const expiryDate = valid_until || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      // Generate unique quote number
      const quoteNumber = await this.generateQuoteNumber(company_id);

      // Create quote
      const quoteResult = await client.query(
        `INSERT INTO quotes (
          company_id, lead_id, quote_number, title, description,
          valid_until, discount_type, discount_value, tax_rate,
          notes, terms, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'draft')
        RETURNING *`,
        [
          company_id, lead_id, quoteNumber, title, description,
          expiryDate, discount_type, discount_value, tax_rate,
          notes, terms
        ]
      );

      const quote = quoteResult.rows[0];

      // Add quote items
      let subtotal = 0;
      for (const item of items) {
        const {
          product_id,
          variant_id = null,
          quantity,
          custom_unit_price = null,
          custom_description = null
        } = item;

        // Get product pricing
        const pricing = await this.productService.getProductPrice(
          product_id, 
          price_list_id, 
          variant_id
        );

        const unitPrice = custom_unit_price || pricing.final_price;
        const lineTotal = unitPrice * quantity;
        subtotal += lineTotal;

        // Get product details
        const product = await this.productService.getProductById(product_id);
        const description = custom_description || product.description;

        await client.query(
          `INSERT INTO quote_items (
            quote_id, product_id, variant_id, product_name,
            description, quantity, unit_price, line_total
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            quote.id, product_id, variant_id, product.name,
            description, quantity, unitPrice, lineTotal
          ]
        );
      }

      // Calculate total
      let discountAmount = 0;
      if (discount_type === 'percentage') {
        discountAmount = (subtotal * discount_value) / 100;
      } else {
        discountAmount = discount_value;
      }

      const afterDiscount = subtotal - discountAmount;
      const taxAmount = (afterDiscount * tax_rate) / 100;
      const total = afterDiscount + taxAmount;

      // Update quote with totals
      await client.query(
        `UPDATE quotes 
        SET subtotal = $1, discount_amount = $2, tax_amount = $3, total = $4
        WHERE id = $5`,
        [subtotal, discountAmount, taxAmount, total, quote.id]
      );

      await client.query('COMMIT');

      logger.info(`Quote created: ${quote.id} - ${quoteNumber}`);
      return await this.getQuoteById(quote.id);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error creating quote:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Generate unique quote number
   */
  async generateQuoteNumber(companyId) {
    const result = await pool.query(
      `SELECT quote_number FROM quotes 
      WHERE company_id = $1 
      ORDER BY created_at DESC 
      LIMIT 1`,
      [companyId]
    );

    const prefix = 'QT';
    const year = new Date().getFullYear();
    
    if (result.rows.length === 0) {
      return `${prefix}-${year}-00001`;
    }

    const lastNumber = result.rows[0].quote_number;
    const numberPart = parseInt(lastNumber.split('-').pop()) + 1;
    return `${prefix}-${year}-${numberPart.toString().padStart(5, '0')}`;
  }

  /**
   * Get quote by ID with all details
   */
  async getQuoteById(quoteId) {
    const quoteResult = await pool.query(
      `SELECT q.*,
        json_build_object(
          'id', l.id,
          'name', l.name,
          'email', l.email,
          'phone_number', l.phone_number,
          'company', l.company
        ) as lead,
        json_agg(
          json_build_object(
            'id', qi.id,
            'product_id', qi.product_id,
            'variant_id', qi.variant_id,
            'product_name', qi.product_name,
            'description', qi.description,
            'quantity', qi.quantity,
            'unit_price', qi.unit_price,
            'line_total', qi.line_total
          ) ORDER BY qi.created_at
        ) as items
      FROM quotes q
      LEFT JOIN leads l ON q.lead_id = l.id
      LEFT JOIN quote_items qi ON q.id = qi.quote_id
      WHERE q.id = $1
      GROUP BY q.id, l.id`,
      [quoteId]
    );

    if (quoteResult.rows.length === 0) {
      throw new Error('Quote not found');
    }

    return quoteResult.rows[0];
  }

  /**
   * Get all quotes with filters
   */
  async getQuotes(companyId, filters = {}) {
    const {
      status,
      lead_id,
      from_date,
      to_date,
      min_amount,
      max_amount,
      search,
      limit = 50,
      offset = 0
    } = filters;

    let query = `
      SELECT q.*,
        json_build_object(
          'id', l.id,
          'name', l.name,
          'email', l.email,
          'phone_number', l.phone_number
        ) as lead,
        (SELECT COUNT(*) FROM quote_items WHERE quote_id = q.id) as item_count
      FROM quotes q
      LEFT JOIN leads l ON q.lead_id = l.id
      WHERE q.company_id = $1
    `;
    const params = [companyId];
    let paramIndex = 2;

    if (status) {
      query += ` AND q.status = $${paramIndex++}`;
      params.push(status);
    }

    if (lead_id) {
      query += ` AND q.lead_id = $${paramIndex++}`;
      params.push(lead_id);
    }

    if (from_date) {
      query += ` AND q.created_at >= $${paramIndex++}`;
      params.push(from_date);
    }

    if (to_date) {
      query += ` AND q.created_at <= $${paramIndex++}`;
      params.push(to_date);
    }

    if (min_amount !== undefined) {
      query += ` AND q.total >= $${paramIndex++}`;
      params.push(min_amount);
    }

    if (max_amount !== undefined) {
      query += ` AND q.total <= $${paramIndex++}`;
      params.push(max_amount);
    }

    if (search) {
      query += ` AND (q.quote_number ILIKE $${paramIndex} OR q.title ILIKE $${paramIndex} OR l.name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY q.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Update quote
   */
  async updateQuote(quoteId, updateData) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { items, ...quoteFields } = updateData;

      // Update quote fields
      const updateFields = [];
      const params = [];
      let paramIndex = 1;

      Object.entries(quoteFields).forEach(([key, value]) => {
        if (value !== undefined && key !== 'id' && key !== 'quote_number' && key !== 'created_at') {
          updateFields.push(`${key} = $${paramIndex++}`);
          params.push(value);
        }
      });

      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

      if (updateFields.length > 0) {
        params.push(quoteId);
        await client.query(
          `UPDATE quotes SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`,
          params
        );
      }

      // Update items if provided
      if (items && Array.isArray(items)) {
        // Delete existing items
        await client.query(`DELETE FROM quote_items WHERE quote_id = $1`, [quoteId]);

        // Add new items
        let subtotal = 0;
        for (const item of items) {
          const lineTotal = item.unit_price * item.quantity;
          subtotal += lineTotal;

          await client.query(
            `INSERT INTO quote_items (
              quote_id, product_id, variant_id, product_name,
              description, quantity, unit_price, line_total
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              quoteId, item.product_id, item.variant_id, item.product_name,
              item.description, item.quantity, item.unit_price, lineTotal
            ]
          );
        }

        // Recalculate totals
        const quote = await pool.query(`SELECT * FROM quotes WHERE id = $1`, [quoteId]);
        const { discount_type, discount_value, tax_rate } = quote.rows[0];

        let discountAmount = 0;
        if (discount_type === 'percentage') {
          discountAmount = (subtotal * discount_value) / 100;
        } else {
          discountAmount = discount_value;
        }

        const afterDiscount = subtotal - discountAmount;
        const taxAmount = (afterDiscount * tax_rate) / 100;
        const total = afterDiscount + taxAmount;

        await client.query(
          `UPDATE quotes 
          SET subtotal = $1, discount_amount = $2, tax_amount = $3, total = $4
          WHERE id = $5`,
          [subtotal, discountAmount, taxAmount, total, quoteId]
        );
      }

      await client.query('COMMIT');
      return await this.getQuoteById(quoteId);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error updating quote:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // ==================== QUOTE ACTIONS ====================

  /**
   * Send quote to lead
   */
  async sendQuote(quoteId, sendOptions = {}) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const quote = await this.getQuoteById(quoteId);

      if (quote.status === 'draft') {
        // Change status to sent
        await client.query(
          `UPDATE quotes SET status = 'sent', sent_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [quoteId]
        );
      }

      // Generate PDF
      const pdfPath = await this.generateQuotePDF(quote);

      // Send via email/WhatsApp (integrate with your communication service)
      const { send_via = 'email' } = sendOptions;
      
      if (send_via === 'email' && quote.lead.email) {
        // await emailService.sendQuote(quote.lead.email, pdfPath);
        logger.info(`Quote sent via email to ${quote.lead.email}`);
      } else if (send_via === 'whatsapp' && quote.lead.phone_number) {
        // await whatsappService.sendQuotePDF(quote.lead.phone_number, pdfPath);
        logger.info(`Quote sent via WhatsApp to ${quote.lead.phone_number}`);
      }

      await client.query('COMMIT');

      return {
        success: true,
        message: 'Quote sent successfully',
        pdf_path: pdfPath
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error sending quote:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Accept quote
   */
  async acceptQuote(quoteId, acceptedBy = null) {
    const result = await pool.query(
      `UPDATE quotes 
      SET status = 'accepted', 
          accepted_at = CURRENT_TIMESTAMP,
          accepted_by = $2
      WHERE id = $1 AND status IN ('sent', 'viewed')
      RETURNING *`,
      [quoteId, acceptedBy]
    );

    if (result.rows.length === 0) {
      throw new Error('Quote not found or cannot be accepted');
    }

    logger.info(`Quote accepted: ${quoteId}`);
    
    // Trigger workflow to create invoice (optional)
    // await invoiceService.createFromQuote(quoteId);

    return result.rows[0];
  }

  /**
   * Reject quote
   */
  async rejectQuote(quoteId, rejectionReason = null) {
    const result = await pool.query(
      `UPDATE quotes 
      SET status = 'rejected', 
          rejected_at = CURRENT_TIMESTAMP,
          notes = CASE 
            WHEN $2 IS NOT NULL THEN COALESCE(notes, '') || E'\\n\\nRejection Reason: ' || $2
            ELSE notes
          END
      WHERE id = $1 AND status IN ('sent', 'viewed')
      RETURNING *`,
      [quoteId, rejectionReason]
    );

    if (result.rows.length === 0) {
      throw new Error('Quote not found or cannot be rejected');
    }

    logger.info(`Quote rejected: ${quoteId}`);
    return result.rows[0];
  }

  /**
   * Mark quote as viewed
   */
  async markAsViewed(quoteId) {
    await pool.query(
      `UPDATE quotes 
      SET status = 'viewed', viewed_at = CURRENT_TIMESTAMP 
      WHERE id = $1 AND status = 'sent'`,
      [quoteId]
    );
    return { success: true };
  }

  /**
   * Duplicate quote
   */
  async duplicateQuote(quoteId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const originalQuote = await this.getQuoteById(quoteId);

      // Create new quote
      const newQuoteNumber = await this.generateQuoteNumber(originalQuote.company_id);
      
      const newQuoteResult = await client.query(
        `INSERT INTO quotes (
          company_id, lead_id, quote_number, title, description,
          valid_until, discount_type, discount_value, tax_rate,
          notes, terms, status, subtotal, discount_amount, tax_amount, total
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'draft', $12, $13, $14, $15)
        RETURNING *`,
        [
          originalQuote.company_id,
          originalQuote.lead_id,
          newQuoteNumber,
          `${originalQuote.title} (Copy)`,
          originalQuote.description,
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
          originalQuote.discount_type,
          originalQuote.discount_value,
          originalQuote.tax_rate,
          originalQuote.notes,
          originalQuote.terms,
          originalQuote.subtotal,
          originalQuote.discount_amount,
          originalQuote.tax_amount,
          originalQuote.total
        ]
      );

      const newQuote = newQuoteResult.rows[0];

      // Copy items
      for (const item of originalQuote.items) {
        await client.query(
          `INSERT INTO quote_items (
            quote_id, product_id, variant_id, product_name,
            description, quantity, unit_price, line_total
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            newQuote.id,
            item.product_id,
            item.variant_id,
            item.product_name,
            item.description,
            item.quantity,
            item.unit_price,
            item.line_total
          ]
        );
      }

      await client.query('COMMIT');
      return await this.getQuoteById(newQuote.id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ==================== PDF GENERATION ====================

  /**
   * Generate PDF for quote
   */
  async generateQuotePDF(quote) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const filename = `quote_${quote.quote_number}.pdf`;
        const filepath = path.join(__dirname, '../../temp', filename);

        // Ensure temp directory exists
        if (!fs.existsSync(path.join(__dirname, '../../temp'))) {
          fs.mkdirSync(path.join(__dirname, '../../temp'), { recursive: true });
        }

        const stream = fs.createWriteStream(filepath);
        doc.pipe(stream);

        // Header
        doc.fontSize(24).text('QUOTATION', { align: 'center' });
        doc.moveDown();

        // Quote details
        doc.fontSize(10);
        doc.text(`Quote Number: ${quote.quote_number}`, { align: 'right' });
        doc.text(`Date: ${new Date(quote.created_at).toLocaleDateString()}`, { align: 'right' });
        doc.text(`Valid Until: ${new Date(quote.valid_until).toLocaleDateString()}`, { align: 'right' });
        doc.moveDown();

        // Lead details
        doc.fontSize(12).text('Bill To:', { underline: true });
        doc.fontSize(10);
        doc.text(quote.lead.name || 'N/A');
        if (quote.lead.company) doc.text(quote.lead.company);
        if (quote.lead.email) doc.text(quote.lead.email);
        if (quote.lead.phone_number) doc.text(quote.lead.phone_number);
        doc.moveDown();

        // Title and description
        if (quote.title) {
          doc.fontSize(14).text(quote.title, { underline: true });
          doc.moveDown(0.5);
        }
        if (quote.description) {
          doc.fontSize(10).text(quote.description);
          doc.moveDown();
        }

        // Items table
        const tableTop = doc.y;
        const itemCodeX = 50;
        const descriptionX = 150;
        const quantityX = 350;
        const priceX = 410;
        const amountX = 480;

        // Table header
        doc.fontSize(10).fillColor('#000000');
        doc.text('Item', itemCodeX, tableTop, { width: 90 });
        doc.text('Description', descriptionX, tableTop, { width: 180 });
        doc.text('Qty', quantityX, tableTop, { width: 50 });
        doc.text('Price', priceX, tableTop, { width: 60, align: 'right' });
        doc.text('Amount', amountX, tableTop, { width: 70, align: 'right' });

        doc.moveTo(itemCodeX, tableTop + 15).lineTo(550, tableTop + 15).stroke();

        let y = tableTop + 25;
        doc.fontSize(9);

        // Items
        quote.items.forEach((item, index) => {
          if (y > 700) {
            doc.addPage();
            y = 50;
          }

          doc.text(item.product_name, itemCodeX, y, { width: 90 });
          doc.text(item.description || '', descriptionX, y, { width: 180 });
          doc.text(item.quantity.toString(), quantityX, y, { width: 50 });
          doc.text(`₹${parseFloat(item.unit_price).toFixed(2)}`, priceX, y, { width: 60, align: 'right' });
          doc.text(`₹${parseFloat(item.line_total).toFixed(2)}`, amountX, y, { width: 70, align: 'right' });

          y += 30;
        });

        // Totals
        y += 20;
        doc.moveTo(350, y).lineTo(550, y).stroke();
        y += 10;

        doc.fontSize(10);
        doc.text('Subtotal:', 400, y);
        doc.text(`₹${parseFloat(quote.subtotal).toFixed(2)}`, 480, y, { width: 70, align: 'right' });
        y += 20;

        if (quote.discount_amount > 0) {
          doc.text(`Discount (${quote.discount_type === 'percentage' ? quote.discount_value + '%' : 'Fixed'}):`, 400, y);
          doc.text(`-₹${parseFloat(quote.discount_amount).toFixed(2)}`, 480, y, { width: 70, align: 'right' });
          y += 20;
        }

        if (quote.tax_amount > 0) {
          doc.text(`Tax (${quote.tax_rate}%):`, 400, y);
          doc.text(`₹${parseFloat(quote.tax_amount).toFixed(2)}`, 480, y, { width: 70, align: 'right' });
          y += 20;
        }

        doc.fontSize(12).fillColor('#000000');
        doc.text('Total:', 400, y);
        doc.text(`₹${parseFloat(quote.total).toFixed(2)}`, 480, y, { width: 70, align: 'right' });

        // Terms and Notes
        if (quote.terms || quote.notes) {
          doc.addPage();
          doc.fontSize(12).text('Terms & Conditions', { underline: true });
          doc.moveDown(0.5);
          doc.fontSize(9).text(quote.terms || 'N/A');
          doc.moveDown();

          if (quote.notes) {
            doc.fontSize(12).text('Notes', { underline: true });
            doc.moveDown(0.5);
            doc.fontSize(9).text(quote.notes);
          }
        }

        // Footer
        doc.fontSize(8).text(
          'This is a computer-generated quote and does not require a signature.',
          50,
          doc.page.height - 50,
          { align: 'center' }
        );

        doc.end();

        stream.on('finish', () => {
          resolve(filepath);
        });

        stream.on('error', (error) => {
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  // ==================== ANALYTICS ====================

  /**
   * Get quote analytics
   */
  async getQuoteAnalytics(companyId, fromDate, toDate) {
    const result = await pool.query(
      `SELECT 
        COUNT(*) as total_quotes,
        COUNT(CASE WHEN status = 'accepted' THEN 1 END) as accepted_quotes,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_quotes,
        COUNT(CASE WHEN status IN ('sent', 'viewed') THEN 1 END) as pending_quotes,
        SUM(CASE WHEN status = 'accepted' THEN total ELSE 0 END) as accepted_value,
        SUM(total) as total_value,
        AVG(total) as average_quote_value,
        AVG(CASE WHEN accepted_at IS NOT NULL THEN EXTRACT(EPOCH FROM (accepted_at - sent_at))/86400 END) as avg_acceptance_days
      FROM quotes
      WHERE company_id = $1 
        AND created_at >= $2 
        AND created_at <= $3`,
      [companyId, fromDate, toDate]
    );

    const stats = result.rows[0];
    const conversionRate = stats.total_quotes > 0 
      ? (stats.accepted_quotes / stats.total_quotes * 100).toFixed(2) 
      : 0;

    return {
      ...stats,
      conversion_rate: parseFloat(conversionRate),
      total_value: parseFloat(stats.total_value || 0),
      accepted_value: parseFloat(stats.accepted_value || 0),
      average_quote_value: parseFloat(stats.average_quote_value || 0)
    };
  }
}

module.exports = QuoteGeneratorService;