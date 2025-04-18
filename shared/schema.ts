import { pgTable, text, serial, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

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
  fileName: text("file_name").notNull().default('unknown'),
  createdAt: text("created_at").notNull(),
  totalPatients: integer("total_patients").default(0),
  processedPatients: integer("processed_patients").default(0),
  userId: integer("user_id").default(-1),
});

export const insertPatientBatchSchema = createInsertSchema(patientBatches).omit({
  id: true,
});

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
  rawData: jsonb("raw_data"),
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

export type FileUploadResponse = {
  success: boolean;
  batchId: string;
  message?: string;
};
