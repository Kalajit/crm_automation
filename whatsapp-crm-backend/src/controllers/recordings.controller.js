const pool = require('../config/database');
const { sendSuccess, handleError } = require('../utils/response');
const { logRequest } = require('../utils/logger');
const fs = require('fs');
const path = require('path');

/**
 * Upload recording file
 */
exports.uploadRecording = async (req, res) => {
  try {
    const { call_sid, filename } = req.body;
    const uploadedFilePath = req.file.path;

    let finalPath = uploadedFilePath;
    if (filename) {
      const uploadDir = path.dirname(uploadedFilePath);
      finalPath = path.join(uploadDir, filename);

      // Check if source file exists before renaming
      if (fs.existsSync(uploadedFilePath)) {
        fs.renameSync(uploadedFilePath, finalPath);
      } else {
        return res.status(400).json({ 
          success: false, 
          error: 'Uploaded file not found' 
        });
      }
    }
    
    // Update call log with local path
    await pool.query(`
      UPDATE call_logs
      SET local_audio_path = $1, updated_at = NOW()
      WHERE call_sid = $2
    `, [finalPath, call_sid]);
    
    logRequest('POST', '/api/recordings/upload', 200);
    sendSuccess(res, {
      saved_as: filename || path.basename(finalPath),
      local_path: finalPath,
      message: 'Recording saved locally'
    });
    
  } catch (error) {
    logRequest('POST', '/api/recordings/upload', 500);
    handleError(res, error);
  }
};