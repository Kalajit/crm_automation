const pool = require('../config/database');
const MultiChannelService = require('../services/multiChannel/multiChannel.service');
const { successResponse, errorResponse } = require('../utils/response');

const multiChannelService = new MultiChannelService(pool);

// SMS
exports.sendSMS = async (req, res) => {
  try {
    const { company_id, to, message, provider } = req.body;
    const data = await multiChannelService.sendSMS(company_id, to, message, provider);
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

exports.smsWebhook = async (req, res) => {
  try {
    const data = await multiChannelService.handleIncomingSMS(req.body);
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

exports.getSMSHistory = async (req, res) => {
  try {
    const { leadId } = req.params;
    const { limit = 50 } = req.query;
    const data = await multiChannelService.getSMSHistory(parseInt(leadId), parseInt(limit));
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

// Web Chat
exports.initWebChat = async (req, res) => {
  try {
    const { company_id, visitor_data } = req.body;
    const data = await multiChannelService.initializeWebChat(company_id, visitor_data);
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

exports.sendWebChatMessage = async (req, res) => {
  try {
    const { session_id, sender_type, sender_id, message, attachments } = req.body;
    const data = await multiChannelService.sendWebChatMessage(session_id, sender_type, sender_id, message, attachments);
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

exports.getWebChatMessages = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { limit = 100 } = req.query;
    const data = await multiChannelService.getWebChatMessages(sessionId, parseInt(limit));
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

exports.assignWebChat = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { agent_id } = req.body;
    const data = await multiChannelService.assignWebChatToAgent(sessionId, agent_id);
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

exports.endWebChat = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const data = await multiChannelService.endWebChatSession(sessionId);
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

exports.getActiveChats = async (req, res) => {
  try {
    const { company_id } = req.query;
    const data = await multiChannelService.getActiveWebChats(company_id);
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

// Social Media
exports.connectSocial = async (req, res) => {
  try {
    const { company_id, platform, account_data } = req.body;
    const data = await multiChannelService.connectSocialAccount(company_id, platform, account_data);
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

exports.syncSocial = async (req, res) => {
  try {
    const { accountId } = req.params;
    const data = await multiChannelService.syncFacebookMessages(parseInt(accountId));
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

exports.sendSocialMessage = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { recipient_id, message } = req.body;
    const data = await multiChannelService.sendSocialMessage(parseInt(accountId), recipient_id, message);
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

exports.getSocialMessages = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { limit = 50 } = req.query;
    const data = await multiChannelService.getSocialMessages(parseInt(accountId), parseInt(limit));
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

exports.socialWebhook = async (req, res) => {
  try {
    const { platform } = req.params;
    const data = await multiChannelService.handleSocialWebhook(platform, req.body);
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

exports.verifySocialWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const VERIFY_TOKEN = process.env.SOCIAL_VERIFY_TOKEN || 'your_verify_token';

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('Webhook verified');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
};