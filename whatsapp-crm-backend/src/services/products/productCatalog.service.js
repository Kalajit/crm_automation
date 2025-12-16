// const pool = require('../../config/database');
// const logger = require('../../utils/logger');

// class ProductCatalogService {
//   // ==================== PRODUCT MANAGEMENT ====================

//   /**
//    * Create a new product
//    */
//   async createProduct(productData) {
//     const client = await pool.connect();
//     try {
//       await client.query('BEGIN');

//       const {
//         company_id,
//         name,
//         description,
//         category,
//         base_price,
//         currency = 'INR',
//         sku,
//         track_inventory = false,
//         stock_quantity = 0,
//         low_stock_threshold = 10,
//         is_active = true,
//         tax_rate = 0,
//         images = [],
//         custom_fields = {},
//         variants = []
//       } = productData;

//       // Create main product
//       const productResult = await client.query(
//         `INSERT INTO products (
//           company_id, name, description, category, base_price, currency,
//           sku, track_inventory, stock_quantity, low_stock_threshold,
//           is_active, tax_rate, images, custom_fields
//         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
//         RETURNING *`,
//         [
//           company_id, name, description, category, base_price, currency,
//           sku, track_inventory, stock_quantity, low_stock_threshold,
//           is_active, tax_rate, JSON.stringify(images), JSON.stringify(custom_fields)
//         ]
//       );

//       const product = productResult.rows[0];

//       // Create product variants if provided
//       if (variants && variants.length > 0) {
//         for (const variant of variants) {
//           await client.query(
//             `INSERT INTO product_variants (
//               product_id, variant_name, sku, price_adjustment,
//               stock_quantity, is_active, custom_attributes
//             ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
//             [
//               product.id,
//               variant.name,
//               variant.sku,
//               variant.price_adjustment || 0,
//               variant.stock_quantity || 0,
//               variant.is_active !== false,
//               JSON.stringify(variant.attributes || {})
//             ]
//           );
//         }
//       }

//       // Create default price list entry
//       await client.query(
//         `INSERT INTO price_lists (company_id, name, is_default)
//         VALUES ($1, $2, true)
//         ON CONFLICT (company_id) WHERE is_default = true DO NOTHING`,
//         [company_id, 'Default Price List']
//       );

//       await client.query('COMMIT');

//       logger.info(`Product created: ${product.id}`);
//       return await this.getProductById(product.id);
//     } catch (error) {
//       await client.query('ROLLBACK');
//       logger.error('Error creating product:', error);
//       throw error;
//     } finally {
//       client.release();
//     }
//   }

//   /**
//    * Get product by ID with variants and pricing
//    */
//   async getProductById(productId) {
//     const productResult = await pool.query(
//       `SELECT p.*, 
//         json_agg(
//           json_build_object(
//             'id', pv.id,
//             'variant_name', pv.variant_name,
//             'sku', pv.sku,
//             'price_adjustment', pv.price_adjustment,
//             'stock_quantity', pv.stock_quantity,
//             'is_active', pv.is_active,
//             'custom_attributes', pv.custom_attributes
//           )
//         ) FILTER (WHERE pv.id IS NOT NULL) as variants
//       FROM products p
//       LEFT JOIN product_variants pv ON p.id = pv.product_id AND pv.is_active = true
//       WHERE p.id = $1
//       GROUP BY p.id`,
//       [productId]
//     );

//     if (productResult.rows.length === 0) {
//       throw new Error('Product not found');
//     }

//     return productResult.rows[0];
//   }

//   /**
//    * Get all products for a company
//    */
//   async getProducts(companyId, filters = {}) {
//     const { 
//       category, 
//       is_active, 
//       search, 
//       min_price, 
//       max_price,
//       in_stock_only = false,
//       limit = 50,
//       offset = 0 
//     } = filters;

//     let query = `
//       SELECT p.*, 
//         COUNT(pv.id) as variant_count,
//         CASE WHEN p.track_inventory THEN p.stock_quantity ELSE NULL END as available_stock
//       FROM products p
//       LEFT JOIN product_variants pv ON p.id = pv.product_id AND pv.is_active = true
//       WHERE p.company_id = $1
//     `;
//     const params = [companyId];
//     let paramIndex = 2;

//     if (category) {
//       query += ` AND p.category = $${paramIndex++}`;
//       params.push(category);
//     }

//     if (is_active !== undefined) {
//       query += ` AND p.is_active = $${paramIndex++}`;
//       params.push(is_active);
//     }

