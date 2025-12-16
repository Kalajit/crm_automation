exports.resetDailyLimits = async () => {
  try {
    // Reset SMS daily limits
    const result = await pool.query(`
      UPDATE sms_configs
      SET 
        messages_sent_today = 0,
        last_reset_at = CURRENT_DATE
      WHERE last_reset_at < CURRENT_DATE
      RETURNING id, phone_number
    `);

    logger.info(`Daily reset: ${result.rows.length} SMS configs reset`);

    // Archive old logs (older than 90 days)
    await pool.query(`
      DELETE FROM email_scan_logs
      WHERE created_at < NOW() - INTERVAL '90 days'
    `);

    await pool.query(`
      DELETE FROM sms_messages
      WHERE created_at < NOW() - INTERVAL '90 days'
    `);

    logger.info('Daily reset: Old logs archived');

    return { reset_count: result.rows.length };
  } catch (error) {
    logger.error('Daily reset error:', error);
    throw error;
  }
};

module.exports = exports;