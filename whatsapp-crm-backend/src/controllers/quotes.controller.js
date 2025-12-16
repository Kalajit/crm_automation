// // // const quoteService = require('../services/quotes/quoteGenerator.service');
// // // const logger = require('../utils/logger');

// // // class QuotesController {
// // //   // Create quote
// // //   async createQuote(req, res) {
// // //     try {
// // //       const quote = await quoteService.createQuote(req.body);
// // //       res.status(201).json({ success: true, data: quote });
// // //     } catch (error) {
// // //       // logger.error('Error creating quote:', error);
// // //       console.error('Error creating quote link:', error);
// // //       res.status(500).json({ error: error.message });
// // //     }
// // //   }

// // //   // Get quote
// // //   async getQuote(req, res) {
// // //     try {
// // //       const { id } = req.params;
// // //       const quote = await quoteService.getQuoteById(id);
// // //       res.json({ success: true, data: quote });
// // //     } catch (error) {
// // //       res.status(404).json({ error: error.message });
// // //     }
// // //   }

// // //   // List quotes
// // //   async listQuotes(req, res) {
// // //     try {
// // //       const { company_id } = req.params;
// // //       const filters = req.query;
// // //       const quotes = await quoteService.getQuotes(company_id, filters);
// // //       res.json({ success: true, data: quotes });
// // //     } catch (error) {
// // //       res.status(500).json({ error: error.message });
// // //     }
// // //   }

// // //   // Update quote
// // //   async updateQuote(req, res) {
// // //     try {
// // //       const { id } = req.params;
// // //       const quote = await quoteService.updateQuote(id, req.body);
// // //       res.json({ success: true, data: quote });
// // //     } catch (error) {
// // //       res.status(500).json({ error: error.message });
// // //     }
// // //   }

// // //   // Send quote
// // //   async sendQuote(req, res) {
// // //     try {
// // //       const { id } = req.params;
// // //       const { send_via } = req.body;
      
// // //       const result = await quoteService.sendQuote(id, { send_via });
// // //       res.json({ success: true, data: result });
// // //     } catch (error) {
// // //       res.status(500).json({ error: error.message });
// // //     }
// // //   }

// // //   // Accept quote
// // //   async acceptQuote(req, res) {
// // //     try {
// // //       const { id } = req.params;
// // //       const { accepted_by } = req.body;
      
// // //       const quote = await quoteService.acceptQuote(id, accepted_by);
// // //       res.json({ success: true, data: quote });
// // //     } catch (error) {
// // //       res.status(500).json({ error: error.message });
// // //     }
// // //   }

// // //   // Reject quote
// // //   async rejectQuote(req, res) {
// // //     try {
// // //       const { id } = req.params;
// // //       const { reason } = req.body;
      
// // //       const quote = await quoteService.rejectQuote(id, reason);
// // //       res.json({ success: true, data: quote });
// // //     } catch (error) {
// // //       res.status(500).json({ error: error.message });
// // //     }
// // //   }

// // //   // Mark as viewed
// // //   async markAsViewed(req, res) {
// // //     try {
// // //       const { id } = req.params;
// // //       await quoteService.markAsViewed(id);
// // //       res.json({ success: true, message: 'Quote marked as viewed' });
// // //     } catch (error) {
// // //       res.status(500).json({ error: error.message });
// // //     }
// // //   }

// // //   // Duplicate quote
// // //   async duplicateQuote(req, res) {
// // //     try {
// // //       const { id } = req.params;
// // //       const newQuote = await quoteService.duplicateQuote(id);
// // //       res.status(201).json({ success: true, data: newQuote });
// // //     } catch (error) {
// // //       res.status(500).json({ error: error.message });
// // //     }
// // //   }

// // //   // Download PDF
// // //   async downloadPDF(req, res) {
// // //     try {
// // //       const { id } = req.params;
// // //       const quote = await quoteService.getQuoteById(id);
// // //       const pdfPath = await quoteService.generateQuotePDF(quote);
      
// // //       res.download(pdfPath, `quote_${quote.quote_number}.pdf`);
// // //     } catch (error) {
// // //       res.status(500).json({ error: error.message });
// // //     }
// // //   }

// // //   // Get analytics
// // //   async getAnalytics(req, res) {
// // //     try {
// // //       const { company_id } = req.params;
// // //       const { from_date, to_date } = req.query;
      
// // //       const analytics = await quoteService.getQuoteAnalytics(
// // //         company_id,
// // //         from_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
// // //         to_date || new Date()
// // //       );
      
