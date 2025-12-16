// // const { google } = require('googleapis');
// // const moment = require('moment-timezone');
// // const logger = require('../../utils/logger');
// // const pool = require('../../config/database');

// // class MeetingSchedulerService {
// //   constructor(pool) {
// //     this.pool = pool;
// //   }

// //   /**
// //    * Create scheduling link for agent
// //    */
// //   async createSchedulingLink(companyId, agentId, linkData) {
// //     try {
// //       const {
// //         link_name,
// //         link_slug,
// //         meeting_duration = 30,
// //         meeting_type,
// //         description,
// //         location_type = 'virtual', // 'virtual', 'phone', 'in_person'
// //         location_details,
// //         availability_rules,
// //         buffer_time_before = 0,
// //         buffer_time_after = 15,
// //         max_bookings_per_day = null,
// //         advance_notice_hours = 24,
// //         max_days_advance = 60,
// //         custom_questions = [],
// //         confirmation_message,
// //         reminder_settings = {
// //           email_reminder: true,
// //           sms_reminder: false,
// //           reminder_before_hours: 24
// //         }
// //       } = linkData;

// //       const result = await this.pool.query(
// //         `INSERT INTO scheduling_links 
// //          (company_id, agent_id, link_name, link_slug, meeting_duration, meeting_type,
// //           description, location_type, location_details, availability_rules,
// //           buffer_time_before, buffer_time_after, max_bookings_per_day,
// //           advance_notice_hours, max_days_advance, custom_questions,
// //           confirmation_message, reminder_settings, is_active)
// //          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, true)
// //          RETURNING *`,
// //         [
// //           companyId, agentId, link_name, link_slug, meeting_duration, meeting_type,
// //           description, location_type, location_details, JSON.stringify(availability_rules),
// //           buffer_time_before, buffer_time_after, max_bookings_per_day,
// //           advance_notice_hours, max_days_advance, JSON.stringify(custom_questions),
// //           confirmation_message, JSON.stringify(reminder_settings)
// //         ]
// //       );

// //       return {
// //         ...result.rows[0],
// //         public_url: `${process.env.APP_URL}/schedule/${link_slug}`
// //       };
// //     } catch (error) {
// //       // logger.error('Create scheduling link error:', error);
// //       console.error('Error creating scheduling link:', error);

// //       throw error;
// //     }
// //   }

// //   /**
// //    * Get available time slots for a scheduling link
// //    */
// //   async getAvailableSlots(linkSlug, selectedDate, timezone = 'Asia/Kolkata') {
// //     try {
// //       // Get scheduling link
// //       const linkResult = await this.pool.query(
// //         `SELECT sl.*, ha.email as agent_email, cc.calendar_id, cc.oauth_access_token
// //          FROM scheduling_links sl
// //          JOIN human_agents ha ON sl.agent_id = ha.id
// //          LEFT JOIN calendar_configs cc ON cc.company_id = sl.company_id AND cc.user_email = ha.email
// //          WHERE sl.link_slug = $1 AND sl.is_active = true`,
// //         [linkSlug]
// //       );

// //       if (linkResult.rows.length === 0) {
// //         throw new Error('Scheduling link not found');
// //       }

// //       const link = linkResult.rows[0];
// //       const date = moment.tz(selectedDate, timezone);
// //       const dayOfWeek = date.format('dddd').toLowerCase();

// //       // Parse availability rules
// //       const availabilityRules = JSON.parse(link.availability_rules);
// //       const dayRule = availabilityRules[dayOfWeek];

// //       if (!dayRule || !dayRule.available) {
// //         return { available_slots: [], message: 'Not available on this day' };
// //       }

// //       // Get existing bookings for this day
// //       const existingBookings = await this.pool.query(
// //         `SELECT scheduled_time, duration_minutes
// //          FROM scheduled_meetings
// //          WHERE scheduling_link_id = (SELECT id FROM scheduling_links WHERE link_slug = $1)
// //          AND DATE(scheduled_time AT TIME ZONE $2) = $3
// //          AND status NOT IN ('cancelled', 'no_show')`,
// //         [linkSlug, timezone, date.format('YYYY-MM-DD')]
// //       );

// //       // Get calendar events if integrated
// //       let calendarEvents = [];
// //       if (link.calendar_id && link.oauth_access_token) {
// //         calendarEvents = await this.getGoogleCalendarEvents(
// //           link.oauth_access_token,
// //           link.calendar_id,
// //           date.startOf('day').toISOString(),
// //           date.endOf('day').toISOString()
// //         );
// //       }

// //       // Generate time slots
// //       const slots = [];
// //       let currentTime = moment.tz(`${date.format('YYYY-MM-DD')} ${dayRule.start_time}`, timezone);
// //       const endTime = moment.tz(`${date.format('YYYY-MM-DD')} ${dayRule.end_time}`, timezone);

// //       // Check advance notice
// //       const minBookingTime = moment.tz(timezone).add(link.advance_notice_hours, 'hours');
// //       const maxBookingTime = moment.tz(timezone).add(link.max_days_advance, 'days');

// //       while (currentTime.isBefore(endTime)) {
// //         const slotStart = currentTime.clone();
// //         const slotEnd = slotStart.clone().add(link.meeting_duration, 'minutes');

// //         // Check if slot is in valid booking window
// //         if (slotStart.isBefore(minBookingTime) || slotStart.isAfter(maxBookingTime)) {
// //           currentTime.add(15, 'minutes'); // Move to next slot
// //           continue;
// //         }

// //         // Check if slot conflicts with existing bookings
// //         const hasConflict = existingBookings.rows.some(booking => {
// //           const bookingStart = moment(booking.scheduled_time).tz(timezone);
// //           const bookingEnd = bookingStart.clone().add(
// //             booking.duration_minutes + link.buffer_time_after,
// //             'minutes'
// //           );
          
// //           return slotStart.isBetween(bookingStart, bookingEnd, null, '[)') ||
// //                  slotEnd.isBetween(bookingStart, bookingEnd, null, '(]');
// //         });

