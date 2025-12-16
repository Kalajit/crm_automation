
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- CORE TABLES
-- ============================================
-- 1. COMPANIES TABLE (MULTI-TENANT SUPPORT)
DROP TABLE IF EXISTS companies CASCADE;
CREATE TABLE companies (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  industry VARCHAR(100),
  company_size VARCHAR(50) CHECK (company_size IN ('small', 'medium', 'large', 'enterprise')),
  website VARCHAR(255),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  country VARCHAR(100) DEFAULT 'India',
  postal_code VARCHAR(100),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'inactive')),
  subscription_plan VARCHAR(50) DEFAULT 'free',
  subscription_expires_at TIMESTAMP,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================
-- NEW USERS TABLE FOR AUTHENTICATION
-- ============================================
DROP TABLE IF EXISTS users CASCADE;
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('admin', 'manager', 'agent', 'user', 'service')),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  email_verified BOOLEAN DEFAULT FALSE,
  email_verification_token VARCHAR(255),
  email_verification_expires TIMESTAMP,
  password_reset_token VARCHAR(255),
  password_reset_expires TIMESTAMP,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- COMMENT ON TABLE users IS 'Stores user accounts for authentication';
-- COMMENT ON COLUMN users.role IS 'admin: full access, manager: team management, agent: limited access, user: basic access, service: API access';

DROP TABLE IF EXISTS refresh_token CASCADE;
CREATE TABLE refresh_token(
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- COMMENT ON TABLE refresh_tokens IS 'Stores JWT refresh tokens for token renewal';



-- 2. LEADS TABLE (WITH CUSTOM FIELDS AND COMPANY SUPPORT)
DROP TABLE IF EXISTS leads CASCADE;
CREATE TABLE leads (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) UNIQUE,
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
  preferred_language VARCHAR(10) DEFAULT 'en', -- ADDED FOR MULTILINGUAL SUPPORT
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_contacted TIMESTAMP,
  assigned_to_agent VARCHAR(255),
  notes TEXT,
  tags TEXT[],
  metadata JSONB DEFAULT '{}'::jsonb
);

-- OAuth Credentials Storage (Per Client/Company)
DROP TABLE IF EXISTS oauth_credentials CASCADE;
CREATE TABLE oauth_credentials (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL, -- 'meta', 'google_ads', 'linkedin'
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMP,
  account_id VARCHAR(255), -- Meta Ad Account ID, Google Ads Customer ID, etc.
  account_name VARCHAR(255),
  scopes TEXT[], -- Granted OAuth scopes
  is_active BOOLEAN DEFAULT TRUE,
  last_sync_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, platform)
);

-- Lead Source Configurations (Field Mappings)
DROP TABLE IF EXISTS lead_source_configs CASCADE;
CREATE TABLE lead_source_configs (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL, -- 'meta', 'google_ads', 'linkedin'
  form_id VARCHAR(255) NOT NULL, -- Meta Form ID, Google Form ID, etc.
  form_name VARCHAR(255),
  field_mappings JSONB NOT NULL, -- {"platform_field": "crm_field"}
  webhook_url TEXT, -- Generated webhook URL for this form
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, platform, form_id) 
);

-- Lead Import Logs (Track All Imports)
DROP TABLE IF EXISTS lead_import_logs CASCADE;
CREATE TABLE lead_import_logs (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL,
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  form_id VARCHAR(255),
  raw_data JSONB, -- Original data from platform
  mapped_data JSONB, -- After field mapping
  status VARCHAR(50) DEFAULT 'success', -- 'success', 'failed', 'duplicate'
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. CONVERSATIONS TABLE
DROP TABLE IF EXISTS conversations CASCADE;
CREATE TABLE conversations (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) NOT NULL,
  conversation_history TEXT,
  last_message TEXT,
  last_message_timestamp TIMESTAMP,
  message_count INTEGER DEFAULT 0,
  sentiment VARCHAR(50),
  ai_summary TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(lead_id) 
);