// // //       res.json({ success: true, data: analytics });
// // //     } catch (error) {
// // //       res.status(500).json({ error: error.message });
// // //     }
// // //   }
// // // }

// // // module.exports = {
// // // //   DocumentsController: new DocumentsController(),
// // // //   SchedulerController: new SchedulerController(),
// // // //   ProductsController: new ProductsController(),
// // //   QuotesController: new QuotesController()
// // // };




// // const quoteService = require('../services/quotes/quoteGenerator.service');

// // class QuotesController {
// //   // Create quote
// //   async createQuote(req, res) {
// //     try {
// //       const quote = await quoteService.createQuote(req.body);
// //       res.status(201).json({ success: true, data: quote });
// //     } catch (error) {
// //       console.error('Error creating quote:', error.message);
// //       res.status(500).json({ error: error.message });
// //     }
// //   }

// //   // Get quote
// //   async getQuote(req, res) {
// //     try {
// //       const { id } = req.params;
// //       const quote = await quoteService.getQuoteById(id);
// //       res.json({ success: true, data: quote });
// //     } catch (error) {
// //       res.status(404).json({ error: error.message });
// //     }
// //   }

// //   // List quotes
// //   async listQuotes(req, res) {
// //     try {
// //       const { company_id } = req.params;
// //       const filters = req.query;
// //       const quotes = await quoteService.getQuotes(company_id, filters);
// //       res.json({ success: true, data: quotes });
// //     } catch (error) {
// //       res.status(500).json({ error: error.message });
// //     }
// //   }

// //   // Update quote
// //   async updateQuote(req, res) {
// //     try {
// //       const { id } = req.params;
// //       const quote = await quoteService.updateQuote(id, req.body);
// //       res.json({ success: true, data: quote });
// //     } catch (error) {
// //       res.status(500).json({ error: error.message });
// //     }
// //   }

// //   // Send quote
// //   async sendQuote(req, res) {
// //     try {
// //       const { id } = req.params;
// //       const { send_via } = req.body;
      
// //       const result = await quoteService.sendQuote(id, { send_via });
// //       res.json({ success: true, data: result });
// //     } catch (error) {
// //       res.status(500).json({ error: error.message });
// //     }
// //   }

// //   // Accept quote
// //   async acceptQuote(req, res) {
// //     try {
// //       const { id } = req.params;
// //       const { accepted_by } = req.body;
      
// //       const quote = await quoteService.acceptQuote(id, accepted_by);
// //       res.json({ success: true, data: quote });
// //     } catch (error) {
// //       res.status(500).json({ error: error.message });
// //     }
// //   }

// //   // Reject quote
// //   async rejectQuote(req, res) {
// //     try {
// //       const { id } = req.params;
// //       const { reason } = req.body;
      
// //       const quote = await quoteService.rejectQuote(id, reason);
// //       res.json({ success: true, data: quote });
// //     } catch (error) {
// //       res.status(500).json({ error: error.message });
// //     }
// //   }

// //   // Mark as viewed
// //   async markAsViewed(req, res) {
// //     try {
// //       const { id } = req.params;
// //       await quoteService.markAsViewed(id);
// //       res.json({ success: true, message: 'Quote marked as viewed' });
// //     } catch (error) {
// //       res.status(500).json({ error: error.message });
// //     }
// //   }

// //   // Duplicate quote
// //   async duplicateQuote(req, res) {
// //     try {
// //       const { id } = req.params;
// //       const newQuote = await quoteService.duplicateQuote(id);
// //       res.status(201).json({ success: true, data: newQuote });
// //     } catch (error) {
// //       res.status(500).json({ error: error.message });
// //     }
// //   }

// //   // Download PDF
// //   async downloadPDF(req, res) {
// //     try {
// //       const { id } = req.params;
// //       const quote = await quoteService.getQuoteById(id);
// //       const pdfPath = await quoteService.generateQuotePDF(quote);
      
// //       res.download(pdfPath, `quote_${quote.quote_number}.pdf`);
// //     } catch (error) {
// //       res.status(500).json({ error: error.message });
// //     }
// //   }

// //   // Get analytics
// //   async getAnalytics(req, res) {
// //     try {
// //       const { company_id } = req.params;
// //       const { from_date, to_date } = req.query;
      
// //       const analytics = await quoteService.getQuoteAnalytics(
// //         company_id,
// //         from_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
// //         to_date || new Date()
// //       );
      