// //         // Check calendar conflicts
// //         const hasCalendarConflict = calendarEvents.some(event => {
// //           const eventStart = moment(event.start.dateTime);
// //           const eventEnd = moment(event.end.dateTime);
          
// //           return slotStart.isBetween(eventStart, eventEnd, null, '[)') ||
// //                  slotEnd.isBetween(eventStart, eventEnd, null, '(]');
// //         });

// //         if (!hasConflict && !hasCalendarConflict) {
// //           slots.push({
// //             start_time: slotStart.toISOString(),
// //             end_time: slotEnd.toISOString(),
// //             display_time: slotStart.format('h:mm A')
// //           });
// //         }

// //         currentTime.add(15, 'minutes'); // 15-minute intervals
// //       }

// //       return { available_slots: slots };
// //     } catch (error) {
// //       // logger.error('Get available slots error:', error);
// //       console.error('Get available slots error:', error);

// //       throw error;
// //     }
// //   }

// //   /**
// //    * Book meeting
// //    */
// //   async bookMeeting(linkSlug, bookingData) {
// //     const client = await this.pool.connect();
    
// //     try {
// //       await client.query('BEGIN');

// //       const {
// //         lead_name,
// //         lead_email,
// //         lead_phone,
// //         scheduled_time,
// //         timezone = 'Asia/Kolkata',
// //         custom_answers = {},
// //         notes
// //       } = bookingData;

// //       // Get scheduling link
// //       const linkResult = await client.query(
// //         `SELECT * FROM scheduling_links WHERE link_slug = $1 AND is_active = true`,
// //         [linkSlug]
// //       );

// //       if (linkResult.rows.length === 0) {
// //         throw new Error('Scheduling link not found');
// //       }

// //       const link = linkResult.rows[0];

// //       // Check if slot is still available
// //       const slots = await this.getAvailableSlots(linkSlug, scheduled_time, timezone);
// //       const requestedTime = moment.tz(scheduled_time, timezone);
      
// //       const slotAvailable = slots.available_slots.some(slot => 
// //         moment(slot.start_time).isSame(requestedTime)
// //       );

// //       if (!slotAvailable) {
// //         throw new Error('Selected time slot is no longer available');
// //       }

// //       // Check max bookings per day
// //       if (link.max_bookings_per_day) {
// //         const dayBookings = await client.query(
// //           `SELECT COUNT(*) as count
// //            FROM scheduled_meetings
// //            WHERE scheduling_link_id = $1
// //            AND DATE(scheduled_time AT TIME ZONE $2) = $3
// //            AND status NOT IN ('cancelled', 'no_show')`,
// //           [link.id, timezone, requestedTime.format('YYYY-MM-DD')]
// //         );

// //         if (parseInt(dayBookings.rows[0].count) >= link.max_bookings_per_day) {
// //           throw new Error('Maximum bookings for this day reached');
// //         }
// //       }

// //       // Create or get lead
// //       let leadId;
// //       const existingLead = await client.query(
// //         'SELECT id FROM leads WHERE email = $1 AND company_id = $2',
// //         [lead_email, link.company_id]
// //       );

// //       if (existingLead.rows.length > 0) {
// //         leadId = existingLead.rows[0].id;
        
// //         // Update lead info
// //         await client.query(
// //           `UPDATE leads 
// //            SET name = $1, phone_number = $2, updated_at = NOW()
// //            WHERE id = $3`,
// //           [lead_name, lead_phone, leadId]
// //         );
// //       } else {
// //         const newLead = await client.query(
// //           `INSERT INTO leads (company_id, name, email, phone_number, lead_source)
// //            VALUES ($1, $2, $3, $4, 'meeting_scheduler')
// //            RETURNING id`,
// //           [link.company_id, lead_name, lead_email, lead_phone]
// //         );
// //         leadId = newLead.rows[0].id;
// //       }

// //       // Create scheduled meeting
// //       const meetingResult = await client.query(
// //         `INSERT INTO scheduled_meetings 
// //          (scheduling_link_id, lead_id, lead_name, lead_email, lead_phone,
// //           scheduled_time, duration_minutes, timezone, location_type, location_details,
// //           custom_answers, notes, status, confirmation_code)
// //          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'confirmed', $13)
// //          RETURNING *`,
// //         [
// //           link.id, leadId, lead_name, lead_email, lead_phone,
// //           scheduled_time, link.meeting_duration, timezone,
// //           link.location_type, link.location_details,
// //           JSON.stringify(custom_answers), notes,
// //           this.generateConfirmationCode()
// //         ]
// //       );

// //       const meeting = meetingResult.rows[0];

// //       // Create Google Calendar event if integrated
// //       if (link.calendar_id) {
// //         await this.createCalendarEvent(link, meeting, timezone);
// //       }

// //       // Create booking in bookings table
// //       await client.query(
// //         `INSERT INTO bookings 
// //          (lead_id, phone_number, booking_type, scheduled_date, duration_minutes, status, notes)
// //          VALUES ($1, $2, $3, $4, $5, 'confirmed', $6)`,
// //         [leadId, lead_phone, link.meeting_type, scheduled_time, link.meeting_duration, notes]
// //       );

// //       // Schedule reminders
// //       await this.scheduleReminders(client, meeting, link);

// //       // Send confirmation email
// //       await this.sendConfirmationEmail(client, meeting, link);

// //       // Create activity
// //       await client.query(
// //         `INSERT INTO activity_feed 
// //          (company_id, lead_id, activity_type, activity_description)
// //          VALUES ($1, $2, 'meeting_scheduled', $3)`,
// //         [link.company_id, leadId, `Meeting scheduled for ${requestedTime.format('MMMM Do, YYYY [at] h:mm A')}`]
// //       );

// //       await client.query('COMMIT');

// //       return {
// //         ...meeting,
// //         public_url: `${process.env.APP_URL}/meeting/${meeting.confirmation_code}`
// //       };
// //     } catch (error) {
// //       await client.query('ROLLBACK');
// //       // logger.error('Book meeting error:', error);
// //       console.error('Book meeting error:', error);
// //       throw error;
// //     } finally {
// //       client.release();
// //     }
// //   }

