const express = require('express');
const router = express.Router();
const oauthController = require('../controllers/oauth.controller');

// Meta/Facebook OAuth
router.get('/meta/start', oauthController.startMetaOAuth);
router.get('/meta/callback', oauthController.handleMetaCallback);
router.get('/meta/forms/:company_id', oauthController.getMetaForms);
router.post('/meta/sync-leads', oauthController.syncMetaLeads);

// Google Ads OAuth
router.get('/google-ads/start', oauthController.startGoogleAdsOAuth);
router.get('/google-ads/callback', oauthController.handleGoogleAdsCallback);

// LinkedIn OAuth
router.get('/linkedin/start', oauthController.startLinkedInOAuth);
router.get('/linkedin/callback', oauthController.handleLinkedInCallback);

// General OAuth endpoints
router.get('/status/:company_id', oauthController.getOAuthStatus);
router.delete('/:company_id/:platform', oauthController.disconnectPlatform);

module.exports = router;