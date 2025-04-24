-- Add reasoning field to patient_prompts table
ALTER TABLE patient_prompts ADD COLUMN IF NOT EXISTS reasoning TEXT; 