const express = require('express');
const router = express.Router();
const leadSourcesController = require('../controllers/leadSources.controller');

// Lead source configuration
router.post('/configure', leadSourcesController.configureLeadSource);
router.get('/configs/:company_id', leadSourcesController.getLeadSourceConfigs);
router.get('/meta/forms/:company_id', leadSourcesController.getMetaForms);

// Lead import management
router.get('/imports/stats/:company_id', leadSourcesController.getImportStats);
router.post('/imports/retry/:log_id', leadSourcesController.retryFailedImport);

router.get('/config-by-token/:token', leadSourcesController.getConfigByToken);

module.exports = router;