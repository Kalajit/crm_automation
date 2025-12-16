const pool = require('../../config/database');
const groq = require('groq-sdk');
const logger = require('../../utils/logger');

// Generate summary of WhatsApp conversation
exports.summarizeWhatsAppConversation = async (conversation_id) => {
  try {
    const messagesResult = await pool.query(`
      SELECT 
        wm.message_body,
        wm.sender,
        wm.timestamp,
        l.name as lead_name,
        l.preferred_language
      FROM whatsapp_messages wm
      JOIN leads l ON wm.lead_id = l.id
      WHERE wm.conversation_id = $1
      ORDER BY wm.timestamp ASC
    `, [conversation_id]);
    
    if (messagesResult.rows.length === 0) {
      throw new Error('No messages found for this conversation');
    }
    
    const messages = messagesResult.rows;
    const lead_name = messages[0].lead_name;
    const preferred_language = messages[0].preferred_language;
    
    const formattedChat = messages.map(msg => 
      `${msg.sender === 'user' ? 'Customer' : 'Agent'}: ${msg.message_body}`
    ).join('\n');
    
    const client = new groq.Groq({ apiKey: process.env.GROQ_API_KEY });
    
    const prompt = `
Analyze this WhatsApp conversation and provide a structured summary:

Conversation:
${formattedChat}

Provide a JSON response with:
{
  "summary": "Brief 2-3 sentence summary",
  "key_points": ["point1", "point2", "point3"],
  "customer_sentiment": "positive/neutral/negative",
  "intent": "inquiry/purchase/support/complaint/other",
  "action_items": ["action1", "action2"],
  "next_steps": "What should happen next"
}

JSON:
`;
    
    const completion = await client.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 500
    });
    
    const responseText = completion.choices[0].message.content;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error('Failed to parse AI summary response');
    }
    
    const summaryData = JSON.parse(jsonMatch[0]);
    
    await pool.query(`
      UPDATE conversations
      SET 
        ai_summary = $1,
        sentiment = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [
      summaryData.summary,
      summaryData.customer_sentiment,
      conversation_id
    ]);
    
    return summaryData;
    
  } catch (error) {
    logger.error('Summarize WhatsApp conversation error:', error);
    throw error;
  }
};

// Auto-summarize conversations after N messages
exports.autoSummarizeIfNeeded = async (conversation_id) => {
  try {
    const convResult = await pool.query(`
      SELECT 
        c.message_count,
        c.ai_summary,
        c.updated_at
      FROM conversations c
      WHERE c.id = $1
    `, [conversation_id]);
    
    if (convResult.rows.length === 0) return;
    
    const conv = convResult.rows[0];
    
    const shouldSummarize = 
      !conv.ai_summary || 
      conv.message_count % 10 === 0 ||
      (new Date() - new Date(conv.updated_at)) > 24 * 60 * 60 * 1000;
    
    if (shouldSummarize) {
      logger.info(`🤖 Auto-summarizing conversation ${conversation_id}`);
      await exports.summarizeWhatsAppConversation(conversation_id);
    }
    
  } catch (error) {
    logger.error('Auto summarize error:', error);
  }
};

// Batch summarize conversations
exports.batchSummarizeConversations = async (company_id, limit = 50) => {
  try {
    const conversationsResult = await pool.query(`
      SELECT c.id
      FROM conversations c
      JOIN leads l ON c.lead_id = l.id
      WHERE l.company_id = $1
      AND (c.ai_summary IS NULL OR c.message_count % 10 = 0)
      AND c.message_count > 3
      ORDER BY c.updated_at DESC
      LIMIT $2
    `, [company_id, limit]);
    
    const results = [];
    const errors = [];
    
    for (const conv of conversationsResult.rows) {
      try {
        const summary = await exports.summarizeWhatsAppConversation(conv.id);
        results.push({ conversation_id: conv.id, success: true, summary });
      } catch (error) {
        errors.push({ conversation_id: conv.id, error: error.message });
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return { results, errors };
    
  } catch (error) {
    logger.error('Batch summarize error:', error);
    throw error;
  }
};