const pool = require('../config/database');
const axios = require('axios');
const nodemailer = require('nodemailer');
const { sendSuccess, handleError } = require('../utils/response');
const { logRequest } = require('../utils/logger');
const { 
  encryptToken, 
  decryptToken,
  getValidAccessToken 
} = require('../utils/encryption');
const {
  getValidCalendarToken,
  refreshCalendarToken,
  createGoogleCalendarEvent,
  checkCalendarAvailability
} = require('../services/calendar/calendarService');
const {
  getCompanyEmailConfig,
  createEmailTransporter,
  generateConfirmationEmailHTML,
  sendCalendarConfirmationEmail
} = require('../services/email/emailConfirmationService');

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



// ============================================
// GOOGLE CALENDAR OAUTH
// ============================================

exports.startGoogleCalendarOAuth = async (req, res) => {
  try {
    const { company_id, user_email } = req.query;
    
    if (!company_id || !user_email) {
      return res.status(400).json({ error: 'company_id and user_email required' });
    }
    
    const state = Buffer.from(JSON.stringify({
      company_id,
      user_email,
      provider: 'google',
      timestamp: Date.now(),
      nonce: Math.random().toString(36).substr(2, 9)
    })).toString('base64');
    
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    
    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events'
    ].join(' ');
    
    const authUrl = 
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${process.env.GOOGLE_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `access_type=offline&` +
      `state=${encodeURIComponent(state)}&` +
      `prompt=consent`;
    
    logRequest('GET', '/api/calendar/oauth/google/start', 200);
    res.json({ success: true, auth_url: authUrl });
  } catch (error) {
    console.error('Google Calendar OAuth start error:', error);
    logRequest('GET', '/api/calendar/oauth/google/start', 500);
    res.status(500).json({ error: error.message });
  }
};

