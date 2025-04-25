import {
  pgTable,
  text,
  serial,
  integer,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { PatientData } from './types';

// User schema (kept from original)
export const users = pgTable("users", {
  id: integer("id").primaryKey(),
  username: text("username").notNull(),
  password: text("password").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users);

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Patient Batch schema
export const patientBatches = pgTable("patient_batches", {
  id: integer("id").primaryKey(),
  batchId: text("batch_id").notNull(),
  processed_patients: integer("processed_patients").default(0),
  total_patients: integer("total_patients").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPatientBatchSchema = createInsertSchema(patientBatches);

// Patient Prompt schema
export const patientPrompts = pgTable("patient_prompts", {
  id: integer("id").primaryKey(),
  batchId: text("batch_id").notNull(),
  patientId: text("patient_id").notNull(),
  name: text("name").notNull(),
  age: text("age"),
  condition: text("condition"),
  prompt: text("prompt"),
  reasoning: text("reasoning"),
  isAlert: text("is_alert").default("false"),
  healthStatus: text("health_status").default("alert"),
  rawData: text("raw_data"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPatientPromptSchema = createInsertSchema(patientPrompts);

export const patientPromptSchema = z.object({
  patientId: z.string(),
  name: z.string(),
  age: z.number(),
  condition: z.string(),
  prompt: z.string(),
  rawData: z.record(z.string(), z.any()).optional(),
});

export type PatientBatch = typeof patientBatches.$inferSelect;
export type InsertPatientBatch = z.infer<typeof insertPatientBatchSchema>;

export type PatientPrompt = typeof patientPrompts.$inferSelect;
export type InsertPatientPrompt = z.infer<typeof insertPatientPromptSchema>;

// New tables for prompt sandbox customization
export const systemPrompts = pgTable("system_prompts", {
  id: integer("id").primaryKey(),
  batchId: text("batch_id"),
  prompt: text("prompt").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSystemPromptSchema = createInsertSchema(systemPrompts);

export const templateVariables = pgTable("template_variables", {
  id: serial("id").primaryKey(),
  batchId: text("batch_id"),
  placeholder: text("placeholder").notNull(),
  description: text("description").notNull(),
  example: text("example"),
  createdAt: text("created_at").default(new Date().toISOString()),
  updatedAt: text("updated_at"),
});

export const insertTemplateVariableSchema = createInsertSchema(
  templateVariables,
).omit({
  id: true,
});

export const templateVariableSchema = z.object({
  placeholder: z.string(),
  description: z.string(),
  example: z.string().optional(),
});

export type SystemPrompt = typeof systemPrompts.$inferSelect;
export type InsertSystemPrompt = z.infer<typeof insertSystemPromptSchema>;

export type TemplateVariable = typeof templateVariables.$inferSelect;
export type InsertTemplateVariable = z.infer<
  typeof insertTemplateVariableSchema
>;

export type FileUploadResponse = {
  success: boolean;
  batchId: string;
  message?: string;
};

/**
 * System-wide settings table.
 * Expected keys:
 * - alertPhone: E.164 formatted phone number for SMS alerts
 * - supportEmail: Support contact email (future)
 *
 * Note: This is not intended for general configuration storage.
 * Keep the number of keys minimal and well-documented.
 */
export const systemSettings = pgTable("system_settings", {
  id: integer("id").primaryKey(),
  key: text("key").notNull(),
  value: text("value").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSystemSettingsSchema = createInsertSchema(
  systemSettings,
).omit({
  updatedAt: true,
});

export type SystemSettings = typeof systemSettings.$inferSelect;
export type InsertSystemSettings = z.infer<typeof insertSystemSettingsSchema>;

// Add phone validation schema
export const phoneSchema = z
  .string()
  .regex(
    /^\+[1-9]\d{1,14}$/,
    "Phone number must be in E.164 format (e.g., +1234567890)",
  );
