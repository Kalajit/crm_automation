const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticateToken, optionalAuth } = require('../middleware/auth.middleware');
const { validateRegistration, validateLogin } = require('../middleware/validation.middleware');


 // Register new company/user
router.post('/register', validateRegistration, authController.register);

// Login user and get JWT token
router.post('/login', validateLogin, authController.login);

 // Refresh JWT token
router.post('/refresh', authController.refreshToken);

// Logout user (invalidate refresh token)
router.post('/logout', authenticateToken, authController.logout);

// Get current user info
router.get('/me', authenticateToken, authController.getCurrentUser);

// Change user password
router.put('/change-password', authenticateToken, authController.changePassword);

// Request password reset
router.post('/forgot-password', authController.forgotPassword);

// Reset password with token
router.post('/reset-password', authController.resetPassword);

// Verify email address
router.post('/verify-email', authController.verifyEmail);

module.exports = router;