// //   /**
// //    * Cancel/reschedule meeting
// //    */
// //   async cancelMeeting(confirmationCode, reason = null) {
// //     const client = await this.pool.connect();
    
// //     try {
// //       await client.query('BEGIN');

// //       const result = await client.query(
// //         `UPDATE scheduled_meetings 
// //          SET status = 'cancelled', 
// //              cancellation_reason = $1,
// //              cancelled_at = NOW()
// //          WHERE confirmation_code = $2
// //          RETURNING *`,
// //         [reason, confirmationCode]
// //       );

// //       if (result.rows.length === 0) {
// //         throw new Error('Meeting not found');
// //       }

// //       const meeting = result.rows[0];

// //       // Cancel calendar event if exists
// //       if (meeting.calendar_event_id) {
// //         await this.cancelCalendarEvent(meeting.calendar_event_id);
// //       }

// //       // Send cancellation email
// //       await this.sendCancellationEmail(client, meeting);

// //       await client.query('COMMIT');

// //       return { success: true, meeting };
// //     } catch (error) {
// //       await client.query('ROLLBACK');
// //       // logger.error('Cancel meeting error:', error);
// //       console.error('Cancel meeting error:', error);
// //       throw error;
// //     } finally {
// //       client.release();
// //     }
// //   }

// //   /**
// //    * Helper: Get Google Calendar events
// //    */
// //   async getGoogleCalendarEvents(accessToken, calendarId, timeMin, timeMax) {
// //     try {
// //       const oauth2Client = new google.auth.OAuth2();
// //       oauth2Client.setCredentials({ access_token: accessToken });

// //       const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

// //       const response = await calendar.events.list({
// //         calendarId: calendarId,
// //         timeMin: timeMin,
// //         timeMax: timeMax,
// //         singleEvents: true,
// //         orderBy: 'startTime'
// //       });

// //       return response.data.items || [];
// //     } catch (error) {
// //       // logger.error('Get calendar events error:', error);
// //       console.error('Get calendar events error:', error);
// //       return [];
// //     }
// //   }

// //   /**
// //    * Helper: Create calendar event
// //    */
// //   async createCalendarEvent(link, meeting, timezone) {
// //     try {
// //       // Implementation depends on calendar integration
// //       // This is a placeholder
// //       return null;
// //     } catch (error) {
// //       // logger.error('Create calendar event error:', error);
// //       console.error('Create calendar event error:', error);
// //     }
// //   }

// //   /**
// //    * Helper: Generate confirmation code
// //    */
// //   generateConfirmationCode() {
// //     return Math.random().toString(36).substring(2, 15) + 
// //            Math.random().toString(36).substring(2, 15);
// //   }

// //   /**
// //    * Helper: Schedule reminders
// //    */
// //   async scheduleReminders(client, meeting, link) {
// //     const reminderSettings = JSON.parse(link.reminder_settings);
    
// //     if (reminderSettings.email_reminder) {
// //       const reminderTime = moment(meeting.scheduled_time)
// //         .subtract(reminderSettings.reminder_before_hours, 'hours');

// //       await client.query(
// //         `INSERT INTO notifications 
// //          (lead_id, phone_number, notification_type, title, message, 
// //           scheduled_time, delivery_channel)
// //          VALUES ($1, $2, 'meeting_reminder', 'Upcoming Meeting Reminder', $3, $4, 'email')`,
// //         [
// //           meeting.lead_id,
// //           meeting.lead_phone,
// //           `Your meeting is scheduled for ${moment(meeting.scheduled_time).format('MMMM Do, YYYY [at] h:mm A')}`,
// //           reminderTime.toISOString()
// //         ]
// //       );
// //     }

// //     if (reminderSettings.sms_reminder) {
// //       const reminderTime = moment(meeting.scheduled_time)
// //         .subtract(reminderSettings.reminder_before_hours, 'hours');

// //       await client.query(
// //         `INSERT INTO notifications 
// //          (lead_id, phone_number, notification_type, title, message, 
// //           scheduled_time, delivery_channel)
// //          VALUES ($1, $2, 'meeting_reminder', 'Meeting Reminder', $3, $4, 'sms')`,
// //         [
// //           meeting.lead_id,
// //           meeting.lead_phone,
// //           `Reminder: Meeting tomorrow at ${moment(meeting.scheduled_time).format('h:mm A')}`,
// //           reminderTime.toISOString()
// //         ]
// //       );
// //     }
// //   }

// //   /**
// //    * Helper: Send confirmation email
// //    */
// //   async sendConfirmationEmail(client, meeting, link) {
// //     const emailBody = link.confirmation_message || 
// //       `Your meeting has been confirmed for ${moment(meeting.scheduled_time).format('MMMM Do, YYYY [at] h:mm A')}`;

// //     await client.query(
// //       `INSERT INTO email_queue 
// //        (to_email, subject, body, lead_id, priority, status)
// //        VALUES ($1, $2, $3, $4, 'high', 'pending')`,
// //       [
// //         meeting.lead_email,
// //         `Meeting Confirmed - ${link.link_name}`,
// //         emailBody,
// //         meeting.lead_id
// //       ]
// //     );
// //   }

// //   /**
// //    * Helper: Send cancellation email
// //    */
// //   async sendCancellationEmail(client, meeting) {
// //     await client.query(
// //       `INSERT INTO email_queue 
// //        (to_email, subject, body, lead_id, priority, status)
// //        VALUES ($1, $2, $3, $4, 'high', 'pending')`,
// //       [
// //         meeting.lead_email,
// //         'Meeting Cancelled',
// //         `Your meeting scheduled for ${moment(meeting.scheduled_time).format('MMMM Do, YYYY [at] h:mm A')} has been cancelled.`,
// //         meeting.lead_id
// //       ]
// //     );
// //   }
// // }

// // // module.exports = MeetingSchedulerService;
// // module.exports = new MeetingSchedulerService(pool);





