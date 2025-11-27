const express = require('express');
const router = express.Router();
const recordingsController = require('../controllers/recordings.controller');
const multer = require('multer');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: './recordings/',
  filename: (req, file, cb) => {
    const callSid = req.body.call_sid || 'unknown';
    cb(null, `${callSid}_${Date.now()}.mp3`);
  }
});

const upload = multer({ storage });

// Upload recording
router.post('/upload', upload.single('audio_file'), recordingsController.uploadRecording);

module.exports = router;