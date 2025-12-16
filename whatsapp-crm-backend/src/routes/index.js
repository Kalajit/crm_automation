const express = require('express');
const router = express.Router();
const {authenticateToken } = require('../middleware/auth.middleware');
const {apiRateLimiter} = require('../middleware/rateLimiter.middleware');

// Import route modules
// router.use('/auth', authRoutes);
const authRoutes = require('./auth.routes');
const healthRoutes = require('./health.routes');
const webhooksRoutes = require('./webhooks.routes');


const leadsRoutes = require('./leads.routes');
const conversationsRoutes = require('./conversations.routes');
const messagesRoutes = require('./messages.routes');
const faqsRoutes = require('./faqs.routes');
const bookingsRoutes = require('./bookings.routes');
const invoicesRoutes = require('./invoices.routes');
const paymentsRoutes = require('./payments.routes');
const subscriptionsRoutes = require('./subscriptions.routes');
const reportsRoutes = require('./reports.routes');
const callsRoutes = require('./calls.routes');
const recordingsRoutes = require('./recordings.routes');
const wsRoutes = require('./websocket.routes');
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
const whatsappRoutes = require('./whatsapp.routes');
const twilioRoutes = require('./twilio.routes');
const sipRoutes = require('./sip.routes');

const oauthRoutes = require('./oauth.routes');
const leadSourcesRoutes = require('./leadSources.routes');

const workflowRouter=require('./workflow.routes');

const documentsRoutes = require('./documents.routes');
const schedulerRoutes = require('./scheduler.routes');
const productsRoutes = require('./products.routes');
const quotesRoutes = require('./quotes.routes');
const emailRoutes = require('./email.routes');

const routingRoutes = require('./routing.routes');
const tasksRoutes = require('./tasks.routes');

const callSummariesRoutes = require('./callSummaries.routes');
const searchRoutes = require('./search.routes');

const dripCampaignsRoutes = require('./dripCampaigns.routes');

const invoicePaymentRoutes = require('./invoicePayment.routes');

// const smsRoutes = require('./sms.routes');

// const usageTrackingRoutes = require('./usageTracking.routes');



// MOUNT ROUTES

// PUBLIC ROUTES 
router.use('/auth', authRoutes);
router.use('/health', healthRoutes);
router.use('/webhook', webhooksRoutes);
router.use('/payment-callback', invoicePaymentRoutes);

// APPLY JWT AUTHENTICATION TO ALL ROUTES BELOW
router.use(authenticateToken);
router.use(apiRateLimiter);

// Core CRM
router.use('/leads', leadsRoutes);
router.use('/conversations', conversationsRoutes);
router.use('/messages', messagesRoutes);

// Customer Management
router.use('/bookings', bookingsRoutes);
router.use('/invoices', invoicesRoutes);
router.use('/payment', paymentsRoutes);
router.use('/subscriptions', subscriptionsRoutes);
router.use('/invoice-payment', invoicePaymentRoutes);

// Communication
router.use('/calls', callsRoutes);
router.use('/recordings', recordingsRoutes);
router.use('/whatsapp', whatsappRoutes);
router.use('/twilio', twilioRoutes);
router.use('/sip', sipRoutes);
router.use('/call-summaries', callSummariesRoutes);

// AI and Automation
router.use('/faqs', faqsRoutes);
router.use('/workflow',workflowRouter);
router.use('/routing', routingRoutes);
router.use('/campaigns', campaignsRoutes);
router.use('/drip-campaigns', dripCampaignsRoutes);

// Agents and Teams
router.use('/agents', agentsRoutes);
router.use('/humanagent',humanAgentsRoutes);
router.use('/takeover', takeoverRoutes);

// Analytics and Reporting
router.use('/stats', statsRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/reports', reportsRoutes);
router.use('/dashboard', dashboardRoutes);

// Company and System
router.use('/companies', companiesRoutes);
router.use('/system', systemRoutes);
router.use('/notifications', notificationsRoutes);

// Integrations
router.use('/oauth', oauthRoutes);
router.use('/lead-sources', leadSourcesRoutes);
router.use('/calendar', calendarRoutes);
router.use('/multichannel', multiChannelRoutes);
router.use('/email', emailRoutes);

// Configuration
router.use('/custom-fields', customFieldsRoutes);

// Documents and Tasks
router.use('/documents', documentsRoutes);
router.use('/tasks', tasksRoutes);

// Products and Quotes
router.use('/products', productsRoutes);
router.use('/quotes', quotesRoutes);

// Scheduler
router.use('/scheduler', schedulerRoutes);

// Websockers
router.use('/ws', wsRoutes);

// Search
router.use('/search/leads', leadsRoutes);
router.use('/search', searchRoutes);

router.use('/oauthRoutes', oauthRoutes)


// router.use('/api/sms', smsRoutes);

// app.use('/api/usage', usageTrackingRoutes);


module.exports = router;