-- 4. WHATSAPP MESSAGES TABLE
DROP TABLE IF EXISTS whatsapp_messages CASCADE;
CREATE TABLE whatsapp_messages (
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

-- 5. FAQ TEMPLATES TABLE
DROP TABLE IF EXISTS faq_templates CASCADE;
CREATE TABLE faq_templates (
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

-- 6. BOOKINGS TABLE
DROP TABLE IF EXISTS bookings CASCADE;
CREATE TABLE bookings (
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

-- 7. INVOICES TABLE
DROP TABLE IF EXISTS invoices CASCADE;
CREATE TABLE invoices (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) NOT NULL,
  invoice_number VARCHAR(100) UNIQUE NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  amount_paid DECIMAL(10, 2) DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'INR',
  invoice_type VARCHAR(50),
  status VARCHAR(50) DEFAULT 'pending',
  payment_status VARCHAR(50),
  due_date TIMESTAMP,
  paid_date TIMESTAMP,
  payment_method VARCHAR(100),
  invoice_data JSONB,
  pdf_url TEXT,
  reminder_count INTEGER DEFAULT 0,
  last_reminder_sent TIMESTAMP,
  phonepe_transaction_id VARCHAR(255),
  phonepe_reference_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
UPDATE invoices 
SET payment_status = status 
WHERE payment_status IS NULL;
COMMENT ON COLUMN invoices.payment_status IS 'paid, pending, partially_paid, refunded, partially_refunded';

-- 8. NOTIFICATIONS TABLE
DROP TABLE IF EXISTS notifications CASCADE;
CREATE TABLE notifications (
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
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. WHATSAPP TEMPLATES TABLE
DROP TABLE IF EXISTS whatsapp_templates CASCADE;
CREATE TABLE whatsapp_templates (
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

-- 10. AGENTS TABLE
DROP TABLE IF EXISTS agents CASCADE;
CREATE TABLE agents (
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

-- 11. AUDIT LOG TABLE
DROP TABLE IF EXISTS audit_logs CASCADE;
CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  action VARCHAR(255) NOT NULL,
  details JSONB,
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- AI CALLING SYSTEM TABLES
-- ============================================
-- 12. AI AGENT CONFIGURATIONS
DROP TABLE IF EXISTS agent_configs CASCADE;
CREATE TABLE agent_configs (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  prompt_key VARCHAR(50) NOT NULL,
  prompt_preamble TEXT NOT NULL,
  initial_message TEXT NOT NULL,
  voice VARCHAR(50) DEFAULT 'Brian',
  model_name VARCHAR(50) DEFAULT 'llama-3.1-8b-instant',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, prompt_key)
);

DROP TABLE IF EXISTS agent_instances CASCADE;
CREATE TABLE agent_instances (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_name VARCHAR(255) NOT NULL,
  agent_type VARCHAR(50) DEFAULT 'voice', -- 'voice' or 'whatsapp'
  phone_number VARCHAR(20), -- Dedicated number for this agent
  whatsapp_number VARCHAR(20), -- WhatsApp number if applicable
  agent_config_id INTEGER REFERENCES agent_configs(id) ON DELETE SET NULL,
  custom_prompt TEXT, -- Override default prompt
  custom_voice VARCHAR(50), -- Override default voice
  is_active BOOLEAN DEFAULT TRUE,
  metadata JSONB DEFAULT '{}'::jsonb,
  supported_languages TEXT[] DEFAULT ARRAY['en', 'hi', 'kn', 'ml'],
  whatsapp_credentials JSONB DEFAULT '{}'::jsonb, -- WhatsApp API credentials
  webhook_verify_token VARCHAR(255), -- For webhook verification
  token_expires_at TIMESTAMP, -- WhatsApp token expiration
  twilio_credentials JSONB DEFAULT '{}'::jsonb, -- Stores Twilio Account SID, Auth Token, Phone Number
  twilio_webhook_verify_token VARCHAR(255), -- For Twilio webhook verification
  twilio_token_expires_at TIMESTAMP, -- Twilio token expiration
  sip_credentials JSONB DEFAULT '{}'::jsonb, -- SIP credentials for Airtel/other providers
  sip_provider VARCHAR(50) DEFAULT 'twilio', -- 'twilio', 'airtel', 'custom'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, agent_name)
);
COMMENT ON COLUMN agent_instances.twilio_credentials IS 'Stores Twilio Account SID, Auth Token, Phone Number';
COMMENT ON COLUMN agent_instances.sip_credentials IS 'SIP credentials for Airtel/other providers';
COMMENT ON COLUMN agent_instances.sip_provider IS 'SIP provider: twilio, airtel, or custom';
  
-- 13. CALL LOGS
DROP TABLE IF EXISTS call_logs CASCADE;
CREATE TABLE call_logs (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  call_sid VARCHAR(100) UNIQUE NOT NULL,
  to_phone VARCHAR(20) NOT NULL,
  from_phone VARCHAR(20) NOT NULL,
  call_type VARCHAR(20) DEFAULT 'qualification',
  call_status VARCHAR(20) DEFAULT 'initiated',
  call_duration INTEGER,
  recording_url TEXT,
  local_audio_path TEXT,
  transcript TEXT,
  sentiment JSONB,
  summary JSONB,
  conversation_history JSONB,
  customer_summary_sent BOOLEAN DEFAULT FALSE,
  cloud_storage_url TEXT,
  uploaded_to_cloud BOOLEAN DEFAULT FALSE,
  cloud_storage_provider VARCHAR(50),
  upload_error TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 14. SCHEDULED CALLS
DROP TABLE IF EXISTS scheduled_calls CASCADE;
CREATE TABLE scheduled_calls (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  call_type VARCHAR(20) NOT NULL,
  scheduled_time TIMESTAMP NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  call_sid VARCHAR(100),
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- NOTIFICATION & ANALYTICS TABLES
-- ============================================
-- 15. SYSTEM NOTIFICATIONS
DROP TABLE IF EXISTS system_notifications CASCADE;
CREATE TABLE system_notifications (
  id SERIAL PRIMARY KEY,
  notification_type VARCHAR(50) DEFAULT 'info',
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  priority VARCHAR(20) DEFAULT 'normal',
  is_read BOOLEAN DEFAULT FALSE,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 16. ALERTS
DROP TABLE IF EXISTS alerts CASCADE;
CREATE TABLE alerts (
  id SERIAL PRIMARY KEY,
  alert_type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  severity VARCHAR(20) DEFAULT 'normal',
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  is_acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by VARCHAR(255),
  acknowledged_at TIMESTAMP,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 17. ANALYTICS EVENTS
DROP TABLE IF EXISTS analytics_events CASCADE;
CREATE TABLE analytics_events (
  id SERIAL PRIMARY KEY,
  event_name VARCHAR(100) NOT NULL,
  event_properties JSONB,
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 18. EMAIL QUEUE
DROP TABLE IF EXISTS email_queue CASCADE;
CREATE TABLE email_queue (
  id SERIAL PRIMARY KEY,
  to_email VARCHAR(255) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  body TEXT NOT NULL,
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  priority VARCHAR(20) DEFAULT 'normal',
  status VARCHAR(20) DEFAULT 'pending',
  sent_at TIMESTAMP,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- HUMAN TAKEOVER TABLES
-- ============================================
-- 1. HUMAN AGENTS TABLE (Sales Reps)
DROP TABLE IF EXISTS human_agents CASCADE;
CREATE TABLE human_agents (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20),
  role VARCHAR(100) DEFAULT 'sales_rep', -- sales_rep, senior_rep, specialist, manager
  status VARCHAR(50) DEFAULT 'available', -- available, busy, offline
  assigned_leads INTEGER DEFAULT 0,
  max_concurrent_leads INTEGER DEFAULT 5,
  expertise TEXT[], -- ['high_value', 'angry_customer', 'technical']
  working_hours JSONB DEFAULT '{"start": "09:00", "end": "18:00", "timezone": "Asia/Kolkata"}',
  notification_channels JSONB DEFAULT '{"email": true, "whatsapp": true, "sms": false}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. TAKEOVER REQUESTS TABLE
DROP TABLE IF EXISTS takeover_requests CASCADE;
CREATE TABLE takeover_requests (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  call_sid VARCHAR(100), -- For voice calls
  conversation_id INTEGER REFERENCES conversations(id), -- For WhatsApp
  request_type VARCHAR(50) NOT NULL, -- 'call_transfer', 'whatsapp_takeover', 'escalation'
  trigger_reason VARCHAR(100) NOT NULL, -- 'angry_customer', 'high_value', 'confused', 'manual_request'
  ai_sentiment JSONB,
  ai_summary TEXT,
  conversation_context TEXT,
  status VARCHAR(50) DEFAULT 'pending', -- pending, assigned, in_progress, completed, expired
  assigned_agent_id INTEGER REFERENCES human_agents(id),
  assigned_at TIMESTAMP,
  completed_at TIMESTAMP,
  priority VARCHAR(20) DEFAULT 'medium', -- low, medium, high, urgent
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. HUMAN SESSIONS TABLE (Track human agent activity)
DROP TABLE IF EXISTS human_sessions CASCADE;
CREATE TABLE human_sessions (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER NOT NULL REFERENCES human_agents(id) ON DELETE CASCADE,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  session_type VARCHAR(50) NOT NULL, -- 'call', 'whatsapp', 'email'
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP,
  duration_seconds INTEGER,
  messages_sent INTEGER DEFAULT 0,
  outcome VARCHAR(100), -- 'converted', 'follow_up_scheduled', 'not_interested', 'escalated'
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- CAMPAIGNS TABLE
DROP TABLE IF EXISTS campaigns CASCADE;
CREATE TABLE campaigns (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  campaign_name VARCHAR(255) NOT NULL,
  campaign_type VARCHAR(50) DEFAULT 'outbound',
  total_leads INTEGER NOT NULL,
  scheduled_start TIMESTAMP,
  call_rate_per_minute INTEGER DEFAULT 1,
  status VARCHAR(50) DEFAULT 'scheduled',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Add campaign_id to scheduled_calls
ALTER TABLE scheduled_calls ADD COLUMN IF NOT EXISTS campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL;
-- Add lead_source_config_id to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_source_config_id INTEGER REFERENCES lead_source_configs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_leads_source_config ON leads(lead_source_config_id);

-- ============================================
-- DYNAMIC CUSTOM FIELDS SYSTEM
-- ============================================
-- 1. CUSTOM FIELD DEFINITIONS (Per Company/Agent Instance)
DROP TABLE IF EXISTS custom_field_definitions CASCADE;
CREATE TABLE custom_field_definitions (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_instance_id INTEGER REFERENCES agent_instances(id) ON DELETE CASCADE,
  field_key VARCHAR(100) NOT NULL, -- e.g., 'chess_rating', 'appointment_date', 'shoe_size'
  field_label VARCHAR(255) NOT NULL, -- e.g., 'Chess Rating', 'Appointment Date', 'Shoe Size'
  field_type VARCHAR(50) NOT NULL, -- 'text', 'number', 'date', 'email', 'phone', 'select', 'multiselect', 'boolean'
  field_category VARCHAR(100), -- 'personal', 'qualification', 'preference', 'medical', etc.
  is_required BOOLEAN DEFAULT FALSE,
  validation_rules JSONB, -- {"min": 1000, "max": 3000, "pattern": "^[0-9]+$"}
  extraction_config JSONB, -- {"keywords": ["rating", "elo"], "regex": "\\b(\\d{3,4})\\b"}
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, field_key)
);

-- 2. CUSTOM FIELD VALUES (Actual Lead Data)
DROP TABLE IF EXISTS lead_custom_data CASCADE;
CREATE TABLE lead_custom_data (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  field_definition_id INTEGER NOT NULL REFERENCES custom_field_definitions(id) ON DELETE CASCADE,
  field_key VARCHAR(100) NOT NULL,
  field_value TEXT,
  field_value_normalized TEXT, -- Cleaned/normalized value for searching
  source VARCHAR(50) DEFAULT 'ai_extraction', -- 'ai_extraction', 'manual', 'api', 'form'
  confidence_score FLOAT, -- 0.0 to 1.0 (how confident AI is about extraction)
  extracted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(lead_id, field_definition_id)
);

-- 3. EXTRACTION TEMPLATES (Pre-built for common industries)
DROP TABLE IF EXISTS extraction_templates CASCADE;
CREATE TABLE extraction_templates (
  id SERIAL PRIMARY KEY,
  template_name VARCHAR(255) NOT NULL UNIQUE,
  industry VARCHAR(100) NOT NULL, -- 'chess_coaching', 'medical', 'real_estate', 'ecommerce', etc.
  description TEXT,
  field_definitions JSONB NOT NULL, -- Array of field configs
  is_system_template BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- EMAIL SCANNING DATABASE SCHEMA
-- ============================================
-- Email Configurations
DROP TABLE IF EXISTS email_configs CASCADE;
CREATE TABLE email_configs (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email_address VARCHAR(255) NOT NULL,
  provider VARCHAR(50) NOT NULL, -- 'gmail', 'outlook', 'imap'
  -- IMAP Configuration
  imap_host VARCHAR(255),
  imap_port INTEGER DEFAULT 993,
  imap_username VARCHAR(255),
  imap_password_encrypted TEXT,
  -- Scanning Settings
  scan_folders TEXT[] DEFAULT ARRAY['INBOX'],
  scan_interval_minutes INTEGER DEFAULT 15,
  ai_rules JSONB DEFAULT '{}'::jsonb,
  -- Statistics
  is_active BOOLEAN DEFAULT TRUE,
  last_scan_at TIMESTAMP,
  total_scanned INTEGER DEFAULT 0,
  leads_extracted INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, email_address)
);
-- Sample AI Rules Configuration
COMMENT ON COLUMN email_configs.ai_rules IS 'JSON structure: {
  "keywords": ["inquiry", "interested", "quote"],
  "priority_keywords": ["urgent", "asap", "immediately"],
  "exclude_keywords": ["unsubscribe", "spam"],
  "extract_fields": ["phone", "email", "company", "interest"],
  "auto_tag": ["email_lead", "inbound"]
}';

-- Email Scan Logs
DROP TABLE IF EXISTS email_scan_logs CASCADE;
CREATE TABLE email_scan_logs (
  id SERIAL PRIMARY KEY,
  email_config_id INTEGER REFERENCES email_configs(id) ON DELETE CASCADE,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  -- Email Details
  message_id VARCHAR(255),
  from_email VARCHAR(255),
  subject TEXT,
  -- Extraction Results
  extracted_data JSONB,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'success', 'skipped', 'failed'
  error_message TEXT,
  confidence_score FLOAT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- MULTI-TENANT EMAIL SCANNING SCHEMA
-- ============================================
-- Email Configurations (Per Company)
DROP TABLE IF EXISTS email_configs CASCADE;
CREATE TABLE email_configs (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email_address VARCHAR(255) NOT NULL,
  provider VARCHAR(50) NOT NULL, -- 'gmail', 'outlook'
  -- OAuth Tokens (Encrypted)
  oauth_access_token TEXT,
  oauth_refresh_token TEXT,
  oauth_token_expires_at TIMESTAMP,
  -- Scanning Settings
  scan_folders TEXT[] DEFAULT ARRAY['INBOX'],
  scan_interval_minutes INTEGER DEFAULT 15,
  ai_rules JSONB DEFAULT '{
    "keywords": ["interested", "inquiry", "quote", "demo"],
    "priority_keywords": ["urgent", "asap", "immediately"],
    "exclude_keywords": ["unsubscribe", "newsletter", "spam", "marketing"],
    "extract_fields": ["phone", "email", "name", "company", "interest"],
    "auto_tag": ["email_lead", "inbound"]
  }'::jsonb,
  -- Statistics
  is_active BOOLEAN DEFAULT TRUE,
  last_scan_at TIMESTAMP,
  total_scanned INTEGER DEFAULT 0,
  leads_extracted INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, email_address)
);
-- Comments
COMMENT ON TABLE email_configs IS 'Stores OAuth credentials for each company email account';
COMMENT ON TABLE email_scan_logs IS 'Logs all email scanning activity per company';
COMMENT ON COLUMN email_configs.oauth_access_token IS 'AES-256 encrypted access token';
COMMENT ON COLUMN email_configs.oauth_refresh_token IS 'AES-256 encrypted refresh token';


-- Email Scan Logs (Per Company)
DROP TABLE IF EXISTS email_scan_logs CASCADE;
CREATE TABLE email_scan_logs (
  id SERIAL PRIMARY KEY,
  email_config_id INTEGER REFERENCES email_configs(id) ON DELETE CASCADE,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  -- Email Details
  message_id VARCHAR(255),
  from_email VARCHAR(255),
  subject TEXT,
  -- Extraction Results
  extracted_data JSONB,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'success', 'skipped', 'failed'
  error_message TEXT,
  confidence_score FLOAT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- Prevent duplicate processing
  UNIQUE(email_config_id, message_id)
);

-- ============================================
-- CALENDAR INTEGRATION TABLES
-- ============================================
DROP TABLE IF EXISTS calendar_configs CASCADE;
CREATE TABLE calendar_configs (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_email VARCHAR(255) NOT NULL,
  provider VARCHAR(50) NOT NULL, -- 'google', 'outlook'
  -- OAuth credentials (encrypted)
  oauth_access_token TEXT,
  oauth_refresh_token TEXT,
  oauth_token_expires_at TIMESTAMP,
  -- Google Calendar specific
  calendar_id VARCHAR(255) DEFAULT 'primary', -- Which calendar to use
  calendar_timezone VARCHAR(100) DEFAULT 'Asia/Kolkata',
  -- Settings
  default_event_duration INTEGER DEFAULT 60, -- minutes
  buffer_time INTEGER DEFAULT 15, -- minutes between meetings
  working_hours JSONB DEFAULT '{"start": "09:00", "end": "18:00", "days": [1,2,3,4,5]}'::jsonb,
  is_default BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  buffer_before_minutes INTEGER DEFAULT 0,
  buffer_after_minutes INTEGER DEFAULT 15,
  UNIQUE(company_id, user_email, provider)
);

DROP TABLE IF EXISTS calendar_events CASCADE;
CREATE TABLE calendar_events (
  id SERIAL PRIMARY KEY,
  calendar_config_id INTEGER NOT NULL REFERENCES calendar_configs(id) ON DELETE CASCADE,
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
  -- Event details
  event_id VARCHAR(255) NOT NULL, -- Google/Outlook event ID
  title VARCHAR(500) NOT NULL,
  description TEXT,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL, 
  -- Attendees
  attendees JSONB, -- [{"email": "user@example.com", "status": "accepted"}] 
  -- Meeting links
  meeting_link TEXT, -- Google Meet link
  -- Status
  status VARCHAR(50) DEFAULT 'confirmed', -- confirmed, cancelled, rescheduled
  reminder_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(calendar_config_id, event_id)
);

-- ============================================
-- MISSING TABLES FOR MODULE 2 & 3
-- ============================================
-- Routing Rules Table
DROP TABLE IF EXISTS routing_rules CASCADE;
CREATE TABLE routing_rules (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  rule_name VARCHAR(255) NOT NULL,
  rule_type VARCHAR(50) NOT NULL, -- 'score_based', 'source_based', 'language_based', 'time_based', 'custom'
  conditions JSONB NOT NULL,
  action VARCHAR(50) NOT NULL, -- 'assign_agent', 'priority_queue', 'auto_call', 'send_notification', 'tag_lead'
  target_agent_id INTEGER REFERENCES human_agents(id) ON DELETE SET NULL,
  priority INTEGER DEFAULT 50,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tasks Table
DROP TABLE IF EXISTS tasks CASCADE;
CREATE TABLE tasks (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  assigned_to_agent_id INTEGER REFERENCES human_agents(id) ON DELETE SET NULL,
  task_type VARCHAR(50) NOT NULL, -- 'follow_up', 'callback', 'email', 'meeting', 'demo'
  title VARCHAR(500) NOT NULL,
  description TEXT,
  due_date TIMESTAMP,
  priority VARCHAR(20) DEFAULT 'medium', -- 'low', 'medium', 'high', 'urgent'
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'cancelled'
  reminder_before_minutes INTEGER DEFAULT 30,
  reminder_sent BOOLEAN DEFAULT FALSE,
  notes TEXT,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- DRIP CAMPAIGN TABLES (Module 7)
-- ============================================
DROP TABLE IF EXISTS drip_campaigns CASCADE;
CREATE TABLE drip_campaigns (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  campaign_name VARCHAR(255) NOT NULL,
  description TEXT,
  trigger_type VARCHAR(50) NOT NULL,
  trigger_conditions JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT FALSE,
  total_subscribers INTEGER DEFAULT 0,
  total_completed INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, campaign_name)
);

-- Drip Campaign Steps
DROP TABLE IF EXISTS drip_campaign_steps CASCADE;
CREATE TABLE drip_campaign_steps (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES drip_campaigns(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  step_type VARCHAR(50) NOT NULL,
  delay_days INTEGER DEFAULT 0,
  delay_hours INTEGER DEFAULT 0,
  delay_minutes INTEGER DEFAULT 0,
  subject VARCHAR(500),
  message_body TEXT,
  template_id VARCHAR(255),
  send_conditions JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(campaign_id, step_number)
);

-- Drip Campaign Subscribers
DROP TABLE IF EXISTS drip_campaign_subscribers CASCADE;
CREATE TABLE drip_campaign_subscribers (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES drip_campaigns(id) ON DELETE CASCADE,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  current_step INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'active',
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  unsubscribed_at TIMESTAMP,
  last_step_sent_at TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(campaign_id, lead_id)
);

-- Drip Campaign Step Executions
DROP TABLE IF EXISTS drip_step_executions CASCADE;
CREATE TABLE drip_step_executions (
  id SERIAL PRIMARY KEY,
  subscriber_id INTEGER NOT NULL REFERENCES drip_campaign_subscribers(id) ON DELETE CASCADE,
  step_id INTEGER NOT NULL REFERENCES drip_campaign_steps(id) ON DELETE CASCADE,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'pending',
  scheduled_for TIMESTAMP NOT NULL,
  sent_at TIMESTAMP,
  opened_at TIMESTAMP,
  clicked_at TIMESTAMP,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Unsubscribe Management
DROP TABLE IF EXISTS unsubscribes CASCADE;
CREATE TABLE unsubscribes (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  unsubscribe_type VARCHAR(50) NOT NULL,
  campaign_id INTEGER REFERENCES drip_campaigns(id) ON DELETE SET NULL,
  reason TEXT,
  unsubscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(50),
  user_agent TEXT,
  UNIQUE(lead_id, unsubscribe_type, campaign_id)
);

-- Campaign Performance Tracking
DROP TABLE IF EXISTS campaign_performance CASCADE;
CREATE TABLE campaign_performance (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER REFERENCES drip_campaigns(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  messages_sent INTEGER DEFAULT 0,
  messages_delivered INTEGER DEFAULT 0,
  messages_opened INTEGER DEFAULT 0,
  messages_clicked INTEGER DEFAULT 0,
  messages_failed INTEGER DEFAULT 0,
  unsubscribes INTEGER DEFAULT 0,
  leads_converted INTEGER DEFAULT 0,
  revenue_generated DECIMAL(10, 2) DEFAULT 0,
  cost_per_message DECIMAL(10, 4) DEFAULT 0,
  total_cost DECIMAL(10, 2) DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(campaign_id, date)
);

-- ============================================
-- SCHEDULED REPORTS TABLE (Module 8)
-- ============================================
DROP TABLE IF EXISTS scheduled_reports CASCADE;
CREATE TABLE scheduled_reports (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  report_type VARCHAR(100) NOT NULL,
  frequency VARCHAR(50) NOT NULL,
  recipients JSONB NOT NULL,
  format VARCHAR(20) DEFAULT 'pdf',
  delivery_time TIME DEFAULT '09:00',
  is_active BOOLEAN DEFAULT TRUE,
  next_delivery TIMESTAMP,
  last_delivery TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- SUBSCRIPTION MANAGEMENT TABLE
-- ============================================
DROP TABLE IF EXISTS lead_subscriptions CASCADE;
CREATE TABLE lead_subscriptions (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'active', 'expired', 'cancelled'
  renewal_reminder_sent BOOLEAN DEFAULT FALSE,
  auto_renew BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- PAYMENT TRANSACTIONS TABLE (Detailed tracking)
-- ============================================
DROP TABLE IF EXISTS payment_transactions CASCADE;
CREATE TABLE payment_transactions (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  merchant_transaction_id VARCHAR(255) UNIQUE NOT NULL,
  phonepe_transaction_id VARCHAR(255),
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'INR',
  status VARCHAR(50) DEFAULT 'initiated', -- 'initiated', 'pending', 'success', 'failed'
  payment_method VARCHAR(50) DEFAULT 'PhonePe',
  payment_mode VARCHAR(50), -- 'UPI', 'Card', 'NetBanking', 'Wallet'
  callback_data JSONB,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- INVOICE REMINDERS TABLE (Track all reminders)
-- ============================================
DROP TABLE IF EXISTS invoice_reminders CASCADE;
CREATE TABLE invoice_reminders (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  reminder_type VARCHAR(50) NOT NULL, -- 'gentle', 'strong', 'escalation', 'renewal'
  reminder_date DATE DEFAULT CURRENT_DATE,
  sent_via VARCHAR(50), -- 'whatsapp', 'email', 'sms'
  status VARCHAR(50) DEFAULT 'sent', -- 'sent', 'failed', 'delivered'
  message_body TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- ACCOUNTING SYNC LOG TABLE
-- ============================================
DROP TABLE IF EXISTS accounting_sync_log CASCADE;
CREATE TABLE accounting_sync_log (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  accounting_system VARCHAR(50) NOT NULL, -- 'quickbooks', 'zoho', 'tally'
  external_id VARCHAR(255),
  sync_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'success', 'failed'
  sync_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  error_message TEXT,
  request_data JSONB,
  response_data JSONB
);

-- Add payment history table
CREATE TABLE IF NOT EXISTS payment_history (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  payment_method VARCHAR(50),
  payment_date TIMESTAMP DEFAULT NOW(),
  transaction_id VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refunds (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
  refund_amount DECIMAL(10, 2) NOT NULL,
  reason TEXT,
  status VARCHAR(50) DEFAULT 'pending', -- pending, processed, failed
  merchant_refund_id VARCHAR(255) UNIQUE,
  phonepe_refund_id VARCHAR(255),
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Company billing plans
CREATE TABLE IF NOT EXISTS company_billing_plans (
  id SERIAL PRIMARY KEY,
  plan_name VARCHAR(100) NOT NULL,
  monthly_price DECIMAL(10, 2) NOT NULL,
  -- Usage limits
  max_whatsapp_messages INTEGER DEFAULT 1000,
  max_voice_minutes INTEGER DEFAULT 500,
  max_leads INTEGER DEFAULT 10000,
  max_agents INTEGER DEFAULT 5,
  max_ai_tokens INTEGER DEFAULT 100000,
  -- Features
  features JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Company subscriptions
CREATE TABLE IF NOT EXISTS company_subscriptions (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  plan_id INTEGER REFERENCES company_billing_plans(id),
  status VARCHAR(50) DEFAULT 'active', -- active, suspended, cancelled
  billing_cycle VARCHAR(20) DEFAULT 'monthly', -- monthly, annual
  current_period_start TIMESTAMP NOT NULL,
  current_period_end TIMESTAMP NOT NULL,
  next_billing_date TIMESTAMP,
  auto_renew BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Usage tracking
CREATE TABLE IF NOT EXISTS company_usage (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  -- Period tracking
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  -- Usage counters
  whatsapp_messages_sent INTEGER DEFAULT 0,
  voice_minutes_used INTEGER DEFAULT 0,
  leads_created INTEGER DEFAULT 0,
  ai_tokens_used INTEGER DEFAULT 0,
  -- Cost tracking
  overage_charges DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(company_id, period_start)
);

-- Real-time usage events
CREATE TABLE IF NOT EXISTS usage_events (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  
  event_type VARCHAR(50) NOT NULL, -- whatsapp_message, voice_call, lead_created
  quantity INTEGER DEFAULT 1,
  
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- BULK MESSAGING TABLES
-- ============================================
DROP TABLE IF EXISTS bulk_message_jobs CASCADE;
CREATE TABLE bulk_message_jobs (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_instance_id INTEGER NOT NULL REFERENCES agent_instances(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  recipients JSONB NOT NULL, -- Array of phone numbers
  total_count INTEGER NOT NULL,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  failed_recipients JSONB, -- Array of {phone, error}
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'scheduled', 'processing', 'completed', 'failed'
  scheduled_time TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- CALL QUEUE MANAGEMENT
-- ============================================
DROP TABLE IF EXISTS call_queue CASCADE;
CREATE TABLE call_queue (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  agent_instance_id INTEGER REFERENCES agent_instances(id) ON DELETE SET NULL,
  priority INTEGER DEFAULT 50, -- 1-100, higher = more urgent
  call_type VARCHAR(50) DEFAULT 'outbound', -- 'outbound', 'callback', 'follow_up'
  scheduled_time TIMESTAMP NOT NULL,
  max_attempts INTEGER DEFAULT 3,
  attempt_count INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'failed', 'cancelled'
  last_attempt_at TIMESTAMP,
  completed_at TIMESTAMP,
  call_sid VARCHAR(100),
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- CONFERENCE CALLS
-- ============================================
DROP TABLE IF EXISTS conference_calls CASCADE;
CREATE TABLE conference_calls (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  conference_sid VARCHAR(100) UNIQUE NOT NULL,
  friendly_name VARCHAR(255),
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'completed'
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP,
  recording_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS conference_participants CASCADE;
CREATE TABLE conference_participants (
  id SERIAL PRIMARY KEY,
  conference_id INTEGER NOT NULL REFERENCES conference_calls(id) ON DELETE CASCADE,
  call_sid VARCHAR(100) NOT NULL,
  participant_type VARCHAR(50) NOT NULL, -- 'agent', 'lead', 'human_agent', 'expert'
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  human_agent_id INTEGER REFERENCES human_agents(id) ON DELETE SET NULL,
  phone_number VARCHAR(20) NOT NULL,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  left_at TIMESTAMP,
  duration_seconds INTEGER,
  is_muted BOOLEAN DEFAULT FALSE,
  is_on_hold BOOLEAN DEFAULT FALSE
);

-- ============================================
-- CALENDAR ENHANCEMENTS
-- ============================================
DROP TABLE IF EXISTS recurring_appointments CASCADE;
CREATE TABLE recurring_appointments (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
  recurrence_rule VARCHAR(255) NOT NULL, -- RRULE format (e.g., 'FREQ=WEEKLY;BYDAY=MO,WE,FR')
  start_date DATE NOT NULL,
  end_date DATE, -- NULL for indefinite
  occurrences_count INTEGER, -- NULL for indefinite
  created_occurrences INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS calendar_conflicts CASCADE;
CREATE TABLE calendar_conflicts (
  id SERIAL PRIMARY KEY,
  calendar_config_id INTEGER NOT NULL REFERENCES calendar_configs(id) ON DELETE CASCADE,
  conflicting_event_id_1 INTEGER REFERENCES calendar_events(id) ON DELETE CASCADE,
  conflicting_event_id_2 INTEGER REFERENCES calendar_events(id) ON DELETE CASCADE,
  conflict_type VARCHAR(50) NOT NULL, -- 'overlap', 'buffer_violation', 'double_booking'
  detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMP,
  resolution_action TEXT
);

-- ============================================
-- CLOUD STORAGE FOR RECORDINGS
-- ============================================
DROP TABLE IF EXISTS cloud_storage_configs CASCADE;
CREATE TABLE cloud_storage_configs (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL, -- 's3', 'gcs', 'azure'
  bucket_name VARCHAR(255) NOT NULL,
  region VARCHAR(100),
  access_key_encrypted TEXT,
  secret_key_encrypted TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, provider)
);

-- ============================================
-- TEAM COLLABORATION
-- ============================================
DROP TABLE IF EXISTS team_chat_messages CASCADE;
CREATE TABLE team_chat_messages (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sender_agent_id INTEGER NOT NULL REFERENCES human_agents(id) ON DELETE CASCADE,
  lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE, -- NULL for general chat
  message_text TEXT NOT NULL,
  mentions JSONB, -- Array of agent IDs mentioned with @
  attachments JSONB, -- Array of file URLs
  parent_message_id INTEGER REFERENCES team_chat_messages(id) ON DELETE SET NULL, -- For threads
  is_edited BOOLEAN DEFAULT FALSE,
  edited_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS shared_notes CASCADE;
CREATE TABLE shared_notes (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  created_by_agent_id INTEGER NOT NULL REFERENCES human_agents(id) ON DELETE CASCADE,
  note_title VARCHAR(500),
  note_content TEXT NOT NULL,
  is_pinned BOOLEAN DEFAULT FALSE,
  tags TEXT[],
  last_edited_by INTEGER REFERENCES human_agents(id) ON DELETE SET NULL,
  last_edited_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS activity_feed CASCADE;
CREATE TABLE activity_feed (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  agent_id INTEGER REFERENCES human_agents(id) ON DELETE SET NULL,
  activity_type VARCHAR(100) NOT NULL, -- 'call_completed', 'note_added', 'status_changed', etc.
  activity_description TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- MOBILE APP SUPPORT
-- ============================================
DROP TABLE IF EXISTS mobile_devices CASCADE;
CREATE TABLE mobile_devices (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER NOT NULL REFERENCES human_agents(id) ON DELETE CASCADE,
  device_id VARCHAR(255) UNIQUE NOT NULL,
  device_type VARCHAR(50) NOT NULL, -- 'ios', 'android'
  device_name VARCHAR(255),
  fcm_token TEXT, -- Firebase Cloud Messaging token
  apns_token TEXT, -- Apple Push Notification token
  app_version VARCHAR(50),
  os_version VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE,
  last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS push_notifications CASCADE;
CREATE TABLE push_notifications (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER NOT NULL REFERENCES human_agents(id) ON DELETE CASCADE,
  notification_type VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  data JSONB, -- Additional payload
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'sent', 'failed', 'delivered', 'clicked'
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  clicked_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- ADVANCED SECURITY
-- ============================================
DROP TABLE IF EXISTS ip_whitelist CASCADE;
CREATE TABLE ip_whitelist (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ip_address VARCHAR(45) NOT NULL, -- Supports IPv4 and IPv6
  description VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  created_by INTEGER REFERENCES human_agents(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, ip_address)
);

DROP TABLE IF EXISTS two_factor_auth CASCADE;
CREATE TABLE two_factor_auth (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER NOT NULL REFERENCES human_agents(id) ON DELETE CASCADE,
  secret_encrypted TEXT NOT NULL,
  backup_codes_encrypted TEXT, -- JSON array of backup codes
  is_enabled BOOLEAN DEFAULT FALSE,
  enabled_at TIMESTAMP,
  last_used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(agent_id)
);

DROP TABLE IF EXISTS audit_log_viewer CASCADE;
CREATE TABLE audit_log_viewer (
  id SERIAL PRIMARY KEY,
  viewer_agent_id INTEGER NOT NULL REFERENCES human_agents(id) ON DELETE CASCADE,
  viewed_log_id INTEGER NOT NULL REFERENCES audit_logs(id) ON DELETE CASCADE,
  viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS data_retention_policies CASCADE;
CREATE TABLE data_retention_policies (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  data_type VARCHAR(100) NOT NULL, -- 'call_recordings', 'messages', 'audit_logs', etc.
  retention_days INTEGER NOT NULL,
  auto_delete BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, data_type)
);

-- ============================================
-- MULTI-CHANNEL SUPPORT
-- ============================================
DROP TABLE IF EXISTS sms_messages CASCADE;
CREATE TABLE sms_messages (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) NOT NULL,
  message_body TEXT NOT NULL,
  direction VARCHAR(20) NOT NULL, -- 'inbound', 'outbound'
  message_sid VARCHAR(100),
  status VARCHAR(50) DEFAULT 'sent',
  provider VARCHAR(50) DEFAULT 'twilio',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS web_chat_sessions CASCADE;
CREATE TABLE web_chat_sessions (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  session_id UUID UNIQUE NOT NULL DEFAULT uuid_generate_v4(),
  visitor_name VARCHAR(255),
  visitor_email VARCHAR(255),
  visitor_ip VARCHAR(45),
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'ended', 'transferred'
  assigned_agent_id INTEGER REFERENCES human_agents(id) ON DELETE SET NULL,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP,
  metadata JSONB
);

DROP TABLE IF EXISTS web_chat_messages CASCADE;
CREATE TABLE web_chat_messages (
  id SERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES web_chat_sessions(session_id) ON DELETE CASCADE,
  sender_type VARCHAR(20) NOT NULL, -- 'visitor', 'agent', 'bot'
  sender_id INTEGER, -- agent_id if agent, NULL if visitor
  message_text TEXT NOT NULL,
  attachments JSONB,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS social_media_accounts CASCADE;
CREATE TABLE social_media_accounts (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL, -- 'facebook', 'instagram', 'twitter', 'linkedin'
  account_id VARCHAR(255) NOT NULL,
  account_name VARCHAR(255),
  access_token_encrypted TEXT,
  page_id VARCHAR(255), -- For Facebook/Instagram pages
  is_active BOOLEAN DEFAULT TRUE,
  last_sync_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, platform, account_id)
);

DROP TABLE IF EXISTS social_media_messages CASCADE;
CREATE TABLE social_media_messages (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES social_media_accounts(id) ON DELETE CASCADE,
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  platform_message_id VARCHAR(255) NOT NULL,
  sender_platform_id VARCHAR(255) NOT NULL,
  sender_name VARCHAR(255),
  message_text TEXT,
  message_type VARCHAR(50), -- 'text', 'image', 'video', 'story_reply', etc.
  attachments JSONB,
  direction VARCHAR(20) NOT NULL, -- 'inbound', 'outbound'
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(account_id, platform_message_id)
);


-- ============================================
-- HUMAN AGENT MANAGEMENT TABLES
-- ============================================

DROP TABLE IF EXISTS agent_shifts CASCADE;
CREATE TABLE agent_shifts (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER NOT NULL REFERENCES human_agents(id) ON DELETE CASCADE,
  shift_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  shift_type VARCHAR(50) DEFAULT 'regular', -- 'regular', 'overtime', 'on_call'
  status VARCHAR(50) DEFAULT 'scheduled', -- 'scheduled', 'active', 'completed', 'cancelled'
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


DROP TABLE IF EXISTS time_off_requests CASCADE;
CREATE TABLE time_off_requests (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER NOT NULL REFERENCES human_agents(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  reviewed_by INTEGER REFERENCES human_agents(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


DROP TABLE IF EXISTS agent_breaks CASCADE;
CREATE TABLE agent_breaks (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER NOT NULL REFERENCES human_agents(id) ON DELETE CASCADE,
  break_type VARCHAR(50) DEFAULT 'regular', -- 'regular', 'lunch', 'emergency'
  started_at TIMESTAMP NOT NULL,
  ended_at TIMESTAMP,
  duration_seconds INTEGER,
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'completed'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- Document Management
DROP TABLE IF EXISTS document_folders CASCADE;
CREATE TABLE document_folders (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  folder_name VARCHAR(255) NOT NULL,
  parent_folder_id INTEGER REFERENCES document_folders(id) ON DELETE CASCADE,
  description TEXT,
  created_by INTEGER REFERENCES human_agents(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT check_folder_name CHECK (LENGTH(TRIM(folder_name)) > 0)
);

-- Main documents table
DROP TABLE IF EXISTS documents CASCADE;
CREATE TABLE documents (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  folder_id INTEGER REFERENCES document_folders(id) ON DELETE SET NULL,
  document_type VARCHAR(100) DEFAULT 'other',
  document_name VARCHAR(500) NOT NULL,
  description TEXT,
  filename VARCHAR(255) NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  storage_url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  version INTEGER DEFAULT 1 CHECK (version > 0),
  uploaded_by INTEGER REFERENCES human_agents(id) ON DELETE SET NULL,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_by INTEGER REFERENCES human_agents(id) ON DELETE SET NULL,
  deleted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT check_document_name CHECK (LENGTH(TRIM(document_name)) > 0),
  CONSTRAINT check_filename CHECK (LENGTH(TRIM(filename)) > 0),
  CONSTRAINT check_file_size CHECK (file_size > 0),
  CONSTRAINT check_storage_url CHECK (LENGTH(TRIM(storage_url)) > 0)
);

-- Document versions (for version control)
DROP TABLE IF EXISTS document_versions CASCADE;
CREATE TABLE document_versions (
  id SERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  filename VARCHAR(255) NOT NULL,
  file_size BIGINT NOT NULL CHECK (file_size > 0),
  storage_url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  created_by INTEGER REFERENCES human_agents(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(document_id, version)
);

-- Document sharing permissions
DROP TABLE IF EXISTS document_shares CASCADE;
CREATE TABLE document_shares (
  id SERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  shared_with_agent_id INTEGER NOT NULL REFERENCES human_agents(id) ON DELETE CASCADE,
  shared_by INTEGER REFERENCES human_agents(id) ON DELETE SET NULL,
  permissions VARCHAR(20) DEFAULT 'view' CHECK (permissions IN ('view', 'edit', 'download', 'full')),
  shared_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(document_id, shared_with_agent_id)
);

-- Document access logs
DROP TABLE IF EXISTS document_access_logs CASCADE;
CREATE TABLE document_access_logs (
  id SERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  accessed_by INTEGER NOT NULL REFERENCES human_agents(id) ON DELETE SET NULL,
  access_type VARCHAR(20) NOT NULL CHECK (access_type IN ('view', 'download', 'edit', 'delete', 'share')),
  ip_address INET,
  accessed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);


-- Meeting Scheduler (Calendly-like)
DROP TABLE IF EXISTS scheduling_links CASCADE;
CREATE TABLE scheduling_links (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_id INTEGER NOT NULL REFERENCES human_agents(id) ON DELETE CASCADE,
  link_name VARCHAR(255) NOT NULL,
  link_slug VARCHAR(255) UNIQUE NOT NULL,
  meeting_duration INTEGER DEFAULT 30 CHECK (meeting_duration > 0),
  meeting_type VARCHAR(100),
  description TEXT,
  location_type VARCHAR(50) DEFAULT 'virtual' CHECK (location_type IN ('virtual', 'phone', 'in_person')),
  location_details TEXT,
  availability_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  buffer_time_before INTEGER DEFAULT 0 CHECK (buffer_time_before >= 0),
  buffer_time_after INTEGER DEFAULT 15 CHECK (buffer_time_after >= 0),
  max_bookings_per_day INTEGER CHECK (max_bookings_per_day IS NULL OR max_bookings_per_day > 0),
  advance_notice_hours INTEGER DEFAULT 24 CHECK (advance_notice_hours >= 0),
  max_days_advance INTEGER DEFAULT 60 CHECK (max_days_advance > 0),
  custom_questions JSONB DEFAULT '[]'::jsonb,
  confirmation_message TEXT,
  reminder_settings JSONB DEFAULT '{
    "email_reminder": true,
    "sms_reminder": false,
    "reminder_before_hours": 24
  }'::jsonb,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT check_link_name CHECK (LENGTH(TRIM(link_name)) > 0),
  CONSTRAINT check_link_slug CHECK (link_slug ~ '^[a-z0-9-]+$')
);

-- Scheduled meetings (actual bookings)
DROP TABLE IF EXISTS scheduled_meetings CASCADE;
CREATE TABLE scheduled_meetings (
  id SERIAL PRIMARY KEY,
  scheduling_link_id INTEGER NOT NULL REFERENCES scheduling_links(id) ON DELETE CASCADE,
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  lead_name VARCHAR(255) NOT NULL,
  lead_email VARCHAR(255) NOT NULL,
  lead_phone VARCHAR(20),
  scheduled_time TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  timezone VARCHAR(50) DEFAULT 'Asia/Kolkata' NOT NULL,
  location_type VARCHAR(50),
  location_details TEXT,
  custom_answers JSONB DEFAULT '{}'::jsonb,
  notes TEXT,
  status VARCHAR(50) DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'completed', 'no_show', 'rescheduled')),
  confirmation_code VARCHAR(50) UNIQUE NOT NULL,
  calendar_event_id VARCHAR(255),
  meeting_link VARCHAR(500),
  cancellation_reason TEXT,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  viewed_at TIMESTAMP WITH TIME ZONE,
  sent_at TIMESTAMP WITH TIME ZONE,
  accepted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT check_lead_name CHECK (LENGTH(TRIM(lead_name)) > 0),
  CONSTRAINT check_lead_email CHECK (lead_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  CONSTRAINT check_scheduled_time CHECK (scheduled_time > CURRENT_TIMESTAMP - INTERVAL '1 year')
);

-- Product/Service Catalog
DROP TABLE IF EXISTS products CASCADE;
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(500) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  base_price NUMERIC(12, 2) NOT NULL CHECK (base_price >= 0),
  currency VARCHAR(10) DEFAULT 'INR' NOT NULL,
  sku VARCHAR(100),
  track_inventory BOOLEAN DEFAULT FALSE,
  stock_quantity INTEGER DEFAULT 0 CHECK (stock_quantity >= 0),
  low_stock_threshold INTEGER DEFAULT 10 CHECK (low_stock_threshold >= 0),
  is_active BOOLEAN DEFAULT TRUE,
  tax_rate NUMERIC(5, 2) DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  images JSONB DEFAULT '[]'::jsonb,
  custom_fields JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT check_product_name CHECK (LENGTH(TRIM(name)) > 0),
  CONSTRAINT unique_company_sku UNIQUE(company_id, sku)
);


-- Product variants
DROP TABLE IF EXISTS product_variants CASCADE;
CREATE TABLE product_variants (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_name VARCHAR(255) NOT NULL,
  sku VARCHAR(100),
  price_adjustment NUMERIC(12, 2) DEFAULT 0,
  stock_quantity INTEGER DEFAULT 0 CHECK (stock_quantity >= 0),
  is_active BOOLEAN DEFAULT TRUE,
  custom_attributes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT check_variant_name CHECK (LENGTH(TRIM(variant_name)) > 0),
  CONSTRAINT unique_variant_sku UNIQUE(sku)
);

-- Price lists (for different customer segments)
CREATE TABLE price_lists (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT check_price_list_name CHECK (LENGTH(TRIM(name)) > 0),
  CONSTRAINT unique_company_price_list UNIQUE(company_id, name)
);


-- Price list items (custom pricing per product)
DROP TABLE IF EXISTS price_list_items CASCADE;
CREATE TABLE price_list_items (
  id SERIAL PRIMARY KEY,
  price_list_id INTEGER NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  custom_price NUMERIC(12, 2) NOT NULL CHECK (custom_price >= 0),
  discount_percent NUMERIC(5, 2) DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT unique_price_list_product UNIQUE(price_list_id, product_id)
);

-- Quote/Proposal Generator
DROP TABLE IF EXISTS quotes CASCADE;
CREATE TABLE quotes (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  quote_number VARCHAR(100) UNIQUE NOT NULL,
  title VARCHAR(500),
  description TEXT,
  valid_until DATE NOT NULL,
  discount_type VARCHAR(20) DEFAULT 'percentage' CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value NUMERIC(12, 2) DEFAULT 0 CHECK (discount_value >= 0),
  tax_rate NUMERIC(5, 2) DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  notes TEXT,
  terms TEXT,
  subtotal NUMERIC(12, 2) DEFAULT 0 CHECK (subtotal >= 0),
  discount_amount NUMERIC(12, 2) DEFAULT 0 CHECK (discount_amount >= 0),
  tax_amount NUMERIC(12, 2) DEFAULT 0 CHECK (tax_amount >= 0),
  total NUMERIC(12, 2) DEFAULT 0 CHECK (total >= 0),
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired')),
  sent_at TIMESTAMP WITH TIME ZONE,
  viewed_at TIMESTAMP WITH TIME ZONE,
  accepted_at TIMESTAMP WITH TIME ZONE,
  rejected_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT check_quote_number CHECK (LENGTH(TRIM(quote_number)) > 0),
  CONSTRAINT check_valid_until CHECK (valid_until >= CURRENT_DATE)
);

-- Quote line items
DROP TABLE IF EXISTS quote_items CASCADE;
CREATE TABLE quote_items (
  id SERIAL PRIMARY KEY,
  quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  variant_id INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
  product_name VARCHAR(500) NOT NULL,
  description TEXT,
  quantity NUMERIC(10, 2) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
  line_total NUMERIC(12, 2) NOT NULL CHECK (line_total >= 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT check_product_name_item CHECK (LENGTH(TRIM(product_name)) > 0)
);

-- Quote templates (for quick quote creation)
CREATE TABLE IF NOT EXISTS quote_templates (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  template_name VARCHAR(255) NOT NULL,
  template_type VARCHAR(50), -- 'standard', 'premium', 'enterprise'
  description TEXT,
  default_items JSONB DEFAULT '[]'::jsonb,
  default_terms TEXT,
  default_payment_terms VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE,
  created_by INTEGER REFERENCES human_agents(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- Meeting reminders
DROP TABLE IF EXISTS meeting_reminders CASCADE;
CREATE TABLE meeting_reminders (
  id SERIAL PRIMARY KEY,
  meeting_id INTEGER NOT NULL REFERENCES scheduled_meetings(id) ON DELETE CASCADE,
  reminder_type VARCHAR(20) NOT NULL CHECK (reminder_type IN ('email', 'sms', 'whatsapp', 'push')),
  minutes_before INTEGER NOT NULL CHECK (minutes_before > 0),
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Inventory logs (for tracking stock changes)
DROP TABLE IF EXISTS inventory_logs CASCADE;
CREATE TABLE inventory_logs (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id INTEGER REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity_change INTEGER NOT NULL,
  operation VARCHAR(20) NOT NULL CHECK (operation IN ('add', 'subtract', 'set', 'adjustment')),
  reason TEXT,
  performed_by INTEGER REFERENCES human_agents(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);


-- ============================================
-- SMS TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS sms_configs (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL DEFAULT 'twilio',
  account_sid VARCHAR(255) NOT NULL,
  auth_token TEXT NOT NULL,
  phone_number VARCHAR(20) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  daily_limit INTEGER DEFAULT 1000,
  messages_sent_today INTEGER DEFAULT 0,
  last_reset_at DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, phone_number)
);

CREATE TABLE IF NOT EXISTS sms_messages (
  id SERIAL PRIMARY KEY,
  sms_config_id INTEGER NOT NULL REFERENCES sms_configs(id) ON DELETE CASCADE,
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_number VARCHAR(20) NOT NULL,
  to_number VARCHAR(20) NOT NULL,
  message_body TEXT NOT NULL,
  message_sid VARCHAR(255) UNIQUE,
  status VARCHAR(20) DEFAULT 'sent',
  error_code VARCHAR(10),
  error_message TEXT,
  segments INTEGER DEFAULT 1,
  cost DECIMAL(10,4),
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  failed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sms_templates (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  template_name VARCHAR(255) NOT NULL,
  template_type VARCHAR(50) NOT NULL,
  message_body TEXT NOT NULL,
  variables TEXT[],
  character_count INTEGER,
  estimated_segments INTEGER,
  is_active BOOLEAN DEFAULT true,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sms_campaigns (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  campaign_name VARCHAR(255) NOT NULL,
  template_id INTEGER REFERENCES sms_templates(id),
  target_audience JSONB DEFAULT '{}',
  scheduled_for TIMESTAMP,
  status VARCHAR(20) DEFAULT 'draft',
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  total_cost DECIMAL(10,2) DEFAULT 0,
  created_by INTEGER REFERENCES human_agents(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sms_campaign_recipients (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES sms_campaigns(id) ON DELETE CASCADE,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) NOT NULL,
  personalized_message TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  message_sid VARCHAR(255),
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  failed_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(campaign_id, lead_id)
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone_number);
CREATE INDEX IF NOT EXISTS idx_leads_company ON leads(company_id);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(lead_source);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(lead_status);
CREATE INDEX IF NOT EXISTS idx_leads_location ON leads(location);
CREATE INDEX IF NOT EXISTS idx_leads_chess_rating ON leads(chess_rating);
CREATE INDEX IF NOT EXISTS idx_leads_language ON leads(preferred_language); 

CREATE INDEX idx_leads_last_contacted ON leads(last_contacted DESC);
CREATE INDEX idx_conversations_phone ON conversations(phone_number);

CREATE INDEX idx_oauth_credentials_company ON oauth_credentials(company_id, platform);
CREATE INDEX idx_lead_source_configs_company ON lead_source_configs(company_id, platform);
CREATE INDEX idx_lead_import_logs_company ON lead_import_logs(company_id, created_at DESC);
CREATE INDEX idx_lead_import_logs_status ON lead_import_logs(status, created_at DESC);

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

CREATE INDEX IF NOT EXISTS idx_call_logs_company ON call_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_lead ON call_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_call_sid ON call_logs(call_sid);
CREATE INDEX IF NOT EXISTS idx_call_logs_status ON call_logs(call_status);

CREATE INDEX IF NOT EXISTS idx_scheduled_calls_company ON scheduled_calls(company_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_calls_status ON scheduled_calls(status, scheduled_time);

CREATE INDEX IF NOT EXISTS idx_agent_configs_company ON agent_configs(company_id);

CREATE INDEX IF NOT EXISTS idx_agent_instances_company ON agent_instances(company_id);
CREATE INDEX IF NOT EXISTS idx_agent_instances_phone ON agent_instances(phone_number);
CREATE INDEX IF NOT EXISTS idx_agent_instances_twilio_phone ON agent_instances(phone_number);

CREATE INDEX IF NOT EXISTS idx_agent_instances_type ON agent_instances(agent_type);

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

CREATE INDEX IF NOT EXISTS idx_takeover_requests_status ON takeover_requests(status, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_takeover_requests_agent ON takeover_requests(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_human_agents_status ON human_agents(status, assigned_leads);
CREATE INDEX IF NOT EXISTS idx_human_sessions_agent ON human_sessions(agent_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_custom_field_defs_company ON custom_field_definitions(company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_custom_field_defs_agent ON custom_field_definitions(agent_instance_id);
CREATE INDEX IF NOT EXISTS idx_lead_custom_data_lead ON lead_custom_data(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_custom_data_field ON lead_custom_data(field_key);
CREATE INDEX IF NOT EXISTS idx_lead_custom_data_normalized ON lead_custom_data(field_value_normalized);

CREATE INDEX IF NOT EXISTS idx_call_logs_in_progress ON call_logs(call_sid, call_status) WHERE call_status = 'in-progress';

CREATE INDEX IF NOT EXISTS idx_conversation_history ON call_logs USING GIN (conversation_history);

CREATE INDEX IF NOT EXISTS idx_agent_instances_whatsapp_number ON agent_instances(whatsapp_number);

CREATE INDEX IF NOT EXISTS idx_agent_instances_webhook_token ON agent_instances(webhook_verify_token);

CREATE INDEX IF NOT EXISTS idx_lead_source_configs_company ON lead_source_configs(company_id, platform);
CREATE INDEX IF NOT EXISTS idx_lead_source_configs_webhook ON lead_source_configs(webhook_url);

CREATE INDEX idx_email_configs_company ON email_configs(company_id, is_active);
CREATE INDEX idx_email_scan_logs_company ON email_scan_logs(company_id, created_at DESC);
CREATE INDEX idx_email_scan_logs_status ON email_scan_logs(status, created_at DESC);
CREATE INDEX idx_email_scan_logs_lead ON email_scan_logs(lead_id);

CREATE INDEX IF NOT EXISTS idx_email_configs_company ON email_configs(company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_email_configs_scan ON email_configs(is_active, last_scan_at);
CREATE INDEX IF NOT EXISTS idx_email_scan_logs_company ON email_scan_logs(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_scan_logs_status ON email_scan_logs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_scan_logs_lead ON email_scan_logs(lead_id);

CREATE INDEX idx_calendar_configs_company ON calendar_configs(company_id, is_active);
CREATE INDEX idx_calendar_events_lead ON calendar_events(lead_id);
CREATE INDEX idx_calendar_events_booking ON calendar_events(booking_id);
CREATE INDEX idx_calendar_events_time ON calendar_events(start_time, end_time);

CREATE INDEX IF NOT EXISTS idx_calendar_configs_company_active ON calendar_configs(company_id, is_active) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_calendar_events_start_time ON calendar_events(start_time) WHERE status = 'confirmed';

CREATE INDEX idx_routing_rules_company ON routing_rules(company_id, is_active);
CREATE INDEX idx_routing_rules_priority ON routing_rules(priority DESC);
CREATE INDEX idx_tasks_agent ON tasks(assigned_to_agent_id, status);
CREATE INDEX idx_tasks_lead ON tasks(lead_id);
CREATE INDEX idx_tasks_due_date ON tasks(due_date) WHERE status NOT IN ('completed', 'cancelled');
CREATE INDEX idx_tasks_priority ON tasks(priority, due_date);

CREATE INDEX IF NOT EXISTS idx_audit_logs_lead ON audit_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_call_logs_transcript_fts ON call_logs USING GIN (to_tsvector('english', transcript));

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_fts ON whatsapp_messages USING GIN (to_tsvector('english', message_body));

CREATE INDEX IF NOT EXISTS idx_lead_import_logs_created ON lead_import_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_import_logs_platform_status ON lead_import_logs(platform, status);

CREATE INDEX idx_drip_campaigns_company ON drip_campaigns(company_id, is_active);
CREATE INDEX idx_drip_campaign_steps_campaign ON drip_campaign_steps(campaign_id, step_number);
CREATE INDEX idx_drip_subscribers_campaign ON drip_campaign_subscribers(campaign_id, status);
CREATE INDEX idx_drip_subscribers_lead ON drip_campaign_subscribers(lead_id);
CREATE INDEX idx_drip_executions_subscriber ON drip_step_executions(subscriber_id, status);
CREATE INDEX idx_drip_executions_scheduled ON drip_step_executions(scheduled_for) WHERE status = 'pending';
CREATE INDEX idx_unsubscribes_lead ON unsubscribes(lead_id, unsubscribe_type);
CREATE INDEX idx_campaign_performance_campaign ON campaign_performance(campaign_id, date);
CREATE INDEX IF NOT EXISTS idx_drip_subscribers_campaign_lead ON drip_campaign_subscribers(campaign_id, lead_id);
CREATE INDEX IF NOT EXISTS idx_drip_subscribers_status ON drip_campaign_subscribers(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_drip_campaigns_company_id ON drip_campaigns(company_id);
CREATE INDEX IF NOT EXISTS idx_drip_campaigns_active ON drip_campaigns(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_drip_executions_subscriber ON drip_campaign_executions(subscriber_id);

CREATE INDEX idx_scheduled_reports_company ON scheduled_reports(company_id, is_active);
CREATE INDEX idx_scheduled_reports_next_delivery ON scheduled_reports(next_delivery) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_invoices_phonepe_txn ON invoices(phonepe_transaction_id);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date) WHERE status = 'pending';

CREATE INDEX idx_subscriptions_lead ON lead_subscriptions(lead_id);
CREATE INDEX idx_subscriptions_status ON lead_subscriptions(status);
CREATE INDEX idx_subscriptions_end_date ON lead_subscriptions(end_date) WHERE status = 'active';
CREATE INDEX idx_subscriptions_renewal ON lead_subscriptions(end_date, renewal_reminder_sent) WHERE status = 'active' AND renewal_reminder_sent = FALSE;

CREATE INDEX idx_payment_txn_invoice ON payment_transactions(invoice_id);
CREATE INDEX idx_payment_txn_merchant ON payment_transactions(merchant_transaction_id);
CREATE INDEX idx_payment_txn_phonepe ON payment_transactions(phonepe_transaction_id);
CREATE INDEX idx_payment_txn_status ON payment_transactions(status);

CREATE INDEX idx_reminders_invoice ON invoice_reminders(invoice_id);
CREATE INDEX idx_reminders_date ON invoice_reminders(reminder_date DESC);

CREATE INDEX idx_accounting_sync_invoice ON accounting_sync_log(invoice_id);
CREATE INDEX idx_accounting_sync_system ON accounting_sync_log(accounting_system, sync_status);

CREATE INDEX idx_payment_history_invoice ON payment_history(invoice_id);

CREATE INDEX idx_refunds_invoice ON refunds(invoice_id);
CREATE INDEX idx_refunds_status ON refunds(status);

CREATE INDEX idx_company_usage_company ON company_usage(company_id);
CREATE INDEX idx_company_usage_period ON company_usage(period_start, period_end);

CREATE INDEX idx_usage_events_company ON usage_events(company_id);
CREATE INDEX idx_usage_events_type ON usage_events(event_type);
CREATE INDEX idx_usage_events_created ON usage_events(created_at);

CREATE INDEX idx_bulk_jobs_company ON bulk_message_jobs(company_id, status);
CREATE INDEX idx_bulk_jobs_scheduled ON bulk_message_jobs(scheduled_time) WHERE status = 'scheduled';

CREATE INDEX idx_call_queue_company ON call_queue(company_id, status);
CREATE INDEX idx_call_queue_scheduled ON call_queue(scheduled_time, status) WHERE status IN ('pending', 'in_progress');
CREATE INDEX idx_call_queue_priority ON call_queue(priority DESC, scheduled_time ASC) WHERE status = 'pending';

CREATE INDEX idx_conference_calls_company ON conference_calls(company_id, status);
CREATE INDEX idx_conference_participants_conference ON conference_participants(conference_id);

CREATE INDEX idx_calendar_conflicts_unresolved ON calendar_conflicts(calendar_config_id, resolved) WHERE resolved = FALSE;

CREATE INDEX idx_call_logs_cloud_pending ON call_logs(id) WHERE recording_url IS NOT NULL AND uploaded_to_cloud = FALSE;

CREATE INDEX idx_team_chat_company ON team_chat_messages(company_id, created_at DESC);
CREATE INDEX idx_team_chat_lead ON team_chat_messages(lead_id, created_at DESC);
CREATE INDEX idx_shared_notes_lead ON shared_notes(lead_id, is_pinned DESC);
CREATE INDEX idx_activity_feed_lead ON activity_feed(lead_id, created_at DESC);
CREATE INDEX idx_activity_feed_company ON activity_feed(company_id, created_at DESC);

CREATE INDEX idx_mobile_devices_agent ON mobile_devices(agent_id, is_active);
CREATE INDEX idx_push_notifications_agent ON push_notifications(agent_id, status);

CREATE INDEX idx_ip_whitelist_company ON ip_whitelist(company_id, is_active);
CREATE INDEX idx_2fa_agent ON two_factor_auth(agent_id, is_enabled);

CREATE INDEX idx_sms_messages_lead ON sms_messages(lead_id, created_at DESC);
CREATE INDEX idx_web_chat_sessions_company ON web_chat_sessions(company_id, status);
CREATE INDEX idx_web_chat_messages_session ON web_chat_messages(session_id, created_at ASC);
CREATE INDEX idx_social_accounts_company ON social_media_accounts(company_id, is_active);
CREATE INDEX idx_social_messages_account ON social_media_messages(account_id, created_at DESC);

CREATE INDEX idx_agent_shifts_agent ON agent_shifts(agent_id, shift_date);
CREATE INDEX idx_agent_shifts_date ON agent_shifts(shift_date, status);
CREATE INDEX idx_time_off_requests_agent ON time_off_requests(agent_id, status);
CREATE INDEX idx_agent_breaks_agent ON agent_breaks(agent_id, started_at DESC);


-- CREATE INDEX idx_documents_company ON documents(company_id) WHERE is_deleted = FALSE;
-- CREATE INDEX idx_documents_lead ON documents(lead_id) WHERE is_deleted = FALSE;
-- CREATE INDEX idx_documents_folder ON documents(folder_id);
-- CREATE INDEX idx_documents_tags ON documents USING GIN(tags);
-- CREATE INDEX idx_documents_type ON documents(document_type) WHERE is_deleted = FALSE;
-- CREATE INDEX idx_documents_deleted ON documents(is_deleted, deleted_at);


CREATE INDEX idx_scheduling_links_slug ON scheduling_links(link_slug) WHERE is_active = TRUE;
CREATE INDEX idx_scheduling_links_company ON scheduling_links(company_id, is_active);
CREATE INDEX idx_scheduling_links_agent ON scheduling_links(agent_id, is_active);
CREATE INDEX idx_scheduled_meetings_link ON scheduled_meetings(scheduling_link_id, status);
CREATE INDEX idx_scheduled_meetings_lead ON scheduled_meetings(lead_id);
CREATE INDEX idx_scheduled_meetings_time ON scheduled_meetings(status, scheduled_time);
CREATE INDEX idx_scheduled_meetings_status ON scheduled_meetings(status, scheduled_time);
CREATE INDEX idx_scheduled_meetings_confirmation ON scheduled_meetings(confirmation_code);

CREATE INDEX idx_meeting_reminders_meeting ON meeting_reminders(meeting_id);
CREATE INDEX idx_meeting_reminders_status ON meeting_reminders(status, sent_at);

CREATE INDEX idx_products_company ON products(company_id, is_active);
CREATE INDEX idx_products_category ON products(category) WHERE is_active = TRUE;
CREATE INDEX idx_products_code ON products(product_code);
CREATE INDEX idx_product_variants_product ON product_variants(product_id, is_active);
CREATE INDEX idx_product_variants_sku ON product_variants(sku);
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_active ON products(is_active);
CREATE INDEX idx_products_stock ON products(stock_quantity) WHERE track_inventory = TRUE;

CREATE INDEX idx_products_fts ON products USING GIN (
  to_tsvector('english', 
    name || ' ' || 
    COALESCE(description, '') || ' ' || 
    COALESCE(sku, '')
  )
) WHERE is_active = TRUE;

-- Full-text search for products
CREATE INDEX idx_products_fts ON products USING GIN (
  to_tsvector('english', product_name || ' ' || COALESCE(description, '') || ' ' || COALESCE(product_code, ''))
);

CREATE INDEX idx_quotes_company ON quotes(company_id, status);
CREATE INDEX idx_quotes_lead ON quotes(lead_id);
CREATE INDEX idx_quotes_number ON quotes(quote_number);
CREATE INDEX idx_quotes_status ON quotes(status);
CREATE INDEX idx_quotes_valid ON quotes(valid_until) WHERE status IN ('sent', 'viewed');
CREATE INDEX idx_quote_items_quote ON quote_items(quote_id);
CREATE INDEX idx_quote_items_product ON quote_items(product_id);

CREATE INDEX idx_folders_company ON document_folders(company_id);
CREATE INDEX idx_folders_parent ON document_folders(parent_folder_id);

CREATE INDEX idx_documents_company ON documents(company_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_documents_lead ON documents(lead_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_documents_folder ON documents(folder_id);
CREATE INDEX idx_documents_tags ON documents USING GIN(tags);
CREATE INDEX idx_documents_type ON documents(document_type) WHERE is_deleted = FALSE;
CREATE INDEX idx_documents_deleted ON documents(is_deleted, deleted_at);

CREATE INDEX idx_documents_fts ON documents USING GIN (
  to_tsvector('english', 
    document_name || ' ' || 
    COALESCE(description, '') || ' ' || 
    COALESCE(array_to_string(tags, ' '), '')
  )
) WHERE is_deleted = FALSE;

-- Full-text search for documents
CREATE INDEX idx_documents_fts ON documents USING GIN (to_tsvector('english', document_name || ' ' || COALESCE(description, '')));

-- Full-text search for products
CREATE INDEX idx_products_fts ON products USING GIN (to_tsvector('english', product_name || ' ' || COALESCE(description, '') || ' ' || COALESCE(product_code, '')));

CREATE INDEX idx_document_shares_document ON document_shares(document_id);
CREATE INDEX idx_document_shares_agent ON document_shares(shared_with_agent_id);

CREATE INDEX idx_document_access_logs_document ON document_access_logs(document_id, accessed_at DESC);
CREATE INDEX idx_document_access_logs_agent ON document_access_logs(accessed_by, accessed_at DESC);

CREATE INDEX idx_price_lists_company ON price_lists(company_id);
CREATE UNIQUE INDEX idx_price_lists_default ON price_lists(company_id) WHERE is_default = TRUE;

CREATE INDEX idx_price_list_items_list ON price_list_items(price_list_id);
CREATE INDEX idx_price_list_items_product ON price_list_items(product_id);

CREATE INDEX idx_inventory_logs_product ON inventory_logs(product_id, created_at DESC);
CREATE INDEX idx_inventory_logs_created ON inventory_logs(created_at DESC);

CREATE INDEX idx_quote_templates_company ON quote_templates(company_id, is_active);

CREATE INDEX idx_document_versions_document ON document_versions(document_id, version DESC);

CREATE INDEX idx_document_shares_document ON document_shares(document_id);
CREATE INDEX idx_document_shares_agent ON document_shares(shared_with_agent_id);

CREATE INDEX idx_meeting_reminders_meeting ON meeting_reminders(meeting_id, status);
CREATE INDEX idx_meeting_reminders_scheduled ON meeting_reminders(scheduled_for, status) WHERE status = 'pending';

-- Email indexes
CREATE INDEX IF NOT EXISTS idx_email_messages_lead_id ON email_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_received_at ON email_messages(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_scan_logs_config_id ON email_scan_logs(email_config_id);

-- SMS indexes
CREATE INDEX IF NOT EXISTS idx_sms_messages_lead_id ON sms_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_created_at ON sms_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_campaign_recipients_status ON sms_campaign_recipients(status) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_sms_configs_company_id ON sms_configs(company_id);
CREATE INDEX IF NOT EXISTS idx_sms_configs_active ON sms_configs(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_sms_messages_direction ON sms_messages(direction);
CREATE INDEX IF NOT EXISTS idx_sms_campaigns_status ON sms_campaigns(status);

CREATE INDEX IF NOT EXISTS idx_leads_phone_number ON leads(phone_number);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_company_id ON leads(company_id);
CREATE INDEX IF NOT EXISTS idx_leads_lead_status ON leads(lead_status);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_company ON users(company_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at);


-- ============================================
-- TRIGGERS FOR AUTOMATIC TIMESTAMPS
-- ============================================

-- ============================================
-- MISSING: FUNCTIONS FOR AUTOMATION
-- ============================================

-- Function to reset daily SMS limits
CREATE OR REPLACE FUNCTION reset_daily_sms_limits()
RETURNS void AS $$
BEGIN
  UPDATE sms_configs
  SET 
    messages_sent_today = 0,
    last_reset_at = CURRENT_DATE
  WHERE last_reset_at < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

-- Function to update campaign analytics
CREATE OR REPLACE FUNCTION update_drip_campaign_analytics()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    INSERT INTO drip_campaign_analytics (
      campaign_id, date,
      enrolled_count, active_count, completed_count, unsubscribed_count
    )
    SELECT 
      campaign_id,
      CURRENT_DATE,
      COUNT(*) FILTER (WHERE enrolled_at::date = CURRENT_DATE),
      COUNT(*) FILTER (WHERE status = 'active'),
      COUNT(*) FILTER (WHERE status = 'completed'),
      COUNT(*) FILTER (WHERE status = 'unsubscribed')
    FROM drip_campaign_subscribers
    WHERE campaign_id = NEW.campaign_id
    GROUP BY campaign_id
    ON CONFLICT (campaign_id, date) DO UPDATE
    SET
      enrolled_count = EXCLUDED.enrolled_count,
      active_count = EXCLUDED.active_count,
      completed_count = EXCLUDED.completed_count,
      unsubscribed_count = EXCLUDED.unsubscribed_count;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_campaign_analytics_trigger
AFTER INSERT OR UPDATE ON drip_campaign_subscribers
FOR EACH ROW
EXECUTE FUNCTION update_drip_campaign_analytics();

-- Create update timestamp function
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- AUTO-UPDATE TIMESTAMPS TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS void AS $$
BEGIN
    DELETE FROM refresh_tokens WHERE expires_at < CURRENT_TIMESTAMP;
    DELETE FROM users WHERE email_verification_expires < CURRENT_TIMESTAMP AND email_verified = FALSE;
    DELETE FROM users WHERE password_reset_expires < CURRENT_TIMESTAMP AND password_reset_token IS NOT NULL;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to all tables with updated_at
DROP TRIGGER IF EXISTS update_leads_timestamp ON leads;
CREATE TRIGGER update_leads_timestamp BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_oauth_credentials_timestamp ON oauth_credentials;
CREATE TRIGGER update_oauth_credentials_timestamp BEFORE UPDATE ON oauth_credentials FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_lead_source_configs_timestamp ON lead_source_configs;
CREATE TRIGGER update_lead_source_configs_timestamp BEFORE UPDATE ON lead_source_configs FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_conversations_timestamp ON conversations;
CREATE TRIGGER update_conversations_timestamp BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_invoices_timestamp ON invoices;
CREATE TRIGGER update_invoices_timestamp BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_bookings_timestamp ON bookings;
CREATE TRIGGER update_bookings_timestamp BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_faq_templates_timestamp ON faq_templates;
CREATE TRIGGER update_faq_templates_timestamp BEFORE UPDATE ON faq_templates FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_whatsapp_templates_timestamp ON whatsapp_templates;
CREATE TRIGGER update_whatsapp_templates_timestamp BEFORE UPDATE ON whatsapp_templates FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_agents_timestamp ON agents;
CREATE TRIGGER update_agents_timestamp BEFORE UPDATE ON agents FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_scheduled_calls_timestamp ON scheduled_calls;
CREATE TRIGGER update_scheduled_calls_timestamp BEFORE UPDATE ON scheduled_calls FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_call_logs_timestamp ON call_logs;
CREATE TRIGGER update_call_logs_timestamp BEFORE UPDATE ON call_logs FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_agent_configs_timestamp ON agent_configs;
CREATE TRIGGER update_agent_configs_timestamp BEFORE UPDATE ON agent_configs FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_agent_instances_timestamp ON agent_instances;
CREATE TRIGGER update_agent_instances_timestamp BEFORE UPDATE ON agent_instances FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_system_notifications_timestamp ON system_notifications;
CREATE TRIGGER update_system_notifications_timestamp BEFORE UPDATE ON system_notifications FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_human_agents_timestamp ON human_agents;
CREATE TRIGGER update_human_agents_timestamp BEFORE UPDATE ON human_agents FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_takeover_requests_timestamp ON takeover_requests;
CREATE TRIGGER update_takeover_requests_timestamp BEFORE UPDATE ON takeover_requests FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_custom_field_definitions_timestamp ON custom_field_definitions;
CREATE TRIGGER update_custom_field_definitions_timestamp BEFORE UPDATE ON custom_field_definitions FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_lead_custom_data_timestamp ON lead_custom_data;
CREATE TRIGGER update_lead_custom_data_timestamp BEFORE UPDATE ON lead_custom_data FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_notifications_timestamp ON notifications;
CREATE TRIGGER update_notifications_timestamp BEFORE UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_email_configs_timestamp ON email_configs;
CREATE TRIGGER update_email_configs_timestamp BEFORE UPDATE ON email_configs FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_email_configs_timestamp ON email_configs;
CREATE TRIGGER update_email_configs_timestamp BEFORE UPDATE ON email_configs FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_calendar_configs_timestamp ON calendar_configs;
CREATE TRIGGER update_calendar_configs_timestamp BEFORE UPDATE ON calendar_configs FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_calendar_events_timestamp ON calendar_events;
CREATE TRIGGER update_calendar_events_timestamp BEFORE UPDATE ON calendar_events FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_routing_rules_timestamp ON routing_rules;
CREATE TRIGGER update_routing_rules_timestamp BEFORE UPDATE ON routing_rules FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_tasks_timestamp ON tasks;
CREATE TRIGGER update_tasks_timestamp BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_drip_campaigns_timestamp ON drip_campaigns;
CREATE TRIGGER update_drip_campaigns_timestamp BEFORE UPDATE ON drip_campaigns FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_drip_campaign_steps_timestamp ON drip_campaign_steps;
CREATE TRIGGER update_drip_campaign_steps_timestamp BEFORE UPDATE ON drip_campaign_steps FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_drip_subscribers_timestamp ON drip_campaign_subscribers;
CREATE TRIGGER update_drip_subscribers_timestamp BEFORE UPDATE ON drip_campaign_subscribers FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_drip_executions_timestamp ON drip_step_executions;
CREATE TRIGGER update_drip_executions_timestamp BEFORE UPDATE ON drip_step_executions FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_campaign_performance_timestamp ON campaign_performance;
CREATE TRIGGER update_campaign_performance_timestamp BEFORE UPDATE ON campaign_performance FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_scheduled_reports_timestamp ON scheduled_reports;
CREATE TRIGGER update_scheduled_reports_timestamp BEFORE UPDATE ON scheduled_reports FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_subscriptions_timestamp ON lead_subscriptions;
CREATE TRIGGER update_subscriptions_timestamp BEFORE UPDATE ON lead_subscriptions FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_payment_transactions_timestamp ON payment_transactions;
CREATE TRIGGER update_payment_transactions_timestamp BEFORE UPDATE ON payment_transactions FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_bulk_jobs_timestamp ON bulk_message_jobs;
CREATE TRIGGER update_bulk_jobs_timestamp BEFORE UPDATE ON bulk_message_jobs FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_call_queue_timestamp ON call_queue;
CREATE TRIGGER update_call_queue_timestamp BEFORE UPDATE ON call_queue FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_cloud_storage_timestamp ON cloud_storage_configs;
CREATE TRIGGER update_cloud_storage_timestamp BEFORE UPDATE ON cloud_storage_configs FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_retention_policies_timestamp ON data_retention_policies;
CREATE TRIGGER update_retention_policies_timestamp BEFORE UPDATE ON data_retention_policies FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_social_accounts_timestamp ON social_media_accounts;
CREATE TRIGGER update_social_accounts_timestamp BEFORE UPDATE ON social_media_accounts FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_agent_shifts_timestamp ON agent_shifts;
CREATE TRIGGER update_agent_shifts_timestamp BEFORE UPDATE ON agent_shifts FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_document_folders_timestamp ON document_folders;
CREATE TRIGGER update_document_folders_timestamp BEFORE UPDATE ON document_folders FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_documents_timestamp ON documents;
CREATE TRIGGER update_documents_timestamp BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_scheduling_links_timestamp ON scheduling_links;
CREATE TRIGGER update_scheduling_links_timestamp BEFORE UPDATE ON scheduling_links FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_scheduled_meetings_timestamp ON scheduled_meetings;
CREATE TRIGGER update_scheduled_meetings_timestamp BEFORE UPDATE ON scheduled_meetings FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_products_timestamp ON products;
CREATE TRIGGER update_products_timestamp BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_quotes_timestamp ON quotes;
CREATE TRIGGER update_quotes_timestamp BEFORE UPDATE ON quotes FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_product_variants_timestamp ON product_variants;
CREATE TRIGGER update_product_variants_timestamp BEFORE UPDATE ON product_variants FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_price_lists_timestamp ON price_lists;
CREATE TRIGGER update_price_lists_timestamp BEFORE UPDATE ON price_lists FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_price_list_items_timestamp ON price_list_items;
CREATE TRIGGER update_price_list_items_timestamp BEFORE UPDATE ON price_list_items FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_quote_templates_timestamp ON quote_templates;
CREATE TRIGGER update_quote_templates_timestamp BEFORE UPDATE ON quote_templates FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_document_folders_updated BEFORE UPDATE ON document_foldersFOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_documents_updated BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_scheduling_links_updated BEFORE UPDATE ON scheduling_links
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_scheduled_meetings_updated BEFORE UPDATE ON scheduled_meetings FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_products_updated BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_product_variants_updated BEFORE UPDATE ON product_variants FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_price_lists_updated BEFORE UPDATE ON price_lists FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_price_list_items_updated BEFORE UPDATE ON price_list_items FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_quotes_updated BEFORE UPDATE ON quotes FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Create trigger for campaign analytics
DROP TRIGGER IF EXISTS update_campaign_analytics_trigger ON drip_campaign_subscribers;
CREATE TRIGGER update_campaign_analytics_trigger AFTER INSERT OR UPDATE ON drip_campaign_subscribers FOR EACH ROW EXECUTE FUNCTION update_drip_campaign_analytics();

-- Apply trigger to companies table
DROP TRIGGER IF EXISTS update_companies_updated_at ON companies;
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to users table
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================
-- SAMPLE DATA
-- ============================================

INSERT INTO faq_templates (question, answer, category, keywords, is_active) VALUES
  ('What is 4champz?', '4champz is Bangalore''s leading chess coaching platform connecting qualified coaches with schools for kids'' programs.', 'general', ARRAY['4champz', 'about'], TRUE),
  ('How much does coaching cost?', 'Coaching rates start at ₹500/hour based on your experience and location. Premium coaches earn more.', 'pricing', ARRAY['cost', 'price', 'rates', 'fees'], TRUE),
  ('What are the timings?', 'We typically offer sessions between 3-6 PM (school hours). Flexible schedules are available based on school needs.', 'timings', ARRAY['timing', 'hours', 'schedule', 'when'], TRUE),
  ('Do I need experience?', 'While experience is valued, enthusiasm matters most. We provide training and curriculum support for all coaches.', 'services', ARRAY['experience', 'training', 'qualification'], TRUE),
  ('How do I pay my invoice?', 'You can pay your invoice by clicking the payment link sent via WhatsApp or email. We accept all major payment methods through PhonePe.', 'payment', ARRAY['invoice', 'payment', 'pay'], 5),
  ('When is my subscription expiring?', 'You can check your subscription expiry date in your account dashboard or contact us directly.', 'subscription', ARRAY['subscription', 'expire', 'renewal'], 5),
  ('What happens if I miss a payment?', 'If a payment is missed, we will send you reminders via WhatsApp and email. Your service may be temporarily suspended if payment is not received within 14 days.', 'payment', ARRAY['payment', 'missed', 'late'], 4)
ON CONFLICT DO NOTHING;


INSERT INTO companies (name, phone_number) VALUES 
('4Champz Chess Coaching', '+19784045213')  
ON CONFLICT (phone_number) DO NOTHING;

INSERT INTO companies (name, phone_number) VALUES 
('MediShop Medical Supplies', '+19784045213')  
ON CONFLICT (phone_number) DO NOTHING;

INSERT INTO companies (name, phone_number) VALUES 
('City Hospital Bangalore', '+19784045213')  
ON CONFLICT (phone_number) DO NOTHING;


-- ============================================
-- SAMPLE DATA: 3 COMPANIES WITH FULL PROMPTS
-- ============================================

INSERT INTO companies (name, phone_number) VALUES 
('4Champz Chess Coaching', '+19784045213')  
ON CONFLICT (phone_number) DO NOTHING;

INSERT INTO agent_configs (company_id, prompt_key, prompt_preamble, initial_message, voice) VALUES 
(
  (SELECT id FROM companies WHERE phone_number = '+19784045213'),
  'chess_coach',
  $PROMPT$# Chess Coaching Sales Representative Prompt
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
2. For outbound: "Hello {{name}}, this is Priya from 4champz. I am reaching out due to your interest. Available to discuss?"
3. Follow with: "I would love to explore your background, answer FAQs like pricing or timings, or assist with reminders if applicable."

### FAQs Handling
- Pricing: "Our coaching fees start at ₹500/hour, varying by experience. Interested in details?"
- Timings: "Coaching is typically 3-6 PM school hours. Flexible options available—want to discuss?"
- Services: "We offer structured curricula, training, and school placements. More questions?"

### Current Involvement Assessment
- Location: "Could you confirm your current location in Bangalore?"
- Involvement: "Are you actively playing or coaching chess?"
- Availability: "What is your schedule like, especially afternoons?"

### Experience and Background Qualification
- Chess playing: "What is your FIDE or All India Chess Federation rating?"
- Tournaments: "Tell me about your recent tournament participation."
- Coaching: "Have you coached children before, especially in chess?"
- Education: "What are your educational qualifications or certifications?"

### School Coaching Interest
- Explain: "We provide coaches to schools across Bangalore with training support."
- Availability: "Are you free 3-6 PM? How many days weekly?"
- Age groups: "Comfortable with Classes 1-12? Any preferences?"
- Support: "We offer training. Interested in a structured curriculum?"

### Scheduling
- If interested: "Let us schedule a detailed discussion. When are you free this week?"
- Use check_calendar_availability and book_appointment.
- Confirm: "Please provide your full name, email, and preferred time."

### Close
- Positive: "Thank you, {{name}}. We will send details and a confirmation. Looking forward to it!"
- End with end_call unless transferred$PROMPT$,
  'Hello {{name}}, this is Priya from 4champz. I am reaching out due to your interest in chess coaching. Available to discuss?',
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
  $PROMPT$# Medical Sales Representative Prompt
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
- Use encouraging language when discussing potential solutions or partnerships

## Conversation Flow
### Introduction
1. For inbound: "Hello {{name}}, this is Sarah from MediShop. Do you have 5-10 minutes to discuss medical supply solutions for your practice?"
2. For outbound: "Hello {{name}}, this is Sarah from MediShop. I am reaching out due to your interest in medical supplies. Available to discuss?"
3. Follow with: "I would love to understand your current needs, answer FAQs like pricing or delivery, or assist with reminders if applicable."

### FAQs Handling
- Pricing: "Our medical supplies start at competitive rates, tailored to your needs. Interested in a detailed quote?"
- Delivery: "We offer same-day delivery in Bangalore for urgent orders. Want to discuss timelines?"
- Products: "We provide equipment, consumables, and maintenance services. Any specific needs?"

### Current Needs Assessment
- Location: "Could you confirm your clinic or hospital location in Bangalore?"
- Current Setup: "What medical supplies or equipment are you currently using?"
- Needs: "Are you looking for specific equipment, like diagnostic tools or consumables?"

### Qualification Questions
- Volume: "What is your typical monthly usage of medical consumables?"
- Budget: "Do you have a budget range for new equipment or supplies?"
- Decision Maker: "Are you the primary decision-maker for purchasing supplies?"
- Current Suppliers: "Who are your current suppliers, and any challenges with them?"

### Sales Opportunity Exploration
- Explain: "We offer tailored solutions for clinics and hospitals, with training and support."
- Customization: "Need specific equipment or bulk discounts? We can customize."
- Support: "We provide maintenance and training. Interested in learning more?"
- Partnerships: "Interested in a long-term partnership for consistent supply?"

### Scheduling
- If interested: "Let us schedule a detailed discussion or demo. When are you free this week?"
- Use check_calendar_availability and book_appointment.
- Confirm: "Please provide your full name, email, and preferred time."

### Close
- Positive: "Thank you, {{name}}. We will send details and a confirmation. Excited to assist!"
- End with end_call unless transferred

## Response Guidelines
- Handle FAQs before diving into qualification if asked
- Use IST timing for scheduling (e.g., today is 08:08 PM IST, Friday, September 26, 2025)
- Ask one question at a time to avoid overwhelming them
- Keep responses focused on qualifying their suitability for MediShop offerings
- Ask location-specific questions about Bangalore areas for delivery logistics
- Show enthusiasm for solving their supply chain challenges
- Be respectful of their busy schedules and operational constraints
- Emphasize the opportunity to enhance patient care with reliable supplies

## Scenario Handling
### Interested Leads
- Enthusiasm: "Your needs align perfectly with our offerings! Let us connect you with a sales rep."
- Route: Use transfer_call to sales rep.

### Support Queries
- Detect: If "support" or "help" in input, say "Let me route you to our support team."
- Route: Use transfer_call to support.

### Reminders
- Meeting: "This is a reminder for your demo on [date/time]. Ready to proceed?" (e.g., use current date + 1 day if unspecified)
- Payment: "This is a payment reminder for your invoice due by [date]. Settled?" (e.g., use current date + 1 day if unspecified)

### For High-Volume Buyers
- Express enthusiasm: "Your usage volume is impressive! We can offer tailored discounts."
- Fast-track process: "Given your needs, let us expedite a detailed quote. When is best?"
- Highlight premium offerings: "Our premium equipment and bulk deals could be ideal."

### For Small Clinics or New Buyers
- Explore potential: "Even small setups benefit from our flexible plans. Tell me about your needs."
- Support emphasis: "We provide training and support to ease transitions. Interested?"
- Alternative solutions: "Interested in starter kits or trial orders?"

### For Delivery or Logistics Concerns
- Flexible scheduling: "We can adjust delivery times to suit you. What works best?"
- Local support: "We have local teams in Bangalore. Which areas are you in?"
- Assurance: "Our logistics ensure timely delivery. Want to discuss specifics?"

### For Candidates Requesting Human Assistance
- If they want human help or details on contracts/partnerships:
  - Use transfer_call
  - Say: "Of course! Let me connect you with our sales manager for detailed discussions."

## Knowledge Base
### Caller Info
- name: {{name}}, email: {{email}}, phone_number: {{phone_number}}, role: {{role}}

### MediShop Model
- Leading medical supplies provider in Bengaluru, serving clinics and hospitals
- Offers equipment, consumables, maintenance, and training
- Focuses on reliable, high-quality supplies to improve patient care

### Requirements
- Clear understanding of current supply needs and budget
- Located in Bangalore with ability to receive deliveries
- Professional communication and decision-making authority

### Assessment Criteria
- Monthly supply volume and budget
- Current suppliers and satisfaction levels
- Specific equipment or consumable needs
- Decision-making role and authority
- Language capabilities (English/Kannada/Hindi)
- Delivery location and logistics preferences


## BOOKING CAPABILITIES:
- When the customer wants to book/schedule a session, ask for their preferred date and time
- Extract the date/time from their response (e.g., "tomorrow at 3pm", "Monday at 10am")
- Confirm the booking and let them know they''ll receive an email confirmation
- If their preferred time is not available, offer alternative time slots

## Response Refinement
- When discussing needs: "Your setup sounds interesting. Could you share more about [specific need]?"
- When explaining offerings: "Let me share how MediShop can streamline your supply chain..."
- When confirming details: "To confirm—your needs are [needs] and delivery is to [location]. Correct?"

## Call Management
### Available Functions
- check_calendar_availability: Use for scheduling follow-up meetings
- book_appointment: Use to confirm scheduled appointments
- transfer_call: Use when candidate requests human assistance
- end_call: Use to conclude every conversation

## Technical Considerations
- If calendar delays occur: "I am checking available slots. This will take a moment."
- If multiple scheduling needs: "Let us book your appointment first, then address other questions."
- Always confirm appointment details before ending: "To confirm, we are scheduled for [day], [date] at [time IST]. You will receive an email."

---
Your goal is to qualify leads for medical supply sales, ensure they understand MediShop value, and maintain a professional reputation. Prioritize accurate qualification, scheduling, and enthusiasm across all call types.$PROMPT$,
  'Hello {{name}}, this is Sarah from MediShop. I am reaching out due to your interest in medical supplies. Available to discuss?',
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
  $PROMPT$# Hospital Receptionist Prompt
## Identity & Purpose
You are Emma, a virtual receptionist for City Hospital, a premier healthcare facility in Bengaluru, India. We provide comprehensive medical services, including consultations, diagnostics, and surgeries, to patients across Bangalore.
Your primary purpose is to assist callers with scheduling appointments, answering general inquiries about hospital services, directing calls to appropriate departments, and handling FAQs for both inbound and outbound calls.

## Voice & Persona
### Personality
- Sound calm, professional, and empathetic—like a caring healthcare professional
- Project genuine interest in helping callers with their medical needs
- Maintain a patient and reassuring demeanor throughout the conversation
- Show respect for their urgency while addressing their inquiries efficiently
- Convey confidence in City Hospital ability to provide excellent care

### Speech Characteristics
- Use clear, soothing, and professional language with a supportive tone
- Keep messages under 150 characters when possible
- Include clarifying questions to understand their needs
- Show empathy for their health concerns or questions
- Use reassuring language when addressing inquiries or scheduling

## Conversation Flow
### Introduction
1. For inbound: "Hello {{name}}, this is Emma from City Hospital. How can I assist with your appointment or inquiry today?"
2. For outbound: "Hello {{name}}, this is Emma from City Hospital. I am following up on your inquiry. Available to discuss?"
3. Follow with: "I can help schedule appointments, answer questions about services, or connect you to a department."

### FAQs Handling
- Appointment Process: "Appointments can be booked online or by phone. Want to schedule one now?"
- Services: "We offer consultations, diagnostics, and surgeries. Need details on a specific service?"
- Visiting Hours: "Visiting hours are 10 AM–8 PM. Need directions or parking info?"

### Caller Needs Assessment
- Location: "Could you confirm if you are visiting our Bangalore branch?"
- Purpose: "Are you scheduling an appointment, seeking information, or needing support?"
- Urgency: "Is this an urgent medical need, or a routine visit?"

### Appointment Scheduling
- Department: "Which department or doctor would you like to see?"
- Availability: "When are you available for an appointment?"
- Details: "Please provide your full name, contact details, and preferred time."

### Inquiry Handling
- Explain: "City Hospital offers comprehensive care with top specialists."
- Specifics: "Need info on specific treatments, like cardiology or orthopedics?"
- Support: "I can connect you to our patient support team if needed."

### Scheduling
- If scheduling: "Let us book your appointment. When are you free this week?"
- Use check_calendar_availability and book_appointment.
- Confirm: "Please confirm your full name, email, and preferred time."

### Close
- Positive: "Thank you, {{name}}. Your appointment is confirmed, and details will be sent. Wishing you well!"
- End with end_call unless transferred

## Response Guidelines
- Handle FAQs before diving into scheduling or inquiries if asked
- Use IST timing for scheduling (e.g., today is 08:08 PM IST, Friday, September 26, 2025)
- Ask one question at a time to avoid overwhelming callers
- Keep responses focused on assisting with their immediate needs
- Ask location-specific questions about Bangalore for in-person visits
- Show empathy for health concerns and urgency
- Be respectful of their time and potential stress
- Emphasize City Hospital commitment to patient care

## Scenario Handling
### Urgent Medical Inquiries
- Urgency: "For emergencies, please visit our ER or call our hotline. Need directions?"
- Route: Use transfer_call to emergency department if urgent.

### Support Queries
- Detect: If "support" or "complaint" in input, say "Let me connect you to our patient support team."
- Route: Use transfer_call to support.

### Reminders
- Appointment: "This is a reminder for your appointment on [date/time]. Confirm or reschedule?" (e.g., use current date + 1 day if unspecified)
- Follow-up: "This is a follow-up for your recent inquiry. Ready to proceed?"

### For First-Time Patients
- Reassurance: "First visits are seamless with our support. Tell me about your needs."
- Guidance: "We will guide you through the process. Need help with registration?"
- Options: "Interested in a consultation or diagnostic services?"

### For Returning Patients
- History: "Welcome back! Have you visited us before for [specific service]?"
- Fast-track: "Le us quickly schedule your next appointment. When is convenient?"
- Loyalty: "As a returning patient, we prioritize your care. Any specific needs?"

### For Logistical Concerns
- Flexible scheduling: "We can adjust appointment times. What works for you?"
- Directions: "We are located in Bangalore. Need directions to our facility?"
- Transport: "Need help with parking or transport options?"

### For Callers Requesting Human Assistance
- If they want human help or detailed medical advice:
  - Use transfer_call
  - Say: "Let me connect you with our patient coordinator for further assistance."

## Knowledge Base
### Caller Info
- name: {{name}}, email: {{email}}, phone_number: {{phone_number}}, role: {{role}}

### City Hospital Model
- Premier healthcare facility in Bengaluru, offering consultations, diagnostics, and surgeries
- Partners with top specialists and provides patient support
- Focuses on accessible, high-quality healthcare

### Requirements
- Clear understanding of caller medical or appointment needs
- Located in or able to visit Bangalore
- Basic contact information for scheduling

### Assessment Criteria
- Purpose of call (appointment, inquiry, support)
- Preferred department or doctor
- Urgency of medical needs
- Contact details and availability
- Language capabilities (English/Kannada/Hindi)
- Accessibility to Bangalore facility


## BOOKING CAPABILITIES:
- When the customer wants to book/schedule a session, ask for their preferred date and time
- Extract the date/time from their response (e.g., "tomorrow at 3pm", "Monday at 10am")
- Confirm the booking and let them know they''ll receive an email confirmation
- If their preferred time is not available, offer alternative time slots

## Response Refinement
- When discussing needs: "I understand your concern. Could you share more about [specific need]?"
- When explaining services: "Let me explain how City Hospital can assist you..."
- When confirming details: "To confirm—your appointment is for [service] at [time]. Correct?"

## Call Management
### Available Functions
- check_calendar_availability: Use for scheduling appointments
- book_appointment: Use to confirm scheduled appointments
- transfer_call: Use when caller requests human assistance
- end_call: Use to conclude every conversation

## Technical Considerations
- If calendar delays occur: "I am checking available slots. This will take a moment."
- If multiple scheduling needs: "Let us book your appointment first, then address other questions."
- Always confirm appointment details before ending: "To confirm, we are scheduled for [day], [date] at [time IST]. You will receive an email."

---
Your goal is to assist callers efficiently, ensure they feel supported, and maintain City Hospitals reputation for excellent patient care. Prioritize accurate scheduling, empathy, and clear communication across all call types.$PROMPT$,
  'Hello {{name}}, this is Emma from City Hospital. I am following up on your inquiry. Available to discuss?',
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


INSERT INTO system_notifications (notification_type, title, message, priority) VALUES
('success', 'System Started', 'AI Calling System is now running', 'normal');


INSERT INTO analytics_events (event_name, event_properties) VALUES
('system_started', '{"version": "1.0.0", "environment": "production"}');


INSERT INTO human_agents (name, email, phone, role, expertise) VALUES
  ('Rahul Sharma', 'rahul@4champz.com', '+919876543210', 'senior_rep', ARRAY['high_value', 'angry_customer']),
  ('Priya Singh', 'priya@4champz.com', '+919876543211', 'sales_rep', ARRAY['general_sales', 'follow_up']),
  ('Amit Patel', 'amit@4champz.com', '+919876543212', 'specialist', ARRAY['technical', 'confused_customer'])
ON CONFLICT (email) DO NOTHING;


INSERT INTO extraction_templates (template_name, industry, description, field_definitions, is_system_template) VALUES
('Chess Coaching', 'sports_coaching', 'Fields for chess coaching recruitment', 
'{
  "fields": [
    {
      "field_key": "chess_rating",
      "field_label": "Chess Rating",
      "field_type": "number",
      "field_category": "qualification",
      "is_required": false,
      "validation_rules": {"min": 1000, "max": 3000},
      "extraction_config": {
        "keywords": ["rating", "elo", "fide", "score"],
        "regex": "\\\\b(\\\\d{3,4})\\\\b",
        "examples": ["My rating is 2400", "I have 1850 rating"]
      }
    },
    {
      "field_key": "location",
      "field_label": "Location",
      "field_type": "text",
      "field_category": "personal",
      "is_required": true,
      "extraction_config": {
        "keywords": ["location", "area", "place", "from", "staying in"],
        "predefined_values": ["bangalore", "btm", "jayanagar", "koramangala", "whitefield"],
        "examples": ["I am in BTM", "From Bangalore"]
      }
    },
    {
      "field_key": "coaching_experience",
      "field_label": "Coaching Experience",
      "field_type": "text",
      "field_category": "qualification",
      "extraction_config": {
        "regex": "\\\\b(\\\\d+)\\\\s*years?\\\\b",
        "keywords": ["experience", "taught", "coaching", "years"],
        "examples": ["5 years experience", "I have taught for 3 years"]
      }
    },
    {
      "field_key": "availability",
      "field_label": "Availability",
      "field_type": "select",
      "field_category": "preference",
      "extraction_config": {
        "keywords": ["available", "free", "timing", "schedule"],
        "predefined_values": ["weekdays", "weekends", "mornings", "evenings", "flexible"],
        "examples": ["Available on weekends", "Free in mornings"]
      }
    },
    {
      "field_key": "age_group_preference",
      "field_label": "Age Group Preference",
      "field_type": "text",
      "field_category": "preference",
      "extraction_config": {
        "regex": "\\\\b(\\\\d+)\\\\s*(?:to|-)\\\\s*(\\\\d+)\\\\s*(?:years|classes)?",
        "keywords": ["age group", "classes", "students"],
        "examples": ["10 to 15 years", "Classes 5-8"]
      }
    }
  ]
}', TRUE)
ON CONFLICT (template_name) DO NOTHING;


INSERT INTO extraction_templates (template_name, industry, description, field_definitions, is_system_template) VALUES
('Medical Appointments', 'healthcare', 'Fields for medical appointment booking', 
'{
  "fields": [
    {
      "field_key": "patient_age",
      "field_label": "Patient Age",
      "field_type": "number",
      "field_category": "personal",
      "is_required": true,
      "validation_rules": {"min": 0, "max": 120},
      "extraction_config": {
        "regex": "\\\\b(\\\\d{1,3})\\\\s*(?:years?|yr|y\\\\.o\\\\.)\\\\b",
        "keywords": ["age", "years old", "year old"],
        "examples": ["I am 45 years old", "Patient is 12"]
      }
    },
    {
      "field_key": "symptoms",
      "field_label": "Symptoms",
      "field_type": "text",
      "field_category": "medical",
      "is_required": true,
      "extraction_config": {
        "keywords": ["symptom", "feeling", "pain", "problem", "issue"],
        "examples": ["Having fever and headache", "Stomach pain"]
      }
    },
    {
      "field_key": "preferred_date",
      "field_label": "Preferred Appointment Date",
      "field_type": "date",
      "field_category": "preference",
      "extraction_config": {
        "keywords": ["tomorrow", "next week", "monday", "appointment"],
        "date_formats": ["tomorrow", "next week", "DD/MM/YYYY"],
        "examples": ["Tomorrow morning", "Next Monday"]
      }
    },
    {
      "field_key": "insurance_provider",
      "field_label": "Insurance Provider",
      "field_type": "text",
      "field_category": "personal",
      "extraction_config": {
        "keywords": ["insurance", "policy", "coverage"],
        "examples": ["I have Star Health insurance", "No insurance"]
      }
    },
    {
      "field_key": "doctor_preference",
      "field_label": "Doctor Preference",
      "field_type": "text",
      "field_category": "preference",
      "extraction_config": {
        "keywords": ["doctor", "specialist", "prefer"],
        "examples": ["I want to see Dr. Sharma", "Any cardiologist"]
      }
    }
  ]
}', TRUE)
ON CONFLICT (template_name) DO NOTHING;


INSERT INTO extraction_templates (template_name, industry, description, field_definitions, is_system_template) VALUES
('Real Estate', 'real_estate', 'Fields for real estate lead qualification', 
'{
  "fields": [
    {
      "field_key": "property_type",
      "field_label": "Property Type",
      "field_type": "select",
      "field_category": "preference",
      "is_required": true,
      "extraction_config": {
        "predefined_values": ["apartment", "villa", "plot", "commercial"],
        "keywords": ["property", "looking for", "want"],
        "examples": ["Looking for 2BHK apartment", "Want a villa"]
      }
    },
    {
      "field_key": "budget",
      "field_label": "Budget Range",
      "field_type": "text",
      "field_category": "qualification",
      "is_required": true,
      "extraction_config": {
        "regex": "\\\\b(\\\\d+)\\\\s*(?:lakhs?|crores?|L|Cr)\\\\b",
        "keywords": ["budget", "price", "afford"],
        "examples": ["Budget is 50 lakhs", "Around 1 crore"]
      }
    },
    {
      "field_key": "preferred_location",
      "field_label": "Preferred Location",
      "field_type": "text",
      "field_category": "preference",
      "is_required": true,
      "extraction_config": {
        "keywords": ["location", "area", "near"],
        "examples": ["Whitefield area", "Near Outer Ring Road"]
      }
    },
    {
      "field_key": "bedrooms",
      "field_label": "Number of Bedrooms",
      "field_type": "number",
      "field_category": "preference",
      "extraction_config": {
        "regex": "\\\\b(\\\\d)\\\\s*(?:BHK|bedroom|bed)\\\\b",
        "keywords": ["bhk", "bedroom"],
        "examples": ["2BHK", "3 bedroom flat"]
      }
    },
    {
      "field_key": "timeline",
      "field_label": "Purchase Timeline",
      "field_type": "select",
      "field_category": "qualification",
      "extraction_config": {
        "predefined_values": ["immediate", "1-3 months", "3-6 months", "6+ months"],
        "keywords": ["when", "timeline", "urgently"],
        "examples": ["Need immediately", "Planning in 2 months"]
      }
    }
  ]
}', TRUE)
ON CONFLICT (template_name) DO NOTHING;


INSERT INTO extraction_templates (template_name, industry, description, field_definitions, is_system_template) VALUES
('E-commerce Retail', 'retail', 'Fields for online retail lead capture', 
'{
  "fields": [
    {
      "field_key": "product_interest",
      "field_label": "Product Interest",
      "field_type": "text",
      "field_category": "preference",
      "is_required": true,
      "extraction_config": {
        "keywords": ["looking for", "want", "need", "interested in"],
        "examples": ["Looking for running shoes", "Need a laptop"]
      }
    },
    {
      "field_key": "size_preference",
      "field_label": "Size",
      "field_type": "text",
      "field_category": "personal",
      "extraction_config": {
        "keywords": ["size", "fit"],
        "examples": ["Size 10", "Medium size"]
      }
    },
    {
      "field_key": "budget_range",
      "field_label": "Budget",
      "field_type": "text",
      "field_category": "qualification",
      "extraction_config": {
        "regex": "\\\\b(?:Rs\\\\.?|₹)?\\\\s*(\\\\d+(?:,\\\\d+)*)\\\\b",
        "keywords": ["budget", "price", "spend"],
        "examples": ["Budget around Rs. 5000", "Under ₹10,000"]
      }
    },
    {
      "field_key": "delivery_address",
      "field_label": "Delivery Address",
      "field_type": "text",
      "field_category": "personal",
      "is_required": true,
      "extraction_config": {
        "keywords": ["address", "delivery", "ship to"],
        "examples": ["Deliver to BTM Layout", "Address: 123 Main St"]
      }
    }
  ]
}', TRUE)
ON CONFLICT (template_name) DO NOTHING;


INSERT INTO email_configs (company_id, email_address, provider, ai_rules) VALUES
(1, 'leads@4champz.com', 'gmail', '{
  "keywords": ["chess", "coaching", "interested", "inquiry"],
  "priority_keywords": ["urgent", "asap"],
  "exclude_keywords": ["newsletter", "unsubscribe"],
  "extract_fields": ["phone", "email", "name", "interest"],
  "auto_tag": ["email_lead", "chess_inquiry"]
}'::jsonb)
ON CONFLICT (company_id, email_address) DO NOTHING;


INSERT INTO routing_rules (company_id, rule_name, rule_type, conditions, action, priority) VALUES
(1, 'High Score Auto-Assign', 'score_based', '{"min_score": 80, "grade": ["A", "B"]}', 'assign_agent', 90),
(1, 'WhatsApp Leads Priority', 'source_based', '{"sources": ["whatsapp", "website"]}', 'priority_queue', 80),
(1, 'Hindi Speakers', 'language_based', '{"languages": ["hi", "kn", "ml"]}', 'assign_agent', 70),
(1, 'After Hours Auto-Tag', 'time_based', '{"hours": {"start": 18, "end": 9}}', 'tag_lead', 60)
ON CONFLICT DO NOTHING;


INSERT INTO products (company_id, product_name, description, category, product_type, unit_price, currency, tax_rate, inventory_tracked)
VALUES 
  (1, 'Chess Coaching - Basic', '4 sessions per month, 1 hour each', 'Coaching', 'subscription', 2000.00, 'INR', 18.00, false),
  (1, 'Chess Coaching - Premium', '8 sessions per month, 1 hour each', 'Coaching', 'subscription', 3500.00, 'INR', 18.00, false),
  (1, 'One-time Consultation', 'Single 1-hour session', 'Consultation', 'service', 500.00, 'INR', 18.00, false),
  (1, 'Chess Set - Standard', 'Wooden chess board with pieces', 'Equipment', 'product', 2000.00, 'INR', 18.00, true)
ON CONFLICT (product_code) DO NOTHING;


-- Sample scheduling link (only if company_id=1 and agent_id=1 exist)
INSERT INTO scheduling_links (
  company_id, agent_id, link_name, link_slug, meeting_duration, 
  meeting_type, description, location_type, availability_rules, is_active
)
VALUES (
  1, 1,
  '30-Minute Consultation',
  '30min-consultation',
  30,
  'consultation',
  'Book a 30-minute consultation to discuss your chess coaching needs',
  'virtual',
  '{
    "monday": {"available": true, "start_time": "09:00", "end_time": "17:00"},
    "tuesday": {"available": true, "start_time": "09:00", "end_time": "17:00"},
    "wednesday": {"available": true, "start_time": "09:00", "end_time": "17:00"},
    "thursday": {"available": true, "start_time": "09:00", "end_time": "17:00"},
    "friday": {"available": true, "start_time": "09:00", "end_time": "17:00"}
  }'::jsonb,
  true
)
ON CONFLICT (link_slug) DO NOTHING;


-- Sample price list
INSERT INTO price_lists (company_id, price_list_name, is_default)
VALUES (1, 'Default Price List', true)
ON CONFLICT (company_id, price_list_name) DO NOTHING;


-- Sample company
INSERT INTO companies (company_name, primary_contact_name, primary_contact_email, primary_contact_phone)
VALUES ('Sample Corp', 'John Doe', 'john@sample.com', '+919876543210')
ON CONFLICT DO NOTHING;

-- Sample SMS template
INSERT INTO sms_templates (company_id, template_name, template_type, message_body, character_count, estimated_segments)
SELECT id, 'Welcome Message', 'welcome', 'Hi {{name}}! Welcome to our service. We''re excited to have you!', 68, 1
FROM companies WHERE company_name = 'Sample Corp'
ON CONFLICT DO NOTHING;

-- Sample drip campaign
INSERT INTO drip_campaigns (company_id, campaign_name, trigger_type, is_active)
SELECT id, 'Welcome Series', 'new_lead', FALSE
FROM companies WHERE company_name = 'Sample Corp'
ON CONFLICT DO NOTHING;

-- ============================================
-- UTILITY VIEWS
-- ============================================

CREATE OR REPLACE VIEW unread_notifications AS
SELECT * FROM system_notifications
WHERE is_read = FALSE
ORDER BY priority DESC, created_at DESC;


CREATE OR REPLACE VIEW urgent_alerts AS
SELECT * FROM alerts
WHERE severity IN ('high', 'critical')
AND is_acknowledged = FALSE
ORDER BY created_at DESC;


CREATE OR REPLACE VIEW today_summary AS
SELECT 
  (SELECT COUNT(*) FROM call_logs WHERE DATE(created_at) = CURRENT_DATE) as total_calls_today,
  (SELECT COUNT(*) FROM call_logs WHERE DATE(created_at) = CURRENT_DATE AND call_status = 'completed') as completed_calls_today,
  (SELECT COUNT(*) FROM call_logs WHERE DATE(created_at) = CURRENT_DATE AND call_status = 'failed') as failed_calls_today,
  (SELECT COUNT(*) FROM leads WHERE DATE(updated_at) = CURRENT_DATE) as leads_updated_today,
  (SELECT COUNT(*) FROM leads WHERE lead_status = 'qualified' AND DATE(updated_at) = CURRENT_DATE) as qualified_leads_today;


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


CREATE OR REPLACE VIEW email_scanning_dashboard AS
SELECT 
  ec.company_id,
  ec.email_address,
  ec.provider,
  ec.is_active,
  ec.last_scan_at,
  ec.total_scanned,
  ec.leads_extracted,
  EXTRACT(DAY FROM (ec.oauth_token_expires_at - NOW())) as days_until_expiry,
  COUNT(esl.id) FILTER (WHERE esl.status = 'success' AND esl.created_at >= NOW() - INTERVAL '24 hours') as leads_today,
  COUNT(esl.id) FILTER (WHERE esl.status = 'failed' AND esl.created_at >= NOW() - INTERVAL '24 hours') as errors_today
FROM email_configs ec
LEFT JOIN email_scan_logs esl ON ec.id = esl.email_config_id
GROUP BY ec.id;


-- Revenue Dashboard View
CREATE OR REPLACE VIEW revenue_dashboard AS
SELECT 
  DATE_TRUNC('month', i.created_at) as month,
  COUNT(*) as total_invoices,
  COUNT(*) FILTER (WHERE i.status = 'paid') as paid_invoices,
  COUNT(*) FILTER (WHERE i.status = 'pending') as pending_invoices,
  SUM(i.amount) as total_billed,
  SUM(i.amount) FILTER (WHERE i.status = 'paid') as total_revenue,
  SUM(i.amount) FILTER (WHERE i.status = 'paid' AND i.invoice_type = 'subscription') as recurring_revenue,
  SUM(i.amount) FILTER (WHERE i.status = 'paid' AND i.invoice_type = 'one_time') as one_time_revenue,
  SUM(i.amount) FILTER (WHERE i.status = 'pending') as pending_amount,
  SUM(i.amount) FILTER (WHERE i.status = 'pending' AND i.due_date < CURRENT_DATE) as overdue_amount
FROM invoices i
GROUP BY DATE_TRUNC('month', i.created_at)
ORDER BY month DESC;

-- Overdue Invoices Summary
CREATE OR REPLACE VIEW overdue_invoices_summary AS
SELECT 
  i.id,
  i.invoice_number,
  i.lead_id,
  l.name as lead_name,
  l.phone_number,
  l.email,
  i.amount,
  i.due_date,
  EXTRACT(DAY FROM (CURRENT_DATE - i.due_date)) as days_overdue,
  CASE 
    WHEN EXTRACT(DAY FROM (CURRENT_DATE - i.due_date)) <= 7 THEN '1-7 days'
    WHEN EXTRACT(DAY FROM (CURRENT_DATE - i.due_date)) <= 14 THEN '8-14 days'
    WHEN EXTRACT(DAY FROM (CURRENT_DATE - i.due_date)) <= 30 THEN '15-30 days'
    ELSE 'Over 30 days'
  END as aging_bucket,
  i.reminder_count,
  i.last_reminder_sent
FROM invoices i
JOIN leads l ON i.lead_id = l.id
WHERE i.status = 'pending' 
AND i.due_date < CURRENT_DATE
ORDER BY i.due_date ASC;

-- Active Subscriptions View
CREATE OR REPLACE VIEW active_subscriptions AS
SELECT 
  ls.id,
  ls.lead_id,
  l.name as lead_name,
  l.phone_number,
  l.email,
  ls.start_date,
  ls.end_date,
  EXTRACT(DAY FROM (ls.end_date - CURRENT_DATE)) as days_until_expiry,
  i.amount as subscription_amount,
  i.invoice_number,
  ls.renewal_reminder_sent,
  ls.auto_renew
FROM lead_subscriptions ls
JOIN leads l ON ls.lead_id = l.id
JOIN invoices i ON ls.invoice_id = i.id
WHERE ls.status = 'active'
ORDER BY ls.end_date ASC;

-- Expiring Subscriptions (Next 30 Days)
CREATE OR REPLACE VIEW expiring_subscriptions AS
SELECT * FROM active_subscriptions
WHERE days_until_expiry <= 30 AND days_until_expiry >= 0
ORDER BY days_until_expiry ASC;


CREATE OR REPLACE FUNCTION needs_token_refresh(config_id INTEGER)
RETURNS BOOLEAN AS $$
  SELECT 
    oauth_token_expires_at < NOW() + INTERVAL '1 hour'
  FROM email_configs
  WHERE id = config_id;
$$ LANGUAGE SQL;


CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_configs_default 
ON calendar_configs(company_id, is_default) 
WHERE is_default = TRUE;


-- ============================================
-- CLEANUP FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS void AS $$
BEGIN
  DELETE FROM system_notifications WHERE is_read = TRUE AND created_at < NOW() - INTERVAL '30 days';
  DELETE FROM alerts WHERE is_acknowledged = TRUE AND created_at < NOW() - INTERVAL '60 days';
  DELETE FROM analytics_events WHERE created_at < NOW() - INTERVAL '90 days';
  DELETE FROM email_queue WHERE status IN ('sent', 'failed') AND created_at < NOW() - INTERVAL '30 days';
  RAISE NOTICE 'Cleanup completed at %', NOW();
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE VIEW tasks_dashboard AS
SELECT 
  t.*,
  l.name as lead_name,
  l.phone_number,
  l.email,
  ha.name as agent_name,
  CASE 
    WHEN t.due_date < NOW() AND t.status NOT IN ('completed', 'cancelled') THEN 'overdue'
    WHEN t.due_date < NOW() + INTERVAL '24 hours' AND t.status NOT IN ('completed', 'cancelled') THEN 'due_soon'
    ELSE 'on_track'
  END as task_urgency
FROM tasks t
JOIN leads l ON t.lead_id = l.id
LEFT JOIN human_agents ha ON t.assigned_to_agent_id = ha.id;


CREATE OR REPLACE FUNCTION auto_score_lead()
RETURNS TRIGGER AS $$
BEGIN
  
  NEW.metadata = jsonb_set(
    COALESCE(NEW.metadata, '{}'::jsonb),
    '{auto_score_pending}',
    'true'::jsonb
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


- Function to check and update expired subscriptions
CREATE OR REPLACE FUNCTION update_expired_subscriptions()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE lead_subscriptions
  SET status = 'expired', updated_at = CURRENT_TIMESTAMP
  WHERE status = 'active' 
  AND end_date < CURRENT_DATE;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get revenue summary for a date range
CREATE OR REPLACE FUNCTION get_revenue_summary(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_company_id INTEGER DEFAULT NULL
)
RETURNS TABLE (
  total_revenue DECIMAL,
  recurring_revenue DECIMAL,
  one_time_revenue DECIMAL,
  pending_revenue DECIMAL,
  overdue_amount DECIMAL,
  paid_invoices BIGINT,
  pending_invoices BIGINT,
  overdue_invoices BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(i.amount) FILTER (WHERE i.status = 'paid'), 0) as total_revenue,
    COALESCE(SUM(i.amount) FILTER (WHERE i.status = 'paid' AND i.invoice_type = 'subscription'), 0) as recurring_revenue,
    COALESCE(SUM(i.amount) FILTER (WHERE i.status = 'paid' AND i.invoice_type = 'one_time'), 0) as one_time_revenue,
    COALESCE(SUM(i.amount) FILTER (WHERE i.status = 'pending'), 0) as pending_revenue,
    COALESCE(SUM(i.amount) FILTER (WHERE i.status = 'pending' AND i.due_date < CURRENT_DATE), 0) as overdue_amount,
    COUNT(*) FILTER (WHERE i.status = 'paid') as paid_invoices,
    COUNT(*) FILTER (WHERE i.status = 'pending') as pending_invoices,
    COUNT(*) FILTER (WHERE i.status = 'pending' AND i.due_date < CURRENT_DATE) as overdue_invoices
  FROM invoices i
  LEFT JOIN leads l ON i.lead_id = l.id
  WHERE 
    (p_start_date IS NULL OR i.created_at >= p_start_date)
    AND (p_end_date IS NULL OR i.created_at <= p_end_date)
    AND (p_company_id IS NULL OR l.company_id = p_company_id);
END;
$$ LANGUAGE plpgsql;



-- Function to archive old messages
CREATE OR REPLACE FUNCTION archive_old_messages()
RETURNS void AS $$
BEGIN
  -- Archive SMS messages older than 90 days
  DELETE FROM sms_messages
  WHERE created_at < NOW() - INTERVAL '90 days';
  
  -- Archive email scan logs older than 90 days
  DELETE FROM email_scan_logs
  WHERE created_at < NOW() - INTERVAL '90 days';
  
  -- Archive drip executions older than 180 days
  DELETE FROM drip_campaign_executions
  WHERE created_at < NOW() - INTERVAL '180 days';
END;
$$ LANGUAGE plpgsql;


DROP TRIGGER IF EXISTS trigger_auto_score_lead ON leads;
CREATE TRIGGER trigger_auto_score_lead BEFORE INSERT OR UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION auto_score_lead();


DO $$
DECLARE
  table_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name IN (
    'lead_subscriptions',
    'payment_transactions',
    'invoice_reminders',
    'accounting_sync_log'
  );
  
  IF table_count = 4 THEN
    RAISE NOTICE '✅ All Module 4 tables created successfully';
  ELSE
    RAISE NOTICE '⚠️ Some tables missing. Expected 4, found %', table_count;
  END IF;
END $$;

-- Verify views
DO $$
DECLARE
  view_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO view_count
  FROM information_schema.views
  WHERE table_schema = 'public'
  AND table_name IN (
    'revenue_dashboard',
    'overdue_invoices_summary',
    'active_subscriptions',
    'expiring_subscriptions'
  );
  
  IF view_count = 4 THEN
    RAISE NOTICE '✅ All Module 4 views created successfully';
  ELSE
    RAISE NOTICE '⚠️ Some views missing. Expected 4, found %', view_count;
  END IF;
END $$;


DO $$
DECLARE
  new_tables_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO new_tables_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name IN (
    'bulk_message_jobs',
    'call_queue',
    'conference_calls',
    'conference_participants',
    'recurring_appointments',
    'calendar_conflicts',
    'cloud_storage_configs',
    'team_chat_messages',
    'shared_notes',
    'activity_feed',
    'mobile_devices',
    'push_notifications',
    'ip_whitelist',
    'two_factor_auth',
    'audit_log_viewer',
    'data_retention_policies',
    'sms_messages',
    'web_chat_sessions',
    'web_chat_messages',
    'social_media_accounts',
    'social_media_messages'
  );
  
  IF new_tables_count = 21 THEN
    RAISE NOTICE '✅ All new tables created successfully for 100%% completion';
  ELSE
    RAISE NOTICE '⚠️ Some tables missing. Expected 21, found %', new_tables_count;
  END IF;
END $$;


-- ============================================
-- VERIFICATION
-- ============================================

DO $$
BEGIN
  RAISE NOTICE 'Schema initialization complete. Total tables: 18';
END $$;