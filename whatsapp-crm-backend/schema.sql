-- -- ============================================
-- -- WhatsApp CRM Database Schema
-- -- Run this file: psql -U crm_user -d whatsapp_crm -f schema.sql
-- -- ============================================

-- -- 1. LEADS TABLE
-- CREATE TABLE IF NOT EXISTS leads (
--   id SERIAL PRIMARY KEY,
--   phone_number VARCHAR(20) UNIQUE NOT NULL,
--   name VARCHAR(255),
--   email VARCHAR(255),
--   lead_source VARCHAR(100) DEFAULT 'whatsapp',
--   lead_status VARCHAR(50) DEFAULT 'new',
--   interest_level INTEGER DEFAULT 1,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   last_contacted TIMESTAMP,
--   assigned_to_agent VARCHAR(255),
--   notes TEXT,
--   tags TEXT[],
--   metadata JSONB DEFAULT '{}'::jsonb
-- );

-- -- 2. CONVERSATIONS TABLE
-- CREATE TABLE IF NOT EXISTS conversations (
--   id SERIAL PRIMARY KEY,
--   lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
--   phone_number VARCHAR(20) NOT NULL,
--   conversation_history JSONB DEFAULT '[]'::jsonb,
--   last_message TEXT,
--   last_message_timestamp TIMESTAMP,
--   message_count INTEGER DEFAULT 0,
--   sentiment VARCHAR(50),
--   ai_summary TEXT,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );

-- -- 3. WHATSAPP MESSAGES TABLE
-- CREATE TABLE IF NOT EXISTS whatsapp_messages (
--   id SERIAL PRIMARY KEY,
--   conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
--   lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
--   phone_number VARCHAR(20) NOT NULL,
--   message_type VARCHAR(50) DEFAULT 'text',
--   message_body TEXT,
--   sender VARCHAR(50) DEFAULT 'user',
--   is_from_user BOOLEAN DEFAULT TRUE,
--   message_id VARCHAR(255) UNIQUE,
--   media_url TEXT,
--   timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   delivery_status VARCHAR(50) DEFAULT 'sent',
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );

-- -- 4. FAQ TEMPLATES TABLE
-- CREATE TABLE IF NOT EXISTS faq_templates (
--   id SERIAL PRIMARY KEY,
--   question VARCHAR(500) NOT NULL,
--   answer TEXT NOT NULL,
--   category VARCHAR(100),
--   keywords TEXT[],
--   priority INTEGER DEFAULT 1,
--   is_active BOOLEAN DEFAULT TRUE,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );

-- -- 5. BOOKINGS TABLE
-- CREATE TABLE IF NOT EXISTS bookings (
--   id SERIAL PRIMARY KEY,
--   lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
--   phone_number VARCHAR(20) NOT NULL,
--   booking_type VARCHAR(100),
--   scheduled_date TIMESTAMP NOT NULL,
--   duration_minutes INTEGER DEFAULT 30,
--   status VARCHAR(50) DEFAULT 'pending',
--   location VARCHAR(255),
--   notes TEXT,
--   calendar_event_id VARCHAR(255),
--   reminder_sent BOOLEAN DEFAULT FALSE,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );

-- -- 6. INVOICES TABLE
-- CREATE TABLE IF NOT EXISTS invoices (
--   id SERIAL PRIMARY KEY,
--   lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
--   phone_number VARCHAR(20) NOT NULL,
--   invoice_number VARCHAR(100) UNIQUE NOT NULL,
--   amount DECIMAL(10, 2) NOT NULL,
--   currency VARCHAR(10) DEFAULT 'INR',
--   invoice_type VARCHAR(50),
--   status VARCHAR(50) DEFAULT 'pending',
--   due_date TIMESTAMP,
--   paid_date TIMESTAMP,
--   payment_method VARCHAR(100),
--   invoice_data JSONB,
--   pdf_url TEXT,
--   reminder_count INTEGER DEFAULT 0,
--   last_reminder_sent TIMESTAMP,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );

-- -- 7. NOTIFICATIONS TABLE
-- CREATE TABLE IF NOT EXISTS notifications (
--   id SERIAL PRIMARY KEY,
--   lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
--   phone_number VARCHAR(20) NOT NULL,
--   notification_type VARCHAR(100),
--   title VARCHAR(255) NOT NULL,
--   message TEXT NOT NULL,
--   status VARCHAR(50) DEFAULT 'pending',
--   scheduled_time TIMESTAMP,
--   sent_at TIMESTAMP,
--   delivery_channel VARCHAR(50) DEFAULT 'whatsapp',
--   template_id VARCHAR(255),
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );

