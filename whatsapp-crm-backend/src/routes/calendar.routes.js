const express = require('express');
const router = express.Router();
const calendarController = require('../controllers/calendar.controller');

// Calendar verification
router.get('/verify', calendarController.verifyCalendar);

// Booking confirmation
router.post('/bookings/confirm', calendarController.confirmBooking);

module.exports = router;