// //       res.json({ success: true, data: analytics });
// //     } catch (error) {
// //       res.status(500).json({ error: error.message });
// //     }
// //   }
// // }

// // module.exports = new QuotesController();




// const pool = require('../config/database');
// const logger = require('../utils/logger');
// const QuoteGeneratorService = require('../services/quotes/quoteGenerator.service');

// // Initialize service
// const quoteService = new QuoteGeneratorService(pool);

// class QuotesController {
//   // Create quote
//   async createQuote(req, res) {
//     try {
//       if (!req.body.company_id || !req.body.lead_id) {
//         return res.status(400).json({ error: 'Company ID and Lead ID are required' });
//       }
      
//       const quote = await quoteService.createQuote(req.body);
//       res.status(201).json({ success: true, data: quote });
//     } catch (error) {
//       logger.error('Error creating quote:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

//   // Get quote
//   async getQuote(req, res) {
//     try {
//       const { id } = req.params;
//       const quote = await quoteService.getQuoteById(id);
//       res.json({ success: true, data: quote });
//     } catch (error) {
//       logger.error('Error getting quote:', error);
//       res.status(404).json({ error: error.message });
//     }
//   }

//   // List quotes
//   async listQuotes(req, res) {
//     try {
//       const { company_id } = req.params;
//       const filters = req.query;
      
//       const quotes = await quoteService.getQuotes(company_id, filters);
//       res.json({ success: true, data: quotes });
//     } catch (error) {
//       logger.error('Error listing quotes:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

//   // Update quote
//   async updateQuote(req, res) {
//     try {
//       const { id } = req.params;
//       const quote = await quoteService.updateQuote(id, req.body);
//       res.json({ success: true, data: quote });
//     } catch (error) {
//       logger.error('Error updating quote:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }


//   // Delete quote
//   async deleteQuote(req, res) {
//     try {
//       const { id } = req.params;
//       await quoteService.deleteQuote(id);
//       res.json({ success: true, message: 'Quote deleted successfully' });
//       } catch (error) {
//         logger.error('Error deleting quote:', error);
//         res.status(500).json({ error: error.message });
//     }
//   }


//   // Send quote
//   async sendQuote(req, res) {
//     try {
//       const { id } = req.params;
//       const { send_via } = req.body;
//       const result = await quoteService.sendQuote(id, { send_via });
//       res.json({ success: true, data: result });
//       } catch (error) {
//         logger.error('Error sending quote:', error);
//         res.status(500).json({ error: error.message });
//     }
//   }


//   // Accept quote
//   async acceptQuote(req, res) {
//     try {
//       const { id } = req.params;
//       const { accepted_by } = req.body;
//         const quote = await quoteService.acceptQuote(id, accepted_by);
//         res.json({ success: true, data: quote });
//       } catch (error) {
//         logger.error('Error accepting quote:', error);
//         res.status(500).json({ error: error.message });
//     }
//   }

//   // Reject quote
//   async rejectQuote(req, res) {
//     try {
//       const { id } = req.params;
//       const { reason } = req.body;
//         const quote = await quoteService.rejectQuote(id, reason);
//         res.json({ success: true, data: quote });
//       } catch (error) {
//         logger.error('Error rejecting quote:', error);
//         res.status(500).json({ error: error.message });
//     }
//   }

//   // Mark as viewed
//   async markAsViewed(req, res) {
//     try {
//       const { id } = req.params;
//       await quoteService.markAsViewed(id);
//       res.json({ success: true, message: 'Quote marked as viewed' });
//       } catch (error) {
//         logger.error('Error marking quote as viewed:', error);
//         res.status(500).json({ error: error.message });
//     }
//   }

//   // Duplicate quote
//   async duplicateQuote(req, res) {
//     try {
//       const { id } = req.params;
//       const newQuote = await quoteService.duplicateQuote(id);
//       res.status(201).json({ success: true, data: newQuote });
//       } catch (error) {
//         logger.error('Error duplicating quote:', error);
//         res.status(500).json({ error: error.message });
//     }
//   }


//   // Add item to quote
//   async addItem(req, res) {
//     try {
//       const { id } = req.params;
//         if (!req.body.product_id) {
//           return res.status(400).json({ error: 'Product ID is required' });
//         }

//         if (!req.body.quantity || req.body.quantity <= 0) {
//           return res.status(400).json({ error: 'Valid quantity is required' });
//         }
        
