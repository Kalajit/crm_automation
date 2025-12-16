const pool = require('../../config/database');
const nodemailer = require('nodemailer');
const { decryptToken, getValidAccessToken } = require('../../utils/encryption');

async function getCompanyEmailConfig(company_id) {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        email_address,
        provider,
        oauth_access_token,
        oauth_refresh_token,
        oauth_token_expires_at
      FROM email_configs
      WHERE company_id = $1 AND is_active = TRUE
      ORDER BY created_at DESC
      LIMIT 1
    `, [company_id]);
    
    if (result.rows.length === 0) {
      throw new Error('No active email configuration found for this company. Please connect an email account first.');
    }
    
    return result.rows[0];
  } catch (error) {
    console.error('Error fetching email config:', error);
    throw error;
  }
}

async function createEmailTransporter(emailConfig) {
  try {
    const accessToken = await getValidAccessToken(emailConfig);
    const refreshToken = decryptToken(emailConfig.oauth_refresh_token);
    
    if (emailConfig.provider === 'gmail') {
      return nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
          type: 'OAuth2',
          user: emailConfig.email_address,
          clientId: process.env.GMAIL_CLIENT_ID,
          clientSecret: process.env.GMAIL_CLIENT_SECRET,
          refreshToken: refreshToken,
          accessToken: accessToken
        }
      });
    } else if (emailConfig.provider === 'outlook') {
      return nodemailer.createTransport({
        host: 'smtp.office365.com',
        port: 587,
        secure: false,
        auth: {
          type: 'OAuth2',
          user: emailConfig.email_address,
          clientId: process.env.OUTLOOK_CLIENT_ID,
          clientSecret: process.env.OUTLOOK_CLIENT_SECRET,
          refreshToken: refreshToken,
          accessToken: accessToken
        }
      });
    } else {
      throw new Error(`Unsupported email provider: ${emailConfig.provider}`);
    }
  } catch (error) {
    console.error('Error creating email transporter:', error);
    throw error;
  }
}

function generateConfirmationEmailHTML(data) {
  const {
    lead_name,
    company_name,
    event_title,
    event_description,
    start_time,
    end_time,
    meeting_link,
    calendar_link,
    timezone
  } = data;
  
  const startDate = new Date(start_time);
  const endDate = new Date(end_time);
  
  const dateStr = startDate.toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  const timeStr = `${startDate.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit'
  })} - ${endDate.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit'
  })} ${timezone || 'IST'}`;
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Appointment Confirmation</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f5f5f5;
        }
        .container {
          background: white;
          border-radius: 10px;
          padding: 40px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 3px solid #667eea;
        }
        .header h1 {
          color: #667eea;
          margin: 0;
          font-size: 28px;
        }
        .check-icon {
          font-size: 48px;
          color: #28a745;
          margin-bottom: 10px;
        }
        .details {
          background: #f8f9fa;
          padding: 25px;
          border-radius: 8px;
          margin: 25px 0;
        }
        .detail-row {
          margin: 15px 0;
          padding: 10px 0;
          border-bottom: 1px solid #e9ecef;
        }
        .detail-row:last-child {
          border-bottom: none;
        }
        .detail-label {
          font-weight: bold;
          color: #495057;
          display: block;
          margin-bottom: 5px;
        }
        .detail-value {
          color: #212529;
          font-size: 16px;
        }
        .meeting-link {
          background: #667eea;
          color: white;
          padding: 15px 30px;
          text-decoration: none;
          border-radius: 5px;
          display: inline-block;
          margin: 20px 0;
          font-weight: bold;
        }
        .meeting-link:hover {
          background: #5568d3;
        }
        .calendar-link {
          background: #28a745;
          color: white;
          padding: 12px 25px;
          text-decoration: none;
          border-radius: 5px;
          display: inline-block;
          margin: 10px 5px;
          font-size: 14px;
        }
        .calendar-link:hover {
          background: #218838;
        }
        .footer {
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #e9ecef;
          text-align: center;
          color: #6c757d;
          font-size: 14px;
        }
        .note {
          background: #fff3cd;
          border-left: 4px solid #ffc107;
          padding: 15px;
          margin: 20px 0;
          border-radius: 4px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="check-icon">✓</div>
          <h1>Appointment Confirmed!</h1>
          <p style="color: #6c757d; margin: 10px 0 0 0;">Your appointment has been successfully scheduled</p>
        </div>
        
        <p>Dear ${lead_name || 'Valued Customer'},</p>
        
        <p>This email confirms your upcoming appointment with <strong>${company_name}</strong>.</p>
        
        <div class="details">
          <div class="detail-row">
            <span class="detail-label">📅 Appointment Title</span>
            <span class="detail-value">${event_title}</span>
          </div>
          
          ${event_description ? `
          <div class="detail-row">
            <span class="detail-label">📝 Description</span>
            <span class="detail-value">${event_description}</span>
          </div>
          ` : ''}
          
          <div class="detail-row">
            <span class="detail-label">📆 Date</span>
            <span class="detail-value">${dateStr}</span>
          </div>
          
          <div class="detail-row">
            <span class="detail-label">🕐 Time</span>
            <span class="detail-value">${timeStr}</span>
          </div>
        </div>
        
        ${meeting_link ? `
        <div style="text-align: center; margin: 30px 0;">
          <a href="${meeting_link}" class="meeting-link">Join Meeting</a>
          <p style="color: #6c757d; font-size: 14px; margin-top: 10px;">
            Click the button above to join the meeting at the scheduled time
          </p>
        </div>
        ` : ''}
        
        ${calendar_link ? `
        <div style="text-align: center; margin: 20px 0;">
          <a href="${calendar_link}" class="calendar-link">View in Calendar</a>
        </div>
        ` : ''}
        
        <div class="note">
          <strong>⏰ Reminder:</strong> We'll send you a reminder 24 hours and 30 minutes before your appointment.
        </div>
        
        <p style="margin-top: 30px;">
          If you need to reschedule or cancel this appointment, please contact us as soon as possible.
        </p>
        
        <div class="footer">
          <p><strong>${company_name}</strong></p>
          <p>This is an automated confirmation email.</p>
          <p style="color: #adb5bd; font-size: 12px; margin-top: 15px;">
            Please do not reply to this email. For questions, contact our support team.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

async function sendCalendarConfirmationEmail(calendar_event_id, company_id, lead_id = null) {
  try {
    console.log(`📧 Attempting to send confirmation email for event ${calendar_event_id}...`);
    
    const eventResult = await pool.query(`
      SELECT 
        ce.*,
        cc.user_email as organizer_email,
        cc.calendar_timezone
      FROM calendar_events ce
      JOIN calendar_configs cc ON ce.calendar_config_id = cc.id
      WHERE ce.id = $1
    `, [calendar_event_id]);
    
    if (eventResult.rows.length === 0) {
      throw new Error('Calendar event not found');
    }
    
    const event = eventResult.rows[0];
    
    let lead = null;
    if (lead_id || event.lead_id) {
      const leadResult = await pool.query(`
        SELECT name, email, phone_number
        FROM leads
        WHERE id = $1
      `, [lead_id || event.lead_id]);
      
      if (leadResult.rows.length > 0) {
        lead = leadResult.rows[0];
      }
    }
    
    const attendees = event.attendees ? (typeof event.attendees === 'string' ? JSON.parse(event.attendees) : event.attendees) : [];
    const recipientEmail = lead?.email || (attendees.length > 0 ? (attendees[0].email || attendees[0]) : null);
    
    if (!recipientEmail) {
      console.warn(`⚠️ No recipient email found for event ${calendar_event_id}. Skipping confirmation email.`);
      return {
        success: false,
        reason: 'No recipient email available'
      };
    }
    
    const companyResult = await pool.query(
      'SELECT name FROM companies WHERE id = $1',
      [company_id]
    );
    
    if (companyResult.rows.length === 0) {
      throw new Error('Company not found');
    }
    
    const company = companyResult.rows[0];
    
    const emailConfig = await getCompanyEmailConfig(company_id);
    
    const transporter = await createEmailTransporter(emailConfig);
    
    const emailData = {
      lead_name: lead?.name || 'Valued Customer',
      company_name: company.name,
      event_title: event.title,
      event_description: event.description,
      start_time: event.start_time,
      end_time: event.end_time,
      meeting_link: event.meeting_link,
      calendar_link: event.calendar_link || `https://calendar.google.com/calendar/event?eid=${event.event_id}`,
      timezone: event.calendar_timezone
    };
    
    const emailHTML = generateConfirmationEmailHTML(emailData);
    
    const mailOptions = {
      from: `${company.name} <${emailConfig.email_address}>`,
      to: recipientEmail,
      subject: `Appointment Confirmation - ${event.title}`,
      html: emailHTML
    };
    
    const info = await transporter.sendMail(mailOptions);
    
    await pool.query(`
      INSERT INTO email_queue (
        to_email,
        subject,
        body,
        lead_id,
        status,
        sent_at
      )
      VALUES ($1, $2, $3, $4, 'sent', NOW())
    `, [
      recipientEmail,
      mailOptions.subject,
      'Appointment confirmation email',
      lead_id || event.lead_id
    ]);
    
    await pool.query(`
      UPDATE calendar_events
      SET reminder_sent = TRUE
      WHERE id = $1
    `, [calendar_event_id]);
    
    console.log(`✅ Confirmation email sent successfully to ${recipientEmail}`);
    
    return {
      success: true,
      email_sent_to: recipientEmail,
      message_id: info.messageId
    };
  } catch (error) {
    console.error('❌ Send confirmation email error:', error);
    
    try {
      await pool.query(`
        INSERT INTO email_queue (
          to_email,
          subject,
          body,
          lead_id,
          status,
          error_message
        )
        VALUES ($1, $2, $3, $4, 'failed', $5)
      `, [
        'unknown',
        'Calendar Confirmation',
        'Failed to send',
        lead_id,
        error.message
      ]);
    } catch (logError) {
      console.error('Failed to log email error:', logError);
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  getCompanyEmailConfig,
  createEmailTransporter,
  generateConfirmationEmailHTML,
  sendCalendarConfirmationEmail
};