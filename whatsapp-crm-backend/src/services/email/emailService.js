const pool = require('../../config/database');
const axios = require('axios');
const groq = require('groq-sdk');

async function extractLeadFromEmail(emailData) {
  const { from, subject, body, company_id } = emailData;

  try {
    const rulesResult = await pool.query(
      'SELECT ai_rules FROM email_configs WHERE company_id = $1 AND is_active = TRUE LIMIT 1',
      [company_id]
    );

    const aiRules = rulesResult.rows[0]?.ai_rules || {};

    const client = new groq.Groq({ apiKey: process.env.GROQ_API_KEY });

    const prompt = `
You are an intelligent email lead filter for a CRM system. Analyze this email and determine if it contains a potential business lead or inquiry.

STRICT FILTERING RULES:
- ONLY extract leads from emails that are BUSINESS INQUIRIES, SALES INQUIRIES, or CUSTOMER REQUESTS
- IGNORE: newsletters, notifications, marketing emails, automated reports, account updates, social media notifications, promotional emails
- IGNORE: "no-reply" addresses, automated system emails, digests, updates
- A valid lead MUST show clear intent to: inquire about services, request information, ask for quotes, express interest in products/services, or seek business engagement

Email Details:
From: ${from}
Subject: ${subject}
Body (first 2000 chars):
${body.substring(0, 2000)}

Additional Rules: ${JSON.stringify(aiRules)}

RESPOND WITH ONLY THIS JSON FORMAT:
{
  "is_lead": true/false,
  "reason": "Brief explanation why this is or isn't a lead",
  "confidence": "high|medium|low",
  "name": "Full name if found (or null)",
  "phone_number": "Phone number in any format (or null)",
  "email": "Email address (or null)",
  "company": "Company name if mentioned (or null)",
  "interest": "What they're interested in (or null)",
  "urgency": "low|medium|high",
  "lead_type": "inquiry|quote_request|support|sales|general|null",
  "next_action": "Recommended next step (or null)"
}

EXAMPLES OF VALID LEADS:
- "Hi, I'm interested in your web development services..."
- "Can you provide a quote for..."
- "I'd like to schedule a demo..."
- "We're looking for a solution that..."

EXAMPLES OF NON-LEADS (IGNORE THESE):
- "Your Medium Daily Digest"
- "Weekly newsletter from..."
- "Password reset request"
- "Your order has been shipped"
- "New follower on..."
- "Team update: Project status"

JSON:`;

    const completion = await client.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 600
    });

    const responseText = completion.choices[0].message.content;
    
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }

    const extractedData = JSON.parse(jsonMatch[0]);

    if (extractedData.is_lead === false || extractedData.confidence === 'low') {
      console.log(`Email filtered out: ${extractedData.reason}`);
      return {
        is_lead: false,
        reason: extractedData.reason,
        confidence: extractedData.confidence
      };
    }

    if (!extractedData.phone_number) {
      const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
      const phoneMatches = body.match(phoneRegex);
      if (phoneMatches && phoneMatches.length > 0) {
        extractedData.phone_number = phoneMatches[0];
      }
    }

    if (!extractedData.email) {
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const emailMatches = body.match(emailRegex);
      if (emailMatches && emailMatches.length > 0) {
        extractedData.email = emailMatches[0];
      }
    }

    if (!extractedData.email) {
      const senderEmailMatch = from.match(/<(.+?)>/) || from.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      extractedData.email = senderEmailMatch ? (senderEmailMatch[1] || senderEmailMatch[0]) : from;
    }

    return extractedData;
  } catch (error) {
    console.error('AI extraction error:', error);
    
    const isLikelyLead = !from.toLowerCase().includes('noreply') && 
                         !from.toLowerCase().includes('no-reply') &&
                         !subject.toLowerCase().includes('newsletter') &&
                         !subject.toLowerCase().includes('digest') &&
                         !subject.toLowerCase().includes('notification');
    
    if (!isLikelyLead) {
      return {
        is_lead: false,
        reason: 'Automated or newsletter email detected',
        confidence: 'medium'
      };
    }
    
    return {
      is_lead: true,
      name: null,
      phone_number: extractPhoneFromText(body),
      email: extractEmailFromText(from + ' ' + body),
      company: null,
      interest: subject,
      urgency: 'medium',
      lead_type: 'general',
      next_action: 'Manual review needed',
      confidence: 'low'
    };
  }
}

