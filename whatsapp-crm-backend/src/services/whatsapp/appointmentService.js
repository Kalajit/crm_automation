const pool = require('../../config/database');
const axios = require('axios');
const { translateText } = require('../translation/translationService');

async function generateAlternativeSlotsMessage(calendarConfigId, requestedDate, language) {
  let message = `⚠️ The requested time slot is not available.\n\n`;
  message += `Here are some alternative times:\n`;
  
  const slots = await getAvailableSlots(calendarConfigId, requestedDate);
  
  slots.slice(0, 3).forEach((slot, index) => {
    const slotDate = new Date(slot.start);
    const dateStr = slotDate.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
    message += `${index + 1}. ${dateStr}\n`;
  });
  
  message += `\nReply with the number of your preferred slot.`;

  if (language !== 'en') {
    message = await translateText(message, language, 'en');
  }

  return message;
}

async function generateWhatsAppConfirmation(lead, appointmentDate, meetingLink, companyName) {
  const dateStr = appointmentDate.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  let message = `✅ Appointment Confirmed!\n\n`;
  message += `📅 Date: ${dateStr}\n`;
  message += `🏢 Company: ${companyName}\n`;
  if (meetingLink) {
    message += `🔗 Meeting Link: ${meetingLink}\n`;
  }
  message += `\nWe look forward to meeting you!`;

  const leadLang = lead.preferred_language || 'en';
  if (leadLang !== 'en') {
    message = await translateText(message, leadLang, 'en');
  }

  return message;
}

async function getAvailableSlots(calendarConfigId, requestedDate) {
  const config = await pool.query(
    'SELECT * FROM calendar_configs WHERE id = $1 AND is_active = TRUE',
    [calendarConfigId]
  );
  
  if (config.rows.length === 0) {
    return [];
  }
  
  const calendarConfig = config.rows[0];
  const { getValidCalendarToken } = require('../../utils/encryption');
  const accessToken = await getValidCalendarToken(calendarConfig);
  
  const startDate = new Date(requestedDate);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 7);
  
  const response = await axios.post(
    'https://www.googleapis.com/calendar/v3/freeBusy',
    {
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      items: [{ id: calendarConfig.calendar_id }]
    },
    {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    }
  );
  
  const busySlots = response.data.calendars[calendarConfig.calendar_id]?.busy || [];
  
  const workingHours = calendarConfig.working_hours || {
    start: "09:00",
    end: "18:00",
    days: [1, 2, 3, 4, 5]
  };
  
  const availableSlots = [];
  let currentDate = new Date(startDate);
  
  while (currentDate <= endDate && availableSlots.length < 10) {
    const dayOfWeek = currentDate.getDay();
    
    if (workingHours.days.includes(dayOfWeek)) {
      const [startHour, startMin] = workingHours.start.split(':').map(Number);
      const [endHour, endMin] = workingHours.end.split(':').map(Number);
      
      let slotStart = new Date(currentDate);
      slotStart.setHours(startHour, startMin, 0, 0);
      
      const dayEnd = new Date(currentDate);
      dayEnd.setHours(endHour, endMin, 0, 0);
      
      while (slotStart < dayEnd) {
        const slotEnd = new Date(slotStart.getTime() + 60 * 60000);
        
        const isAvailable = !busySlots.some(busy => {
          const busyStart = new Date(busy.start);
          const busyEnd = new Date(busy.end);
          return (slotStart < busyEnd && slotEnd > busyStart);
        });
        
        if (isAvailable && slotEnd <= dayEnd) {
          availableSlots.push({
            start: slotStart.toISOString(),
            end: slotEnd.toISOString()
          });
        }
        
        slotStart = new Date(slotStart.getTime() + 75 * 60000);
      }
    }
    
    currentDate.setDate(currentDate.getDate() + 1);
    currentDate.setHours(0, 0, 0, 0);
  }
  
  return availableSlots;
}


module.exports = {
    generateAlternativeSlotsMessage,
    generateWhatsAppConfirmation,
    getAvailableSlots
};