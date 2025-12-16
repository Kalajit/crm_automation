// const express = require('express');
// const router = express.Router();
// const multer = require('multer');
// // const { DocumentsController } = require('../controllers/documents.controller');
// const DocumentsController = require('../controllers/documents.controller');


// // Configure multer for file uploads
// const upload = multer({
//   storage: multer.memoryStorage(),
//   limits: {
//     fileSize: 50 * 1024 * 1024 // 50MB limit
//   }
// });

// // Document routes
// router.post('/upload', upload.single('file'), DocumentsController.uploadDocument);
// router.get('/:id', DocumentsController.getDocument);
// router.get('/company/:company_id', DocumentsController.listDocuments);
// router.get('/:id/download', DocumentsController.downloadDocument);
// router.put('/:id', DocumentsController.updateDocument);
// router.delete('/:id', DocumentsController.deleteDocument);
// router.post('/:id/share', DocumentsController.shareDocument);
// router.get('/company/:company_id/search', DocumentsController.searchDocuments);

// // Folder routes
// router.post('/folders', DocumentsController.createFolder);

// module.exports = router;




const express = require('express');
const router = express.Router();
const multer = require('multer');
const DocumentsController = require('../controllers/documents.controller');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'image/jpeg',
      'image/png',
      'image/gif',
      'text/plain',
      'text/csv'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}`));
    }
  }
});

// Document CRUD routes
router.post('/upload', upload.single('file'), DocumentsController.uploadDocument);
router.get('/:id', DocumentsController.getDocument);
router.get('/company/:company_id', DocumentsController.listDocuments);
router.put('/:id', DocumentsController.updateDocument);
router.delete('/:id', DocumentsController.deleteDocument);

// Document actions
router.post('/:id/share', DocumentsController.shareDocument);
router.get('/company/:company_id/search', DocumentsController.searchDocuments);
router.get('/:id/access-logs', DocumentsController.getAccessLogs);

// Folder routes
router.post('/folders', DocumentsController.createFolder);
router.get('/company/:company_id/folders', DocumentsController.getFolders);

module.exports = router;