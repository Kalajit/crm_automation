// // const documentService = require('../services/documents/documentManagement.service');
// // const logger = require('../utils/logger');

// // class DocumentsController {
// //   // Upload document
// //   async uploadDocument(req, res) {
// //     try {
// //       const { company_id, folder_id, name, tags, shared_with } = req.body;
// //       const file = req.file;

// //       if (!file) {
// //         return res.status(400).json({ error: 'No file uploaded' });
// //       }

// //       const document = await documentService.uploadDocument({
// //         company_id,
// //         folder_id: folder_id || null,
// //         file,
// //         name: name || file.originalname,
// //         tags: tags ? JSON.parse(tags) : [],
// //         shared_with: shared_with ? JSON.parse(shared_with) : []
// //       });

// //       res.status(201).json({ success: true, data: document });
// //     } catch (error) {
// //       // logger.error('Error uploading document:', error);
// //       console.error('Error uploading document:', error);

// //       res.status(500).json({ error: error.message });
// //     }
// //   }

// //   // Get document by ID
// //   async getDocument(req, res) {
// //     try {
// //       const { id } = req.params;
// //       const document = await documentService.getDocumentById(id);
// //       res.json({ success: true, data: document });
// //     } catch (error) {
// //       res.status(404).json({ error: error.message });
// //     }
// //   }

// //   // List documents
// //   async listDocuments(req, res) {
// //     try {
// //       const { company_id } = req.params;
// //       const filters = req.query;
// //       const documents = await documentService.getDocuments(company_id, filters);
// //       res.json({ success: true, data: documents });
// //     } catch (error) {
// //       res.status(500).json({ error: error.message });
// //     }
// //   }

// //   // Download document
// //   async downloadDocument(req, res) {
// //     try {
// //       const { id } = req.params;
// //       const { version } = req.query;
      
// //       const result = await documentService.downloadDocument(id, version || null);
      
// //       res.setHeader('Content-Type', result.mime_type);
// //       res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
// //       res.send(result.data);
// //     } catch (error) {
// //       res.status(500).json({ error: error.message });
// //     }
// //   }

// //   // Update document
// //   async updateDocument(req, res) {
// //     try {
// //       const { id } = req.params;
// //       const updateData = req.body;
      
// //       const document = await documentService.updateDocument(id, updateData);
// //       res.json({ success: true, data: document });
// //     } catch (error) {
// //       res.status(500).json({ error: error.message });
// //     }
// //   }

// //   // Delete document
// //   async deleteDocument(req, res) {
// //     try {
// //       const { id } = req.params;
// //       await documentService.deleteDocument(id);
// //       res.json({ success: true, message: 'Document deleted' });
// //     } catch (error) {
// //       res.status(500).json({ error: error.message });
// //     }
// //   }

// //   // Share document
// //   async shareDocument(req, res) {
// //     try {
// //       const { id } = req.params;
// //       const { user_ids, permission } = req.body;
      
// //       const result = await documentService.shareDocument(id, user_ids, permission);
// //       res.json({ success: true, data: result });
// //     } catch (error) {
// //       res.status(500).json({ error: error.message });
// //     }
// //   }

// //   // Search documents
// //   async searchDocuments(req, res) {
// //     try {
// //       const { company_id } = req.params;
// //       const { query } = req.query;
      
// //       const results = await documentService.searchDocuments(company_id, query);
// //       res.json({ success: true, data: results });
// //     } catch (error) {
// //       res.status(500).json({ error: error.message });
// //     }
// //   }

// //   // Create folder
// //   async createFolder(req, res) {
// //     try {
// //       const { company_id, name, parent_folder_id } = req.body;
// //       const folder = await documentService.createFolder(company_id, name, parent_folder_id);
// //       res.status(201).json({ success: true, data: folder });
// //     } catch (error) {
// //       res.status(500).json({ error: error.message });
// //     }
// //   }
// // }



// // module.exports = new DocumentsController();





// // const documentService = require('../services/documents/documentManagement.service');

// // class DocumentsController {
// //   // Upload document
// //   async uploadDocument(req, res) {
// //     try {
// //       const { company_id, folder_id, name, tags, shared_with } = req.body;
// //       const file = req.file;

