const pool = require('../config/database');
const { sendSuccess, handleError } = require('../utils/response');
const { logRequest } = require('../utils/logger');

/**
 * Create company
 */
exports.createCompany = async (req, res) => {
  try {
    const { name, phone_number } = req.body;
    
    const query = `
      INSERT INTO companies (name, phone_number)
      VALUES ($1, $2)
      RETURNING *;
    `;
    
    const result = await pool.query(query, [name, phone_number]);
    
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * Get all companies
 */
exports.getAllCompanies = async (req, res) => {
  try {
    const query = 'SELECT * FROM companies ORDER BY created_at DESC;';
    const result = await pool.query(query);
    
    logRequest('GET', '/api/companies', 200);
    sendSuccess(res, { data: result.rows });
  } catch (error) {
    logRequest('GET', '/api/companies', 500);
    handleError(res, error);
  }
};

/**
 * Get company by ID
 */
exports.getCompanyById = async (req, res) => {
  try {
    const { company_id } = req.params;
    
    const query = 'SELECT * FROM companies WHERE id = $1;';
    const result = await pool.query(query, [company_id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }
    
    logRequest('GET', `/api/companies/${company_id}`, 200);
    sendSuccess(res, { data: result.rows[0] });
  } catch (error) {
    logRequest('GET', `/api/companies/${company_id}`, 500);
    handleError(res, error);
  }
};