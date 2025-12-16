const pool = require('../config/database');

exports.configureAirtelSIP = async (req, res) => {
  try {
    const { 
      agent_instance_id, 
      sip_domain, 
      sip_username, 
      sip_password, 
      did_number 
    } = req.body;
    
    if (!agent_instance_id || !sip_domain || !sip_username || !sip_password || !did_number) {
      return res.status(400).json({ 
        error: 'agent_instance_id, sip_domain, sip_username, sip_password, and did_number required' 
      });
    }
    
    const normalizedDID = did_number.startsWith('+') ? did_number : `+${did_number}`;
    
    await pool.query(`
      UPDATE agent_instances
      SET 
        phone_number = $1,
        sip_provider = 'airtel',
        sip_credentials = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [
      normalizedDID,
      JSON.stringify({
        sip_domain,
        sip_username,
        sip_password,
        did_number: normalizedDID,
        provider: 'airtel'
      }),
      agent_instance_id
    ]);
    
    res.json({ 
      success: true, 
      message: 'Airtel SIP configured successfully',
      phone_number: normalizedDID 
    });
    
  } catch (error) {
    console.error('Airtel SIP config error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getSIPStatus = async (req, res) => {
  try {
    const { agent_instance_id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        phone_number,
        sip_provider,
        sip_credentials,
        twilio_credentials
      FROM agent_instances
      WHERE id = $1
    `, [agent_instance_id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    const agent = result.rows[0];
    let status = {
      is_configured: false,
      provider: 'none',
      phone_number: null
    };
    
    if (agent.sip_credentials && Object.keys(agent.sip_credentials).length > 0) {
      status = {
        is_configured: true,
        provider: agent.sip_provider || 'custom',
        phone_number: agent.phone_number
      };
    } else if (agent.twilio_credentials && Object.keys(agent.twilio_credentials).length > 0) {
      status = {
        is_configured: true,
        provider: 'twilio',
        phone_number: agent.phone_number
      };
    }
    
    res.json({ success: true, data: status });
    
  } catch (error) {
    console.error('SIP status error:', error);
    res.status(500).json({ error: error.message });
  }
};