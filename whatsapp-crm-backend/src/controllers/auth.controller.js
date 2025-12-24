const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../config/database');
const {logger} = require('../utils/logger');

// JWT secret from environment
const JWT_SECRET = process.env.JWT_SECRET_KEY || 'your-secret-key-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key';
const JWT_EXPIRY = process.env.JWT_EXPIRY_HOURS || '24h';
const JWT_REFRESH_EXPIRY = '7d';

/**
 * Generate JWT tokens
 */
const generateTokens = (user) => {
  const accessToken = jwt.sign(
    {
      user_id: user.id,
      email: user.email,
      company_id: user.company_id,
      role: user.role || 'user'
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );

  const refreshToken = jwt.sign(
    {
      user_id: user.id,
      company_id: user.company_id,
      type: 'refresh'
    },
    JWT_REFRESH_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRY }
  );

  return { accessToken, refreshToken };
};

/**
 * Register new company and admin user
 */
exports.register = async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const {
      company_name,
      email,
      password,
      phone,
      phone_number,
      first_name,
      last_name,
      industry,
      company_size
    } = req.body;

    // Check if email already exists
    const existingUser = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create company
    const companyResult = await client.query(
      `INSERT INTO companies (
        name, 
        phone_number,
        industry, 
        company_size,
        status,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW()) 
      RETURNING id, name, status`,
      [
        company_name, 
        phone_number, 
        industry || 'other', 
        company_size || 'small', 
        'active']
    );

    const company = companyResult.rows[0];

    // Create admin user
    const userResult = await client.query(
      `INSERT INTO users (
        company_id,
        email,
        password_hash,
        first_name,
        last_name,
        phone,
        role,
        status,
        email_verified,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING id, email, first_name, last_name, role, company_id`,
      [
        company.id,
        email,
        hashedPassword,
        first_name,
        last_name,
        phone,
        'admin',
        'active',
        false
      ]
    );

    const user = userResult.rows[0];

    // Generate email verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    await client.query(
      `UPDATE users 
       SET email_verification_token = $1, 
           email_verification_expires = NOW() + INTERVAL '24 hours'
       WHERE id = $2`,
      [verificationToken, user.id]
    );

    await client.query('COMMIT');

    // Generate JWT tokens
    const { accessToken, refreshToken } = generateTokens(user);

    // Store refresh token in database
    await pool.query(
      `INSERT INTO refresh_token (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [user.id, refreshToken]
    );

    logger.info(`New company registered: ${company_name} (ID: ${company.id})`);

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          role: user.role,
          company_id: user.company_id
        },
        company: {
          id: company.id,
          name: company.name,
          status: company.status
        },
        tokens: {
          accessToken,
          refreshToken
        },
        verificationToken // For development/testing - remove in production
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  } finally {
    client.release();
  }
};

/**
 * Login user
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user with company info
    const result = await pool.query(
      `SELECT 
        u.id, u.email, u.password_hash, u.first_name, u.last_name, 
        u.role, u.company_id, u.status, u.email_verified,
        c.name as company_name, c.status as company_status
       FROM users u
       JOIN companies c ON u.company_id = c.id
       WHERE u.email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const user = result.rows[0];

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Account is suspended or inactive'
      });
    }

    // Check if company is active
    if (user.company_status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Company account is suspended'
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user);

    // Store refresh token
    await pool.query(
      `INSERT INTO refresh_token (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [user.id, refreshToken]
    );

    // Update last login
    await pool.query(
      'UPDATE users SET last_login_at = NOW() WHERE id = $1',
      [user.id]
    );

    logger.info(`User logged in: ${email} (ID: ${user.id})`);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          role: user.role,
          company_id: user.company_id,
          company_name: user.company_name,
          email_verified: user.email_verified
        },
        tokens: {
          accessToken,
          refreshToken
        }
      }
    });

  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
};

/**
 * Refresh JWT token
 */
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token required'
      });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);

    // Check if refresh token exists and is valid
    const tokenResult = await pool.query(
      `SELECT user_id, expires_at 
       FROM refresh_token 
       WHERE token = $1 AND user_id = $2 AND expires_at > NOW()`,
      [refreshToken, decoded.user_id]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token'
      });
    }

    // Get user info
    const userResult = await pool.query(
      `SELECT id, email, first_name, last_name, role, company_id, status
       FROM users WHERE id = $1 AND status = 'active'`,
      [decoded.user_id]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'User not found or inactive'
      });
    }

    const user = userResult.rows[0];

    // Generate new access token
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);

    // Delete old refresh token and insert new one
    await pool.query('DELETE FROM refresh_token WHERE token = $1', [refreshToken]);
    await pool.query(
      `INSERT INTO refresh_token (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [user.id, newRefreshToken]
    );

    res.json({
      success: true,
      data: {
        accessToken,
        refreshToken: newRefreshToken
      }
    });

  } catch (error) {
    logger.error('Refresh token error:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid refresh token',
      error: error.message
    });
  }
};

