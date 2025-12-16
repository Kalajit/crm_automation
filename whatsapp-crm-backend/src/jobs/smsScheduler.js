const smsService = require('../services/sms/smsService');

exports.processPendingCampaigns = async () => {
  try {
    // Get running campaigns with pending recipients
    const campaigns = await pool.query(`
      SELECT DISTINCT sc.* FROM sms_campaigns sc
      JOIN sms_campaign_recipients scr ON sc.id = scr.campaign_id
      WHERE sc.status = 'running'
      AND scr.status = 'pending'
      LIMIT 10
    `);

    if (campaigns.rows.length === 0) {
      return { processed: 0 };
    }

    let totalSent = 0;

    for (const campaign of campaigns.rows) {
      try {
        // Get SMS config
        const configResult = await pool.query(`
          SELECT * FROM sms_configs
          WHERE company_id = $1 AND is_active = TRUE
          LIMIT 1
        `, [campaign.company_id]);

        if (configResult.rows.length === 0) {
          logger.error(`No active SMS config for company ${campaign.company_id}`);
          continue;
        }

        const config = configResult.rows[0];

        // Check daily limit
        if (config.messages_sent_today >= config.daily_limit) {
          logger.info(`Daily limit reached for ${config.phone_number}`);
          continue;
        }

        // Get pending recipients (rate limit: 5 per run)
        const recipients = await pool.query(`
          SELECT scr.*, st.message_body
          FROM sms_campaign_recipients scr
          JOIN sms_campaigns sc ON scr.campaign_id = sc.id
          JOIN sms_templates st ON sc.template_id = st.id
          WHERE scr.campaign_id = $1
          AND scr.status = 'pending'
          LIMIT 5
        `, [campaign.id]);

        for (const recipient of recipients.rows) {
          try {
            // Send SMS
            const result = await smsService.sendSms({
              account_sid: config.account_sid,
              auth_token: config.auth_token,
              from: config.phone_number,
              to: recipient.phone_number,
              body: recipient.personalized_message || recipient.message_body
            });

            // Update recipient
            await pool.query(`
              UPDATE sms_campaign_recipients
              SET 
                status = 'sent',
                message_sid = $1,
                sent_at = NOW()
              WHERE id = $2
            `, [result.sid, recipient.id]);

            // Update campaign
            await pool.query(`
              UPDATE sms_campaigns
              SET sent_count = sent_count + 1
              WHERE id = $1
            `, [campaign.id]);

            // Update config
            await pool.query(`
              UPDATE sms_configs
              SET messages_sent_today = messages_sent_today + 1
              WHERE id = $1
            `, [config.id]);

            totalSent++;
          } catch (sendError) {
            logger.error(`Failed to send SMS to ${recipient.phone_number}:`, sendError.message);
            
            await pool.query(`
              UPDATE sms_campaign_recipients
              SET 
                status = 'failed',
                failed_at = NOW(),
                error_message = $1
              WHERE id = $2
            `, [sendError.message, recipient.id]);
          }
        }
      } catch (campaignError) {
        logger.error(`Campaign ${campaign.id} processing error:`, campaignError.message);
      }
    }

    logger.info(`SMS scheduler: ${totalSent} messages sent`);
    return { processed: totalSent };
  } catch (error) {
    logger.error('SMS scheduler error:', error);
    throw error;
  }
};
