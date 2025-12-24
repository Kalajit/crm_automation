// // // const schedulerService = require('../services/scheduler/meetingScheduler.service');
// // // const logger = require('../utils/logger');

// // // class SchedulerController {
// // //   // Create scheduling link
// // //   async createLink(req, res) {
// // //     try {
// // //       const linkData = req.body;
// // //       const link = await schedulerService.createSchedulingLink(linkData);
// // //       res.status(201).json({ success: true, data: link });
// // //     } catch (error) {
// // //       // logger.error('Error creating scheduling link:', error);
// // //       console.error('Error creating scheduling link:', error);
// // //       res.status(500).json({ error: error.message });
// // //     }
// // //   }

// // //   // Get scheduling link
// // //   async getLink(req, res) {
// // //     try {
// // //       const { link_id } = req.params;
// // //       const link = await schedulerService.getSchedulingLink(link_id);
// // //       res.json({ success: true, data: link });
// // //     } catch (error) {
// // //       res.status(404).json({ error: error.message });
// // //     }
// // //   }

// // //   // Get public link by slug
// // //   async getPublicLink(req, res) {
// // //     try {
// // //       const { slug } = req.params;
// // //       const link = await schedulerService.getSchedulingLinkBySlug(slug);
// // //       res.json({ success: true, data: link });
// // //     } catch (error) {
// // //       res.status(404).json({ error: error.message });
// // //     }
// // //   }

// // //   // Get available slots
// // //   async getAvailableSlots(req, res) {
// // //     try {
// // //       const { link_id } = req.params;
// // //       const { start_date, end_date } = req.query;
      
// // //       const slots = await schedulerService.getAvailableSlots(link_id, start_date, end_date);
// // //       res.json({ success: true, data: slots });
// // //     } catch (error) {
// // //       res.status(500).json({ error: error.message });
// // //     }
// // //   }

// // //   // Book meeting
// // //   async bookMeeting(req, res) {
// // //     try {
// // //       const bookingData = req.body;
// // //       const meeting = await schedulerService.bookMeeting(bookingData);
// // //       res.status(201).json({ success: true, data: meeting });
// // //     } catch (error) {
// // //       res.status(500).json({ error: error.message });
// // //     }
// // //   }

// // //   // Get meetings
// // //   async getMeetings(req, res) {
// // //     try {
// // //       const { company_id } = req.params;
// // //       const filters = req.query;
// // //       const meetings = await schedulerService.getMeetings(company_id, filters);
// // //       res.json({ success: true, data: meetings });
// // //     } catch (error) {
// // //       res.status(500).json({ error: error.message });
// // //     }
// // //   }

// // //   // Cancel meeting
// // //   async cancelMeeting(req, res) {
// // //     try {
// // //       const { meeting_id } = req.params;
// // //       const { reason } = req.body;
      
// // //       await schedulerService.cancelMeeting(meeting_id, reason);
// // //       res.json({ success: true, message: 'Meeting cancelled' });
// // //     } catch (error) {
// // //       res.status(500).json({ error: error.message });
// // //     }
// // //   }

// // //   // Reschedule meeting
// // //   async rescheduleMeeting(req, res) {
// // //     try {
// // //       const { meeting_id } = req.params;
// // //       const { new_start_time } = req.body;
      
// // //       const meeting = await schedulerService.rescheduleMeeting(meeting_id, new_start_time);
// // //       res.json({ success: true, data: meeting });
// // //     } catch (error) {
// // //       res.status(500).json({ error: error.message });
// // //     }
// // //   }
// // // }


// // // module.exports = { SchedulerController: new SchedulerController() };




// // const schedulerService = require('../services/scheduler/meetingScheduler.service');

// // class SchedulerController {
// //   // Create scheduling link
// //   async createLink(req, res) {
// //     try {
// //       const link = await schedulerService.createSchedulingLink(req.body);
// //       res.status(201).json({ success: true, data: link });
// //     } catch (error) {
// //       console.error('Error creating scheduling link:', error.message);
// //       res.status(500).json({ error: error.message });
// //     }
// //   }