/**
 * Logout user
 */
exports.logout = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { refreshToken } = req.body;

    // Delete specific refresh token or all tokens for user
    if (refreshToken) {
      await pool.query(
        'DELETE FROM refresh_token WHERE token = $1 AND user_id = $2',
        [refreshToken, userId]
      );
    } else {
      // Delete all refresh tokens for user (logout from all devices)
      await pool.query('DELETE FROM refresh_token WHERE user_id = $1', [userId]);
    }

    logger.info(`User logged out: ${userId}`);

    res.json({
      success: true,
      message: 'Logout successful'
    });

  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed',
      error: error.message
    });
  }
};

/**
 * Get current user info
 */
exports.getCurrentUser = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const result = await pool.query(
      `SELECT 
        u.id, u.email, u.first_name, u.last_name, u.phone,
        u.role, u.company_id, u.status, u.email_verified,
        u.created_at, u.last_login_at,
        c.name as company_name, c.status as company_status,
        c.industry, c.company_size
       FROM users u
       JOIN companies c ON u.company_id = c.id
       WHERE u.id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = result.rows[0];
    delete user.password_hash; // Safety check

    res.json({
      success: true,
      data: user
    });

  } catch (error) {
    logger.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user info',
      error: error.message
    });
  }
};

/**
 * Change password
 */
exports.changePassword = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { currentPassword, newPassword } = req.body;

    // Get current password hash
    const result = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [hashedPassword, userId]
    );

    // Invalidate all refresh tokens (force re-login on all devices)
    await pool.query('DELETE FROM refresh_token WHERE user_id = $1', [userId]);

    logger.info(`Password changed for user: ${userId}`);

    res.json({
      success: true,
      message: 'Password changed successfully. Please login again.'
    });

  } catch (error) {
    logger.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password',
      error: error.message
    });
  }
};

/**
 * Forgot password - send reset link
 */
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    // Find user
    const result = await pool.query(
      'SELECT id, email, first_name FROM users WHERE email = $1 AND status = $2',
      [email, 'active']
    );

    // Don't reveal if email exists or not (security best practice)
    if (result.rows.length === 0) {
      return res.json({
        success: true,
        message: 'If the email exists, a password reset link has been sent'
      });
    }

    const user = result.rows[0];

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

    // Store reset token
    await pool.query(
      `UPDATE users 
       SET password_reset_token = $1, 
           password_reset_expires = $2
       WHERE id = $3`,
      [resetToken, resetTokenExpiry, user.id]
    );

    // TODO: Send email with reset link
    // const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    // await sendEmail(user.email, 'Password Reset', resetLink);

    logger.info(`Password reset requested for: ${email}`);

    res.json({
      success: true,
      message: 'If the email exists, a password reset link has been sent',
      resetToken // For development only - remove in production
    });

  } catch (error) {
    logger.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process request',
      error: error.message
    });
  }
};

/**
 * Reset password with token
 */
exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    // Find user with valid reset token
    const result = await pool.query(
      `SELECT id, email 
       FROM users 
       WHERE password_reset_token = $1 
       AND password_reset_expires > NOW()
       AND status = 'active'`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    const user = result.rows[0];

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and clear reset token
    await pool.query(
      `UPDATE users 
       SET password_hash = $1,
           password_reset_token = NULL,
           password_reset_expires = NULL,
           updated_at = NOW()
       WHERE id = $2`,
      [hashedPassword, user.id]
    );

    // Invalidate all refresh tokens
    await pool.query('DELETE FROM refresh_token WHERE user_id = $1', [user.id]);

    logger.info(`Password reset successful for: ${user.email}`);

    res.json({
      success: true,
      message: 'Password reset successful. Please login with your new password.'
    });

  } catch (error) {
    logger.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password',
      error: error.message
    });
  }
};

/**
 * Verify email address
 */
exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.body;

    // Find user with valid verification token
    const result = await pool.query(
      `SELECT id, email 
       FROM users 
       WHERE email_verification_token = $1 
       AND email_verification_expires > NOW()
       AND email_verified = false`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification token'
      });
    }

    const user = result.rows[0];

    // Mark email as verified
    await pool.query(
      `UPDATE users 
       SET email_verified = true,
           email_verification_token = NULL,
           email_verification_expires = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [user.id]
    );

    logger.info(`Email verified for: ${user.email}`);

    res.json({
      success: true,
      message: 'Email verified successfully'
    });

  } catch (error) {
    logger.error('Verify email error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify email',
      error: error.message
    });
  }
};