//     if (search) {
//       query += ` AND (p.name ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex} OR p.sku ILIKE $${paramIndex})`;
//       params.push(`%${search}%`);
//       paramIndex++;
//     }

//     if (min_price !== undefined) {
//       query += ` AND p.base_price >= $${paramIndex++}`;
//       params.push(min_price);
//     }

//     if (max_price !== undefined) {
//       query += ` AND p.base_price <= $${paramIndex++}`;
//       params.push(max_price);
//     }

//     if (in_stock_only) {
//       query += ` AND (p.track_inventory = false OR p.stock_quantity > 0)`;
//     }

//     query += ` GROUP BY p.id ORDER BY p.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
//     params.push(limit, offset);

//     const result = await pool.query(query, params);
//     return result.rows;
//   }

//   /**
//    * Update product
//    */
//   async updateProduct(productId, updateData) {
//     const client = await pool.connect();
//     try {
//       await client.query('BEGIN');

//       const { variants, ...productFields } = updateData;

//       // Build dynamic UPDATE query
//       const updateFields = [];
//       const params = [];
//       let paramIndex = 1;

//       Object.entries(productFields).forEach(([key, value]) => {
//         if (value !== undefined && key !== 'id' && key !== 'created_at') {
//           if (key === 'images' || key === 'custom_fields') {
//             updateFields.push(`${key} = $${paramIndex++}`);
//             params.push(JSON.stringify(value));
//           } else {
//             updateFields.push(`${key} = $${paramIndex++}`);
//             params.push(value);
//           }
//         }
//       });

//       updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

//       if (updateFields.length > 0) {
//         params.push(productId);
//         const updateQuery = `
//           UPDATE products 
//           SET ${updateFields.join(', ')}
//           WHERE id = $${paramIndex}
//           RETURNING *
//         `;
//         await client.query(updateQuery, params);
//       }

//       // Update variants if provided
//       if (variants && Array.isArray(variants)) {
//         for (const variant of variants) {
//           if (variant.id) {
//             // Update existing variant
//             await client.query(
//               `UPDATE product_variants 
//               SET variant_name = $1, sku = $2, price_adjustment = $3,
//                   stock_quantity = $4, is_active = $5, custom_attributes = $6,
//                   updated_at = CURRENT_TIMESTAMP
//               WHERE id = $7 AND product_id = $8`,
//               [
//                 variant.name,
//                 variant.sku,
//                 variant.price_adjustment || 0,
//                 variant.stock_quantity || 0,
//                 variant.is_active !== false,
//                 JSON.stringify(variant.attributes || {}),
//                 variant.id,
//                 productId
//               ]
//             );
//           } else {
//             // Create new variant
//             await client.query(
//               `INSERT INTO product_variants (
//                 product_id, variant_name, sku, price_adjustment,
//                 stock_quantity, is_active, custom_attributes
//               ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
//               [
//                 productId,
//                 variant.name,
//                 variant.sku,
//                 variant.price_adjustment || 0,
//                 variant.stock_quantity || 0,
//                 variant.is_active !== false,
//                 JSON.stringify(variant.attributes || {})
//               ]
//             );
//           }
//         }
//       }

//       await client.query('COMMIT');
//       return await this.getProductById(productId);
//     } catch (error) {
//       await client.query('ROLLBACK');
//       logger.error('Error updating product:', error);
//       throw error;
//     } finally {
//       client.release();
//     }
//   }

//   /**
//    * Delete product (soft delete)
//    */
//   async deleteProduct(productId) {
//     await pool.query(
//       `UPDATE products SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
//       [productId]
//     );
//     logger.info(`Product soft deleted: ${productId}`);
//     return { success: true, message: 'Product deactivated' };
//   }

//   // ==================== INVENTORY MANAGEMENT ====================

//   /**
//    * Update stock quantity
//    */
//   async updateStock(productId, variantId = null, quantity, operation = 'set') {
//     const client = await pool.connect();
//     try {
//       await client.query('BEGIN');