// //       if (!file) {
// //         return res.status(400).json({ error: 'No file uploaded' });
// //       }

// //       const document = await documentService.uploadDocument({
// //         company_id,
// //         folder_id: folder_id || null,
// //         file,
// //         name: name || file.originalname,
// //         tags: tags ? JSON.parse(tags) : [],
// //         shared_with: shared_with ? JSON.parse(shared_with) : []
// //       });

// //       res.status(201).json({ success: true, data: document });
// //     } catch (error) {
// //       console.error('Error uploading document:', error.message);
// //       res.status(500).json({ error: error.message });
// //     }
// //   }

// //   // Get document by ID
// //   async getDocument(req, res) {
// //     try {
// //       const { id } = req.params;
// //       const document = await documentService.getDocumentById(id);
// //       res.json({ success: true, data: document });
// //     } catch (error) {
// //       res.status(404).json({ error: error.message });
// //     }
// //   }

// //   // List documents
// //   async listDocuments(req, res) {
// //     try {
// //       const { company_id } = req.params;
// //       const filters = req.query;
// //       const documents = await documentService.getDocuments(company_id, filters);
// //       res.json({ success: true, data: documents });
// //     } catch (error) {
// //       res.status(500).json({ error: error.message });
// //     }
// //   }

// //   // Download document
// //   async downloadDocument(req, res) {
// //     try {
// //       const { id } = req.params;
// //       const { version } = req.query;
      
// //       const result = await documentService.downloadDocument(id, version || null);
      
// //       res.setHeader('Content-Type', result.mime_type);
// //       res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
// //       res.send(result.data);
// //     } catch (error) {
// //       res.status(500).json({ error: error.message });
// //     }
// //   }

// //   // Update document
// //   async updateDocument(req, res) {
// //     try {
// //       const { id } = req.params;
// //       const updateData = req.body;
      
// //       const document = await documentService.updateDocument(id, updateData);
// //       res.json({ success: true, data: document });
// //     } catch (error) {
// //       res.status(500).json({ error: error.message });
// //     }
// //   }

// //   // Delete document
// //   async deleteDocument(req, res) {
// //     try {
// //       const { id } = req.params;
// //       await documentService.deleteDocument(id);
// //       res.json({ success: true, message: 'Document deleted' });
// //     } catch (error) {
// //       res.status(500).json({ error: error.message });
// //     }
// //   }

// //   // Share document
// //   async shareDocument(req, res) {
// //     try {
// //       const { id } = req.params;
// //       const { user_ids, permission } = req.body;
      
// //       const result = await documentService.shareDocument(id, user_ids, permission);
// //       res.json({ success: true, data: result });
// //     } catch (error) {
// //       res.status(500).json({ error: error.message });
// //     }
// //   }

// //   // Search documents
// //   async searchDocuments(req, res) {
// //     try {
// //       const { company_id } = req.params;
// //       const { query } = req.query;
      
// //       const results = await documentService.searchDocuments(company_id, query);
// //       res.json({ success: true, data: results });
// //     } catch (error) {
// //       res.status(500).json({ error: error.message });
// //     }
// //   }

// //   // Create folder
// //   async createFolder(req, res) {
// //     try {
// //       const { company_id, name, parent_folder_id } = req.body;
// //       const folder = await documentService.createFolder(company_id, name, parent_folder_id);
// //       res.status(201).json({ success: true, data: folder });
// //     } catch (error) {
// //       res.status(500).json({ error: error.message });
// //     }
// //   }
// // }

// // module.exports = new DocumentsController();






// const pool = require('../config/database');
// const logger = require('../utils/logger');
// const { DocumentManagementService } = require('../services/documents/documentManagement.service');

// // Initialize service
// const documentService = new DocumentManagementService(pool);

// class DocumentsController {
//   // Upload document
//   async uploadDocument(req, res) {
//     try {
//       const { company_id, folder_id, document_type, document_name, description, tags } = req.body;
//       const file = req.file;
//       const uploadedBy = req.user?.id || req.body.uploaded_by;

//       if (!file) {
//         return res.status(400).json({ error: 'No file uploaded' });
//       }

//       if (!company_id) {
//         return res.status(400).json({ error: 'Company ID is required' });
//       }

