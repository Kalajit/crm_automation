const pool = require('../../config/database');
const groq = require('groq-sdk');
const axios = require('axios');
const logger = require('../../utils/logger');
const { translateText } = require('../../config/translation');

// Generate customer-friendly call summary
exports.generateCustomerSummary = async (call_sid) => {
  try {
    const callResult = await pool.query(`
      SELECT 
        cl.*,
        l.name as lead_name,
        l.email,
        l.phone_number,
        l.preferred_language,
        c.name as company_name
      FROM call_logs cl
      JOIN leads l ON cl.lead_id = l.id
      JOIN companies c ON cl.company_id = c.id
      WHERE cl.call_sid = $1
    `, [call_sid]);
    
    if (callResult.rows.length === 0) {
      throw new Error('Call log not found');
    }
    
    const call = callResult.rows[0];
    const summary = call.summary || {};
    const sentiment = call.sentiment || {};
    
    const client = new groq.Groq({ apiKey: process.env.GROQ_API_KEY });
    
    const prompt = `
Transform this call summary into a professional, customer-friendly message:

Call Details:
- Duration: ${call.call_duration} seconds
- Sentiment: ${sentiment.sentiment || 'neutral'}
- Intent: ${summary.intent || 'general inquiry'}

AI Summary: ${summary.summary || 'Call completed successfully'}

Create a brief, professional summary (max 200 words) that:
1. Thanks them for their time
2. Highlights key discussion points
3. Mentions next steps if any
4. Maintains a warm, professional tone

Format as plain text, no markdown.
`;
    
    const completion = await client.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 300
    });
    
    const customerSummary = completion.choices[0].message.content.trim();
    
    let finalSummary = customerSummary;
    if (call.preferred_language && call.preferred_language !== 'en') {
      finalSummary = await translateText(customerSummary, call.preferred_language, 'en');
    }
    
    await pool.query(`
      UPDATE call_logs
      SET summary = jsonb_set(
        COALESCE(summary, '{}'::jsonb),
        '{customer_summary}',
        to_jsonb($1::text)
      )
      WHERE call_sid = $2
    `, [finalSummary, call_sid]);
    
    return {
      summary: finalSummary,
      lead: call,
      company_name: call.company_name
    };
    
  } catch (error) {
    logger.error('Generate customer summary error:', error);
    throw error;
  }
};

// Get company email configuration
async function getCompanyEmailConfig(company_id) {
  const result = await pool.query(
    'SELECT email_address, email_password, smtp_host, smtp_port FROM companies WHERE id = $1',
    [company_id]
  );
  
  if (result.rows.length === 0) {
    throw new Error('Company email configuration not found');
  }
  
  return result.rows[0];
}

// Create email transporter
async function createEmailTransporter(emailConfig) {
  const nodemailer = require('nodemailer');
  
  return nodemailer.createTransport({
    host: emailConfig.smtp_host || 'smtp.gmail.com',
    port: emailConfig.smtp_port || 587,
    secure: false,
    auth: {
      user: emailConfig.email_address,
      pass: emailConfig.email_password
    }
  });
}

