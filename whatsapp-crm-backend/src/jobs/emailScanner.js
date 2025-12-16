const pool = require('../config/database');
const logger = require('../utils/logger');
const { getValidAccessToken } = require('../utils/encryption');
const emailService = require('../services/email/emailService');

exports.scanAllCompanies = async () => {
  try {
    const configs = await pool.query(`
      SELECT * FROM email_configs
      WHERE is_active = TRUE
      ORDER BY last_scan_at ASC NULLS FIRST
      LIMIT 20
    `);

    if (configs.rows.length === 0) {
      logger.info('No active email configs to scan');
      return;
    }

    const results = [];
    const errors = [];

    for (const config of configs.rows) {
      try {
        logger.info(`Scanning emails for ${config.email_address}...`);

        const accessToken = await getValidAccessToken(config);

        let emails = [];
        if (config.provider === 'gmail') {
          emails = await emailService.fetchGmailEmails(accessToken, config);
        } else if (config.provider === 'outlook') {
          emails = await emailService.fetchOutlookEmails(accessToken, config);
        }

        logger.info(`Found ${emails.length} unread emails for ${config.email_address}`);

        for (const email of emails) {
          try {
            const processed = await emailService.processEmailForLead({
              email_config_id: config.id,
              company_id: config.company_id,
              email_from: email.from,
              email_subject: email.subject,
              email_body: email.body,
              email_date: email.date,
              message_id: email.id
            });

            if (!processed.skipped) {
              results.push(processed);
            }
          } catch (emailError) {
            logger.error(`Email processing error for ${email.id}:`, emailError.message);
            errors.push({
              email_id: email.id,
              error: emailError.message
            });
          }
        }

        await pool.query(
          'UPDATE email_configs SET last_scan_at = NOW() WHERE id = $1',
          [config.id]
        );
      } catch (configError) {
        logger.error(`Config processing error for ${config.email_address}:`, configError.message);
        errors.push({
          email_address: config.email_address,
          error: configError.message
        });
      }
    }

    logger.info(`Email scan complete: ${results.length} leads processed, ${errors.length} errors`);
    return { results, errors };
  } catch (error) {
    logger.error('Scan all companies error:', error);
    throw error;
  }
};