-- -- 8. WHATSAPP TEMPLATES TABLE
-- CREATE TABLE IF NOT EXISTS whatsapp_templates (
--   id SERIAL PRIMARY KEY,
--   template_name VARCHAR(255) UNIQUE NOT NULL,
--   template_id VARCHAR(255),
--   category VARCHAR(50),
--   body_text TEXT NOT NULL,
--   variables TEXT[],
--   language VARCHAR(20) DEFAULT 'en',
--   approval_status VARCHAR(50) DEFAULT 'pending',
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );

-- -- 9. AGENTS TABLE
-- CREATE TABLE IF NOT EXISTS agents (
--   id SERIAL PRIMARY KEY,
--   name VARCHAR(255) NOT NULL,
--   email VARCHAR(255) UNIQUE NOT NULL,
--   phone VARCHAR(20),
--   role VARCHAR(100),
--   assigned_leads INTEGER DEFAULT 0,
--   status VARCHAR(50) DEFAULT 'active',
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );

-- -- 10. AUDIT LOG TABLE
-- CREATE TABLE IF NOT EXISTS audit_logs (
--   id SERIAL PRIMARY KEY,
--   lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
--   action VARCHAR(255) NOT NULL,
--   details JSONB,
--   created_by VARCHAR(255),
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );

-- -- ============================================
-- -- INDEXES FOR PERFORMANCE
-- -- ============================================
-- CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone_number);
-- CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(lead_source);
-- CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(lead_status);
-- CREATE INDEX IF NOT EXISTS idx_conversations_lead_id ON conversations(lead_id);
-- CREATE INDEX IF NOT EXISTS idx_messages_lead_id ON whatsapp_messages(lead_id);
-- CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON whatsapp_messages(conversation_id);
-- CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON whatsapp_messages(timestamp);
-- CREATE INDEX IF NOT EXISTS idx_invoices_lead_id ON invoices(lead_id);
-- CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
-- CREATE INDEX IF NOT EXISTS idx_bookings_lead_id ON bookings(lead_id);
-- CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(scheduled_date);
-- CREATE INDEX IF NOT EXISTS idx_notifications_phone ON notifications(phone_number);
-- CREATE INDEX IF NOT EXISTS idx_faq_active ON faq_templates(is_active);

-- -- ============================================
-- -- TRIGGERS FOR TIMESTAMPS
-- -- ============================================
-- CREATE OR REPLACE FUNCTION update_timestamp()
-- RETURNS TRIGGER AS $$
-- BEGIN
--   NEW.updated_at = CURRENT_TIMESTAMP;
--   RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;

-- CREATE TRIGGER update_leads_timestamp
-- BEFORE UPDATE ON leads
-- FOR EACH ROW
-- EXECUTE FUNCTION update_timestamp();

-- CREATE TRIGGER update_conversations_timestamp
-- BEFORE UPDATE ON conversations
-- FOR EACH ROW
-- EXECUTE FUNCTION update_timestamp();

-- CREATE TRIGGER update_invoices_timestamp
-- BEFORE UPDATE ON invoices
-- FOR EACH ROW
-- EXECUTE FUNCTION update_timestamp();

-- -- ============================================
-- -- SAMPLE FAQ DATA (Optional)
-- -- ============================================
-- INSERT INTO faq_templates (question, answer, category, keywords, is_active) VALUES
--   ('What is 4champz?', '4champz is Bangalore''s leading chess coaching platform connecting qualified coaches with schools for kids'' programs.', 'general', ARRAY['4champz', 'about'], TRUE),
--   ('How much does coaching cost?', 'Coaching rates start at ₹500/hour based on your experience and location. Premium coaches earn more.', 'pricing', ARRAY['cost', 'price', 'rates', 'fees'], TRUE),
--   ('What are the timings?', 'We typically offer sessions between 3-6 PM (school hours). Flexible schedules are available based on school needs.', 'timings', ARRAY['timing', 'hours', 'schedule', 'when'], TRUE),
--   ('Do I need experience?', 'While experience is valued, enthusiasm matters most. We provide training and curriculum support for all coaches.', 'services', ARRAY['experience', 'training', 'qualification'], TRUE)
-- ON CONFLICT DO NOTHING;