// //   // Get scheduling link
// //   async getLink(req, res) {
// //     try {
// //       const { link_id } = req.params;
// //       const link = await schedulerService.getSchedulingLink(link_id);
// //       res.json({ success: true, data: link });
// //     } catch (error) {
// //       res.status(404).json({ error: error.message });
// //     }
// //   }

// //   // Get public link by slug
// //   async getPublicLink(req, res) {
// //     try {
// //       const { slug } = req.params;
// //       const link = await schedulerService.getSchedulingLinkBySlug(slug);
// //       res.json({ success: true, data: link });
// //     } catch (error) {
// //       res.status(404).json({ error: error.message });
// //     }
// //   }

// //   // Get available slots
// //   async getAvailableSlots(req, res) {
// //     try {
// //       const { link_id } = req.params;
// //       const { start_date, end_date } = req.query;
      
// //       const slots = await schedulerService.getAvailableSlots(link_id, start_date, end_date);
// //       res.json({ success: true, data: slots });
// //     } catch (error) {
// //       res.status(500).json({ error: error.message });
// //     }
// //   }

// //   // Book meeting
// //   async bookMeeting(req, res) {
// //     try {
// //       const meeting = await schedulerService.bookMeeting(req.body);
// //       res.status(201).json({ success: true, data: meeting });
// //     } catch (error) {
// //       res.status(500).json({ error: error.message });
// //     }
// //   }

// //   // Get meetings
// //   async getMeetings(req, res) {
// //     try {
// //       const { company_id } = req.params;
// //       const filters = req.query;
// //       const meetings = await schedulerService.getMeetings(company_id, filters);
// //       res.json({ success: true, data: meetings });
// //     } catch (error) {
// //       res.status(500).json({ error: error.message });
// //     }
// //   }

// //   // Cancel meeting
// //   async cancelMeeting(req, res) {
// //     try {
// //       const { meeting_id } = req.params;
// //       const { reason } = req.body;
      
// //       await schedulerService.cancelMeeting(meeting_id, reason);
// //       res.json({ success: true, message: 'Meeting cancelled' });
// //     } catch (error) {
// //       res.status(500).json({ error: error.message });
// //     }
// //   }

// //   // Reschedule meeting
// //   async rescheduleMeeting(req, res) {
// //     try {
// //       const { meeting_id } = req.params;
// //       const { new_start_time } = req.body;
      
// //       await schedulerService.rescheduleMeeting(meeting_id, new_start_time);
// //       res.json({ success: true, message: 'Meeting rescheduled' });
// //     } catch (error) {
// //       res.status(500).json({ error: error.message });
// //     }
// //   }
// // }

// // module.exports = new SchedulerController();




// const pool = require('../config/database');
// const logger = require('../utils/logger');
// const MeetingSchedulerService = require('../services/scheduler/meetingScheduler.service');

// // Initialize service
// const schedulerService = new MeetingSchedulerService(pool);

// class SchedulerController {
//   // Create scheduling link
//   async createLink(req, res) {
//     try {
//       const { company_id, agent_id } = req.body;
      
//       if (!company_id || !agent_id) {
//         return res.status(400).json({ error: 'Company ID and Agent ID are required' });
//       }
      
//       const link = await schedulerService.createSchedulingLink(company_id, agent_id, req.body);
//       res.status(201).json({ success: true, data: link });
//     } catch (error) {
//       logger.error('Error creating scheduling link:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

//   // Get scheduling link
//   async getLink(req, res) {
//     try {
//       const { link_slug } = req.params;
      
//       const link = await schedulerService.getSchedulingLink(link_slug);
//       res.json({ success: true, data: link });
//     } catch (error) {
//       logger.error('Error getting scheduling link:', error);
//       res.status(404).json({ error: error.message });
//     }
//   }

