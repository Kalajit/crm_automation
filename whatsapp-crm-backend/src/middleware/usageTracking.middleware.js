const { trackUsage, checkUsageLimit } = require('../services/usage/usageTracking.service');

// Track usage middleware
exports.trackUsageMiddleware = (eventType) => {
  return async (req, res, next) => {
    try {
      const company_id = req.body.company_id || req.query.company_id || req.params.company_id;
      
      if (company_id) {
        const quantity = req.body.quantity || 1;
        const metadata = {
          endpoint: req.path,
          method: req.method,
          user_agent: req.headers['user-agent']
        };
        
        await trackUsage(company_id, eventType, quantity, metadata);
      }
      
      next();
    } catch (error) {
      next();
    }
  };
};

// Check usage limit middleware
exports.checkUsageLimitMiddleware = (eventType) => {
  return async (req, res, next) => {
    try {
      const company_id = req.body.company_id || req.query.company_id || req.params.company_id;
      
      if (!company_id) {
        return next();
      }
      
      const limitCheck = await checkUsageLimit(company_id, eventType);
      
      if (!limitCheck.allowed) {
        return res.status(429).json({
          success: false,
          error: 'Usage limit exceeded',
          details: {
            reason: limitCheck.reason,
            used: limitCheck.used,
            limit: limitCheck.limit
          }
        });
      }
      
      req.usageLimitInfo = limitCheck;
      next();
    } catch (error) {
      next();
    }
  };
};