//       const documentData = {
//         lead_id: req.body.lead_id || null,
//         document_type: document_type || 'other',
//         document_name: document_name || file.originalname,
//         description: description || null,
//         folder_id: folder_id || null,
//         tags: tags ? (typeof tags === 'string' ? JSON.parse(tags) : tags) : []
//       };

//       const document = await documentService.uploadDocument(
//         company_id,
//         uploadedBy,
//         documentData,
//         file
//       );

//       res.status(201).json({ success: true, data: document });
//     } catch (error) {
//       logger.error('Error uploading document:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

//   // Get document by ID
//   async getDocument(req, res) {
//     try {
//       const { id } = req.params;
//       const userId = req.user?.id || 1;
      
//       const document = await documentService.getDocument(id, userId);
//       res.json({ success: true, data: document });
//     } catch (error) {
//       logger.error('Error getting document:', error);
//       res.status(404).json({ error: error.message });
//     }
//   }

//   // List documents
//   async listDocuments(req, res) {
//     try {
//       const { company_id } = req.params;
//       const filters = req.query;
      
//       const result = await documentService.listDocuments(company_id, filters);
//       res.json({ success: true, ...result });
//     } catch (error) {
//       logger.error('Error listing documents:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

//   // Update document
//   async updateDocument(req, res) {
//     try {
//       const { id } = req.params;
//       const updateData = req.body;
      
//       const document = await documentService.updateDocument(id, updateData);
//       res.json({ success: true, data: document });
//     } catch (error) {
//       logger.error('Error updating document:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

//   // Delete document
//   async deleteDocument(req, res) {
//     try {
//       const { id } = req.params;
//       const deletedBy = req.user?.id || 1;
      
//       await documentService.deleteDocument(id, deletedBy);
//       res.json({ success: true, message: 'Document deleted successfully' });
//     } catch (error) {
//       logger.error('Error deleting document:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

//   // Share document
//   async shareDocument(req, res) {
//     try {
//       const { id } = req.params;
//       const { shared_with_agent_id, permissions } = req.body;
//       const sharedBy = req.user?.id || 1;

//       if (!shared_with_agent_id) {
//         return res.status(400).json({ error: 'Agent ID is required' });
//       }
      
//       await documentService.shareDocument(id, shared_with_agent_id, sharedBy, permissions);
//       res.json({ success: true, message: 'Document shared successfully' });
//     } catch (error) {
//       logger.error('Error sharing document:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

//   // Search documents
//   async searchDocuments(req, res) {
//     try {
//       const { company_id } = req.params;
//       const { query } = req.query;
      
//       if (!query) {
//         return res.status(400).json({ error: 'Search query is required' });
//       }
      
//       const results = await documentService.searchDocuments(company_id, query);
//       res.json({ success: true, data: results });
//     } catch (error) {
//       logger.error('Error searching documents:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

//   // Create folder
//   async createFolder(req, res) {
//     try {
//       const { company_id, folder_name, parent_folder_id, description } = req.body;
//       const createdBy = req.user?.id || 1;
      
//       if (!company_id || !folder_name) {
//         return res.status(400).json({ error: 'Company ID and folder name are required' });
//       }
      
//       const folder = await documentService.createFolder(
//         company_id,
//         { folder_name, parent_folder_id, description },
//         createdBy
//       );
//       res.status(201).json({ success: true, data: folder });
//     } catch (error) {
//       logger.error('Error creating folder:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

//   // Get folders
//   async getFolders(req, res) {
//     try {
//       const { company_id } = req.params;
//       const { parent_folder_id } = req.query;
      
//       const folders = await documentService.getFolders(
//         company_id,
//         parent_folder_id || null
//       );
//       res.json({ success: true, data: folders });
//     } catch (error) {
//       logger.error('Error getting folders:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

//   // Get access logs
//   async getAccessLogs(req, res) {
//     try {
//       const { id } = req.params;
//       const { limit } = req.query;
      
//       const logs = await documentService.getAccessLogs(id, limit ? parseInt(limit) : 50);
//       res.json({ success: true, data: logs });
//     } catch (error) {
//       logger.error('Error getting access logs:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }
// }

// module.exports = new DocumentsController();







const pool = require('../config/database');
const logger = require('../utils/logger');
const documentServiceModule = require('../services/documents/documentManagement.service');

