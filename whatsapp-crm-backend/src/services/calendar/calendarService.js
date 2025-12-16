const pool = require('../../config/database');
const axios = require('axios');
const { encryptToken, decryptToken } = require('../../utils/encryption');

async function getValidCalendarToken(calendar_config) {
  const now = new Date();
  const expiresAt = new Date(calendar_config.oauth_token_expires_at);
  
  if (expiresAt <= new Date(now.getTime() + 5 * 60 * 1000)) {
    console.log(`Calendar token expired for ${calendar_config.user_email}, refreshing...`);
    return await refreshCalendarToken(calendar_config);
  }
  
  return decryptToken(calendar_config.oauth_access_token);
}

async function refreshCalendarToken(calendar_config) {
  try {
    const refreshToken = decryptToken(calendar_config.oauth_refresh_token);
    
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }
    
    const response = await axios.post(
      'https://oauth2.googleapis.com/token',
      {
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      }
    );
    
    const { access_token, expires_in } = response.data;
    
    await pool.query(`
      UPDATE calendar_configs
      SET 
        oauth_access_token = $1,
        oauth_token_expires_at = NOW() + $2 * INTERVAL '1 second',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [encryptToken(access_token), expires_in, calendar_config.id]);
    
    console.log(`✅ Calendar token refreshed for ${calendar_config.user_email}`);
    return access_token;
  } catch (error) {
    console.error('Calendar token refresh failed:', error);
    
    await pool.query(`
      UPDATE calendar_configs
      SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [calendar_config.id]);
    
    throw new Error('Calendar token refresh failed. Please reconnect your account.');
  }
}

async function createGoogleCalendarEvent(calendar_config_id, eventData) {
  try {
    const config = await pool.query(
      'SELECT * FROM calendar_configs WHERE id = $1 AND is_active = TRUE',
      [calendar_config_id]
    );
    
    if (config.rows.length === 0) {
      throw new Error('Calendar config not found or inactive');
    }
    
    const calendarConfig = config.rows[0];
    const accessToken = await getValidCalendarToken(calendarConfig);
    
    const attendees = eventData.attendees?.map(email => ({ email })) || [];
    
    const event = {
      summary: eventData.title,
      description: eventData.description || '',
      start: {
        dateTime: new Date(eventData.start_time).toISOString(),
        timeZone: calendarConfig.calendar_timezone
      },
      end: {
        dateTime: new Date(eventData.end_time).toISOString(),
        timeZone: calendarConfig.calendar_timezone
      },
      attendees: attendees,
      conferenceData: {
        createRequest: {
          requestId: `meet_${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 30 }
        ]
      }
    };
    
    const response = await axios.post(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarConfig.calendar_id}/events`,
      event,
      {
        params: { conferenceDataVersion: 1 },
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );
    
    const createdEvent = response.data;
    const meetingLink = createdEvent.hangoutLink || createdEvent.conferenceData?.entryPoints?.[0]?.uri;
    
    const insertQuery = eventData.lead_id 
      ? `INSERT INTO calendar_events (
           calendar_config_id, lead_id, booking_id,
           event_id, title, description, start_time, end_time,
           attendees, meeting_link, status
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'confirmed')`
      : `INSERT INTO calendar_events (
           calendar_config_id, booking_id,
           event_id, title, description, start_time, end_time,
           attendees, meeting_link, status
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'confirmed')`;
    
    const insertParams = eventData.lead_id
      ? [
          calendar_config_id,
          eventData.lead_id,
          eventData.booking_id || null,
          createdEvent.id,
          eventData.title,
          eventData.description || null,
          eventData.start_time,
          eventData.end_time,
          JSON.stringify(attendees),
          meetingLink
        ]
      : [
          calendar_config_id,
          eventData.booking_id || null,
          createdEvent.id,
          eventData.title,
          eventData.description || null,
          eventData.start_time,
          eventData.end_time,
          JSON.stringify(attendees),
          meetingLink
        ];
        await pool.query(insertQuery, insertParams);
        console.log(`✅ Calendar event created: ${createdEvent.id}`);

    return {
        event_id: createdEvent.id,
        meeting_link: meetingLink,
        calendar_link: createdEvent.htmlLink
        };
    } catch (error) {
        console.error('Create calendar event error:', error.response?.data || error.message);
        throw error;
        }
    }
    async function checkCalendarAvailability(calendar_config_id, start_time, end_time) {
    try {
        const config = await pool.query(
        'SELECT * FROM calendar_configs WHERE id = $1 AND is_active = TRUE',
        [calendar_config_id]
        );
    if (config.rows.length === 0) {
        throw new Error('Calendar config not found');
        }

    const calendarConfig = config.rows[0];
    const accessToken = await getValidCalendarToken(calendarConfig);

    const response = await axios.post(
        'https://www.googleapis.com/calendar/v3/freeBusy',
        {
            timeMin: new Date(start_time).toISOString(),
            timeMax: new Date(end_time).toISOString(),
            items: [{ id: calendarConfig.calendar_id }]
        },
        {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        }
    );

    const busySlots = response.data.calendars[calendarConfig.calendar_id]?.busy || [];
    const isAvailable = busySlots.length === 0;

    return {
        available: isAvailable,
        busy_slots: busySlots
        };
    } catch (error) {
            console.error('Check availability error:', error);
    throw error;
    }
}
module.exports = {
getValidCalendarToken,
refreshCalendarToken,
createGoogleCalendarEvent,
checkCalendarAvailability
};