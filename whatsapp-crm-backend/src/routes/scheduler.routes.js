// const express = require('express');
// const router = express.Router();
// const { SchedulerController } = require('../controllers/scheduler.controller');

// // Scheduling link routes
// router.post('/links', SchedulerController.createLink);
// router.get('/links/:link_id', SchedulerController.getLink);
// router.get('/public/:slug', SchedulerController.getPublicLink);
// router.get('/links/:link_id/slots', SchedulerController.getAvailableSlots);

// // Meeting routes
// router.post('/meetings', SchedulerController.bookMeeting);
// router.get('/meetings/company/:company_id', SchedulerController.getMeetings);
// router.put('/meetings/:meeting_id/cancel', SchedulerController.cancelMeeting);
// router.put('/meetings/:meeting_id/reschedule', SchedulerController.rescheduleMeeting);

// module.exports = router;



const express = require('express');
const router = express.Router();
const SchedulerController = require('../controllers/scheduler.controller');

// Scheduling link routes
router.post('/links', SchedulerController.createLink);
router.get('/links/:link_slug', SchedulerController.getLink);
router.put('/links/:link_slug', SchedulerController.updateLink);
router.delete('/links/:link_slug', SchedulerController.deleteLink);
router.get('/links/company/:company_id', SchedulerController.getCompanyLinks);

// Available slots
router.get('/:link_slug/slots', SchedulerController.getAvailableSlots);

// Meeting routes
router.post('/:link_slug/book', SchedulerController.bookMeeting);
router.get('/meetings/company/:company_id', SchedulerController.getMeetings);
router.get('/meetings/:confirmation_code', SchedulerController.getMeetingDetails);
router.put('/meetings/:confirmation_code/cancel', SchedulerController.cancelMeeting);
router.put('/meetings/:confirmation_code/reschedule', SchedulerController.rescheduleMeeting);

module.exports = router;