//       if (variantId) {
//         // Update variant stock
//         let stockQuery;
//         if (operation === 'set') {
//           stockQuery = `UPDATE product_variants SET stock_quantity = $1 WHERE id = $2`;
//         } else if (operation === 'add') {
//           stockQuery = `UPDATE product_variants SET stock_quantity = stock_quantity + $1 WHERE id = $2`;
//         } else if (operation === 'subtract') {
//           stockQuery = `UPDATE product_variants SET stock_quantity = GREATEST(0, stock_quantity - $1) WHERE id = $2`;
//         }
//         await client.query(stockQuery, [quantity, variantId]);
//       } else {
//         // Update main product stock
//         let stockQuery;
//         if (operation === 'set') {
//           stockQuery = `UPDATE products SET stock_quantity = $1 WHERE id = $2`;
//         } else if (operation === 'add') {
//           stockQuery = `UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2`;
//         } else if (operation === 'subtract') {
//           stockQuery = `UPDATE products SET stock_quantity = GREATEST(0, stock_quantity - $1) WHERE id = $2`;
//         }
//         await client.query(stockQuery, [quantity, productId]);
//       }

//       // Log inventory change
//       await client.query(
//         `INSERT INTO inventory_logs (product_id, variant_id, quantity_change, operation, created_at)
//         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
//         [productId, variantId, quantity, operation]
//       );

//       await client.query('COMMIT');
      
//       // Check low stock alert
//       await this.checkLowStockAlert(productId, variantId);

//       return { success: true, message: 'Stock updated' };
//     } catch (error) {
//       await client.query('ROLLBACK');
//       logger.error('Error updating stock:', error);
//       throw error;
//     } finally {
//       client.release();
//     }
//   }

//   /**
//    * Check and trigger low stock alert
//    */
//   async checkLowStockAlert(productId, variantId = null) {
//     let stockCheck;
//     if (variantId) {
//       stockCheck = await pool.query(
//         `SELECT pv.stock_quantity, p.low_stock_threshold, p.name, pv.variant_name
//         FROM product_variants pv
//         JOIN products p ON pv.product_id = p.id
//         WHERE pv.id = $1 AND p.track_inventory = true`,
//         [variantId]
//       );
//     } else {
//       stockCheck = await pool.query(
//         `SELECT stock_quantity, low_stock_threshold, name
//         FROM products
//         WHERE id = $1 AND track_inventory = true`,
//         [productId]
//       );
//     }

//     if (stockCheck.rows.length > 0) {
//       const { stock_quantity, low_stock_threshold, name, variant_name } = stockCheck.rows[0];
//       if (stock_quantity <= low_stock_threshold) {
//         logger.warn(`Low stock alert: ${name}${variant_name ? ` (${variant_name})` : ''} - ${stock_quantity} remaining`);
//         // Trigger notification (integrate with your notification system)
//         // await notificationService.sendLowStockAlert(productId, variantId);
//       }
//     }
//   }

//   /**
//    * Get inventory report
//    */
//   async getInventoryReport(companyId) {
//     const result = await pool.query(
//       `SELECT 
//         p.id,
//         p.name,
//         p.sku,
//         p.category,
//         p.stock_quantity as main_stock,
//         p.low_stock_threshold,
//         CASE 
//           WHEN p.stock_quantity <= p.low_stock_threshold THEN 'low'
//           WHEN p.stock_quantity = 0 THEN 'out_of_stock'
//           ELSE 'in_stock'
//         END as stock_status,
//         json_agg(
//           json_build_object(
//             'variant_id', pv.id,
//             'variant_name', pv.variant_name,
//             'sku', pv.sku,
//             'stock_quantity', pv.stock_quantity
//           )
//         ) FILTER (WHERE pv.id IS NOT NULL) as variants
//       FROM products p
//       LEFT JOIN product_variants pv ON p.id = pv.product_id
//       WHERE p.company_id = $1 AND p.track_inventory = true
//       GROUP BY p.id
//       ORDER BY 
//         CASE 
//           WHEN p.stock_quantity = 0 THEN 1
//           WHEN p.stock_quantity <= p.low_stock_threshold THEN 2
//           ELSE 3
//         END,
//         p.name`,
//       [companyId]
//     );

//     return result.rows;
//   }

//   // ==================== PRICE MANAGEMENT ====================

//   /**
//    * Create price list
//    */
//   async createPriceList(companyId, name, description = null, isDefault = false) {
//     const result = await pool.query(
//       `INSERT INTO price_lists (company_id, name, description, is_default)
//       VALUES ($1, $2, $3, $4)
//       RETURNING *`,
//       [companyId, name, description, isDefault]
//     );
//     return result.rows[0];
//   }

