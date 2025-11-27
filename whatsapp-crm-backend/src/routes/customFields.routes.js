const express = require('express');
const router = express.Router();
const customFieldsController = require('../controllers/customFields.controller');

// Extraction templates
router.get('/templates', customFieldsController.getExtractionTemplates);
router.post('/templates/apply/:company_id', customFieldsController.applyTemplate);

// Custom field definitions
router.get('/definitions/:company_id', customFieldsController.getCustomFieldDefinitions);
router.post('/definitions', customFieldsController.createOrUpdateFieldDefinition);

// Lead custom data
router.post('/leads/:lead_id/data', customFieldsController.saveLeadCustomData);
router.get('/leads/:lead_id/data', customFieldsController.getLeadCustomData);

// Search by custom fields
router.get('/search', customFieldsController.searchByCustomField);

module.exports = router;