-- ============================================
-- WhatsApp CRM Database Schema - UPDATED
-- Run this file: psql -U crm_user -d whatsapp_crm -f schema.sql
-- ============================================

-- 1. LEADS TABLE (UPDATED WITH CUSTOM FIELDS)
DROP TABLE IF EXISTS leads CASCADE;

CREATE TABLE leads (
  id SERIAL PRIMARY KEY,
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(255),
  email VARCHAR(255),
  lead_source VARCHAR(100) DEFAULT 'whatsapp',
  lead_status VARCHAR(50) DEFAULT 'new',
  interest_level INTEGER DEFAULT 1,
  
  -- CUSTOM FIELDS FOR CHESS COACHING
  chess_rating INTEGER,
  location VARCHAR(255),
  tournament_experience TEXT,
  coaching_experience TEXT,
  education_certs TEXT,
  availability TEXT,
  age_group_pref TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_contacted TIMESTAMP,
  assigned_to_agent VARCHAR(255),
  notes TEXT,
  tags TEXT[],
  metadata JSONB DEFAULT '{}'::jsonb
);

-- 2. CONVERSATIONS TABLE
CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) NOT NULL,
  conversation_history TEXT,
  last_message TEXT,
  last_message_timestamp TIMESTAMP,
  message_count INTEGER DEFAULT 0,
  sentiment VARCHAR(50),
  ai_summary TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. WHATSAPP MESSAGES TABLE
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) NOT NULL,
  message_type VARCHAR(50) DEFAULT 'text',
  message_body TEXT,
  sender VARCHAR(50) DEFAULT 'user',
  is_from_user BOOLEAN DEFAULT TRUE,
  message_id VARCHAR(255) UNIQUE,
  media_url TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  delivery_status VARCHAR(50) DEFAULT 'sent',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. FAQ TEMPLATES TABLE
CREATE TABLE IF NOT EXISTS faq_templates (
  id SERIAL PRIMARY KEY,
  question VARCHAR(500) NOT NULL,
  answer TEXT NOT NULL,
  category VARCHAR(100),
  keywords TEXT[],
  priority INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. BOOKINGS TABLE
CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) NOT NULL,
  booking_type VARCHAR(100),
  scheduled_date TIMESTAMP NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  status VARCHAR(50) DEFAULT 'pending',
  location VARCHAR(255),
  notes TEXT,
  calendar_event_id VARCHAR(255),
  reminder_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. INVOICES TABLE
CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) NOT NULL,
  invoice_number VARCHAR(100) UNIQUE NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'INR',
  invoice_type VARCHAR(50),
  status VARCHAR(50) DEFAULT 'pending',
  due_date TIMESTAMP,
  paid_date TIMESTAMP,
  payment_method VARCHAR(100),
  invoice_data JSONB,
  pdf_url TEXT,
  reminder_count INTEGER DEFAULT 0,
  last_reminder_sent TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) NOT NULL,
  notification_type VARCHAR(100),
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  scheduled_time TIMESTAMP,
  sent_at TIMESTAMP,
  delivery_channel VARCHAR(50) DEFAULT 'whatsapp',
  template_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. WHATSAPP TEMPLATES TABLE
CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id SERIAL PRIMARY KEY,
  template_name VARCHAR(255) UNIQUE NOT NULL,
  template_id VARCHAR(255),
  category VARCHAR(50),
  body_text TEXT NOT NULL,
  variables TEXT[],
  language VARCHAR(20) DEFAULT 'en',
  approval_status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. AGENTS TABLE
CREATE TABLE IF NOT EXISTS agents (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20),
  role VARCHAR(100),
  assigned_leads INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10. AUDIT LOG TABLE
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  action VARCHAR(255) NOT NULL,
  details JSONB,
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone_number);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(lead_source);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(lead_status);
CREATE INDEX IF NOT EXISTS idx_leads_location ON leads(location);
CREATE INDEX IF NOT EXISTS idx_leads_chess_rating ON leads(chess_rating);
CREATE INDEX IF NOT EXISTS idx_conversations_lead_id ON conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_messages_lead_id ON whatsapp_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON whatsapp_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON whatsapp_messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_invoices_lead_id ON invoices(lead_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_bookings_lead_id ON bookings(lead_id);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_notifications_phone ON notifications(phone_number);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status, scheduled_time);
CREATE INDEX IF NOT EXISTS idx_faq_active ON faq_templates(is_active);