//   /**
//    * Add product to price list with custom pricing
//    */
//   async addProductToPriceList(priceListId, productId, customPrice, discountPercent = 0) {
//     const result = await pool.query(
//       `INSERT INTO price_list_items (price_list_id, product_id, custom_price, discount_percent)
//       VALUES ($1, $2, $3, $4)
//       ON CONFLICT (price_list_id, product_id) 
//       DO UPDATE SET custom_price = $3, discount_percent = $4, updated_at = CURRENT_TIMESTAMP
//       RETURNING *`,
//       [priceListId, productId, customPrice, discountPercent]
//     );
//     return result.rows[0];
//   }

//   /**
//    * Get price for product (considering price lists)
//    */
//   async getProductPrice(productId, priceListId = null, variantId = null) {
//     let query;
//     let params;

//     if (variantId) {
//       query = `
//         SELECT 
//           p.base_price + COALESCE(pv.price_adjustment, 0) as base_price,
//           pli.custom_price,
//           pli.discount_percent,
//           p.currency,
//           p.tax_rate
//         FROM products p
//         LEFT JOIN product_variants pv ON pv.id = $2
//         LEFT JOIN price_list_items pli ON pli.product_id = p.id AND pli.price_list_id = $3
//         WHERE p.id = $1
//       `;
//       params = [productId, variantId, priceListId];
//     } else {
//       query = `
//         SELECT 
//           p.base_price,
//           pli.custom_price,
//           pli.discount_percent,
//           p.currency,
//           p.tax_rate
//         FROM products p
//         LEFT JOIN price_list_items pli ON pli.product_id = p.id AND pli.price_list_id = $2
//         WHERE p.id = $1
//       `;
//       params = [productId, priceListId];
//     }

//     const result = await pool.query(query, params);

//     if (result.rows.length === 0) {
//       throw new Error('Product not found');
//     }

//     const { base_price, custom_price, discount_percent, currency, tax_rate } = result.rows[0];

//     const finalPrice = custom_price || base_price;
//     const discountedPrice = finalPrice * (1 - (discount_percent || 0) / 100);
//     const priceWithTax = discountedPrice * (1 + (tax_rate || 0) / 100);

//     return {
//       base_price: parseFloat(base_price),
//       final_price: parseFloat(finalPrice),
//       discounted_price: parseFloat(discountedPrice.toFixed(2)),
//       price_with_tax: parseFloat(priceWithTax.toFixed(2)),
//       discount_percent: parseFloat(discount_percent || 0),
//       tax_rate: parseFloat(tax_rate || 0),
//       currency
//     };
//   }

//   // ==================== CATEGORIES ====================

//   /**
//    * Get product categories with counts
//    */
//   async getCategories(companyId) {
//     const result = await pool.query(
//       `SELECT 
//         category,
//         COUNT(*) as product_count,
//         SUM(CASE WHEN is_active THEN 1 ELSE 0 END) as active_count
//       FROM products
//       WHERE company_id = $1
//       GROUP BY category
//       ORDER BY product_count DESC`,
//       [companyId]
//     );
//     return result.rows;
//   }

//   // ==================== BULK OPERATIONS ====================

//   /**
//    * Bulk update prices
//    */
//   async bulkUpdatePrices(productIds, priceChange, isPercentage = false) {
//     const client = await pool.connect();
//     try {
//       await client.query('BEGIN');

//       for (const productId of productIds) {
//         let updateQuery;
//         if (isPercentage) {
//           updateQuery = `UPDATE products SET base_price = base_price * (1 + $1/100) WHERE id = $2`;
//         } else {
//           updateQuery = `UPDATE products SET base_price = base_price + $1 WHERE id = $2`;
//         }
//         await client.query(updateQuery, [priceChange, productId]);
//       }

//       await client.query('COMMIT');
//       return { success: true, updated: productIds.length };
//     } catch (error) {
//       await client.query('ROLLBACK');
//       throw error;
//     } finally {
//       client.release();
//     }
//   }
// }

// module.exports = new ProductCatalogService();







const pool = require('../../config/database');
// const logger = require('../../utils/logger');
const { logger } = require('../../utils/logger');

class ProductCatalogService {
  constructor(poolInstance = null) {
    this.pool = poolInstance || pool;
  }

  // ==================== PRODUCT MANAGEMENT ====================

  /**
   * Create a new product
   */
  async createProduct(productData) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const {
        company_id,
        name,
        description,
        category,
        base_price,
        currency = 'INR',
        sku,
        track_inventory = false,
        stock_quantity = 0,
        low_stock_threshold = 10,
        is_active = true,
        tax_rate = 0,
        images = [],
        custom_fields = {},
        variants = []
      } = productData;

      

