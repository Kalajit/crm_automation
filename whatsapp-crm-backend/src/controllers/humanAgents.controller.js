const pool = require('../config/database');
const HumanAgentsService = require('../services/humanAgents/humanAgents.service');
const { successResponse, errorResponse } = require('../utils/response');

const humanAgentsService = new HumanAgentsService(pool);

exports.getProfile = async (req, res) => {
  try {
    const { agentId } = req.params;
    const data = await humanAgentsService.getAgentProfile(parseInt(agentId));
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

exports.getPerformance = async (req, res) => {
  try {
    const { agentId } = req.params;
    const { days = 30 } = req.query;
    const data = await humanAgentsService.getAgentPerformanceHistory(parseInt(agentId), parseInt(days));
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

exports.getLeaderboard = async (req, res) => {
  try {
    const { company_id, metric = 'conversions', period = 'month' } = req.query;
    const data = await humanAgentsService.getAgentLeaderboard(company_id, metric, period);
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

exports.createShifts = async (req, res) => {
  try {
    const { agentId } = req.params;
    const { shifts } = req.body;
    const data = await humanAgentsService.createShiftSchedule(parseInt(agentId), shifts);
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

exports.getSchedule = async (req, res) => {
  try {
    const { agentId } = req.params;
    const { start_date, end_date } = req.query;
    const data = await humanAgentsService.getAgentSchedule(parseInt(agentId), start_date, end_date);
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

exports.requestTimeOff = async (req, res) => {
  try {
    const { agentId } = req.params;
    const { start_date, end_date, reason } = req.body;
    const data = await humanAgentsService.requestTimeOff(parseInt(agentId), start_date, end_date, reason);
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

exports.reviewTimeOff = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { action, reviewer_id } = req.body;
    const data = await humanAgentsService.reviewTimeOffRequest(parseInt(requestId), action, reviewer_id);
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

exports.startBreak = async (req, res) => {
  try {
    const { agentId } = req.params;
    const { break_type = 'regular' } = req.body;
    const data = await humanAgentsService.startBreak(parseInt(agentId), break_type);
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

exports.endBreak = async (req, res) => {
  try {
    const { agentId, breakId } = req.params;
    const data = await humanAgentsService.endBreak(parseInt(breakId), parseInt(agentId));
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

exports.getBreakHistory = async (req, res) => {
  try {
    const { agentId } = req.params;
    const { start_date, end_date } = req.query;
    const data = await humanAgentsService.getBreakHistory(parseInt(agentId), start_date, end_date);
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

exports.getStatusDashboard = async (req, res) => {
  try {
    const { company_id } = req.query;
    const data = await humanAgentsService.getAgentStatusDashboard(company_id);
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

exports.sendTeamMessage = async (req, res) => {
  try {
    const { company_id, sender_id, lead_id, message, mentions } = req.body;
    const data = await humanAgentsService.sendTeamMessage(company_id, sender_id, lead_id, message, mentions);
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

exports.getTeamChat = async (req, res) => {
  try {
    const { leadId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    const data = await humanAgentsService.getTeamChatHistory(parseInt(leadId), parseInt(limit), parseInt(offset));
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

exports.createNote = async (req, res) => {
  try {
    const { company_id, lead_id, agent_id, title, content, tags } = req.body;
    const data = await humanAgentsService.createSharedNote(company_id, lead_id, agent_id, title, content, tags);
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

exports.getNotes = async (req, res) => {
  try {
    const { leadId } = req.params;
    const data = await humanAgentsService.getSharedNotes(parseInt(leadId));
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

exports.getWorkload = async (req, res) => {
  try {
    const { agentId } = req.params;
    const data = await humanAgentsService.getAgentWorkload(parseInt(agentId));
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

exports.balanceWorkload = async (req, res) => {
  try {
    const { company_id } = req.body;
    const data = await humanAgentsService.balanceWorkload(company_id);
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};