//         const item = await quoteService.addQuoteItem(id, req.body);
//         res.status(201).json({ success: true, data: item });
//       } catch (error) {
//         logger.error('Error adding quote item:', error);
//         res.status(500).json({ error: error.message });
//       }
//   }

//   // Update quote item
//   async updateItem(req, res) {
//     try {
//     const { id, item_id } = req.params;
//       const item = await quoteService.updateQuoteItem(id, item_id, req.body);
//       res.json({ success: true, data: item });
//     } catch (error) {
//       logger.error('Error updating quote item:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

//   // Remove quote item
//   async removeItem(req, res) {
//     try {
//       const { id, item_id } = req.params;
//       await quoteService.removeQuoteItem(id, item_id);
//       res.json({ success: true, message: 'Item removed from quote' });
//       } catch (error) {
//         logger.error('Error removing quote item:', error);
//         res.status(500).json({ error: error.message });
//     }
//   }

//   // Download PDF
//   async downloadPDF(req, res) {
//     try {
//       const { id } = req.params;
//       const quote = await quoteService.getQuoteById(id);
//       const pdfPath = await quoteService.generateQuotePDF(quote);
//         res.download(pdfPath, `quote_${quote.quote_number}.pdf`, (err) => {
//           if (err) {
//             logger.error('Error downloading PDF:', err);
//             res.status(500).json({ error: 'Error downloading PDF' });
//           }
//         });
//       } catch (error) {
//         logger.error('Error generating PDF:', error);
//         res.status(500).json({ error: error.message });
//     }
//   }


//   // Get analytics
//   async getAnalytics(req, res) {
//     try {
//       const { company_id } = req.params;
//       const { from_date, to_date } = req.query;
//         const fromDate = from_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
//         const toDate = to_date || new Date().toISOString();
        
//         const analytics = await quoteService.getQuoteAnalytics(company_id, fromDate, toDate);
//         res.json({ success: true, data: analytics });
//       } catch (error) {
//         logger.error('Error getting analytics:', error);
//         res.status(500).json({ error: error.message });
//     }
//   }

//   // Create template
//   async createTemplate(req, res) {
//     try {
//       const { company_id, template_name, template_data } = req.body;
//         if (!company_id || !template_name) {
//           return res.status(400).json({ error: 'Company ID and template name are required' });
//         }
        
//         const template = await quoteService.createQuoteTemplate(company_id, template_name, template_data);
//         res.status(201).json({ success: true, data: template });
//       } catch (error) {
//         logger.error('Error creating template:', error);
//         res.status(500).json({ error: error.message });
//     }
//   }


//   // Get templates
//   async getTemplates(req, res) {
//     try {
//       const { company_id } = req.params;
//       const templates = await quoteService.getQuoteTemplates(company_id);
//       res.json({ success: true, data: templates });
//     } catch (error) {
//       logger.error('Error getting templates:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

// }

// module.exports = new QuotesController();









const pool = require('../config/database');
const logger = require('../utils/logger');
// const quoteServiceModule = require('../services/quotes/quoteGenerator.service');
const QuoteGeneratorService = require('../services/quotes/quoteGenerator.service');


// // Handle both export patterns
// const QuoteGeneratorService = quoteServiceModule.QuoteGeneratorService || quoteServiceModule.default || quoteServiceModule;

// Initialize service
const quoteService = new QuoteGeneratorService(pool);