function extractPhoneFromText(text) {
  const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
  const match = text.match(phoneRegex);
  return match ? match[0] : null;
}

function extractEmailFromText(text) {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const match = text.match(emailRegex);
  return match ? match[0] : null;
}

async function fetchGmailEmails(accessToken, config) {
  try {
    const response = await axios.get(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages',
      {
        params: {
          q: 'is:unread in:inbox',
          maxResults: 10
        },
        headers: { 'Authorization': `Bearer ${accessToken}` },
        timeout: 30000
      }
    );
    
    if (!response.data.messages || response.data.messages.length === 0) {
      return [];
    }
    
    const emails = [];
    
    for (const message of response.data.messages) {
      try {
        const details = await axios.get(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}`,
          {
            headers: { 'Authorization': `Bearer ${accessToken}` },
            timeout: 30000
          }
        );
        
        const headers = details.data.payload.headers;
        const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value;
        
        let body = '';
        if (details.data.payload.parts) {
          const textPart = details.data.payload.parts.find(p => p.mimeType === 'text/plain');
          if (textPart?.body?.data) {
            body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
          }
        } else if (details.data.payload.body?.data) {
          body = Buffer.from(details.data.payload.body.data, 'base64').toString('utf-8');
        }
        
        emails.push({
          id: message.id,
          from: getHeader('From') || 'Unknown',
          subject: getHeader('Subject') || 'No Subject',
          date: getHeader('Date') || new Date().toISOString(),
          body: body
        });
      } catch (messageError) {
        console.error(`Failed to fetch message ${message.id}:`, messageError.message);
        continue;
      }
    }
    
    return emails;
  } catch (error) {
    if (error.response?.status === 401) {
      throw new Error('Token expired or invalid');
    }
    throw error;
  }
}

async function fetchOutlookEmails(accessToken, config) {
  try {
    const response = await axios.get(
      'https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages',
      {
        params: {
          $filter: 'isRead eq false',
          $top: 10,
          $select: 'id,from,subject,receivedDateTime,body'
        },
        headers: { 'Authorization': `Bearer ${accessToken}` },
        timeout: 30000
      }
    );
    
    return response.data.value.map(email => ({
      id: email.id,
      from: email.from?.emailAddress?.address || 'Unknown',
      subject: email.subject || 'No Subject',
      date: email.receivedDateTime || new Date().toISOString(),
      body: email.body?.content || ''
    }));
  } catch (error) {
    if (error.response?.status === 401) {
      throw new Error('Token expired or invalid');
    }
    throw error;
  }
}

async function processEmailForLead(emailData) {
  const {
    email_config_id,
    company_id,
    email_from,
    email_subject,
    email_body,
    email_date,
    message_id
  } = emailData;
  
  try {
    const existingLog = await pool.query(
      'SELECT id, status FROM email_scan_logs WHERE email_config_id = $1 AND message_id = $2',
      [email_config_id, message_id]
    );
    
    if (existingLog.rows.length > 0) {
      console.log(`Message ${message_id} already processed, skipping...`);
      return {
        skipped: true,
        reason: 'Already processed',
        existing_status: existingLog.rows[0].status
      };
    }
    
    const extractedData = await extractLeadFromEmail({
      from: email_from,
      subject: email_subject,
      body: email_body,
      company_id: company_id
    });
    
    if (extractedData.is_lead === false) {
      await pool.query(`
        INSERT INTO email_scan_logs (
          email_config_id, company_id, message_id,
          from_email, subject, status, error_message, created_at
        )
        VALUES ($1, $2, $3, $4, $5, 'skipped', $6, NOW())
        ON CONFLICT (email_config_id, message_id) DO NOTHING
      `, [
        email_config_id, 
        company_id, 
        message_id, 
        email_from, 
        email_subject,
        `Not a lead: ${extractedData.reason}`
      ]);
      
      console.log(`Skipped non-lead email: ${email_subject} - ${extractedData.reason}`);
      return { 
        skipped: true, 
        reason: extractedData.reason,
        is_lead: false
      };
    }
    
    if (!extractedData.phone_number && !extractedData.email) {
      await pool.query(`
        INSERT INTO email_scan_logs (
          email_config_id, company_id, message_id,
          from_email, subject, status, error_message, created_at
        )
        VALUES ($1, $2, $3, $4, $5, 'skipped', 'No contact information found', NOW())
        ON CONFLICT (email_config_id, message_id) DO NOTHING
      `, [email_config_id, company_id, message_id, email_from, email_subject]);
      
      return { skipped: true, reason: 'No contact info' };
    }
    
    let phone = extractedData.phone_number;
    if (phone) {
      phone = phone.replace(/\D/g, '');
      if (phone.length === 10) phone = '+91' + phone;
      else if (!phone.startsWith('+')) phone = '+' + phone;
    }
    
    let leadId;
    const existingLead = await pool.query(
      'SELECT id FROM leads WHERE (phone_number = $1 OR email = $2) AND company_id = $3',
      [phone, extractedData.email, company_id]
    );
    
    if (existingLead.rows.length > 0) {
      leadId = existingLead.rows[0].id;
      await pool.query(`
        UPDATE leads
        SET 
          name = COALESCE($1, name),
          email = COALESCE($2, email),
          notes = COALESCE(notes || E'\\n\\n', '') || $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
      `, [
        extractedData.name, 
        extractedData.email, 
        `📧 Email (${new Date().toISOString().split('T')[0]}): ${email_subject}\n${extractedData.interest || ''}\nUrgency: ${extractedData.urgency || 'medium'}`,
        leadId
      ]);
    } else {
      const newLead = await pool.query(`
        INSERT INTO leads (
          company_id, phone_number, name, email,
          lead_source, notes
        )
        VALUES ($1, $2, $3, $4, 'email_inbox', $5)
        RETURNING id
      `, [
        company_id, 
        phone, 
        extractedData.name || 'Email Lead', 
        extractedData.email, 
        `📧 ${email_subject}\n\nType: ${extractedData.lead_type || 'inquiry'}\nInterest: ${extractedData.interest || 'N/A'}\nUrgency: ${extractedData.urgency || 'medium'}\nNext Action: ${extractedData.next_action || 'Follow up'}`
      ]);
      leadId = newLead.rows[0].id;
    }
    
    await pool.query(`
      INSERT INTO email_scan_logs (
        email_config_id, company_id, lead_id, message_id,
        from_email, subject, extracted_data, status, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'success', NOW())
      ON CONFLICT (email_config_id, message_id) 
      DO UPDATE SET 
        lead_id = EXCLUDED.lead_id,
        extracted_data = EXCLUDED.extracted_data,
        status = EXCLUDED.status
    `, [
      email_config_id, 
      company_id, 
      leadId, 
      message_id, 
      email_from, 
      email_subject, 
      JSON.stringify(extractedData)
    ]);
    
    await pool.query(`
      UPDATE email_configs
      SET 
        total_scanned = total_scanned + 1,
        leads_extracted = leads_extracted + 1,
        last_scan_at = NOW()
      WHERE id = $1
    `, [email_config_id]);
    
    console.log(`✅ Lead created: ${extractedData.name || extractedData.email} (${extractedData.lead_type})`);
    
    return {
      success: true,
      lead_id: leadId,
      is_new: existingLead.rows.length === 0,
      extracted_data: extractedData,
      lead_type: extractedData.lead_type,
      confidence: extractedData.confidence
    };
  } catch (error) {
    console.error('Process email error:', error);
    
    try {
      await pool.query(`
        INSERT INTO email_scan_logs (
          email_config_id, company_id, message_id,
          from_email, subject, status, error_message, created_at
        )
        VALUES ($1, $2, $3, $4, $5, 'failed', $6, NOW())
        ON CONFLICT (email_config_id, message_id) 
        DO UPDATE SET 
          status = 'failed',
          error_message = EXCLUDED.error_message
      `, [email_config_id, company_id, message_id, email_from, email_subject, error.message]);
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }
    
    throw error;
  }
}

module.exports = {
  extractLeadFromEmail,
  fetchGmailEmails,
  fetchOutlookEmails,
  processEmailForLead
};