// Send call summary via email
exports.sendCallSummaryEmail = async (call_sid) => {
  try {
    const summaryData = await exports.generateCustomerSummary(call_sid);
    const { summary, lead, company_name } = summaryData;
    
    if (!lead.email) {
      logger.info(`No email available for lead ${lead.id}, skipping email summary`);
      return { success: false, reason: 'No email address' };
    }
    
    const emailConfig = await getCompanyEmailConfig(lead.company_id || 1);
    const transporter = await createEmailTransporter(emailConfig);
    
    const emailHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Call Summary</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
    .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
    .summary-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea; }
    .footer { text-align: center; margin-top: 30px; color: #6c757d; font-size: 14px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>📞 Call Summary</h1>
    <p>Thank you for speaking with ${company_name}</p>
  </div>
  <div class="content">
    <p>Dear ${lead.name || 'Valued Customer'},</p>
    
    <div class="summary-box">
      ${summary.split('\n').map(line => `<p>${line}</p>`).join('')}
    </div>
    
    <p>If you have any questions or need further assistance, please don't hesitate to reach out.</p>
    
    <div class="footer">
      <p><strong>${company_name}</strong></p>
      <p>This is an automated summary. Please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>
    `;
    
    const mailOptions = {
      from: `${company_name} <${emailConfig.email_address}>`,
      to: lead.email,
      subject: `Call Summary - ${company_name}`,
      html: emailHTML
    };
    
    const info = await transporter.sendMail(mailOptions);
    
    await pool.query(`
      INSERT INTO email_queue (to_email, subject, body, lead_id, status, sent_at)
      VALUES ($1, $2, $3, $4, 'sent', NOW())
    `, [lead.email, mailOptions.subject, 'Call summary sent', lead.id]);
    
    logger.info(`✅ Call summary email sent to ${lead.email}`);
    return { success: true, message_id: info.messageId };
    
  } catch (error) {
    logger.error('Send call summary email error:', error);
    return { success: false, error: error.message };
  }
};

// Send call summary via WhatsApp
exports.sendCallSummaryWhatsApp = async (call_sid) => {
  try {
    const summaryData = await exports.generateCustomerSummary(call_sid);
    const { summary, lead, company_name } = summaryData;
    
    const agentResult = await pool.query(`
      SELECT ai.*
      FROM agent_instances ai
      WHERE ai.company_id = $1 
      AND ai.agent_type = 'whatsapp'
      AND ai.is_active = TRUE
      LIMIT 1
    `, [lead.company_id || 1]);
    
    if (agentResult.rows.length === 0) {
      logger.info('No WhatsApp agent available for summary delivery');
      return { success: false, reason: 'No WhatsApp agent configured' };
    }
    
    const agent = agentResult.rows[0];
    const credentials = agent.whatsapp_credentials;
    
    if (!credentials.access_token) {
      return { success: false, reason: 'WhatsApp not configured' };
    }
    
    const message = `📞 *Call Summary*\n\n${summary}\n\n_Thank you for speaking with ${company_name}_`;
    
    const response = await axios.post(
      `https://graph.facebook.com/v21.0/${credentials.phone_number_id}/messages`,
      {
        messaging_product: 'whatsapp',
        to: lead.phone_number.replace('+', ''),
        type: 'text',
        text: { body: message }
      },
      {
        headers: {
          'Authorization': `Bearer ${credentials.access_token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    await pool.query(`
      INSERT INTO whatsapp_messages 
      (lead_id, phone_number, message_type, message_body, sender, is_from_user, message_id)
      VALUES ($1, $2, 'text', $3, 'bot', FALSE, $4)
    `, [lead.id, lead.phone_number, message, response.data.messages[0].id]);
    
    logger.info(`✅ Call summary WhatsApp sent to ${lead.phone_number}`);
    return { success: true, message_id: response.data.messages[0].id };
    
  } catch (error) {
    logger.error('Send call summary WhatsApp error:', error);
    return { success: false, error: error.message };
  }
};

// Automatically send summaries after call completion
exports.autoSendCallSummaries = async (call_sid) => {
  try {
    const callResult = await pool.query(`
      SELECT l.email, l.phone_number, l.preferred_language, cl.company_id
      FROM call_logs cl
      JOIN leads l ON cl.lead_id = l.id
      WHERE cl.call_sid = $1
    `, [call_sid]);
    
    if (callResult.rows.length === 0) {
      logger.info('No lead found for call summary delivery');
      return;
    }
    
    const lead = callResult.rows[0];
    const results = [];
    
    if (lead.email) {
      const emailResult = await exports.sendCallSummaryEmail(call_sid);
      results.push({ channel: 'email', ...emailResult });
    }
    
    const whatsappResult = await exports.sendCallSummaryWhatsApp(call_sid);
    results.push({ channel: 'whatsapp', ...whatsappResult });
    
    logger.info(`📊 Summary delivery results for ${call_sid}:`, results);
    return results;
    
  } catch (error) {
    logger.error('Auto send summaries error:', error);
    throw error;
  }
};