// Handle both export patterns
const DocumentManagementService = documentServiceModule.DocumentManagementService || documentServiceModule;

// Initialize service
const documentService = new DocumentManagementService(pool);

class DocumentsController {
  // Upload document
  async uploadDocument(req, res) {
    try {
      const { company_id, folder_id, document_type, document_name, description, tags } = req.body;
      const file = req.file;
      const uploadedBy = req.user?.id || req.body.uploaded_by;

      if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      if (!company_id) {
        return res.status(400).json({ error: 'Company ID is required' });
      }

      const documentData = {
        lead_id: req.body.lead_id || null,
        document_type: document_type || 'other',
        document_name: document_name || file.originalname,
        description: description || null,
        folder_id: folder_id || null,
        tags: tags ? (typeof tags === 'string' ? JSON.parse(tags) : tags) : []
      };

      const document = await documentService.uploadDocument(
        company_id,
        uploadedBy,
        documentData,
        file
      );

      res.status(201).json({ success: true, data: document });
    } catch (error) {
      logger.error('Error uploading document:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Get document by ID
  async getDocument(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user?.id || 1;
      
      const document = await documentService.getDocument(id, userId);
      res.json({ success: true, data: document });
    } catch (error) {
      logger.error('Error getting document:', error);
      res.status(404).json({ error: error.message });
    }
  }

  // List documents
  async listDocuments(req, res) {
    try {
      const { company_id } = req.params;
      const filters = req.query;
      
      const result = await documentService.listDocuments(company_id, filters);
      res.json({ success: true, ...result });
    } catch (error) {
      logger.error('Error listing documents:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Update document
  async updateDocument(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      
      const document = await documentService.updateDocument(id, updateData);
      res.json({ success: true, data: document });
    } catch (error) {
      logger.error('Error updating document:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Delete document
  async deleteDocument(req, res) {
    try {
      const { id } = req.params;
      const deletedBy = req.user?.id || 1;
      
      await documentService.deleteDocument(id, deletedBy);
      res.json({ success: true, message: 'Document deleted successfully' });
    } catch (error) {
      logger.error('Error deleting document:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Share document
  async shareDocument(req, res) {
    try {
      const { id } = req.params;
      const { shared_with_agent_id, permissions } = req.body;
      const sharedBy = req.user?.id || 1;

      if (!shared_with_agent_id) {
        return res.status(400).json({ error: 'Agent ID is required' });
      }
      
      await documentService.shareDocument(id, shared_with_agent_id, sharedBy, permissions);
      res.json({ success: true, message: 'Document shared successfully' });
    } catch (error) {
      logger.error('Error sharing document:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Search documents
  async searchDocuments(req, res) {
    try {
      const { company_id } = req.params;
      const { query } = req.query;
      
      if (!query) {
        return res.status(400).json({ error: 'Search query is required' });
      }
      
      const results = await documentService.searchDocuments(company_id, query);
      res.json({ success: true, data: results });
    } catch (error) {
      logger.error('Error searching documents:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Create folder
  async createFolder(req, res) {
    try {
      const { company_id, folder_name, parent_folder_id, description } = req.body;
      const createdBy = req.user?.id || 1;
      
      if (!company_id || !folder_name) {
        return res.status(400).json({ error: 'Company ID and folder name are required' });
      }
      
      const folder = await documentService.createFolder(
        company_id,
        { folder_name, parent_folder_id, description },
        createdBy
      );
      res.status(201).json({ success: true, data: folder });
    } catch (error) {
      logger.error('Error creating folder:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Get folders
  async getFolders(req, res) {
    try {
      const { company_id } = req.params;
      const { parent_folder_id } = req.query;
      
      const folders = await documentService.getFolders(
        company_id,
        parent_folder_id || null
      );
      res.json({ success: true, data: folders });
    } catch (error) {
      logger.error('Error getting folders:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Get access logs
  async getAccessLogs(req, res) {
    try {
      const { id } = req.params;
      const { limit } = req.query;
      
      const logs = await documentService.getAccessLogs(id, limit ? parseInt(limit) : 50);
      res.json({ success: true, data: logs });
    } catch (error) {
      logger.error('Error getting access logs:', error);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new DocumentsController();