// const pool = require('../../config/database');
// const { google } = require('googleapis');
// const moment = require('moment-timezone');

// // Simple console logger (works everywhere)
// const logger = {
//   info: (msg, ...args) => console.log('[INFO]', msg, ...args),
//   error: (msg, ...args) => console.error('[ERROR]', msg, ...args),
//   warn: (msg, ...args) => console.warn('[WARN]', msg, ...args)
// };

// class MeetingSchedulerService {
//   /**
//    * Create scheduling link
//    */
//   async createSchedulingLink(linkData) {
//     const client = await pool.connect();
//     try {
//       await client.query('BEGIN');

//       const {
//         company_id,
//         agent_id,
//         link_name,
//         link_slug,
//         meeting_duration = 30,
//         meeting_type,
//         description,
//         location_type = 'virtual',
//         location_details,
//         availability_rules,
//         buffer_time_before = 0,
//         buffer_time_after = 15,
//         max_bookings_per_day = null,
//         advance_notice_hours = 24,
//         max_days_advance = 60,
//         custom_questions = [],
//         confirmation_message,
//         reminder_settings = {}
//       } = linkData;

//       const result = await client.query(
//         `INSERT INTO scheduling_links 
//          (company_id, agent_id, link_name, link_slug, meeting_duration, meeting_type,
//           description, location_type, location_details, availability_rules,
//           buffer_time_before, buffer_time_after, max_bookings_per_day,
//           advance_notice_hours, max_days_advance, custom_questions,
//           confirmation_message, reminder_settings, is_active)
//          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, true)
//          RETURNING *`,
//         [
//           company_id, agent_id, link_name, link_slug, meeting_duration, meeting_type,
//           description, location_type, location_details, JSON.stringify(availability_rules),
//           buffer_time_before, buffer_time_after, max_bookings_per_day,
//           advance_notice_hours, max_days_advance, JSON.stringify(custom_questions),
//           confirmation_message, JSON.stringify(reminder_settings)
//         ]
//       );

//       await client.query('COMMIT');

//       const link = result.rows[0];
//       link.public_url = `${process.env.APP_URL || 'http://localhost:3000'}/schedule/${link_slug}`;

//       logger.info(`Scheduling link created: ${link.id}`);
//       return link;
//     } catch (error) {
//       await client.query('ROLLBACK');
//       logger.error('Create scheduling link error:', error.message);
//       throw error;
//     } finally {
//       client.release();
//     }
//   }

//   /**
//    * Get scheduling link by ID
//    */
//   async getSchedulingLink(linkId) {
//     const result = await pool.query(
//       `SELECT sl.*, 
//         json_build_object(
//           'id', ha.id,
//           'name', ha.name,
//           'email', ha.email
//         ) as agent
//       FROM scheduling_links sl
//       LEFT JOIN human_agents ha ON sl.agent_id = ha.id
//       WHERE sl.id = $1`,
//       [linkId]
//     );

//     if (result.rows.length === 0) {
//       throw new Error('Scheduling link not found');
//     }

//     return result.rows[0];
//   }

//   /**
//    * Get scheduling link by slug
//    */
//   async getSchedulingLinkBySlug(slug) {
//     const result = await pool.query(
//       `SELECT sl.*, 
//         json_build_object(
//           'id', ha.id,
//           'name', ha.name,
//           'email', ha.email
//         ) as agent
//       FROM scheduling_links sl
//       LEFT JOIN human_agents ha ON sl.agent_id = ha.id
//       WHERE sl.link_slug = $1 AND sl.is_active = true`,
//       [slug]
//     );

//     if (result.rows.length === 0) {
//       throw new Error('Scheduling link not found');
//     }

//     return result.rows[0];
//   }

//   /**
//    * Get available slots
//    */
//   async getAvailableSlots(linkId, startDate, endDate) {
//     try {
//       const link = await this.getSchedulingLink(linkId);
//       const timezone = 'Asia/Kolkata';
      
//       const start = moment.tz(startDate, timezone);
//       const end = moment.tz(endDate, timezone);
      
//       const allSlots = [];
//       let currentDate = start.clone();

//       while (currentDate.isSameOrBefore(end, 'day')) {
//         const dayOfWeek = currentDate.format('dddd').toLowerCase();
//         const availabilityRules = typeof link.availability_rules === 'string' 
//           ? JSON.parse(link.availability_rules) 
//           : link.availability_rules;

//         const dayRule = availabilityRules[dayOfWeek];

//         if (dayRule && dayRule.available) {
//           const dayStart = moment.tz(`${currentDate.format('YYYY-MM-DD')} ${dayRule.start_time}`, timezone);
//           const dayEnd = moment.tz(`${currentDate.format('YYYY-MM-DD')} ${dayRule.end_time}`, timezone);

//           // Get existing bookings for this day
//           const bookings = await pool.query(
//             `SELECT scheduled_time, end_time
//              FROM scheduled_meetings
//              WHERE scheduling_link_id = $1
//              AND DATE(scheduled_time AT TIME ZONE $2) = $3
//              AND status NOT IN ('cancelled', 'no_show')`,
//             [linkId, timezone, currentDate.format('YYYY-MM-DD')]
//           );

//           let slotTime = dayStart.clone();
          
//           while (slotTime.isBefore(dayEnd)) {
//             const slotEnd = slotTime.clone().add(link.meeting_duration, 'minutes');
            
//             // Check if in the future
//             if (slotTime.isBefore(moment())) {
//               slotTime.add(15, 'minutes');
//               continue;
//             }

//             // Check conflicts
//             const hasConflict = bookings.rows.some(booking => {
//               const bookingStart = moment(booking.scheduled_time).tz(timezone);
//               const bookingEnd = moment(booking.end_time).tz(timezone);
              
//               return slotTime.isBetween(bookingStart, bookingEnd, null, '[)') ||
//                      slotEnd.isBetween(bookingStart, bookingEnd, null, '(]');
//             });

