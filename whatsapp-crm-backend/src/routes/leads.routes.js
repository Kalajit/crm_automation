const express = require('express');
const router = express.Router();
const leadsController = require('../controllers/leads.controller');

// Get all leads with filters
router.get('/', leadsController.getAllLeads);

// Search leads
router.get('/search', leadsController.searchLeads);

// Bulk import leads
router.post('/bulk', leadsController.bulkImportLeads);

// Bulk update interest
router.post('/bulk-update-interest', leadsController.bulkUpdateInterest);

// Get lead by phone number
router.get('/by-phone/:phone', leadsController.getLeadByPhone);

// Get single lead by ID (numeric)
router.get('/id/:lead_id', leadsController.getLeadById);

// Get single lead by ID (alternative route)
router.get('/:lead_id(\\d+)', leadsController.getLeadById);

// Get/Update language preference
router.get('/:phone/language', leadsController.getLanguagePreference);
router.patch('/:phone/language', leadsController.updateLanguagePreference);

// Update lead interest level
router.patch('/:phone/interest', leadsController.updateLeadInterest);

// Update last contacted
router.patch('/:phone/last-contacted', leadsController.updateLastContacted);

// Create or update lead
router.post('/', leadsController.createOrUpdateLead);

// Update lead by ID
router.patch('/:lead_id', leadsController.updateLeadById);

module.exports = router;