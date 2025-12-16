const express = require('express');
const router = express.Router();
const calendarController = require('../controllers/calendar.controller');

// Calendar verification
router.get('/verify', calendarController.verifyCalendar);

// Booking confirmation
router.post('/bookings/confirm', calendarController.confirmBooking);

// Google Calendar OAuth
router.get('/oauth/google/start', calendarController.startGoogleCalendarOAuth);
router.get('/oauth/google/callback', calendarController.handleGoogleCalendarCallback);

// Calendar management
router.get('/status/:company_id', calendarController.getCalendarStatus);
router.get('/active/:company_id', calendarController.getActiveCalendar);
router.delete('/disconnect/:calendar_config_id', calendarController.disconnectCalendar);

// Calendar events
router.post('/create-event', calendarController.createCalendarEvent);
router.post('/check-availability', calendarController.checkAvailability);
router.post('/available-slots', calendarController.getAvailableSlots);

// Email confirmations
router.post('/send-confirmation', calendarController.sendConfirmationEmail);
router.post('/resend-confirmation/:event_id', calendarController.resendConfirmationEmail);
router.get('/email-status/:event_id', calendarController.getEmailStatus);


module.exports = router;