const pool = require('../config/database');
const { sendSuccess, handleError } = require('../utils/response');
const { logRequest } = require('../utils/logger');

/**
 * Verify calendar integration
 */
exports.verifyCalendar = async (req, res) => {
  try {
    const testDate = new Date();
    testDate.setDate(testDate.getDate() + 1); // Tomorrow
    
    res.json({
      success: true,
      message: 'Calendar integration ready',
      test_date: testDate.toISOString(),
      timezone: 'Asia/Kolkata'
    });
  } catch (error) {
    logRequest('GET', '/api/calendar/verify', 500);
    handleError(res, error);
  }
};

/**
 * Confirm booking with calendar event
 */
exports.confirmBooking = async (req, res) => {
  try {
    const {
      lead_id, phone_number, booking_type, scheduled_date,
      duration_minutes, calendar_event_id, google_meet_link
    } = req.body;

    if (!lead_id || !scheduled_date) {
      return res.status(400).json({ error: 'lead_id and scheduled_date are required' });
    }

    // Create booking in DB
    const query = `
      INSERT INTO bookings 
      (lead_id, phone_number, booking_type, scheduled_date, duration_minutes, 
       status, calendar_event_id, notes)
      VALUES ($1, $2, $3, $4, $5, 'confirmed', $6, $7)
      RETURNING *;
    `;

    const result = await pool.query(query, [
      lead_id, phone_number, booking_type || 'demo_session',
      scheduled_date, duration_minutes || 60, calendar_event_id,
      google_meet_link ? `Google Meet: ${google_meet_link}` : null
    ]);

    // Send confirmation notification
    await pool.query(`
      INSERT INTO notifications (
        lead_id, phone_number, notification_type, title, message,
        scheduled_time, delivery_channel
      )
      VALUES ($1, $2, 'booking_confirmed', 'Booking Confirmed! 🎉', $3, CURRENT_TIMESTAMP, 'whatsapp')
    `, [
      lead_id, phone_number,
      `Your session is confirmed for ${new Date(scheduled_date).toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})}. ${google_meet_link ? `Join here: ${google_meet_link}` : 'Location details will be sent shortly.'}`
    ]);

    logRequest('POST', '/api/bookings/confirm', 201);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logRequest('POST', '/api/bookings/confirm', 500);
    handleError(res, error);
  }
};