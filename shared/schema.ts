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
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Patient Batch schema
export const patientBatches = pgTable("patient_batches", {
  id: serial("id").primaryKey(),
  batchId: text("batch_id").notNull().unique(),
  fileName: text("file_name").notNull().default("unknown"),
  createdAt: text("created_at").notNull(),
  totalPatients: integer("total_patients").default(0),
  processedPatients: integer("processed_patients").default(0),
  userId: integer("user_id").default(-1),
});

export const insertPatientBatchSchema = createInsertSchema(patientBatches).omit(
  {
    id: true,
  },
);

// Patient Prompt schema
export const patientPrompts = pgTable("patient_prompts", {
  id: serial("id").primaryKey(),
  batchId: text("batch_id").notNull(),
  patientId: text("patient_id").notNull(),
  name: text("name").notNull(),
  age: integer("age").notNull(),
  condition: text("condition").notNull(),
  isAlert: text("is_alert").default("false"),
  healthStatus: text("health_status").default("alert"),
  prompt: text("prompt").notNull(),
  patientMessage: text("patient_message"), // Patient-directed message
  reasoning: text("reasoning"),
  template: text("template"), // Store custom template for this patient
  rawData: jsonb("raw_data"), // Store issues and alert reasons in rawData
  createdAt: text("created_at").default(new Date().toISOString()),
  updatedAt: text("updated_at"),
});

export const insertPatientPromptSchema = createInsertSchema(patientPrompts).omit({
  id: true,
});

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
  id: serial("id").primaryKey(),
  batchId: text("batch_id"),
  prompt: text("prompt").notNull(),
  createdAt: text("created_at").default(new Date().toISOString()),
  updatedAt: text("updated_at"),
});

export const patientSystemPrompts = pgTable("patient_system_prompts", {
  id: serial("id").primaryKey(),
  batchId: text("batch_id"),
  prompt: text("prompt").notNull(),
  createdAt: text("created_at").default(new Date().toISOString()),
  updatedAt: text("updated_at"),
});

export const trendSystemPrompts = pgTable("trend_system_prompts", {
  id: serial("id").primaryKey(),
  batchId: text("batch_id"),
  prompt: text("prompt").notNull(),
  createdAt: text("created_at").default(new Date().toISOString()),
  updatedAt: text("updated_at"),
});

export const insertSystemPromptSchema = createInsertSchema(systemPrompts).omit({
  id: true,
});

export const insertPatientSystemPromptSchema = createInsertSchema(patientSystemPrompts).omit({
  id: true,
});

export const insertTrendSystemPromptSchema = createInsertSchema(trendSystemPrompts).omit({
  id: true,
});

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

export type PatientSystemPrompt = typeof patientSystemPrompts.$inferSelect;
export type InsertPatientSystemPrompt = z.infer<typeof insertPatientSystemPromptSchema>;

export type TrendSystemPrompt = typeof trendSystemPrompts.$inferSelect;
export type InsertTrendSystemPrompt = z.infer<typeof insertTrendSystemPromptSchema>;

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
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const insertSystemSettingsSchema = createInsertSchema(
  systemSettings,
).omit({
  updatedAt: true,
});

export type SystemSettings = typeof systemSettings.$inferSelect;
export type InsertSystemSettings = z.infer<typeof insertSystemSettingsSchema>;

// Add phone validation schema
/**
 * Call history table to store conversation summaries and context
 * for follow-up calls with patients
 */
export const callHistory = pgTable("call_history", {
  id: serial("id").primaryKey(),
  callId: text("call_id").notNull(), // Vapi call ID
  patientId: text("patient_id").notNull(), // Reference to patient
  patientName: text("patient_name").notNull(),
  phoneNumber: text("phone_number").notNull(),
  duration: integer("duration"), // Call duration in seconds
  status: text("status").notNull(), // completed, failed, no-answer, etc.
  transcript: text("transcript"), // Full conversation transcript
  summary: text("summary"), // AI-generated summary
  keyPoints: text("key_points").array(), // Array of key talking points
  healthConcerns: text("health_concerns").array(), // Array of health issues mentioned
  followUpItems: text("follow_up_items").array(), // Items to mention in next call
  callDate: timestamp("call_date").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const insertCallHistorySchema = createInsertSchema(callHistory).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export type CallHistory = typeof callHistory.$inferSelect;
export type InsertCallHistory = z.infer<typeof insertCallHistorySchema>;

export const phoneSchema = z
  .string()
  .regex(
    /^\+[1-9]\d{1,14}$/,
    "Phone number must be in E.164 format (e.g., +1234567890)",
  );