-- ============================================
-- TRIGGERS FOR TIMESTAMPS
-- ============================================
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_leads_timestamp ON leads;
CREATE TRIGGER update_leads_timestamp
BEFORE UPDATE ON leads
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_conversations_timestamp ON conversations;
CREATE TRIGGER update_conversations_timestamp
BEFORE UPDATE ON conversations
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_invoices_timestamp ON invoices;
CREATE TRIGGER update_invoices_timestamp
BEFORE UPDATE ON invoices
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();






DROP TRIGGER IF EXISTS update_bookings_timestamp ON bookings;
CREATE TRIGGER update_bookings_timestamp
BEFORE UPDATE ON bookings
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_notifications_timestamp ON notifications;
CREATE TRIGGER update_notifications_timestamp
BEFORE UPDATE ON notifications
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_faq_templates_timestamp ON faq_templates;
CREATE TRIGGER update_faq_templates_timestamp
BEFORE UPDATE ON faq_templates
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_whatsapp_templates_timestamp ON whatsapp_templates;
CREATE TRIGGER update_whatsapp_templates_timestamp
BEFORE UPDATE ON whatsapp_templates
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_agents_timestamp ON agents;
CREATE TRIGGER update_agents_timestamp
BEFORE UPDATE ON agents
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();


-- ============================================
-- SAMPLE FAQ DATA (Optional)
-- ============================================
INSERT INTO faq_templates (question, answer, category, keywords, is_active) VALUES
  ('What is 4champz?', '4champz is Bangalore''s leading chess coaching platform connecting qualified coaches with schools for kids'' programs.', 'general', ARRAY['4champz', 'about'], TRUE),
  ('How much does coaching cost?', 'Coaching rates start at ₹500/hour based on your experience and location. Premium coaches earn more.', 'pricing', ARRAY['cost', 'price', 'rates', 'fees'], TRUE),
  ('What are the timings?', 'We typically offer sessions between 3-6 PM (school hours). Flexible schedules are available based on school needs.', 'timings', ARRAY['timing', 'hours', 'schedule', 'when'], TRUE),
  ('Do I need experience?', 'While experience is valued, enthusiasm matters most. We provide training and curriculum support for all coaches.', 'services', ARRAY['experience', 'training', 'qualification'], TRUE)
ON CONFLICT DO NOTHING;








-- ============================================
-- AI CALLING SYSTEM - NEW TABLES (MULTI-TENANT)
-- ============================================

-- 1. COMPANIES TABLE (MULTI-TENANT SUPPORT)
DROP TABLE IF EXISTS companies CASCADE;
CREATE TABLE companies (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone_number VARCHAR(20) UNIQUE NOT NULL, -- Twilio number for this company
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. AI AGENT CONFIGURATIONS (ONE PER COMPANY)
DROP TABLE IF EXISTS agent_configs CASCADE;
CREATE TABLE agent_configs (
  id SERIAL PRIMARY KEY,
  company_id INT REFERENCES companies(id) ON DELETE CASCADE,
  prompt_key VARCHAR(50) NOT NULL, -- e.g., "chess_coach", "medical_sales"
  prompt_preamble TEXT NOT NULL,
  initial_message TEXT NOT NULL,
  voice VARCHAR(50) DEFAULT 'Brian', -- StreamElements voice
  model_name VARCHAR(50) DEFAULT 'llama-3.1-8b-instant',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, prompt_key)
);