//             if (!hasConflict) {
//               allSlots.push({
//                 start_time: slotTime.toISOString(),
//                 end_time: slotEnd.toISOString(),
//                 display_time: slotTime.format('h:mm A')
//               });
//             }

//             slotTime.add(15, 'minutes');
//           }
//         }

//         currentDate.add(1, 'day');
//       }

//       return allSlots;
//     } catch (error) {
//       logger.error('Get available slots error:', error.message);
//       throw error;
//     }
//   }

//   /**
//    * Book meeting
//    */
//   async bookMeeting(bookingData) {
//     const client = await pool.connect();
    
//     try {
//       await client.query('BEGIN');

//       const {
//         scheduling_link_id,
//         lead_id = null,
//         attendee_name,
//         attendee_email,
//         attendee_phone,
//         start_time,
//         timezone = 'Asia/Kolkata',
//         answers = {},
//         notes
//       } = bookingData;

//       const link = await this.getSchedulingLink(scheduling_link_id);
//       const endTime = moment(start_time).add(link.meeting_duration, 'minutes').toISOString();

//       // Create meeting
//       const result = await client.query(
//         `INSERT INTO scheduled_meetings 
//          (scheduling_link_id, lead_id, lead_name, lead_email, lead_phone,
//           scheduled_time, end_time, duration_minutes, timezone, 
//           location_type, location_details, custom_answers, notes, 
//           status, confirmation_code)
//          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'confirmed', $14)
//          RETURNING *`,
//         [
//           scheduling_link_id, lead_id, attendee_name, attendee_email, attendee_phone,
//           start_time, endTime, link.meeting_duration, timezone,
//           link.location_type, link.location_details, 
//           JSON.stringify(answers), notes,
//           this.generateConfirmationCode()
//         ]
//       );

//       await client.query('COMMIT');

//       logger.info(`Meeting booked: ${result.rows[0].id}`);
//       return result.rows[0];
//     } catch (error) {
//       await client.query('ROLLBACK');
//       logger.error('Book meeting error:', error.message);
//       throw error;
//     } finally {
//       client.release();
//     }
//   }

//   /**
//    * Get meetings for a company
//    */
//   async getMeetings(companyId, filters = {}) {
//     const { status, from_date, to_date, limit = 50, offset = 0 } = filters;

//     let query = `
//       SELECT sm.*, 
//         json_build_object(
//           'id', sl.id,
//           'name', sl.link_name,
//           'agent_id', sl.agent_id
//         ) as scheduling_link,
//         json_build_object(
//           'id', l.id,
//           'name', l.name,
//           'email', l.email,
//           'phone_number', l.phone_number
//         ) as lead
//       FROM scheduled_meetings sm
//       JOIN scheduling_links sl ON sm.scheduling_link_id = sl.id
//       LEFT JOIN leads l ON sm.lead_id = l.id
//       WHERE sl.company_id = $1
//     `;

//     const params = [companyId];
//     let paramIndex = 2;

//     if (status) {
//       query += ` AND sm.status = $${paramIndex++}`;
//       params.push(status);
//     }

//     if (from_date) {
//       query += ` AND sm.scheduled_time >= $${paramIndex++}`;
//       params.push(from_date);
//     }

//     if (to_date) {
//       query += ` AND sm.scheduled_time <= $${paramIndex++}`;
//       params.push(to_date);
//     }

//     query += ` ORDER BY sm.scheduled_time DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
//     params.push(limit, offset);

//     const result = await pool.query(query, params);
//     return result.rows;
//   }

//   /**
//    * Cancel meeting
//    */
//   async cancelMeeting(meetingId, reason) {
//     await pool.query(
//       `UPDATE scheduled_meetings 
//        SET status = 'cancelled', 
//            cancellation_reason = $1,
//            cancelled_at = CURRENT_TIMESTAMP
//        WHERE id = $2`,
//       [reason, meetingId]
//     );

//     logger.info(`Meeting cancelled: ${meetingId}`);
//     return { success: true, message: 'Meeting cancelled' };
//   }

//   /**
//    * Reschedule meeting
//    */
//   async rescheduleMeeting(meetingId, newStartTime) {
//     const client = await pool.connect();
    
//     try {
//       await client.query('BEGIN');

//       const meetingResult = await client.query(
//         `SELECT sm.*, sl.meeting_duration
//          FROM scheduled_meetings sm
//          JOIN scheduling_links sl ON sm.scheduling_link_id = sl.id
//          WHERE sm.id = $1`,
//         [meetingId]
//       );

//       if (meetingResult.rows.length === 0) {
//         throw new Error('Meeting not found');
//       }

//       const meeting = meetingResult.rows[0];
//       const newEndTime = moment(newStartTime).add(meeting.meeting_duration, 'minutes').toISOString();

//       await client.query(
//         `UPDATE scheduled_meetings 
//          SET scheduled_time = $1, 
//              end_time = $2, 
//              updated_at = CURRENT_TIMESTAMP
//          WHERE id = $3`,
//         [newStartTime, newEndTime, meetingId]
//       );

//       await client.query('COMMIT');

//       logger.info(`Meeting rescheduled: ${meetingId}`);
//       return { success: true, message: 'Meeting rescheduled' };
//     } catch (error) {
//       await client.query('ROLLBACK');
//       logger.error('Reschedule meeting error:', error.message);
//       throw error;
//     } finally {
//       client.release();
//     }
//   }

//   /**
//    * Generate confirmation code
//    */
//   generateConfirmationCode() {
//     return Math.random().toString(36).substring(2, 15) + 
//            Math.random().toString(36).substring(2, 15);
//   }
// }

// module.exports = new MeetingSchedulerService();










const { google } = require('googleapis');
const moment = require('moment-timezone');
const crypto = require('crypto');
const logger = require('../../utils/logger');

