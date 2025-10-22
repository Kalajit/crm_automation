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

-- ============================================
-- SAMPLE FAQ DATA (Optional)
-- ============================================
INSERT INTO faq_templates (question, answer, category, keywords, is_active) VALUES
  ('What is 4champz?', '4champz is Bangalore''s leading chess coaching platform connecting qualified coaches with schools for kids'' programs.', 'general', ARRAY['4champz', 'about'], TRUE),
  ('How much does coaching cost?', 'Coaching rates start at ₹500/hour based on your experience and location. Premium coaches earn more.', 'pricing', ARRAY['cost', 'price', 'rates', 'fees'], TRUE),
  ('What are the timings?', 'We typically offer sessions between 3-6 PM (school hours). Flexible schedules are available based on school needs.', 'timings', ARRAY['timing', 'hours', 'schedule', 'when'], TRUE),
  ('Do I need experience?', 'While experience is valued, enthusiasm matters most. We provide training and curriculum support for all coaches.', 'services', ARRAY['experience', 'training', 'qualification'], TRUE)
ON CONFLICT DO NOTHING;