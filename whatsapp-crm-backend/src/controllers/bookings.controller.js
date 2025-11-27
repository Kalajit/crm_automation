const pool = require('../config/database');
const { sendSuccess, handleError } = require('../utils/response');
const { logRequest } = require('../utils/logger');

/**
 * Create new booking
 */
exports.createBooking = async (req, res) => {
  try {
    const {
      lead_id,
      phone_number,
      booking_type,
      scheduled_date,
      duration_minutes = 60,
      status = 'pending',
      notes,
      calendar_event_id
    } = req.body;
    
    if (!lead_id || !phone_number || !booking_type || !scheduled_date) {
      return res.status(400).json({
        error: 'lead_id, phone_number, booking_type, scheduled_date required'
      });
    }
    
    const result = await pool.query(`
      INSERT INTO bookings (
        lead_id, phone_number, booking_type, scheduled_date,
        duration_minutes, status, notes, calendar_event_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      lead_id,
      phone_number,
      booking_type,
      scheduled_date,
      duration_minutes,
      status,
      notes || null,
      calendar_event_id || null
    ]);
    
    logRequest('POST', '/api/bookings', 201);
    res.status(201).json({
      success: true,
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Create booking error:', error);
    logRequest('POST', '/api/bookings', 500);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get all bookings with optional filters
 */
exports.getAllBookings = async (req, res) => {
  try {
    const { lead_id, company_id, status, booking_type, limit = 50, offset = 0 } = req.query;
    
    let query = `
      SELECT 
        b.*,
        l.name as lead_name,
        l.phone_number,
        l.email,
        c.name as company_name
      FROM bookings b
      LEFT JOIN leads l ON b.lead_id = l.id
      LEFT JOIN companies c ON l.company_id = c.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (lead_id) {
      query += ` AND b.lead_id = $${paramIndex}`;
      params.push(lead_id);
      paramIndex++;
    }
    
    if (company_id) {
      query += ` AND l.company_id = $${paramIndex}`;
      params.push(company_id);
      paramIndex++;
    }
    
    if (status) {
      query += ` AND b.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    if (booking_type) {
      query += ` AND b.booking_type = $${paramIndex}`;
      params.push(booking_type);
      paramIndex++;
    }
    
    query += ` ORDER BY b.scheduled_date DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));
    
    const result = await pool.query(query, params);
    
    logRequest('GET', '/api/bookings', 200);
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
    
  } catch (error) {
    console.error('Get bookings error:', error);
    logRequest('GET', '/api/bookings', 500);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get single booking by ID
 */
exports.getBookingById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        b.*,
        l.name as lead_name,
        l.phone_number,
        l.email,
        c.name as company_name,
        ce.meeting_link,
        ce.event_id as calendar_event_id
      FROM bookings b
      LEFT JOIN leads l ON b.lead_id = l.id
      LEFT JOIN companies c ON l.company_id = c.id
      LEFT JOIN calendar_events ce ON b.calendar_event_id = ce.event_id
      WHERE b.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    logRequest('GET', `/api/bookings/${id}`, 200);
    res.json({
      success: true,
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Get booking error:', error);
    logRequest('GET', `/api/bookings/${id}`, 500);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Update booking
 */
exports.updateBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      scheduled_date,
      duration_minutes,
      status,
      notes,
      calendar_event_id
    } = req.body;
    
    const updates = [];
    const values = [];
    let paramIndex = 1;
    
    if (scheduled_date !== undefined) {
      updates.push(`scheduled_date = $${paramIndex}`);
      values.push(scheduled_date);
      paramIndex++;
    }
    
    if (duration_minutes !== undefined) {
      updates.push(`duration_minutes = $${paramIndex}`);
      values.push(duration_minutes);
      paramIndex++;
    }
    
    if (status !== undefined) {
      updates.push(`status = $${paramIndex}`);
      values.push(status);
      paramIndex++;
    }
    
    if (notes !== undefined) {
      updates.push(`notes = $${paramIndex}`);
      values.push(notes);
      paramIndex++;
    }
    
    if (calendar_event_id !== undefined) {
      updates.push(`calendar_event_id = $${paramIndex}`);
      values.push(calendar_event_id);
      paramIndex++;
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);
    
    const query = `
      UPDATE bookings 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    logRequest('PATCH', `/api/bookings/${id}`, 200);
    res.json({
      success: true,
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Update booking error:', error);
    logRequest('PATCH', `/api/bookings/${id}`, 500);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Cancel booking
 */
exports.cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      UPDATE bookings 
      SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    logRequest('DELETE', `/api/bookings/${id}`, 200);
    res.json({
      success: true,
      message: 'Booking cancelled',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Cancel booking error:', error);
    logRequest('DELETE', `/api/bookings/${id}`, 500);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get upcoming bookings (next 7 days)
 */
exports.getUpcomingBookings = async (req, res) => {
  try {
    const { company_id, days = 7 } = req.query;
    
    let query = `
      SELECT 
        b.*,
        l.name as lead_name,
        l.phone_number,
        l.email,
        ce.meeting_link
      FROM bookings b
      LEFT JOIN leads l ON b.lead_id = l.id
      LEFT JOIN calendar_events ce ON b.calendar_event_id = ce.event_id
      WHERE b.status IN ('pending', 'confirmed')
        AND b.scheduled_date BETWEEN NOW() AND NOW() + INTERVAL '${days} days'
    `;
    
    const params = [];
    
    if (company_id) {
      query += ` AND l.company_id = $1`;
      params.push(company_id);
    }
    
    query += ` ORDER BY b.scheduled_date ASC`;
    
    const result = await pool.query(query, params);
    
    logRequest('GET', '/api/bookings/upcoming', 200);
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
    
  } catch (error) {
    console.error('Get upcoming bookings error:', error);
    logRequest('GET', '/api/bookings/upcoming', 500);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get bookings by lead
 */
exports.getBookingsByLead = async (req, res) => {
  try {
    const { lead_id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        b.*,
        ce.meeting_link,
        ce.event_id as calendar_event_id
      FROM bookings b
      LEFT JOIN calendar_events ce ON b.calendar_event_id = ce.event_id
      WHERE b.lead_id = $1
      ORDER BY b.scheduled_date DESC
    `, [lead_id]);
    
    logRequest('GET', `/api/bookings/lead/${lead_id}`, 200);
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
    
  } catch (error) {
    console.error('Get lead bookings error:', error);
    logRequest('GET', `/api/bookings/lead/${lead_id}`, 500);
    res.status(500).json({ error: error.message });
  }
};