class MeetingSchedulerService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Create scheduling link
   */
  async createSchedulingLink(companyId, agentId, linkData) {
    try {
      const {
        link_name,
        link_slug,
        meeting_duration = 30,
        meeting_type,
        description,
        location_type = 'virtual',
        location_details,
        availability_rules,
        buffer_time_before = 0,
        buffer_time_after = 15,
        max_bookings_per_day = null,
        advance_notice_hours = 24,
        max_days_advance = 60,
        custom_questions = [],
        confirmation_message,
        reminder_settings = {
          email_reminder: true,
          sms_reminder: false,
          reminder_before_hours: 24
        }
      } = linkData;

      // Validate required fields
      if (!link_name || link_name.trim().length === 0) {
        throw new Error('Link name is required');
      }

      if (!link_slug || !/^[a-z0-9-]+$/.test(link_slug)) {
        throw new Error('Link slug is required and must contain only lowercase letters, numbers, and hyphens');
      }

      if (!availability_rules || Object.keys(availability_rules).length === 0) {
        throw new Error('Availability rules are required');
      }

      const result = await this.pool.query(
        `INSERT INTO scheduling_links 
         (company_id, agent_id, link_name, link_slug, meeting_duration, meeting_type,
          description, location_type, location_details, availability_rules,
          buffer_time_before, buffer_time_after, max_bookings_per_day,
          advance_notice_hours, max_days_advance, custom_questions,
          confirmation_message, reminder_settings, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, true)
         RETURNING *`,
        [
          companyId, agentId, link_name, link_slug, meeting_duration, meeting_type,
          description, location_type, location_details, JSON.stringify(availability_rules),
          buffer_time_before, buffer_time_after, max_bookings_per_day,
          advance_notice_hours, max_days_advance, JSON.stringify(custom_questions),
          confirmation_message, JSON.stringify(reminder_settings)
        ]
      );

      logger.info(`Scheduling link created: ${result.rows[0].id}`);

      return {
        ...result.rows[0],
        public_url: `${process.env.APP_URL}/schedule/${link_slug}`
      };
    } catch (error) {
      if (error.code === '23505') { // Unique violation
        throw new Error('Link slug already exists. Please choose a different one.');
      }
      logger.error('Create scheduling link error:', error);
      throw error;
    }
  }

  /**
   * Get available time slots for a scheduling link
   */
  async getAvailableSlots(linkSlug, selectedDate, timezone = 'Asia/Kolkata') {
    try {
      // Get scheduling link
      const linkResult = await this.pool.query(
        `SELECT sl.*, ha.email as agent_email, ha.name as agent_name
         FROM scheduling_links sl
         JOIN human_agents ha ON sl.agent_id = ha.id
         WHERE sl.link_slug = $1 AND sl.is_active = true`,
        [linkSlug]
      );

      if (linkResult.rows.length === 0) {
        throw new Error('Scheduling link not found');
      }

      const link = linkResult.rows[0];
      const date = moment.tz(selectedDate, timezone);
      const dayOfWeek = date.format('dddd').toLowerCase();

      // Parse availability rules
      const availabilityRules = typeof link.availability_rules === 'string' 
        ? JSON.parse(link.availability_rules) 
        : link.availability_rules;

      const dayRule = availabilityRules[dayOfWeek];

      if (!dayRule || !dayRule.available) {
        return { 
          available_slots: [], 
          message: 'Not available on this day',
          link_name: link.link_name,
          agent_name: link.agent_name
        };
      }

      // Check advance notice
      const minBookingTime = moment.tz(timezone).add(link.advance_notice_hours, 'hours');
      const maxBookingTime = moment.tz(timezone).add(link.max_days_advance, 'days');

      if (date.isBefore(minBookingTime, 'day') || date.isAfter(maxBookingTime, 'day')) {
        return { 
          available_slots: [], 
          message: `Bookings must be between ${link.advance_notice_hours} hours and ${link.max_days_advance} days in advance`,
          link_name: link.link_name,
          agent_name: link.agent_name
        };
      }

      // Get existing bookings for this day
      const existingBookings = await this.pool.query(
        `SELECT scheduled_time, duration_minutes
         FROM scheduled_meetings
         WHERE scheduling_link_id = $1
         AND DATE(scheduled_time AT TIME ZONE $2) = $3
         AND status NOT IN ('cancelled', 'no_show')`,
        [link.id, timezone, date.format('YYYY-MM-DD')]
      );

      // Check max bookings per day
      if (link.max_bookings_per_day && existingBookings.rows.length >= link.max_bookings_per_day) {
        return { 
          available_slots: [], 
          message: 'Maximum bookings for this day reached',
          link_name: link.link_name,
          agent_name: link.agent_name
        };
      }

      // Generate time slots
      const slots = [];
      let currentTime = moment.tz(`${date.format('YYYY-MM-DD')} ${dayRule.start_time}`, timezone);
      const endTime = moment.tz(`${date.format('YYYY-MM-DD')} ${dayRule.end_time}`, timezone);

      while (currentTime.isBefore(endTime)) {
        const slotStart = currentTime.clone();
        const slotEnd = slotStart.clone().add(link.meeting_duration, 'minutes');

        // Check if slot end time exceeds availability end time
        if (slotEnd.isAfter(endTime)) {
          break;
        }

        // Check if slot is in valid booking window
        if (slotStart.isBefore(minBookingTime)) {
          currentTime.add(15, 'minutes');
          continue;
        }

        // Check if slot conflicts with existing bookings (including buffer times)
        const hasConflict = existingBookings.rows.some(booking => {
          const bookingStart = moment(booking.scheduled_time).tz(timezone)
            .subtract(link.buffer_time_before, 'minutes');
          const bookingEnd = moment(booking.scheduled_time).tz(timezone)
            .add(booking.duration_minutes + link.buffer_time_after, 'minutes');
          
          return (
            slotStart.isBetween(bookingStart, bookingEnd, null, '[)') ||
            slotEnd.isBetween(bookingStart, bookingEnd, null, '(]') ||
            (slotStart.isSameOrBefore(bookingStart) && slotEnd.isSameOrAfter(bookingEnd))
          );
        });

        if (!hasConflict) {
          slots.push({
            start_time: slotStart.toISOString(),
            end_time: slotEnd.toISOString(),
            display_time: slotStart.format('h:mm A'),
            timezone: timezone
          });
        }

        currentTime.add(15, 'minutes'); // 15-minute intervals
      }

      return { 
        available_slots: slots,
        link_name: link.link_name,
        agent_name: link.agent_name,
        meeting_duration: link.meeting_duration
      };
    } catch (error) {
      logger.error('Get available slots error:', error);
      throw error;
    }
  }

  /**
   * Book meeting with comprehensive validation
   */
  async bookMeeting(linkSlug, bookingData) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      const {
        lead_name,
        lead_email,
        lead_phone,
        scheduled_time,
        timezone = 'Asia/Kolkata',
        custom_answers = {},
        notes = null
      } = bookingData;

      // Validate required fields
      if (!lead_name || lead_name.trim().length === 0) {
        throw new Error('Lead name is required');
      }

      if (!lead_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead_email)) {
        throw new Error('Valid email address is required');
      }

      if (!scheduled_time) {
        throw new Error('Scheduled time is required');
      }

      // Get scheduling link
      const linkResult = await client.query(
        `SELECT * FROM scheduling_links WHERE link_slug = $1 AND is_active = true`,
        [linkSlug]
      );

      if (linkResult.rows.length === 0) {
        throw new Error('Scheduling link not found');
      }

      const link = linkResult.rows[0];

      // Verify slot is still available
      const slots = await this.getAvailableSlots(linkSlug, scheduled_time, timezone);
      const requestedTime = moment.tz(scheduled_time, timezone);
      
      const slotAvailable = slots.available_slots.some(slot => 
        moment(slot.start_time).isSame(requestedTime)
      );

      if (!slotAvailable) {
        throw new Error('Selected time slot is no longer available');
      }

      // Create or get lead
      let leadId;
      const existingLead = await client.query(
        'SELECT id FROM leads WHERE email = $1 AND company_id = $2',
        [lead_email, link.company_id]
      );

      if (existingLead.rows.length > 0) {
        leadId = existingLead.rows[0].id;
        
        await client.query(
          `UPDATE leads 
           SET name = $1, phone_number = $2, updated_at = NOW()
           WHERE id = $3`,
          [lead_name, lead_phone, leadId]
        );
      } else {
        const newLead = await client.query(
          `INSERT INTO leads (company_id, name, email, phone_number, lead_source, lead_status)
           VALUES ($1, $2, $3, $4, 'meeting_scheduler', 'new')
           RETURNING id`,
          [link.company_id, lead_name, lead_email, lead_phone]
        );
        leadId = newLead.rows[0].id;
      }

      // Generate confirmation code
      const confirmationCode = crypto.randomBytes(16).toString('hex');

      // Create scheduled meeting
      const meetingResult = await client.query(
        `INSERT INTO scheduled_meetings 
         (scheduling_link_id, lead_id, lead_name, lead_email, lead_phone,
          scheduled_time, duration_minutes, timezone, location_type, location_details,
          custom_answers, notes, status, confirmation_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'confirmed', $13)
         RETURNING *`,
        [
          link.id, leadId, lead_name, lead_email, lead_phone,
          scheduled_time, link.meeting_duration, timezone,
          link.location_type, link.location_details,
          JSON.stringify(custom_answers), notes, confirmationCode
        ]
      );

      const meeting = meetingResult.rows[0];

      // Create booking in bookings table
      await client.query(
        `INSERT INTO bookings 
         (lead_id, phone_number, booking_type, scheduled_date, duration_minutes, status, notes)
         VALUES ($1, $2, $3, $4, $5, 'confirmed', $6)`,
        [leadId, lead_phone, link.meeting_type || 'meeting', scheduled_time, link.meeting_duration, notes]
      );

      // Schedule reminders
      await this.scheduleReminders(client, meeting, link);

      // Send confirmation email
      await this.sendConfirmationEmail(client, meeting, link);

      // Create activity
      await client.query(
        `INSERT INTO activity_feed 
         (company_id, lead_id, activity_type, activity_description)
         VALUES ($1, $2, 'meeting_scheduled', $3)`,
        [link.company_id, leadId, `Meeting scheduled for ${requestedTime.format('MMMM Do, YYYY [at] h:mm A')}`]
      );

      await client.query('COMMIT');

      logger.info(`Meeting booked successfully: ${meeting.id}`);

      return {
        ...meeting,
        public_url: `${process.env.APP_URL}/meeting/${meeting.confirmation_code}`
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Book meeting error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Cancel meeting
   */
  async cancelMeeting(confirmationCode, reason = null) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `UPDATE scheduled_meetings 
         SET status = 'cancelled', 
             cancellation_reason = $1,
             cancelled_at = NOW()
         WHERE confirmation_code = $2 AND status != 'cancelled'
         RETURNING *`,
        [reason, confirmationCode]
      );

      if (result.rows.length === 0) {
        throw new Error('Meeting not found or already cancelled');
      }

      const meeting = result.rows[0];

      // Send cancellation email
      await this.sendCancellationEmail(client, meeting);

      // Cancel reminders
      await client.query(
        `UPDATE meeting_reminders 
         SET status = 'cancelled'
         WHERE meeting_id = $1 AND status = 'pending'`,
        [meeting.id]
      );

      await client.query('COMMIT');

      logger.info(`Meeting cancelled: ${meeting.id}`);
      return { success: true, meeting };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Cancel meeting error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Reschedule meeting
   */
  async rescheduleMeeting(confirmationCode, newScheduledTime, timezone = 'Asia/Kolkata') {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Get current meeting
      const meetingResult = await client.query(
        `SELECT sm.*, sl.link_slug
         FROM scheduled_meetings sm
         JOIN scheduling_links sl ON sm.scheduling_link_id = sl.id
         WHERE sm.confirmation_code = $1 AND sm.status = 'confirmed'`,
        [confirmationCode]
      );

      if (meetingResult.rows.length === 0) {
        throw new Error('Meeting not found or cannot be rescheduled');
      }

      const meeting = meetingResult.rows[0];

      // Verify new slot is available
      const slots = await this.getAvailableSlots(meeting.link_slug, newScheduledTime, timezone);
      const requestedTime = moment.tz(newScheduledTime, timezone);
      
      const slotAvailable = slots.available_slots.some(slot => 
        moment(slot.start_time).isSame(requestedTime)
      );

      if (!slotAvailable) {
        throw new Error('Selected time slot is not available');
      }

      // Update meeting
      const updateResult = await client.query(
        `UPDATE scheduled_meetings 
         SET scheduled_time = $1, 
             timezone = $2,
             status = 'rescheduled',
             updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [newScheduledTime, timezone, meeting.id]
      );

      // Reschedule reminders
      await client.query(
        `DELETE FROM meeting_reminders WHERE meeting_id = $1`,
        [meeting.id]
      );

      const link = await client.query(
        `SELECT * FROM scheduling_links WHERE id = $1`,
        [meeting.scheduling_link_id]
      );

      await this.scheduleReminders(client, updateResult.rows[0], link.rows[0]);

      // Send reschedule notification
      await this.sendRescheduleEmail(client, updateResult.rows[0]);

      await client.query('COMMIT');

      logger.info(`Meeting rescheduled: ${meeting.id}`);
      return updateResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Reschedule meeting error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Helper: Schedule reminders
   */
  async scheduleReminders(client, meeting, link) {
    const reminderSettings = typeof link.reminder_settings === 'string'
      ? JSON.parse(link.reminder_settings)
      : link.reminder_settings;
    
    const meetingTime = moment(meeting.scheduled_time);

    if (reminderSettings.email_reminder) {
      const reminderTime = meetingTime.clone().subtract(reminderSettings.reminder_before_hours || 24, 'hours');

      if (reminderTime.isAfter(moment())) {
        await client.query(
          `INSERT INTO meeting_reminders 
           (meeting_id, reminder_type, minutes_before, scheduled_for, status)
           VALUES ($1, 'email', $2, $3, 'pending')`,
          [meeting.id, (reminderSettings.reminder_before_hours || 24) * 60, reminderTime.toISOString()]
        );
      }
    }

    if (reminderSettings.sms_reminder) {
      const reminderTime = meetingTime.clone().subtract(reminderSettings.reminder_before_hours || 24, 'hours');

      if (reminderTime.isAfter(moment())) {
        await client.query(
          `INSERT INTO meeting_reminders 
           (meeting_id, reminder_type, minutes_before, scheduled_for, status)
           VALUES ($1, 'sms', $2, $3, 'pending')`,
          [meeting.id, (reminderSettings.reminder_before_hours || 24) * 60, reminderTime.toISOString()]
        );
      }
    }
  }

  /**
   * Helper: Send confirmation email
   */
  async sendConfirmationEmail(client, meeting, link) {
    const confirmationMessage = link.confirmation_message || 
      `Your meeting has been confirmed for ${moment(meeting.scheduled_time).format('MMMM Do, YYYY [at] h:mm A')}`;

    await client.query(
      `INSERT INTO email_queue 
       (to_email, subject, body, lead_id, priority, status, email_type)
       VALUES ($1, $2, $3, $4, 'high', 'pending', 'meeting_confirmation')`,
      [
        meeting.lead_email,
        `Meeting Confirmed - ${link.link_name}`,
        confirmationMessage,
        meeting.lead_id
      ]
    );
  }

  /**
   * Helper: Send cancellation email
   */
  async sendCancellationEmail(client, meeting) {
    await client.query(
      `INSERT INTO email_queue 
       (to_email, subject, body, lead_id, priority, status, email_type)
       VALUES ($1, $2, $3, $4, 'high', 'pending', 'meeting_cancellation')`,
      [
        meeting.lead_email,
        'Meeting Cancelled',
        `Your meeting scheduled for ${moment(meeting.scheduled_time).format('MMMM Do, YYYY [at] h:mm A')} has been cancelled.${meeting.cancellation_reason ? `\n\nReason: ${meeting.cancellation_reason}` : ''}`,
        meeting.lead_id
      ]
    );
  }

  /**
   * Helper: Send reschedule email
   */
  async sendRescheduleEmail(client, meeting) {
    await client.query(
      `INSERT INTO email_queue 
       (to_email, subject, body, lead_id, priority, status, email_type)
       VALUES ($1, $2, $3, $4, 'high', 'pending', 'meeting_rescheduled')`,
      [
        meeting.lead_email,
        'Meeting Rescheduled',
        `Your meeting has been rescheduled to ${moment(meeting.scheduled_time).format('MMMM Do, YYYY [at] h:mm A')}.`,
        meeting.lead_id
      ]
    );
  }

  /**
   * Get meetings for a company
   */
  async getMeetings(companyId, filters = {}) {
    try {
      const { 
        status, 
        agent_id, 
        from_date, 
        to_date, 
        limit = 50, 
        offset = 0 
      } = filters;

      let query = `
        SELECT sm.*, 
               sl.link_name, sl.meeting_type,
               ha.name as agent_name, ha.email as agent_email
        FROM scheduled_meetings sm
        JOIN scheduling_links sl ON sm.scheduling_link_id = sl.id
        JOIN human_agents ha ON sl.agent_id = ha.id
        WHERE sl.company_id = $1
      `;

      const params = [companyId];
      let paramCount = 1;

      if (status) {
        params.push(status);
        query += ` AND sm.status = $${++paramCount}`;
      }

      if (agent_id) {
        params.push(agent_id);
        query += ` AND sl.agent_id = $${++paramCount}`;
      }

      if (from_date) {
        params.push(from_date);
        query += ` AND sm.scheduled_time >= $${++paramCount}`;
      }

      if (to_date) {
        params.push(to_date);
        query += ` AND sm.scheduled_time <= $${++paramCount}`;
      }

      query += ` ORDER BY sm.scheduled_time DESC LIMIT $${++paramCount} OFFSET $${++paramCount}`;
      params.push(limit, offset);

      const result = await this.pool.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Get meetings error:', error);
      throw error;
    }
  }
}

module.exports = MeetingSchedulerService;