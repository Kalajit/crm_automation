const express = require('express');
const router = express.Router();

// Import route modules
const leadsRoutes = require('./leads.routes');
const conversationsRoutes = require('./conversations.routes');
const messagesRoutes = require('./messages.routes');
const faqsRoutes = require('./faqs.routes');
const bookingsRoutes = require('./bookings.routes');
const invoicesRoutes = require('./invoices.routes');
const paymentsRoutes = require('./payments.routes');
const subscriptionsRoutes = require('./subscriptions.routes');
const reportsRoutes = require('./reports.routes');
const webhooksRoutes = require('./webhooks.routes');
const callsRoutes = require('./calls.routes');
const recordingsRoutes = require('./recordings.routes');
const wsRoutes = require('./websocket.routes');
const healthRoutes = require('./health.routes');
const notificationsRoutes = require('./notifications.routes');
const statsRoutes = require('./stats.routes');
const companiesRoutes = require('./companies.routes');
const agentsRoutes = require('./agents.routes');
const analyticsRoutes = require('./analytics.routes');
const systemRoutes = require('./system.routes');
const dashboardRoutes = require('./dashboard.routes');
const takeoverRoutes = require('./takeover.routes');
const campaignsRoutes = require('./campaigns.routes');
const customFieldsRoutes = require('./customFields.routes');
const calendarRoutes = require('./calendar.routes');
const multiChannelRoutes = require('./multichannel.routes');
const humanAgentsRoutes = require('./humanAgents.routes');

// Mount routes
router.use('/leads', leadsRoutes);
router.use('/conversations', conversationsRoutes);
router.use('/messages', messagesRoutes);
router.use('/faqs', faqsRoutes);
router.use('/bookings', bookingsRoutes);
router.use('/invoices', invoicesRoutes);
router.use('/payment', paymentsRoutes);
router.use('/subscriptions', subscriptionsRoutes);
router.use('/reports', reportsRoutes);
router.use('/webhook', webhooksRoutes);
router.use('/calls', callsRoutes);
router.use('/recordings', recordingsRoutes);
router.use('/ws', wsRoutes);
router.use('/health', healthRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/stats', statsRoutes);
router.use('/companies', companiesRoutes);
router.use('/agents', agentsRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/system', systemRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/takeover', takeoverRoutes);
router.use('/campaigns', campaignsRoutes);
router.use('/custom-fields', customFieldsRoutes);
router.use('/calendar', calendarRoutes);


// Legacy endpoints for backward compatibility
router.use('/search/leads', leadsRoutes);
router.post('/payment-callback', require('../controllers/payments.controller').handlePaymentCallback);

// Agent-specific legacy routes
router.post('/agent-configs', require('../controllers/agents.controller').createOrUpdateAgentConfig);
router.get('/agent-configs/:company_id', require('../controllers/agents.controller').getAgentConfigsByCompany);
router.post('/schedule-call', require('../controllers/agents.controller').scheduleCall);
router.get('/scheduled-calls/pending', require('../controllers/agents.controller').getPendingScheduledCalls);
router.patch('/scheduled-calls/:id', require('../controllers/agents.controller').updateScheduledCall);
router.post('/call-logs', require('../controllers/agents.controller').createCallLog);
router.patch('/call-logs/:call_sid', require('../controllers/agents.controller').updateCallLog);
router.get('/call-logs/lead/:lead_id', require('../controllers/agents.controller').getCallLogsByLead);
router.get('/call-logs/sid/:call_sid', require('../controllers/agents.controller').getCallLogByCallSid);
router.get('/call-logs/:call_sid', require('../controllers/agents.controller').getCallLogByCallSid);
router.get('/call-logs', require('../controllers/agents.controller').getAllCallLogs);
router.get('/active-calls', require('../controllers/agents.controller').getActiveCalls);
router.get('/metrics/dashboard', require('../controllers/agents.controller').getMetricsDashboard);

// Analytics legacy routes
router.get('/hot-leads', require('../controllers/analytics.controller').getHotLeads);
router.get('/failed-calls', require('../controllers/analytics.controller').getFailedCalls);

// Takeover legacy routes
router.get('/human-agents', require('../controllers/takeover.controller').getAllHumanAgents);
router.patch('/human-agents/:id/status', require('../controllers/takeover.controller').updateAgentStatus);

// Custom fields legacy routes  
router.get('/extraction-templates', require('../controllers/customFields.controller').getExtractionTemplates);
router.post('/companies/:company_id/apply-template', require('../controllers/customFields.controller').applyTemplate);
router.get('/custom-fields/:company_id', require('../controllers/customFields.controller').getCustomFieldDefinitions);
router.post('/custom-fields', require('../controllers/customFields.controller').createOrUpdateFieldDefinition);
router.post('/leads/:lead_id/custom-data', require('../controllers/customFields.controller').saveLeadCustomData);
router.get('/leads/:lead_id/custom-data', require('../controllers/customFields.controller').getLeadCustomData);
router.get('/leads/search-by-custom-field', require('../controllers/customFields.controller').searchByCustomField);

// Website lead capture
router.post('/leads/website', require('../controllers/leads.controller').websiteLeadCapture);

// Conversation AI fallback
router.post('/conversations/ai-fallback', require('../controllers/analytics.controller').aiFollback);
router.get('/conversations/rate-check/:phone', require('../controllers/analytics.controller').rateCheck);

// System status
router.get('/system/status', require('../controllers/analytics.controller').systemStatus);

// Company calling hours
router.get('/companies/:company_id/calling-hours', require('../controllers/companies.controller').getCallingHours);
router.patch('/companies/:company_id/calling-hours', require('../controllers/companies.controller').updateCallingHours);

router.use('/multichannel', multiChannelRoutes);
router.use('/humanagent',humanAgentsRoutes);


module.exports = router;