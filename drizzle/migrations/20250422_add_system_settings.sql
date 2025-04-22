-- Add system_settings table for global app configuration
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add initial alert phone number
INSERT INTO system_settings (key, value) 
VALUES ('alertPhone', '+15555555555')
ON CONFLICT (key) DO NOTHING;

-- Add index on key for faster lookups
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(key);