//   // Update scheduling link
//   async updateLink(req, res) {
//     try {
//       const { link_slug } = req.params;
      
//       const link = await schedulerService.updateSchedulingLink(link_slug, req.body);
//       res.json({ success: true, data: link });
//     } catch (error) {
//       logger.error('Error updating scheduling link:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

//   // Delete scheduling link
//   async deleteLink(req, res) {
//     try {
//       const { link_slug } = req.params;
      
//       await schedulerService.deleteSchedulingLink(link_slug);
//       res.json({ success: true, message: 'Scheduling link deleted successfully' });
//     } catch (error) {
//       logger.error('Error deleting scheduling link:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

//   // Get company links
//   async getCompanyLinks(req, res) {
//     try {
//       const { company_id } = req.params;
      
//       const links = await schedulerService.getCompanyLinks(company_id);
//       res.json({ success: true, data: links });
//     } catch (error) {
//       logger.error('Error getting company links:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

//   // Get available slots
//   async getAvailableSlots(req, res) {
//     try {
//       const { link_slug } = req.params;
//       const { date, timezone } = req.query;
      
//       if (!date) {
//         return res.status(400).json({ error: 'Date is required' });
//       }
      
//       const slots = await schedulerService.getAvailableSlots(link_slug, date, timezone);
//       res.json({ success: true, data: slots });
//     } catch (error) {
//       logger.error('Error getting available slots:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

//   // Book meeting
//   async bookMeeting(req, res) {
//     try {
//       const { link_slug } = req.params;
//       const bookingData = req.body;

//       if (!bookingData.scheduled_time) {
//         return res.status(400).json({ error: 'Scheduled time is required' });
//       }

//       if (!bookingData.attendee_name || !bookingData.attendee_email) {
//         return res.status(400).json({ error: 'Attendee name and email are required' });
//       }
      
//       const meeting = await schedulerService.bookMeeting(link_slug, bookingData);
//       res.status(201).json({ success: true, data: meeting });
//     } catch (error) {
//       logger.error('Error booking meeting:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

//   // Get meetings
//   async getMeetings(req, res) {
//     try {
//       const { company_id } = req.params;
//       const filters = req.query;
      
//       const meetings = await schedulerService.getMeetings(company_id, filters);
//       res.json({ success: true, data: meetings });
//     } catch (error) {
//       logger.error('Error getting meetings:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

//   // Get meeting details
//   async getMeetingDetails(req, res) {
//     try {
//       const { confirmation_code } = req.params;
      
//       const meeting = await schedulerService.getMeetingByConfirmation(confirmation_code);
//       res.json({ success: true, data: meeting });
//     } catch (error) {
//       logger.error('Error getting meeting details:', error);
//       res.status(404).json({ error: error.message });
//     }
//   }

//   // Cancel meeting
//   async cancelMeeting(req, res) {
//     try {
//       const { confirmation_code } = req.params;
//       const { reason } = req.body;
      
//       const result = await schedulerService.cancelMeeting(confirmation_code, reason);
//       res.json({ success: true, data: result });
//     } catch (error) {
//       logger.error('Error canceling meeting:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

//   // Reschedule meeting
//   async rescheduleMeeting(req, res) {
//     try {
//       const { confirmation_code } = req.params;
//       const { new_scheduled_time, timezone } = req.body;
      
//       if (!new_scheduled_time) {
//         return res.status(400).json({ error: 'New scheduled time is required' });
//       }
      
//       const meeting = await schedulerService.rescheduleMeeting(
//         confirmation_code,
//         new_scheduled_time,
//         timezone
//       );
//       res.json({ success: true, data: meeting });
//     } catch (error) {
//       logger.error('Error rescheduling meeting:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }
// }

// module.exports = new SchedulerController();






const pool = require('../config/database');
const {logger} = require('../utils/logger');
const { successResponse, errorResponse } = require('../utils/response');
const schedulerServiceModule = require('../services/scheduler/meetingScheduler.service');

