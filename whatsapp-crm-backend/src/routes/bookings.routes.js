const express = require('express');
const router = express.Router();
const bookingsController = require('../controllers/bookings.controller');

// Get upcoming bookings
router.get('/upcoming', bookingsController.getUpcomingBookings);

// Get bookings by lead
router.get('/lead/:lead_id', bookingsController.getBookingsByLead);

// Get all bookings with filters
router.get('/', bookingsController.getAllBookings);

// Get single booking by ID
router.get('/:id', bookingsController.getBookingById);

// Create new booking
router.post('/', bookingsController.createBooking);

// Update booking
router.patch('/:id', bookingsController.updateBooking);

// Cancel booking
router.delete('/:id', bookingsController.cancelBooking);

module.exports = router;