      // Create main product
      const productResult = await client.query(
        `INSERT INTO products (
          company_id, name, description, category, base_price, currency,
          sku, track_inventory, stock_quantity, low_stock_threshold,
          is_active, tax_rate, images, custom_fields
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *`,
        [
          company_id, name, description, category, base_price, currency,
          sku, track_inventory, stock_quantity, low_stock_threshold,
          is_active, tax_rate, JSON.stringify(images), JSON.stringify(custom_fields)
        ]
      );

      const product = productResult.rows[0];

      // Create product variants if provided
      if (variants && variants.length > 0) {
        for (const variant of variants) {
          await client.query(
            `INSERT INTO product_variants (
              product_id, variant_name, sku, price_adjustment,
              stock_quantity, is_active, custom_attributes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              product.id,
              variant.name,
              variant.sku,
              variant.price_adjustment || 0,
              variant.stock_quantity || 0,
              variant.is_active !== false,
              JSON.stringify(variant.attributes || {})
            ]
          );
        }
      }

      // // Create default price list entry
      // await client.query(
      //   `INSERT INTO price_lists (company_id, name, is_default)
      //   VALUES ($1, $2, true)
      //   ON CONFLICT (company_id) WHERE is_default = true DO NOTHING`,
      //   [company_id, 'Default Price List']
      // );

      // Create default price list entry (if not exists)
      const priceListCheck = await client.query(
        `SELECT id FROM price_lists WHERE company_id = $1 AND is_default = true LIMIT 1`,
        [company_id]
      );

      if (priceListCheck.rows.length === 0) {
        await client.query(
          `INSERT INTO price_lists (company_id, name, is_default)
          VALUES ($1, $2, true)`,
          [company_id, 'Default Price List']
        );
      }

      await client.query('COMMIT');

      logger.info(`Product created: ${product.id}`);
      return await this.getProductById(product.id);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error creating product:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get product by ID with variants and pricing
   */
  async getProductById(productId) {
    const productResult = await this.pool.query(
      `SELECT p.*, 
        json_agg(
          json_build_object(
            'id', pv.id,
            'variant_name', pv.variant_name,
            'sku', pv.sku,
            'price_adjustment', pv.price_adjustment,
            'stock_quantity', pv.stock_quantity,
            'is_active', pv.is_active,
            'custom_attributes', pv.custom_attributes
          )
        ) FILTER (WHERE pv.id IS NOT NULL) as variants
      FROM products p
      LEFT JOIN product_variants pv ON p.id = pv.product_id AND pv.is_active = true
      WHERE p.id = $1
      GROUP BY p.id`,
      [productId]
    );

    if (productResult.rows.length === 0) {
      throw new Error('Product not found');
    }

    return productResult.rows[0];
  }

  /**
   * Get all products for a company
   */
  async getProducts(companyId, filters = {}) {
    const { 
      category, 
      is_active, 
      search, 
      min_price, 
      max_price,
      in_stock_only = false,
      limit = 50,
      offset = 0 
    } = filters;

    let query = `
      SELECT p.*, 
        COUNT(pv.id) as variant_count,
        CASE WHEN p.track_inventory THEN p.stock_quantity ELSE NULL END as available_stock
      FROM products p
      LEFT JOIN product_variants pv ON p.id = pv.product_id AND pv.is_active = true
      WHERE p.company_id = $1
    `;
    const params = [companyId];
    let paramIndex = 2;

    if (category) {
      query += ` AND p.category = $${paramIndex++}`;
      params.push(category);
    }

    if (is_active !== undefined) {
      query += ` AND p.is_active = $${paramIndex++}`;
      params.push(is_active);
    }

    if (search) {
      query += ` AND (p.name ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex} OR p.sku ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (min_price !== undefined) {
      query += ` AND p.base_price >= $${paramIndex++}`;
      params.push(min_price);
    }

    if (max_price !== undefined) {
      query += ` AND p.base_price <= $${paramIndex++}`;
      params.push(max_price);
    }

    if (in_stock_only) {
      query += ` AND (p.track_inventory = false OR p.stock_quantity > 0)`;
    }

    query += ` GROUP BY p.id ORDER BY p.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Update product
   */
  async updateProduct(productId, updateData) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { variants, ...productFields } = updateData;

      // Build dynamic UPDATE query
      const updateFields = [];
      const params = [];
      let paramIndex = 1;

      Object.entries(productFields).forEach(([key, value]) => {
        if (value !== undefined && key !== 'id' && key !== 'created_at') {
          if (key === 'images' || key === 'custom_fields') {
            updateFields.push(`${key} = $${paramIndex++}`);
            params.push(JSON.stringify(value));
          } else {
            updateFields.push(`${key} = $${paramIndex++}`);
            params.push(value);
          }
        }
      });

      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

      if (updateFields.length > 0) {
        params.push(productId);
        const updateQuery = `
          UPDATE products 
          SET ${updateFields.join(', ')}
          WHERE id = $${paramIndex}
          RETURNING *
        `;
        await client.query(updateQuery, params);
      }

      // Update variants if provided
      if (variants && Array.isArray(variants)) {
        for (const variant of variants) {
          if (variant.id) {
            // Update existing variant
            await client.query(
              `UPDATE product_variants 
              SET variant_name = $1, sku = $2, price_adjustment = $3,
                  stock_quantity = $4, is_active = $5, custom_attributes = $6,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = $7 AND product_id = $8`,
              [
                variant.name,
                variant.sku,
                variant.price_adjustment || 0,
                variant.stock_quantity || 0,
                variant.is_active !== false,
                JSON.stringify(variant.attributes || {}),
                variant.id,
                productId
              ]
            );
          } else {
            // Create new variant
            await client.query(
              `INSERT INTO product_variants (
                product_id, variant_name, sku, price_adjustment,
                stock_quantity, is_active, custom_attributes
              ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [
                productId,
                variant.name,
                variant.sku,
                variant.price_adjustment || 0,
                variant.stock_quantity || 0,
                variant.is_active !== false,
                JSON.stringify(variant.attributes || {})
              ]
            );
          }
        }
      }

      await client.query('COMMIT');
      return await this.getProductById(productId);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error updating product:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete product (soft delete)
   */
  async deleteProduct(productId) {
    await this.pool.query(
      `UPDATE products SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [productId]
    );
    logger.info(`Product soft deleted: ${productId}`);
    return { success: true, message: 'Product deactivated' };
  }

  // ==================== INVENTORY MANAGEMENT ====================

  /**
   * Update stock quantity
   */
  async updateStock(productId, variantId = null, quantity, operation = 'set') {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      if (variantId) {
        // Update variant stock
        let stockQuery;
        if (operation === 'set') {
          stockQuery = `UPDATE product_variants SET stock_quantity = $1 WHERE id = $2`;
        } else if (operation === 'add') {
          stockQuery = `UPDATE product_variants SET stock_quantity = stock_quantity + $1 WHERE id = $2`;
        } else if (operation === 'subtract') {
          stockQuery = `UPDATE product_variants SET stock_quantity = GREATEST(0, stock_quantity - $1) WHERE id = $2`;
        }
        await client.query(stockQuery, [quantity, variantId]);
      } else {
        // Update main product stock
        let stockQuery;
        if (operation === 'set') {
          stockQuery = `UPDATE products SET stock_quantity = $1 WHERE id = $2`;
        } else if (operation === 'add') {
          stockQuery = `UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2`;
        } else if (operation === 'subtract') {
          stockQuery = `UPDATE products SET stock_quantity = GREATEST(0, stock_quantity - $1) WHERE id = $2`;
        }
        await client.query(stockQuery, [quantity, productId]);
      }

      // Log inventory change
      await client.query(
        `INSERT INTO inventory_logs (product_id, variant_id, quantity_change, operation, created_at)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
        [productId, variantId, quantity, operation]
      );

      await client.query('COMMIT');
      
      // Check low stock alert
      await this.checkLowStockAlert(productId, variantId);

      return { success: true, message: 'Stock updated' };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error updating stock:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check and trigger low stock alert
   */
  async checkLowStockAlert(productId, variantId = null) {
    let stockCheck;
    if (variantId) {
      stockCheck = await this.pool.query(
        `SELECT pv.stock_quantity, p.low_stock_threshold, p.name, pv.variant_name
        FROM product_variants pv
        JOIN products p ON pv.product_id = p.id
        WHERE pv.id = $1 AND p.track_inventory = true`,
        [variantId]
      );
    } else {
      stockCheck = await this.pool.query(
        `SELECT stock_quantity, low_stock_threshold, name
        FROM products
        WHERE id = $1 AND track_inventory = true`,
        [productId]
      );
    }

    if (stockCheck.rows.length > 0) {
      const { stock_quantity, low_stock_threshold, name, variant_name } = stockCheck.rows[0];
      if (stock_quantity <= low_stock_threshold) {
        logger.warn(`Low stock alert: ${name}${variant_name ? ` (${variant_name})` : ''} - ${stock_quantity} remaining`);
      }
    }
  }

  /**
   * Get inventory report
   */
  async getInventoryReport(companyId) {
    const result = await this.pool.query(
      `SELECT 
        p.id,
        p.name,
        p.sku,
        p.category,
        p.stock_quantity as main_stock,
        p.low_stock_threshold,
        CASE 
          WHEN p.stock_quantity <= p.low_stock_threshold THEN 'low'
          WHEN p.stock_quantity = 0 THEN 'out_of_stock'
          ELSE 'in_stock'
        END as stock_status,
        json_agg(
          json_build_object(
            'variant_id', pv.id,
            'variant_name', pv.variant_name,
            'sku', pv.sku,
            'stock_quantity', pv.stock_quantity
          )
        ) FILTER (WHERE pv.id IS NOT NULL) as variants
      FROM products p
      LEFT JOIN product_variants pv ON p.id = pv.product_id
      WHERE p.company_id = $1 AND p.track_inventory = true
      GROUP BY p.id
      ORDER BY 
        CASE 
          WHEN p.stock_quantity = 0 THEN 1
          WHEN p.stock_quantity <= p.low_stock_threshold THEN 2
          ELSE 3
        END,
        p.name`,
      [companyId]
    );

    return result.rows;
  }

  /**
   * Set stock alert threshold
   */
  async setStockAlert(productId, variantId=null, threshold) {
    if (variantId) {
      await this.pool.query(
        `UPDATE product_variants SET low_stock_threshold = $1 WHERE id = $2`,
        [threshold, variantId]
      );
    } else {
      await this.pool.query(
        `UPDATE products SET low_stock_threshold = $1 WHERE id = $2`,
        [threshold, productId]
      );
    }
    return { success: true, message: 'Stock alert threshold updated' };
  }

  // ==================== PRICE MANAGEMENT ====================


  /**
   * Create price list
   */
  async createPriceList(companyId, name, description = null, isDefault = false) {
    const result = await this.pool.query(
      `INSERT INTO price_lists (company_id, name, description, is_default)
      VALUES ($1, $2, $3, $4)
      RETURNING *`,
      [companyId, name, description, isDefault]
    );
    return result.rows[0];
  }

  /**
   * Add product to price list with custom pricing
   */
  async addProductToPriceList(priceListId, productId, customPrice, discountPercent = 0) {
    const result = await this.pool.query(
      `INSERT INTO price_list_items (price_list_id, product_id, custom_price, discount_percent)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (price_list_id, product_id) 
      DO UPDATE SET custom_price = $3, discount_percent = $4, updated_at = CURRENT_TIMESTAMP
      RETURNING *`,
      [priceListId, productId, customPrice, discountPercent]
    );
    return result.rows[0];
  }

  /**
   * Get price for product (considering price lists)
   */
  async getProductPrice(productId, priceListId = null, variantId = null) {
    let query;
    let params;

    if (variantId) {
      query = `
        SELECT 
          p.base_price + COALESCE(pv.price_adjustment, 0) as base_price,
          pli.custom_price,
          pli.discount_percent,
          p.currency,
          p.tax_rate
        FROM products p
        LEFT JOIN product_variants pv ON pv.id = $2
        LEFT JOIN price_list_items pli ON pli.product_id = p.id AND pli.price_list_id = $3
        WHERE p.id = $1
      `;
      params = [productId, variantId, priceListId];
    } else {
      query = `
        SELECT 
          p.base_price,
          pli.custom_price,
          pli.discount_percent,
          p.currency,
          p.tax_rate
        FROM products p
        LEFT JOIN price_list_items pli ON pli.product_id = p.id AND pli.price_list_id = $2
        WHERE p.id = $1
      `;
      params = [productId, priceListId];
    }

    const result = await this.pool.query(query, params);

    if (result.rows.length === 0) {
      throw new Error('Product not found');
    }

    const { base_price, custom_price, discount_percent, currency, tax_rate } = result.rows[0];

    const finalPrice = custom_price || base_price;
    const discountedPrice = finalPrice * (1 - (discount_percent || 0) / 100);
    const priceWithTax = discountedPrice * (1 + (tax_rate || 0) / 100);

    return {
      base_price: parseFloat(base_price),
      final_price: parseFloat(finalPrice),
      discounted_price: parseFloat(discountedPrice.toFixed(2)),
      price_with_tax: parseFloat(priceWithTax.toFixed(2)),
      discount_percent: parseFloat(discount_percent || 0),
      tax_rate: parseFloat(tax_rate || 0),
      currency
    };
  }

  // ==================== CATEGORIES ====================

  /**
   * Get product categories with counts
   */
  async getCategories(companyId) {
    const result = await this.pool.query(
      `SELECT 
        category,
        COUNT(*) as product_count,
        SUM(CASE WHEN is_active THEN 1 ELSE 0 END) as active_count
      FROM products
      WHERE company_id = $1 
      GROUP BY category
      ORDER BY product_count DESC`,
      [companyId]
    );
    return result.rows;
  }

  /**
   * Create category
   */
  async createCategory(companyId, categoryData) {
    const { category_name, description } = categoryData;
    
    // Note: This assumes you have a categories table
    // If not, categories are just stored as strings in products table
    return {
      category_name,
      description,
      company_id: companyId,
      created_at: new Date(),
      message: 'Category stored (using product category field)'
    };
  }

  // ==================== VARIANTS ====================

  /**
   * Add variant to product
   */
  async addVariant(productId, variantData) {
    const result = await this.pool.query(
      `INSERT INTO product_variants (
        product_id, variant_name, sku, price_adjustment,
        stock_quantity, is_active, custom_attributes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        productId,
        variantData.variant_name,
        variantData.sku,
        variantData.price_adjustment || 0,
        variantData.stock_quantity || 0,
        variantData.is_active !== false,
        JSON.stringify(variantData.custom_attributes || {})
      ]
    );
    
    return result.rows[0];
  }

  /**
   * Update variant
   */
  async updateVariant(productId, variantId, variantData) {
    const result = await this.pool.query(
      `UPDATE product_variants 
       SET variant_name = $1, sku = $2, price_adjustment = $3,
           stock_quantity = $4, is_active = $5, custom_attributes = $6,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7 AND product_id = $8
       RETURNING *`,
      [
        variantData.variant_name,
        variantData.sku,
        variantData.price_adjustment || 0,
        variantData.stock_quantity || 0,
        variantData.is_active !== false,
        JSON.stringify(variantData.custom_attributes || {}),
        variantId,
        productId
      ]
    );

    if (result.rows.length === 0) {
      throw new Error('Variant not found');
    }

    return result.rows[0];
  }

  /**
   * Delete variant
   */
  async deleteVariant(productId, variantId) {
    const result = await this.pool.query(
      `UPDATE product_variants 
       SET is_active = false, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND product_id = $2
       RETURNING *`,
      [variantId, productId]
    );

    if (result.rows.length === 0) {
      throw new Error('Variant not found');
    }

    return { success: true, message: 'Variant deleted' };
  }

  // ==================== BULK OPERATIONS ====================

  /**
   * Bulk update prices
   */
  async bulkUpdatePrices(productIds, priceChange, isPercentage = false) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const productId of productIds) {
        let updateQuery;
        if (isPercentage) {
          updateQuery = `UPDATE products SET base_price = base_price * (1 + $1/100) WHERE id = $2`;
        } else {
          updateQuery = `UPDATE products SET base_price = base_price + $1 WHERE id = $2`;
        }
        await client.query(updateQuery, [priceChange, productId]);
      }

      await client.query('COMMIT');
      return { success: true, updated: productIds.length };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Bulk update stock
   */
  async bulkUpdateStock(updates) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const update of updates) {
        const { product_id, variant_id, quantity, operation = 'set' } = update;
        await this.updateStock(product_id, variant_id, quantity, operation);
      }

      await client.query('COMMIT');
      return { success: true, updated: updates.length };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Bulk import products
   */
  async bulkImportProducts(companyId, products) {
    const client = await this.pool.connect();
    const results = { success: [], failed: [] };

    try {
      await client.query('BEGIN');

      for (const productData of products) {
        try {
          const product = await this.createProduct({ ...productData, company_id: companyId });
          results.success.push({ product_id: product.id, name: product.name });
        } catch (error) {
          results.failed.push({ 
            product_name: productData.name, 
            error: error.message 
          });
        }
      }

      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = ProductCatalogService;