exports.handleGoogleCalendarCallback = async (req, res) => {
  try {
    const { code, state, error: oauth_error } = req.query;
    
    if (oauth_error) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head><title>OAuth Error</title></head>
        <body style="font-family: Arial; padding: 50px; text-align: center;">
          <div style="background: white; padding: 40px; border-radius: 10px; max-width: 600px; margin: 0 auto;">
            <div style="color: #dc3545; font-size: 24px; margin-bottom: 20px;">❌ OAuth Error</div>
            <p>${oauth_error}</p>
            <a href="/dashboard?tab=calendar" style="color: #667eea;">← Back to Dashboard</a>
          </div>
        </body>
        </html>
      `);
    }
    
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const { company_id, user_email } = stateData;
    
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    
    const tokenResponse = await axios.post(
      'https://oauth2.googleapis.com/token',
      {
        code: code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      }
    );
    
    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    
    if (!refresh_token) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Setup Required</title></head>
        <body style="font-family: Arial; padding: 50px; text-align: center;">
          <div style="background: white; padding: 40px; border-radius: 10px; max-width: 600px; margin: 0 auto;">
            <div style="color: #ff9800; font-size: 24px; margin-bottom: 20px;">⚠️ Re-authorization Required</div>
            <p>Please revoke access in Google Account settings and try again.</p>
            <a href="https://myaccount.google.com/permissions" target="_blank" style="color: #667eea;">Google Permissions</a>
          </div>
        </body>
        </html>
      `);
    }
    
    const calendarResponse = await axios.get(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList/primary',
      {
        headers: { 'Authorization': `Bearer ${access_token}` }
      }
    );
    
    const calendarTimezone = calendarResponse.data.timeZone || 'Asia/Kolkata';
    const calendarId = calendarResponse.data.id || 'primary';
    
    const encryptedAccessToken = encryptToken(access_token);
    const encryptedRefreshToken = encryptToken(refresh_token);
    
    if (!encryptedAccessToken || !encryptedRefreshToken) {
      throw new Error('Token encryption failed');
    }
    
    await pool.query(`
      INSERT INTO calendar_configs (
        company_id, user_email, provider,
        oauth_access_token, oauth_refresh_token,
        oauth_token_expires_at, calendar_id, calendar_timezone, is_active
      )
      VALUES ($1, $2, 'google', $3, $4, NOW() + $5 * INTERVAL '1 second', $6, $7, TRUE)
      ON CONFLICT (company_id, user_email, provider) DO UPDATE
      SET 
        oauth_access_token = EXCLUDED.oauth_access_token,
        oauth_refresh_token = EXCLUDED.oauth_refresh_token,
        oauth_token_expires_at = EXCLUDED.oauth_token_expires_at,
        calendar_id = EXCLUDED.calendar_id,
        calendar_timezone = EXCLUDED.calendar_timezone,
        is_active = TRUE,
        updated_at = CURRENT_TIMESTAMP
    `, [company_id, user_email, encryptedAccessToken, encryptedRefreshToken, expires_in, calendarId, calendarTimezone]);
    
    logRequest('GET', '/api/calendar/oauth/google/callback', 200);
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Google Calendar Connected</title>
        <style>
          body { font-family: Arial; padding: 50px; background: #f5f5f5; text-align: center; }
          .container { background: white; padding: 40px; border-radius: 10px; max-width: 600px; margin: 0 auto; }
          .success { color: #28a745; font-size: 24px; margin-bottom: 20px; }
          .btn { background: #667eea; color: white; padding: 12px 24px; border-radius: 5px; text-decoration: none; display: inline-block; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success">✅ Google Calendar Connected!</div>
          <p><strong>Email:</strong> ${user_email}</p>
          <p><strong>Timezone:</strong> ${calendarTimezone}</p>
          <p>Your calendar is now integrated. Bookings will be automatically synced.</p>
          <a href="/dashboard?tab=calendar" class="btn">Go to Dashboard</a>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Google Calendar OAuth callback error:', error);
    logRequest('GET', '/api/calendar/oauth/google/callback', 500);
    res.status(500).send(`Error: ${error.message}`);
  }
};

// ============================================
// CALENDAR MANAGEMENT
// ============================================

exports.getCalendarStatus = async (req, res) => {
  try {
    const { company_id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        id, user_email, provider, calendar_id, calendar_timezone,
        is_active, oauth_token_expires_at,
        EXTRACT(DAY FROM (oauth_token_expires_at - NOW())) as days_until_expiry
      FROM calendar_configs
      WHERE company_id = $1
      ORDER BY created_at DESC
    `, [company_id]);
    
    logRequest('GET', `/api/calendar/status/${company_id}`, 200);
    res.json({
      success: true,
      data: result.rows.map(row => ({
        ...row,
        needs_reauth: row.days_until_expiry < 7
      }))
    });
  } catch (error) {
    console.error('Get calendar status error:', error);
    logRequest('GET', `/api/calendar/status/${req.params.company_id}`, 500);
    res.status(500).json({ error: error.message });
  }
};

exports.getActiveCalendar = async (req, res) => {
  try {
    const { company_id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        id as calendar_config_id,
        user_email,
        calendar_id,
        calendar_timezone,
        is_active
      FROM calendar_configs
      WHERE company_id = $1 AND is_active = TRUE
      ORDER BY is_default DESC NULLS LAST, created_at ASC
      LIMIT 1
    `, [company_id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'No active calendar configuration found',
        message: 'Please connect a Google Calendar account first'
      });
    }
    
    logRequest('GET', `/api/calendar/active/${company_id}`, 200);
    res.json({ 
      success: true, 
      data: result.rows[0] 
    });
  } catch (error) {
    console.error('Get active calendar error:', error);
    logRequest('GET', `/api/calendar/active/${req.params.company_id}`, 500);
    res.status(500).json({ error: error.message });
  }
};

