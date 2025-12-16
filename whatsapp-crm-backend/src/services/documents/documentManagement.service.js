const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const AWS = require('aws-sdk');
const logger = require('../../utils/logger');
const { logInfo, logError } = require('../../utils/logger');


// Configure AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
});

class DocumentManagementService {
  constructor(pool) {
    this.pool = pool;
    this.uploadDir = path.join(__dirname, '../../../uploads/documents');
    this.initUploadDir();
  }

  async initUploadDir() {
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
      logInfo('Upload directory initialized');
    } catch (error) {
      logError('Failed to create upload directory:', error);
    }
  }

  /**
   * Upload document with proper error handling
   */
  async uploadDocument(companyId, uploadedBy, documentData, file) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      const {
        lead_id = null,
        document_type = 'other',
        document_name,
        description = null,
        folder_id = null,
        tags = []
      } = documentData;

      // Validate required fields
      if (!document_name || document_name.trim().length === 0) {
        throw new Error('Document name is required');
      }

      if (!file || !file.buffer) {
        throw new Error('File data is required');
      }

      // Generate unique filename
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(7);
      const ext = path.extname(file.originalname);
      const filename = `${timestamp}_${randomStr}${ext}`;
      
      let storageUrl;
      let storagePath;

      // Upload to S3 or local storage
      if (process.env.USE_S3 === 'true') {
        const s3Key = `documents/${companyId}/${filename}`;
        
        const uploadParams = {
          Bucket: process.env.S3_BUCKET,
          Key: s3Key,
          Body: file.buffer,
          ContentType: file.mimetype,
          ACL: 'private',
          ServerSideEncryption: 'AES256'
        };

        await s3.upload(uploadParams).promise();

        storageUrl = `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;
        storagePath = s3Key;
      } else {
        // Local storage
        const companyDir = path.join(this.uploadDir, companyId.toString());
        await fs.mkdir(companyDir, { recursive: true });
        
        const localPath = path.join(companyDir, filename);
        await fs.writeFile(localPath, file.buffer);
        
        storageUrl = `/uploads/documents/${companyId}/${filename}`;
        storagePath = localPath;
      }

      // Save to database
      const result = await client.query(
        `INSERT INTO documents 
         (company_id, lead_id, document_type, document_name, description, 
          filename, file_size, mime_type, storage_url, storage_path, 
          folder_id, tags, uploaded_by, version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 1)
         RETURNING *`,
        [
          companyId, lead_id, document_type, document_name, description,
          filename, file.size, file.mimetype, storageUrl, storagePath,
          folder_id, tags, uploadedBy
        ]
      );

      // Create activity log if lead_id exists
      if (lead_id) {
        await client.query(
          `INSERT INTO activity_feed 
           (company_id, lead_id, agent_id, activity_type, activity_description)
           VALUES ($1, $2, $3, 'document_uploaded', $4)`,
          [companyId, lead_id, uploadedBy, `Uploaded document: ${document_name}`]
        );
      }

      await client.query('COMMIT');

      logInfo(`Document uploaded successfully: ${result.rows[0].id}`);
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      logError('Upload document error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get document with signed URL
   */
  async getDocument(documentId, userId) {
    try {
      const result = await this.pool.query(
        `SELECT d.*, ha.name as uploaded_by_name, ha.email as uploaded_by_email
         FROM documents d
         LEFT JOIN human_agents ha ON d.uploaded_by = ha.id
         WHERE d.id = $1 AND d.is_deleted = FALSE`,
        [documentId]
      );

      if (result.rows.length === 0) {
        throw new Error('Document not found');
      }

      const document = result.rows[0];

      // Generate signed URL if using S3
      if (process.env.USE_S3 === 'true') {
        const signedUrl = s3.getSignedUrl('getObject', {
          Bucket: process.env.S3_BUCKET,
          Key: document.storage_path,
          Expires: 3600 // 1 hour
        });

        document.download_url = signedUrl;
      } else {
        document.download_url = document.storage_url;
      }

      // Log access
      await this.pool.query(
        `INSERT INTO document_access_logs 
         (document_id, accessed_by, access_type)
         VALUES ($1, $2, 'view')`,
        [documentId, userId]
      );

      return document;
    } catch (error) {
      logError('Get document error:', error);
      throw error;
    }
  }

  /**
   * List documents with pagination and filters
   */
  async listDocuments(companyId, filters = {}) {
    try {
      const {
        lead_id,
        document_type,
        folder_id,
        search,
        page = 1,
        limit = 50
      } = filters;

      let query = `
        SELECT d.*, 
               ha.name as uploaded_by_name,
               COUNT(*) OVER() as total_count
        FROM documents d
        LEFT JOIN human_agents ha ON d.uploaded_by = ha.id
        WHERE d.company_id = $1 AND d.is_deleted = FALSE
      `;

      const params = [companyId];
      let paramCount = 1;

      if (lead_id) {
        params.push(lead_id);
        query += ` AND d.lead_id = $${++paramCount}`;
      }

      if (document_type) {
        params.push(document_type);
        query += ` AND d.document_type = $${++paramCount}`;
      }

      if (folder_id === 'null') {
        query += ` AND d.folder_id IS NULL`;
      } else if (folder_id) {
        params.push(folder_id);
        query += ` AND d.folder_id = $${++paramCount}`;
      }

      if (search) {
        params.push(`%${search}%`);
        query += ` AND (
          d.document_name ILIKE $${++paramCount} OR 
          d.description ILIKE $${paramCount} OR
          d.filename ILIKE $${paramCount}
        )`;
      }

      query += ` ORDER BY d.created_at DESC`;

      const offset = (page - 1) * limit;
      params.push(limit, offset);
      query += ` LIMIT $${++paramCount} OFFSET $${++paramCount}`;

      const result = await this.pool.query(query, params);

      return {
        documents: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: result.rows[0]?.total_count || 0,
          total_pages: Math.ceil((result.rows[0]?.total_count || 0) / limit)
        }
      };
    } catch (error) {
      logError('List documents error:', error);
      throw error;
    }
  }

  /**
   * Create folder
   */
  async createFolder(companyId, folderData, createdBy) {
    try {
      const { folder_name, parent_folder_id = null, description = null } = folderData;

      if (!folder_name || folder_name.trim().length === 0) {
        throw new Error('Folder name is required');
      }

      const result = await this.pool.query(
        `INSERT INTO document_folders 
         (company_id, folder_name, parent_folder_id, description, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [companyId, folder_name.trim(), parent_folder_id, description, createdBy]
      );

      logInfo(`Folder created: ${result.rows[0].id}`);
      return result.rows[0];
    } catch (error) {
      logError('Create folder error:', error);
      throw error;
    }
  }

  /**
   * Get folders
   */
  async getFolders(companyId, parentFolderId = null) {
    try {
      let query;
      let params;

      if (parentFolderId === null) {
        query = `
          SELECT f.*, 
                 ha.name as created_by_name,
                 (SELECT COUNT(*) FROM documents WHERE folder_id = f.id AND is_deleted = FALSE) as document_count,
                 (SELECT COUNT(*) FROM document_folders WHERE parent_folder_id = f.id) as subfolder_count
          FROM document_folders f
          LEFT JOIN human_agents ha ON f.created_by = ha.id
          WHERE f.company_id = $1 AND f.parent_folder_id IS NULL
          ORDER BY f.folder_name
        `;
        params = [companyId];
      } else {
        query = `
          SELECT f.*, 
                 ha.name as created_by_name,
                 (SELECT COUNT(*) FROM documents WHERE folder_id = f.id AND is_deleted = FALSE) as document_count,
                 (SELECT COUNT(*) FROM document_folders WHERE parent_folder_id = f.id) as subfolder_count
          FROM document_folders f
          LEFT JOIN human_agents ha ON f.created_by = ha.id
          WHERE f.company_id = $1 AND f.parent_folder_id = $2
          ORDER BY f.folder_name
        `;
        params = [companyId, parentFolderId];
      }

      const result = await this.pool.query(query, params);
      return result.rows;
    } catch (error) {
      logError('Get folders error:', error);
      throw error;
    }
  }

  /**
   * Delete document (soft delete)
   */
  async deleteDocument(documentId, deletedBy) {
    try {
      const result = await this.pool.query(
        `UPDATE documents 
         SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $1
         WHERE id = $2 AND is_deleted = FALSE
         RETURNING *`,
        [deletedBy, documentId]
      );

      if (result.rows.length === 0) {
        throw new Error('Document not found or already deleted');
      }

      logInfo(`Document deleted: ${documentId}`);
      return { success: true, document: result.rows[0] };
    } catch (error) {
      logError('Delete document error:', error);
      throw error;
    }
  }

  /**
   * Share document
   */
  async shareDocument(documentId, sharedWith, sharedBy, permissions = 'view') {
    try {
      if (!['view', 'edit', 'download', 'full'].includes(permissions)) {
        throw new Error('Invalid permissions. Must be: view, edit, download, or full');
      }

      await this.pool.query(
        `INSERT INTO document_shares 
         (document_id, shared_with_agent_id, shared_by, permissions)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (document_id, shared_with_agent_id) 
         DO UPDATE SET permissions = $4, shared_at = NOW()`,
        [documentId, sharedWith, sharedBy, permissions]
      );

      // Create notification
      await this.pool.query(
        `INSERT INTO push_notifications 
         (agent_id, notification_type, title, body, data)
         VALUES ($1, 'document_shared', 'Document Shared', $2, $3)`,
        [
          sharedWith,
          'A document has been shared with you',
          JSON.stringify({ document_id: documentId, permissions })
        ]
      );

      logInfo(`Document ${documentId} shared with agent ${sharedWith}`);
      return { success: true };
    } catch (error) {
      logError('Share document error:', error);
      throw error;
    }
  }

  /**
   * Update document metadata
   */
  async updateDocument(documentId, updateData) {
    try {
      const { document_name, description, tags, folder_id } = updateData;

      const updates = [];
      const params = [];
      let paramCount = 1;

      if (document_name !== undefined) {
        updates.push(`document_name = $${paramCount++}`);
        params.push(document_name);
      }

      if (description !== undefined) {
        updates.push(`description = $${paramCount++}`);
        params.push(description);
      }

      if (tags !== undefined) {
        updates.push(`tags = $${paramCount++}`);
        params.push(tags);
      }

      if (folder_id !== undefined) {
        updates.push(`folder_id = $${paramCount++}`);
        params.push(folder_id);
      }

      if (updates.length === 0) {
        throw new Error('No fields to update');
      }

      params.push(documentId);

      const result = await this.pool.query(
        `UPDATE documents 
         SET ${updates.join(', ')}, updated_at = NOW()
         WHERE id = $${paramCount} AND is_deleted = FALSE
         RETURNING *`,
        params
      );

      if (result.rows.length === 0) {
        throw new Error('Document not found');
      }

      logInfo(`Document updated: ${documentId}`);
      return result.rows[0];
    } catch (error) {
      logError('Update document error:', error);
      throw error;
    }
  }

  /**
   * Search documents using full-text search
   */
  async searchDocuments(companyId, searchTerm) {
    try {
      const query = `
        SELECT d.*, 
               ha.name as uploaded_by_name,
               ts_rank(
                 to_tsvector('english', d.document_name || ' ' || COALESCE(d.description, '') || ' ' || COALESCE(array_to_string(d.tags, ' '), '')), 
                 plainto_tsquery('english', $2)
               ) as rank
        FROM documents d
        LEFT JOIN human_agents ha ON d.uploaded_by = ha.id
        WHERE d.company_id = $1
        AND d.is_deleted = FALSE
        AND to_tsvector('english', d.document_name || ' ' || COALESCE(d.description, '') || ' ' || COALESCE(array_to_string(d.tags, ' '), '')) @@ plainto_tsquery('english', $2)
        ORDER BY rank DESC, d.created_at DESC
        LIMIT 50
      `;

      const result = await this.pool.query(query, [companyId, searchTerm]);
      return result.rows;
    } catch (error) {
      logError('Search documents error:', error);
      throw error;
    }
  }

  /**
   * Get document access logs
   */
  async getAccessLogs(documentId, limit = 50) {
    try {
      const result = await this.pool.query(
        `SELECT dal.*, ha.name as accessed_by_name, ha.email as accessed_by_email
         FROM document_access_logs dal
         LEFT JOIN human_agents ha ON dal.accessed_by = ha.id
         WHERE dal.document_id = $1
         ORDER BY dal.accessed_at DESC
         LIMIT $2`,
        [documentId, limit]
      );

      return result.rows;
    } catch (error) {
      logError('Get access logs error:', error);
      throw error;
    }
  }
}

// Multer configuration
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
      cb(new Error(`Invalid file type: ${file.mimetype}. Allowed types: PDF, Word, Excel, PowerPoint, images, text files.`));
    }
  }
});

module.exports = { DocumentManagementService, upload };
