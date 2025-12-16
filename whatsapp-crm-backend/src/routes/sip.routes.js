const express = require('express');
const router = express.Router();
const sipController = require('../controllers/sip.controller');

router.post('/airtel-sip/configure', sipController.configureAirtelSIP);
router.get('/status/:agent_instance_id', sipController.getSIPStatus);

module.exports = router;