exports.disconnectCalendar = async (req, res) => {
  try {
    const { calendar_config_id } = req.params;
    
    await pool.query(
      'DELETE FROM calendar_configs WHERE id = $1',
      [calendar_config_id]
    );
    
    logRequest('DELETE', `/api/calendar/disconnect/${calendar_config_id}`, 200);
    res.json({ success: true, message: 'Calendar disconnected' });
  } catch (error) {
    console.error('Disconnect calendar error:', error);
    logRequest('DELETE', `/api/calendar/disconnect/${req.params.calendar_config_id}`, 500);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// CALENDAR EVENTS
// ============================================

exports.createCalendarEvent = async (req, res) => {
  try {
    const {
      calendar_config_id,
      lead_id,
      booking_id,
      title,
      description,
      start_time,
      end_time,
      attendees,
      send_confirmation = true
    } = req.body;
    
    if (!calendar_config_id || !title || !start_time || !end_time) {
      return res.status(400).json({
        error: 'calendar_config_id, title, start_time, end_time required'
      });
    }

    let lead = null;
    if (lead_id) {
      const leadCheck = await pool.query(
        'SELECT id, email, name FROM leads WHERE id = $1',
        [lead_id]
      );
      
      if (leadCheck.rows.length === 0) {
        return res.status(400).json({
          error: 'Invalid lead_id: Lead does not exist'
        });
      }
      lead = leadCheck.rows[0];
    }
    
    const configResult = await pool.query(
      'SELECT company_id FROM calendar_configs WHERE id = $1',
      [calendar_config_id]
    );
    
    if (configResult.rows.length === 0) {
      return res.status(404).json({ error: 'Calendar config not found' });
    }
    
    const company_id = configResult.rows[0].company_id;
    
    const attendeesList = attendees || (lead?.email ? [lead.email] : []);
    
    const calendarResult = await createGoogleCalendarEvent(calendar_config_id, {
      lead_id: lead_id || null,
      booking_id,
      title,
      description,
      start_time,
      end_time,
      attendees: attendeesList
    });
    
    const eventResult = await pool.query(
      'SELECT id FROM calendar_events WHERE event_id = $1 ORDER BY created_at DESC LIMIT 1',
      [calendarResult.event_id]
    );
    
    if (eventResult.rows.length === 0) {
      throw new Error('Calendar event created but not found in database');
    }
    
    const calendar_event_id = eventResult.rows[0].id;
    
    let emailResult = null;
    if (send_confirmation) {
      emailResult = await sendCalendarConfirmationEmail(
        calendar_event_id,
        company_id,
        lead_id
      );
    }
    
    logRequest('POST', '/api/calendar/create-event', 201);
    res.status(201).json({
      success: true,
      data: {
        ...calendarResult,
        calendar_event_id,
        confirmation_email: emailResult
      },
      message: emailResult?.success 
        ? `Event created and confirmation email sent to ${emailResult.email_sent_to}` 
        : 'Event created successfully'
    });
  } catch (error) {
    console.error('Create event error:', error);
    logRequest('POST', '/api/calendar/create-event', 500);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

exports.checkAvailability = async (req, res) => {
  try {
    const { calendar_config_id, start_time, end_time } = req.body;
    
    if (!calendar_config_id || !start_time || !end_time) {
      return res.status(400).json({
        error: 'calendar_config_id, start_time, end_time required'
      });
    }
    
    const result = await checkCalendarAvailability(
      calendar_config_id,
      start_time,
      end_time
    );
    
    logRequest('POST', '/api/calendar/check-availability', 200);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Check availability error:', error);
    logRequest('POST', '/api/calendar/check-availability', 500);
    res.status(500).json({ error: error.message });
  }
};

exports.getAvailableSlots = async (req, res) => {
  try {
    const { 
      calendar_config_id, 
      start_date, 
      end_date,
      duration_minutes = 60,
      buffer_minutes = 15
    } = req.body;
    
    if (!calendar_config_id || !start_date || !end_date) {
      return res.status(400).json({
        error: 'calendar_config_id, start_date, end_date required'
      });
    }
    
    const config = await pool.query(
      'SELECT * FROM calendar_configs WHERE id = $1 AND is_active = TRUE',
      [calendar_config_id]
    );
    
    if (config.rows.length === 0) {
      return res.status(404).json({ error: 'Calendar config not found' });
    }
    
    const calendarConfig = config.rows[0];
    const accessToken = await getValidCalendarToken(calendarConfig);
    
    const response = await axios.post(
      'https://www.googleapis.com/calendar/v3/freeBusy',
      {
        timeMin: new Date(start_date).toISOString(),
        timeMax: new Date(end_date).toISOString(),
        items: [{ id: calendarConfig.calendar_id }]
      },
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );
    
    const busySlots = response.data.calendars[calendarConfig.calendar_id]?.busy || [];
    
    const workingHours = calendarConfig.working_hours || {
      start: "09:00",
      end: "18:00",
      days: [1, 2, 3, 4, 5]
    };
    
    const availableSlots = [];
    let currentDate = new Date(start_date);
    const endDateTime = new Date(end_date);
    
    while (currentDate <= endDateTime) {
      const dayOfWeek = currentDate.getDay();
      
      if (workingHours.days.includes(dayOfWeek)) {
        const [startHour, startMin] = workingHours.start.split(':').map(Number);
        const [endHour, endMin] = workingHours.end.split(':').map(Number);
        
        let slotStart = new Date(currentDate);
        slotStart.setHours(startHour, startMin, 0, 0);
        
        const dayEnd = new Date(currentDate);
        dayEnd.setHours(endHour, endMin, 0, 0);
        
        while (slotStart < dayEnd) {
          const slotEnd = new Date(slotStart.getTime() + duration_minutes * 60000);
          
          const isAvailable = !busySlots.some(busy => {
            const busyStart = new Date(busy.start);
            const busyEnd = new Date(busy.end);
            return (slotStart < busyEnd && slotEnd > busyStart);
          });
          
          if (isAvailable && slotEnd <= dayEnd) {
            availableSlots.push({
              start: slotStart.toISOString(),
              end: slotEnd.toISOString(),
              duration_minutes: duration_minutes
            });
          }
          
          slotStart = new Date(slotStart.getTime() + (duration_minutes + buffer_minutes) * 60000);
        }
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
      currentDate.setHours(0, 0, 0, 0);
    }
    
    logRequest('POST', '/api/calendar/available-slots', 200);
    res.json({ 
      success: true, 
      data: {
        available_slots: availableSlots,
        timezone: calendarConfig.calendar_timezone,
        total_slots: availableSlots.length
      }
    });
  } catch (error) {
    console.error('Get available slots error:', error);
    logRequest('POST', '/api/calendar/available-slots', 500);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// EMAIL CONFIRMATIONS
// ============================================

exports.sendConfirmationEmail = async (req, res) => {
  try {
    const {
      calendar_event_id,
      company_id,
      lead_id
    } = req.body;
    
    if (!calendar_event_id || !company_id) {
      return res.status(400).json({
        error: 'calendar_event_id and company_id are required'
      });
    }
    
    const result = await sendCalendarConfirmationEmail(
      calendar_event_id,
      company_id,
      lead_id
    );
    
    if (result.success) {
      logRequest('POST', '/api/calendar/send-confirmation', 200);
      res.json({
        success: true,
        message: 'Confirmation email sent successfully',
        email_sent_to: result.email_sent_to,
        message_id: result.message_id
      });
    } else {
      logRequest('POST', '/api/calendar/send-confirmation', 400);
      res.status(400).json({
        success: false,
        error: result.error || result.reason
      });
    }
  } catch (error) {
    console.error('Send confirmation email error:', error);
    logRequest('POST', '/api/calendar/send-confirmation', 500);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

exports.resendConfirmationEmail = async (req, res) => {
  try {
    const { event_id } = req.params;
    
    const eventResult = await pool.query(`
      SELECT 
        ce.id,
        ce.lead_id,
        cc.company_id
      FROM calendar_events ce
      JOIN calendar_configs cc ON ce.calendar_config_id = cc.id
      WHERE ce.id = $1
    `, [event_id]);
    
    if (eventResult.rows.length === 0) {
      return res.status(404).json({ error: 'Calendar event not found' });
    }
    
    const event = eventResult.rows[0];
    
    const result = await sendCalendarConfirmationEmail(
      event.id,
      event.company_id,
      event.lead_id
    );
    
    if (result.success) {
      logRequest('POST', `/api/calendar/resend-confirmation/${event_id}`, 200);
      res.json({
        success: true,
        message: 'Confirmation email resent successfully',
        email_sent_to: result.email_sent_to
      });
    } else {
      logRequest('POST', `/api/calendar/resend-confirmation/${event_id}`, 400);
      res.status(400).json({
        success: false,
        error: result.error || result.reason
      });
    }
  } catch (error) {
    console.error('Resend confirmation error:', error);
    logRequest('POST', `/api/calendar/resend-confirmation/${req.params.event_id}`, 500);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

exports.getEmailStatus = async (req, res) => {
  try {
    const { event_id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        ce.id,
        ce.reminder_sent,
        ce.title,
        ce.start_time,
        eq.to_email,
        eq.status as email_status,
        eq.sent_at,
        eq.error_message
      FROM calendar_events ce
      LEFT JOIN email_queue eq ON eq.lead_id = ce.lead_id 
        AND eq.subject LIKE '%' || ce.title || '%'
        AND eq.created_at >= ce.created_at
      WHERE ce.id = $1
      ORDER BY eq.created_at DESC
      LIMIT 1
    `, [event_id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Calendar event not found' });
    }
    
    logRequest('GET', `/api/calendar/email-status/${event_id}`, 200);
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Get email status error:', error);
    logRequest('GET', `/api/calendar/email-status/${req.params.event_id}`, 500);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};