class QuotesController {
  // Create quote
  async createQuote(req, res) {
    try {
      if (!req.body.company_id || !req.body.lead_id) {
        return res.status(400).json({ error: 'Company ID and Lead ID are required' });
      }
      
      const quote = await quoteService.createQuote(req.body);
      res.status(201).json({ success: true, data: quote });
    } catch (error) {
      logger.error('Error creating quote:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Get quote
  async getQuote(req, res) {
    try {
      const { id } = req.params;
      const quote = await quoteService.getQuoteById(id);
      res.json({ success: true, data: quote });
    } catch (error) {
      logger.error('Error getting quote:', error);
      res.status(404).json({ error: error.message });
    }
  }

  // List quotes
  async listQuotes(req, res) {
    try {
      const { company_id } = req.params;
      const filters = req.query;
      
      const quotes = await quoteService.getQuotes(company_id, filters);
      res.json({ success: true, data: quotes });
    } catch (error) {
      logger.error('Error listing quotes:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Update quote
  async updateQuote(req, res) {
    try {
      const { id } = req.params;
      const quote = await quoteService.updateQuote(id, req.body);
      res.json({ success: true, data: quote });
    } catch (error) {
      logger.error('Error updating quote:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Delete quote
  async deleteQuote(req, res) {
    try {
      const { id } = req.params;
      await quoteService.deleteQuote(id);
      res.json({ success: true, message: 'Quote deleted successfully' });
    } catch (error) {
      logger.error('Error deleting quote:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Send quote
  async sendQuote(req, res) {
    try {
      const { id } = req.params;
      const { send_via } = req.body;
      
      const result = await quoteService.sendQuote(id, { send_via });
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Error sending quote:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Accept quote
  async acceptQuote(req, res) {
    try {
      const { id } = req.params;
      const { accepted_by } = req.body;
      
      const quote = await quoteService.acceptQuote(id, accepted_by);
      res.json({ success: true, data: quote });
    } catch (error) {
      logger.error('Error accepting quote:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Reject quote
  async rejectQuote(req, res) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      
      const quote = await quoteService.rejectQuote(id, reason);
      res.json({ success: true, data: quote });
    } catch (error) {
      logger.error('Error rejecting quote:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Mark as viewed
  async markAsViewed(req, res) {
    try {
      const { id } = req.params;
      await quoteService.markAsViewed(id);
      res.json({ success: true, message: 'Quote marked as viewed' });
    } catch (error) {
      logger.error('Error marking quote as viewed:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Duplicate quote
  async duplicateQuote(req, res) {
    try {
      const { id } = req.params;
      const newQuote = await quoteService.duplicateQuote(id);
      res.status(201).json({ success: true, data: newQuote });
    } catch (error) {
      logger.error('Error duplicating quote:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Add item to quote
  async addItem(req, res) {
    try {
      const { id } = req.params;
      
      if (!req.body.product_id) {
        return res.status(400).json({ error: 'Product ID is required' });
      }

      if (!req.body.quantity || req.body.quantity <= 0) {
        return res.status(400).json({ error: 'Valid quantity is required' });
      }
      
      const item = await quoteService.addQuoteItem(id, req.body);
      res.status(201).json({ success: true, data: item });
    } catch (error) {
      logger.error('Error adding quote item:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Update quote item
  async updateItem(req, res) {
    try {
      const { id, item_id } = req.params;
      
      const item = await quoteService.updateQuoteItem(id, item_id, req.body);
      res.json({ success: true, data: item });
    } catch (error) {
      logger.error('Error updating quote item:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Remove quote item
  async removeItem(req, res) {
    try {
      const { id, item_id } = req.params;
      
      await quoteService.removeQuoteItem(id, item_id);
      res.json({ success: true, message: 'Item removed from quote' });
    } catch (error) {
      logger.error('Error removing quote item:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Download PDF
  async downloadPDF(req, res) {
    try {
      const { id } = req.params;
      const quote = await quoteService.getQuoteById(id);
      const pdfPath = await quoteService.generateQuotePDF(quote);
      
      res.download(pdfPath, `quote_${quote.quote_number}.pdf`, (err) => {
        if (err) {
          logger.error('Error downloading PDF:', err);
          res.status(500).json({ error: 'Error downloading PDF' });
        }
      });
    } catch (error) {
      logger.error('Error generating PDF:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Get analytics
  async getAnalytics(req, res) {
    try {
      const { company_id } = req.params;
      const { from_date, to_date } = req.query;
      
      const fromDate = from_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const toDate = to_date || new Date().toISOString();
      
      const analytics = await quoteService.getQuoteAnalytics(company_id, fromDate, toDate);
      res.json({ success: true, data: analytics });
    } catch (error) {
      logger.error('Error getting analytics:', error);
      res.status(500).json({ error: error.message });
    }
  }

  //Create template

  async createTemplate(req, res) {
    try {
      const { company_id, template_name, template_data } = req.body;
        if (!company_id || !template_name) {
          return res.status(400).json({ error: 'Company ID and template name are required' });
        }
        
        const template = await quoteService.createQuoteTemplate(company_id, template_name, template_data);
        res.status(201).json({ success: true, data: template });
      } catch (error) {
        logger.error('Error creating template:', error);
        res.status(500).json({ error: error.message });
    }
  }


  // Get templates
  async getTemplates(req, res) {
    try {
      const { company_id } = req.params;
        const templates = await quoteService.getQuoteTemplates(company_id);
        res.json({ success: true, data: templates });
      } catch (error) {
        logger.error('Error getting templates:', error);
        res.status(500).json({ error: error.message });
    }
  }
}


module.exports = new QuotesController();