-- Add 'reasoning' column to patient_prompts table
ALTER TABLE "patient_prompts"
ADD COLUMN IF NOT EXISTS "reasoning" text;