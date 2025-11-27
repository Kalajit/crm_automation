const express = require('express');
const router = express.Router();
const companiesController = require('../controllers/companies.controller');

// Get all companies
router.get('/', companiesController.getAllCompanies);

// Get company by ID
router.get('/:company_id', companiesController.getCompanyById);

// Create company
router.post('/', companiesController.createCompany);

module.exports = router;