-- 3. CALL LOGS (REPLACES CONVERSATIONS JSON FILES)
DROP TABLE IF EXISTS call_logs CASCADE;
CREATE TABLE call_logs (
  id SERIAL PRIMARY KEY,
  company_id INT REFERENCES companies(id) ON DELETE CASCADE,
  lead_id INT REFERENCES leads(id) ON DELETE SET NULL,
  call_sid VARCHAR(100) UNIQUE NOT NULL, -- Twilio CallSid
  to_phone VARCHAR(20) NOT NULL,
  from_phone VARCHAR(20) NOT NULL,
  call_type VARCHAR(20) DEFAULT 'qualification', -- qualification, reminder, payment
  call_status VARCHAR(20) DEFAULT 'initiated', -- initiated, in-progress, completed, failed
  call_duration INT, -- seconds
  recording_url TEXT, -- Twilio recording URL
  local_audio_path TEXT, -- Local WAV file path
  transcript TEXT,
  sentiment JSONB, -- {"sentiment": "positive", "tone_score": 8}
  summary JSONB, -- {"summary": "...", "intent": "interested", "next_actions": [...]}
  conversation_history JSONB, -- Array of {"speaker": "user", "text": "...", "ts": 123}
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. SCHEDULED CALLS (REPLACES LEADS.JSON SCHEDULER)
DROP TABLE IF EXISTS scheduled_calls CASCADE;
CREATE TABLE scheduled_calls (
  id SERIAL PRIMARY KEY,
  company_id INT REFERENCES companies(id) ON DELETE CASCADE,
  lead_id INT REFERENCES leads(id) ON DELETE CASCADE,
  call_type VARCHAR(20) NOT NULL,
  scheduled_time TIMESTAMP NOT NULL,
  status VARCHAR(20) DEFAULT 'pending', -- pending, called, failed, completed
  call_sid VARCHAR(100), -- Populated after call initiated
  retry_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. ADD COMPANY_ID TO EXISTING LEADS TABLE (NON-DESTRUCTIVE)
-- This will add the column to your EXISTING leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS company_id INT REFERENCES companies(id) ON DELETE CASCADE;

-- ============================================
-- INDEXES FOR PERFORMANCE (AI CALLING)
-- ============================================
CREATE INDEX IF NOT EXISTS idx_leads_company ON leads(company_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_company ON call_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_lead ON call_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_call_sid ON call_logs(call_sid);
CREATE INDEX IF NOT EXISTS idx_scheduled_calls_company ON scheduled_calls(company_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_calls_status ON scheduled_calls(status, scheduled_time);
CREATE INDEX IF NOT EXISTS idx_agent_configs_company ON agent_configs(company_id);

-- ============================================
-- TRIGGER FOR SCHEDULED CALLS TIMESTAMP
-- ============================================
DROP TRIGGER IF EXISTS update_scheduled_calls_timestamp ON scheduled_calls;
CREATE TRIGGER update_scheduled_calls_timestamp
BEFORE UPDATE ON scheduled_calls
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();




DROP TRIGGER IF EXISTS update_call_logs_timestamp ON call_logs;
CREATE TRIGGER update_call_logs_timestamp
BEFORE UPDATE ON call_logs
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_agent_configs_timestamp ON agent_configs;
CREATE TRIGGER update_agent_configs_timestamp
BEFORE UPDATE ON agent_configs
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();





-- ============================================
-- SAMPLE DATA: 3 COMPANIES WITH FULL PROMPTS
-- ============================================

-- 1. 4CHAMPZ CHESS COACHING
INSERT INTO companies (name, phone_number) VALUES 
('4Champz Chess Coaching', '+19784045213')  
ON CONFLICT (phone_number) DO NOTHING;

INSERT INTO agent_configs (company_id, prompt_key, prompt_preamble, initial_message, voice) VALUES 
(
  (SELECT id FROM companies WHERE phone_number = '+19784045213'),
  'chess_coach',
  $$# Chess Coaching Sales Representative Prompt
## Identity & Purpose
You are Priya, a virtual sales representative for 4champz, a leading chess coaching service provider based in Bengaluru, India. We specialize in providing qualified chess coaches to schools across Bangalore.
Your primary purpose is to qualify leads who have shown interest in chess coaching opportunities, understand their background and experience, explore potential collaboration as a chess coach for our school programs, handle FAQs, and schedule meetings for both inbound and outbound calls.

## Voice & Persona
### Personality
- Sound professional, warm, and conversational—like a knowledgeable chess enthusiast
- Project genuine interest in learning about their chess journey
- Maintain an engaging and respectful demeanor throughout the conversation
- Show respect for their time while staying focused on understanding their suitability for school coaching
- Convey enthusiasm about the opportunity to shape young minds through chess

### Speech Characteristics
- Use clear, conversational language with natural flow
- Keep messages under 150 characters when possible
- Include probing questions to gather detailed information
- Show genuine interest in their chess background and achievements
- Use encouraging language when discussing their experience and qualifications

## Conversation Flow
### Introduction
1. For inbound: "Hello {{name}}, this is Priya from 4champz. Do you have 5-10 minutes to discuss chess coaching opportunities in Bangalore?"
2. For outbound: "Hello {{name}}, this is Priya from 4champz. I'm reaching out due to your interest. Available to discuss?"
3. Follow with: "I'd love to explore your background, answer FAQs like pricing or timings, or assist with reminders if applicable."

### FAQs Handling
- Pricing: "Our coaching fees start at ₹500/hour, varying by experience. Interested in details?"
- Timings: "Coaching is typically 3-6 PM school hours. Flexible options available—want to discuss?"
- Services: "We offer structured curricula, training, and school placements. More questions?"

### Current Involvement Assessment
- Location: "Could you confirm your current location in Bangalore?"
- Involvement: "Are you actively playing or coaching chess?"
- Availability: "What's your schedule like, especially afternoons?"

### Experience and Background Qualification
- Chess playing: "What's your FIDE or All India Chess Federation rating?"
- Tournaments: "Tell me about your recent tournament participation."
- Coaching: "Have you coached children before, especially in chess?"
- Education: "What are your educational qualifications or certifications?"

### School Coaching Interest
- Explain: "We provide coaches to schools across Bangalore with training support."
- Availability: "Are you free 3-6 PM? How many days weekly?"
- Age groups: "Comfortable with Classes 1-12? Any preferences?"
- Support: "We offer training. Interested in a structured curriculum?"

### Scheduling
- If interested: "Let's schedule a detailed discussion. When are you free this week?"
- Use check_calendar_availability and book_appointment.
- Confirm: "Please provide your full name, email, and preferred time."

### Close
- Positive: "Thank you, {{name}}. We'll send details and a confirmation. Looking forward to it!"
- End with end_call unless transferred$$,
  'Hello {{name}}, this is Priya from 4champz. I'm reaching out due to your interest in chess coaching. Available to discuss?',
  'Raveena'
)
ON CONFLICT (company_id, prompt_key) DO UPDATE SET
  prompt_preamble = EXCLUDED.prompt_preamble,
  initial_message = EXCLUDED.initial_message,
  voice = EXCLUDED.voice,
  updated_at = CURRENT_TIMESTAMP;

-- 2. MEDISHOP MEDICAL SALES
INSERT INTO companies (name, phone_number) VALUES 
('MediShop Medical Supplies', '+19784045213')  
ON CONFLICT (phone_number) DO NOTHING;

INSERT INTO agent_configs (company_id, prompt_key, prompt_preamble, initial_message, voice) VALUES 
(
  (SELECT id FROM companies WHERE name = 'MediShop Medical Supplies'),
  'medical_sales',
  $$# Medical Sales Representative Prompt
## Identity & Purpose
You are Sarah, a virtual sales representative for MediShop, a leading medical supplies provider based in Bengaluru, India. We specialize in providing high-quality medical equipment, consumables, and services to clinics, hospitals, and individual practitioners across Bangalore.
Your primary purpose is to qualify leads who have shown interest in medical supplies, understand their needs and current setup, explore potential partnerships or sales opportunities, handle FAQs, and schedule follow-up meetings for both inbound and outbound calls.

## Voice & Persona
### Personality
- Sound professional, empathetic, and knowledgeable—like a trusted healthcare advisor
- Project genuine interest in understanding their medical supply needs
- Maintain a courteous and solution-oriented demeanor throughout the conversation
- Show respect for their time while focusing on their requirements for medical equipment
- Convey enthusiasm about helping healthcare providers improve patient care through quality supplies

### Speech Characteristics
- Use clear, concise, and professional language with a supportive tone
- Keep messages under 150 characters when possible
- Include probing questions to gather detailed information about their needs
- Show genuine interest in their current setup and challenges
- Use encouraging language when discussing potential solutions or partnerships$$,
  'Hello {{name}}, this is Sarah from MediShop. I'm reaching out due to your interest in medical supplies. Available to discuss?',
  'Aditi'
)
ON CONFLICT (company_id, prompt_key) DO UPDATE SET
  prompt_preamble = EXCLUDED.prompt_preamble,
  initial_message = EXCLUDED.initial_message,
  voice = EXCLUDED.voice,
  updated_at = CURRENT_TIMESTAMP;

-- 3. CITY HOSPITAL RECEPTIONIST
INSERT INTO companies (name, phone_number) VALUES 
('City Hospital Bangalore', '+19784045213')  
ON CONFLICT (phone_number) DO NOTHING;

INSERT INTO agent_configs (company_id, prompt_key, prompt_preamble, initial_message, voice) VALUES 
(
  (SELECT id FROM companies WHERE name = 'City Hospital Bangalore'),
  'hospital_receptionist',
  $$# Hospital Receptionist Prompt
## Identity & Purpose
You are Emma, a virtual receptionist for City Hospital, a premier healthcare facility in Bengaluru, India. We provide comprehensive medical services, including consultations, diagnostics, and surgeries, to patients across Bangalore.
Your primary purpose is to assist callers with scheduling appointments, answering general inquiries about hospital services, directing calls to appropriate departments, and handling FAQs for both inbound and outbound calls.

## Voice & Persona
### Personality
- Sound calm, professional, and empathetic—like a caring healthcare professional
- Project genuine interest in helping callers with their medical needs
- Maintain a patient and reassuring demeanor throughout the conversation
- Show respect for their urgency while addressing their inquiries efficiently
- Convey confidence in City Hospital's ability to provide excellent care

### Speech Characteristics
- Use clear, soothing, and professional language with a supportive tone
- Keep messages under 150 characters when possible
- Include clarifying questions to understand their needs
- Show empathy for their health concerns or questions
- Use reassuring language when addressing inquiries or scheduling$$,
  'Hello {{name}}, this is Emma from City Hospital. I'm following up on your inquiry. Available to discuss?',
  'Matthew'
)
ON CONFLICT (company_id, prompt_key) DO UPDATE SET
  prompt_preamble = EXCLUDED.prompt_preamble,
  initial_message = EXCLUDED.initial_message,
  voice = EXCLUDED.voice,
  updated_at = CURRENT_TIMESTAMP;

-- ============================================
-- ASSIGN ALL EXISTING LEADS TO 4CHAMPZ (OPTIONAL)
-- ============================================
UPDATE leads 
SET company_id = (SELECT id FROM companies WHERE name = '4Champz Chess Coaching')
WHERE company_id IS NULL;

-- ============================================
-- END SAMPLE DATA
-- ============================================



-- ============================================
-- ADDITIONAL TABLES FOR SIMPLE NOTIFICATION & ANALYTICS SYSTEM
-- Add these to your existing schema.sql (run after main schema)
-- ============================================

-- 1. SYSTEM NOTIFICATIONS (Replaces Slack)
CREATE TABLE IF NOT EXISTS system_notifications (
  id SERIAL PRIMARY KEY,
  notification_type VARCHAR(50) DEFAULT 'info', -- info, warning, error, success
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  priority VARCHAR(20) DEFAULT 'normal', -- low, normal, high, urgent
  is_read BOOLEAN DEFAULT FALSE,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. ALERTS (For important notifications)
CREATE TABLE IF NOT EXISTS alerts (
  id SERIAL PRIMARY KEY,
  alert_type VARCHAR(50) NOT NULL, -- hot_lead, call_failed, negative_sentiment, etc.
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  severity VARCHAR(20) DEFAULT 'normal', -- low, normal, high, critical
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  is_acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by VARCHAR(255),
  acknowledged_at TIMESTAMP,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. ANALYTICS EVENTS (Replaces external analytics)
CREATE TABLE IF NOT EXISTS analytics_events (
  id SERIAL PRIMARY KEY,
  event_name VARCHAR(100) NOT NULL, -- call_completed, lead_qualified, etc.
  event_properties JSONB,
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. EMAIL QUEUE (For simple email management)
CREATE TABLE IF NOT EXISTS email_queue (
  id SERIAL PRIMARY KEY,
  to_email VARCHAR(255) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  body TEXT NOT NULL,
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  priority VARCHAR(20) DEFAULT 'normal', -- low, normal, high
  status VARCHAR(20) DEFAULT 'pending', -- pending, sent, failed
  sent_at TIMESTAMP,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_system_notifications_type ON system_notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_system_notifications_priority ON system_notifications(priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_notifications_is_read ON system_notifications(is_read);

CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_lead ON alerts(lead_id);
CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged ON alerts(is_acknowledged);

CREATE INDEX IF NOT EXISTS idx_analytics_events_name ON analytics_events(event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_events_lead ON analytics_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_company ON analytics_events(company_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events(created_at);

CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status, created_at);
CREATE INDEX IF NOT EXISTS idx_email_queue_priority ON email_queue(priority, status);

-- ============================================
-- TRIGGERS FOR TIMESTAMPS
-- ============================================
DROP TRIGGER IF EXISTS update_system_notifications_timestamp ON system_notifications;
CREATE TRIGGER update_system_notifications_timestamp
BEFORE UPDATE ON system_notifications
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- ============================================
-- SAMPLE DATA (Optional - for testing)
-- ============================================

-- Sample notification
INSERT INTO system_notifications (notification_type, title, message, priority) VALUES
('success', 'System Started', 'AI Calling System is now running', 'normal');

-- Sample alert types documentation (as comments)
-- alert_type values:
-- - 'hot_lead': High interest lead detected
-- - 'call_failed': Call failed to connect
-- - 'negative_sentiment': Customer angry/frustrated
-- - 'payment_due': Payment reminder needed
-- - 'system_error': System error occurred

-- Sample analytics event
INSERT INTO analytics_events (event_name, event_properties) VALUES
('system_started', '{"version": "1.0.0", "environment": "production"}');

-- ============================================
-- UTILITY VIEWS (Optional - for easier queries)
-- ============================================

-- View for unread notifications
CREATE OR REPLACE VIEW unread_notifications AS
SELECT * FROM system_notifications
WHERE is_read = FALSE
ORDER BY priority DESC, created_at DESC;

-- View for urgent alerts
CREATE OR REPLACE VIEW urgent_alerts AS
SELECT * FROM alerts
WHERE severity IN ('high', 'critical')
AND is_acknowledged = FALSE
ORDER BY created_at DESC;

-- View for hot leads needing attention
CREATE OR REPLACE VIEW hot_leads_today AS
SELECT 
  l.*,
  cl.sentiment->>'tone_score' as tone_score,
  cl.summary->>'intent' as intent,
  cl.created_at as last_call_date
FROM leads l
JOIN call_logs cl ON l.id = cl.lead_id
WHERE (
  l.lead_status = 'qualified'
  OR (cl.sentiment->>'tone_score')::int >= 7
  OR cl.summary->>'intent' = 'interested'
)
AND cl.created_at >= CURRENT_DATE
ORDER BY cl.created_at DESC;

-- View for today's summary
CREATE OR REPLACE VIEW today_summary AS
SELECT 
  (SELECT COUNT(*) FROM call_logs WHERE DATE(created_at) = CURRENT_DATE) as total_calls_today,
  (SELECT COUNT(*) FROM call_logs WHERE DATE(created_at) = CURRENT_DATE AND call_status = 'completed') as completed_calls_today,
  (SELECT COUNT(*) FROM call_logs WHERE DATE(created_at) = CURRENT_DATE AND call_status = 'failed') as failed_calls_today,
  (SELECT COUNT(*) FROM leads WHERE DATE(updated_at) = CURRENT_DATE) as leads_updated_today,
  (SELECT COUNT(*) FROM leads WHERE lead_status = 'qualified' AND DATE(updated_at) = CURRENT_DATE) as qualified_leads_today;

-- ============================================
-- CLEANUP FUNCTION (Optional - for maintenance)
-- ============================================

-- Function to clean old data (run weekly)
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS void AS $$
BEGIN
  -- Delete old read notifications (older than 30 days)
  DELETE FROM system_notifications
  WHERE is_read = TRUE
  AND created_at < NOW() - INTERVAL '30 days';
  
  -- Delete old acknowledged alerts (older than 60 days)
  DELETE FROM alerts
  WHERE is_acknowledged = TRUE
  AND created_at < NOW() - INTERVAL '60 days';
  
  -- Delete old analytics events (older than 90 days)
  DELETE FROM analytics_events
  WHERE created_at < NOW() - INTERVAL '90 days';
  
  -- Delete old sent/failed emails (older than 30 days)
  DELETE FROM email_queue
  WHERE status IN ('sent', 'failed')
  AND created_at < NOW() - INTERVAL '30 days';
  
  RAISE NOTICE 'Cleanup completed at %', NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- USEFUL QUERIES (as comments for reference)
-- ============================================

/*
-- Get today's hot leads
SELECT * FROM hot_leads_today;

-- Get unread high-priority notifications
SELECT * FROM system_notifications
WHERE is_read = FALSE AND priority IN ('high', 'urgent')
ORDER BY created_at DESC;

-- Get failed calls that need retry
SELECT * FROM call_logs
WHERE call_status = 'failed'
AND created_at >= NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- Get analytics summary for last 7 days
SELECT 
  event_name,
  COUNT(*) as count,
  DATE(created_at) as date
FROM analytics_events
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY event_name, DATE(created_at)
ORDER BY date DESC, count DESC;

-- Get pending emails
SELECT * FROM email_queue
WHERE status = 'pending'
ORDER BY priority DESC, created_at ASC
LIMIT 20;
*/

-- ============================================
-- END OF ADDITIONAL SCHEMA
-- ============================================