// Handle both export patterns
const MeetingSchedulerService = schedulerServiceModule.MeetingSchedulerService || schedulerServiceModule.default || schedulerServiceModule;

// Initialize service
const schedulerService = new MeetingSchedulerService(pool);

class SchedulerController {
  // Create scheduling link
  async createLink(req, res) {
    try {
      const { company_id, agent_id } = req.body;
      
      if (!company_id || !agent_id) {
        return res.status(400).json({ error: 'Company ID and Agent ID are required' });
      }
      
      const link = await schedulerService.createSchedulingLink(company_id, agent_id, req.body);
      res.status(201).json({ success: true, data: link });
    } catch (error) {
      logger.error('Error creating scheduling link:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Get scheduling link
  async getLink(req, res) {
    try {
      const { link_slug } = req.params;
      
      const link = await schedulerService.getSchedulingLink(link_slug);
      res.json({ success: true, data: link });
    } catch (error) {
      logger.error('Error getting scheduling link:', error);
      res.status(404).json({ error: error.message });
    }
  }

  // Update scheduling link
  async updateLink(req, res) {
    try {
      const { link_slug } = req.params;
      
      const link = await schedulerService.updateSchedulingLink(link_slug, req.body);
      res.json({ success: true, data: link });
    } catch (error) {
      logger.error('Error updating scheduling link:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Delete scheduling link
  async deleteLink(req, res) {
    try {
      const { link_slug } = req.params;
      
      await schedulerService.deleteSchedulingLink(link_slug);
      res.json({ success: true, message: 'Scheduling link deleted successfully' });
    } catch (error) {
      logger.error('Error deleting scheduling link:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Get company links
  async getCompanyLinks(req, res) {
    try {
      const { company_id } = req.params;
      
      const links = await schedulerService.getCompanyLinks(company_id);
      res.json({ success: true, data: links });
    } catch (error) {
      logger.error('Error getting company links:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Get available slots
  async getAvailableSlots(req, res) {
    try {
      const { link_slug } = req.params;
      const { date, timezone } = req.query;
      
      if (!date) {
        return res.status(400).json({ error: 'Date is required' });
      }
      
      const slots = await schedulerService.getAvailableSlots(link_slug, date, timezone);
      res.json({ success: true, data: slots });
    } catch (error) {
      logger.error('Error getting available slots:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Book meeting
  async bookMeeting(req, res) {
    try {
      const { link_slug } = req.params;
      const bookingData = req.body;

      if (!bookingData.scheduled_time) {
        return res.status(400).json({ error: 'Scheduled time is required' });
      }

      if (!bookingData.attendee_name || !bookingData.attendee_email) {
        return res.status(400).json({ error: 'Attendee name and email are required' });
      }
      
      const meeting = await schedulerService.bookMeeting(link_slug, bookingData);
      res.status(201).json({ success: true, data: meeting });
    } catch (error) {
      logger.error('Error booking meeting:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Get meetings
  async getMeetings(req, res) {
    try {
      const { company_id } = req.params;
      const filters = req.query;
      
      const meetings = await schedulerService.getMeetings(company_id, filters);
      res.json({ success: true, data: meetings });
    } catch (error) {
      logger.error('Error getting meetings:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Get meeting details
  async getMeetingDetails(req, res) {
    try {
      const { confirmation_code } = req.params;
      
      const meeting = await schedulerService.getMeetingByConfirmation(confirmation_code);
      res.json({ success: true, data: meeting });
    } catch (error) {
      logger.error('Error getting meeting details:', error);
      res.status(404).json({ error: error.message });
    }
  }

  // Cancel meeting
  async cancelMeeting(req, res) {
    try {
      const { confirmation_code } = req.params;
      const { reason } = req.body;
      
      const result = await schedulerService.cancelMeeting(confirmation_code, reason);
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Error canceling meeting:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Reschedule meeting
  async rescheduleMeeting(req, res) {
    try {
      const { confirmation_code } = req.params;
      const { new_scheduled_time, timezone } = req.body;
      
      if (!new_scheduled_time) {
        return res.status(400).json({ error: 'New scheduled time is required' });
      }
      
      const meeting = await schedulerService.rescheduleMeeting(
        confirmation_code,
        new_scheduled_time,
        timezone
      );
      res.json({ success: true, data: meeting });
    } catch (error) {
      logger.error('Error rescheduling meeting:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Schedule a call
  async scheduleCall(req, res) {
    try {
      const { company_id, lead_id, call_type, scheduled_time } = req.body;
      
      if (!company_id || !lead_id || !call_type || !scheduled_time) {
        return errorResponse(res, 'company_id, lead_id, call_type, and scheduled_time are required', 400);
      }

      // Validate that the lead exists
      const leadCheck = await pool.query('SELECT id FROM leads WHERE id = $1', [lead_id]);
      if (leadCheck.rows.length === 0) {
        return errorResponse(res, `Lead with id ${lead_id} does not exist`, 404);
      }
      
      // Validate that the company exists
      const companyCheck = await pool.query('SELECT id FROM companies WHERE id = $1', [company_id]);
      if (companyCheck.rows.length === 0) {
        return errorResponse(res, `Company with id ${company_id} does not exist`, 404);
      }
      
      const query = `
        INSERT INTO scheduled_calls (company_id, lead_id, call_type, scheduled_time)
        VALUES ($1, $2, $3, $4)
        RETURNING *;
      `;
      const result = await pool.query(query, [company_id, lead_id, call_type, scheduled_time]);
      
      return successResponse(res, result.rows[0], 'Call scheduled successfully', 201);
    } catch (error) {
      logger.error('Schedule call error:', error);
      return errorResponse(res, error.message, 500);
    }
  }

  // Get pending scheduled calls
  async getPendingScheduledCalls(req, res) {
    try {
      const query = `
        SELECT sc.*, l.phone_number, l.name, ac.prompt_key, ac.initial_message, ac.voice
        FROM scheduled_calls sc
        JOIN leads l ON sc.lead_id = l.id
        JOIN agent_configs ac ON sc.company_id = ac.company_id
        WHERE sc.status = 'pending' AND sc.scheduled_time <= NOW()
        ORDER BY sc.scheduled_time ASC;
      `;
      const result = await pool.query(query);
      
      return successResponse(res, result.rows, 'Pending scheduled calls retrieved successfully');
    } catch (error) {
      logger.error('Get pending scheduled calls error:', error);
      return errorResponse(res, error.message, 500);
    }
  }

  // Update scheduled call
  async updateScheduledCall(req, res) {
    try {
      const { id } = req.params;
      const { status, call_sid } = req.body;  
      
      let query;
      let params;
      
      if (status === 'called' && call_sid) {
        query = `
          UPDATE scheduled_calls
          SET status = $1, call_sid = $2, updated_at = CURRENT_TIMESTAMP
          WHERE id = $3
          RETURNING *;
        `;
        params = [status, call_sid, id];
      } else if (status === 'failed') {
        query = `
          UPDATE scheduled_calls
          SET status = $1, retry_count = retry_count + 1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
          RETURNING *;
        `;
        params = [status, id];
      } else {
        query = `
          UPDATE scheduled_calls
          SET status = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
          RETURNING *;
        `;
        params = [status, id];
      }
      
      const result = await pool.query(query, params);
      
      if (result.rows.length === 0) {
        return errorResponse(res, 'Scheduled call not found', 404);
      }
      
      return successResponse(res, result.rows[0], 'Scheduled call updated successfully');
    } catch (error) {
      logger.error('Update scheduled call error:', error);
      return errorResponse(res, error.message, 500);
    }
  }


}

module.exports = new SchedulerController();