import {
  users,
  patientBatches,
  patientPrompts,
  systemPrompts,
  patientSystemPrompts,
  templateVariables,
  systemSettings,
  callHistory,
  trendReportPrompts,
  type User,
  type InsertUser,
  type PatientBatch,
  type InsertPatientBatch,
  type PatientPrompt,
  type InsertPatientPrompt,
  type SystemPrompt,
  type InsertSystemPrompt,
  type PatientSystemPrompt,
  type InsertPatientSystemPrompt,
  type TemplateVariable,
  type InsertTemplateVariable,
  type SystemSettings,
  type CallHistory,
  type InsertCallHistory,
  type TrendReportPrompt,
  type InsertTrendReportPrompt
} from "@shared/schema";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { db } from "./db";
import { and, eq, sql, desc } from "drizzle-orm";
import twilio from "twilio";
import type { SystemPrompt as SystemPromptType } from '@shared/types';

// Modify the interface with any CRUD methods you might need
export interface IStorage {
  // User methods (kept from original)
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Patient Batch methods
  createPatientBatch(batch: InsertPatientBatch): Promise<PatientBatch>;
  getPatientBatch(batchId: string): Promise<PatientBatch | undefined>;
  getAllPatientBatches(): Promise<PatientBatch[]>;

  // Patient Prompt methods
  createPatientPrompt(prompt: InsertPatientPrompt): Promise<PatientPrompt>;
  getPatientPromptsByBatchId(batchId: string): Promise<PatientPrompt[]>;
  getPatientPromptByIds(batchId: string, patientId: string): Promise<PatientPrompt | undefined>;
  getPatientPromptById(id: number): Promise<PatientPrompt | undefined>;
  getLatestPatientPrompt(patientId: string): Promise<PatientPrompt | undefined>;
  updatePatientPrompt(id: number, updates: Partial<InsertPatientPrompt>): Promise<PatientPrompt>;

  // Patient Template methods
  getPromptTemplate(patientId: string): Promise<{ template: string, originalTemplate?: string } | null>;
  updatePromptTemplate(patientId: string, template: string): Promise<void>;

  // System Prompt methods
  getSystemPrompt(batchId?: string): Promise<SystemPrompt | null>;
  updateSystemPrompt(prompt: string, batchId?: string): Promise<SystemPrompt>;

  // Patient System Prompt methods
  getPatientSystemPrompt(batchId?: string): Promise<PatientSystemPrompt | null>;
  updatePatientSystemPrompt(prompt: string, batchId?: string): Promise<PatientSystemPrompt>;

  // Template Variables methods
  getTemplateVariables(batchId?: string): Promise<TemplateVariable[]>;
  createTemplateVariable(variable: InsertTemplateVariable): Promise<TemplateVariable>;
  updateTemplateVariable(id: number, updates: Partial<InsertTemplateVariable>): Promise<TemplateVariable>;
  deleteTemplateVariable(id: number): Promise<void>;

  // System Settings methods
  getSetting(key: string): Promise<string | null>;
  updateSetting(key: string, value: string): Promise<SystemSettings>;
  getAlertPhone(): Promise<string | null>;
  updateAlertPhone(phone: string): Promise<SystemSettings>;

  // Triage methods
  getPatientAlerts(batchId?: string): Promise<any[]>;
  sendAlert(alertId: string): Promise<any>;
  sendAllAlerts(alertIds: string[]): Promise<{ sent: number }>;

  // Monthly reports methods
  getMonthlyReports(): Promise<any[]>;
  generateMonthlyReport(monthYear: string): Promise<any>;

  // Call history methods
  createCallHistory(callData: InsertCallHistory): Promise<CallHistory>;
  getCallHistoryByPatient(patientId: string, limit?: number, offset?: number): Promise<CallHistory[]>;
  getLatestCallForPatient(patientId: string): Promise<CallHistory | null>;
  updateCallHistory(callId: string, updates: Partial<InsertCallHistory>): Promise<CallHistory>;
  getAllCallHistory(limit?: number, offset?: number): Promise<CallHistory[]>;
  getCallHistoryContext(patientId: string, limit?: number): Promise<{
    hasHistory: boolean;
    contextText: string;
    recentCalls: number;
    allSummaries: string[];
    allKeyPoints: string[];
    allHealthConcerns: string[];
    allFollowUpItems: string[];
  }>;

  // Voice agent template methods
  getVoiceAgentTemplate(): Promise<string>;
  updateVoiceAgentTemplate(template: string): Promise<void>;

  // Trend report prompt methods
  getTrendReportPrompt(batchId?: string): Promise<TrendReportPrompt | null>;
  updateTrendReportPrompt(prompt: string, batchId?: string): Promise<TrendReportPrompt>;

  // Session store
  sessionStore: session.Store;
}

export class DatabaseStorage implements IStorage {
  public sessionStore: session.Store;

  constructor() {
    const PostgresSessionStore = connectPg(session);
    this.sessionStore = new PostgresSessionStore({
      conObject: {
        connectionString: process.env.DATABASE_URL,
      },
      createTableIfMissing: true,
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async createPatientBatch(insertBatch: InsertPatientBatch): Promise<PatientBatch> {
    const [batch] = await db.insert(patientBatches).values(insertBatch).returning();
    return batch;
  }

  async getPatientBatch(batchId: string): Promise<PatientBatch | undefined> {
    const [batch] = await db.select().from(patientBatches).where(eq(patientBatches.batchId, batchId));
    return batch;
  }

  async getAllPatientBatches(): Promise<PatientBatch[]> {
    return await db.select().from(patientBatches).orderBy(desc(patientBatches.createdAt));
  }

  async createPatientPrompt(insertPrompt: InsertPatientPrompt): Promise<PatientPrompt> {
    // Create a cleaned up version of the insert data that matches our schema
    const promptData = {
      batchId: insertPrompt.batchId,
      patientId: insertPrompt.patientId,
      name: insertPrompt.name,
      age: insertPrompt.age,
      condition: insertPrompt.condition,
      prompt: insertPrompt.prompt,
      patientMessage: insertPrompt.patientMessage || null, // Add the missing patientMessage field
      reasoning: insertPrompt.reasoning || null,
      isAlert: insertPrompt.isAlert ? "true" : "false",
      healthStatus: insertPrompt.healthStatus || "alert",
      rawData: insertPrompt.rawData ?? null,
      createdAt: new Date().toISOString(),
    };

    const [prompt] = await db.insert(patientPrompts).values(promptData).returning();
    return prompt;
  }

  async getPatientPromptsByBatchId(batchId: string): Promise<PatientPrompt[]> {
    try {
      // Trim the batch ID to handle any whitespace issues
      const trimmedBatchId = batchId.trim();
      console.log(`Getting prompts for batch ID: '${trimmedBatchId}'`);

      // First check if batch exists in patient_batches table
      const batchExists = await db.select().from(patientBatches).where(eq(patientBatches.batchId, trimmedBatchId));

      if (!batchExists || batchExists.length === 0) {
        console.warn(`Batch ID '${trimmedBatchId}' not found in patient_batches table`);
        // Return empty array for non-existent batch
        return [];
      }

      // Run query to check the count first for debugging
      const countResult = await db.select({ count: sql`count(*)` })
        .from(patientPrompts)
        .where(eq(patientPrompts.batchId, trimmedBatchId));

      const count = parseInt(countResult[0]?.count?.toString() || '0');
      console.log(`Found ${count} prompts for batch ID '${trimmedBatchId}'`);

      // Get the actual prompts
      const result = await db.select().from(patientPrompts).where(eq(patientPrompts.batchId, trimmedBatchId));
      return result;
    } catch (error) {
      console.error(`Error getting prompts for batch ID '${batchId}':`, error);
      // Return empty array on error
      return [];
    }
  }

  async getPatientPromptByIds(batchId: string, patientId: string): Promise<PatientPrompt | undefined> {
    const [prompt] = await db.select().from(patientPrompts)
      .where(and(
        eq(patientPrompts.batchId, batchId),
        eq(patientPrompts.patientId, patientId)
      ));
    return prompt;
  }

  async getPatientPromptById(id: number): Promise<PatientPrompt | undefined> {
    const [prompt] = await db.select().from(patientPrompts)
      .where(eq(patientPrompts.id, id));
    return prompt;
  }

  async getLatestPatientPrompt(patientId: string): Promise<PatientPrompt | undefined> {
    const [prompt] = await db.select().from(patientPrompts)
      .where(eq(patientPrompts.patientId, patientId))
      .orderBy(desc(patientPrompts.id))
      .limit(1);
    return prompt;
  }

  async updatePatientPrompt(id: number, updates: Partial<InsertPatientPrompt>): Promise<PatientPrompt> {
    // Create a cleaned up version of the update data that matches our schema
    const updateData: Record<string, any> = {};

    if (updates.prompt) updateData.prompt = updates.prompt;
    if (updates.patientMessage) updateData.patientMessage = updates.patientMessage;
    if (updates.reasoning) updateData.reasoning = updates.reasoning;
    if (updates.isAlert !== undefined) updateData.isAlert = updates.isAlert ? "true" : "false";
    if (updates.healthStatus) updateData.healthStatus = updates.healthStatus;
    if (updates.condition) updateData.condition = updates.condition;

    // Add updatedAt timestamp
    updateData.updatedAt = new Date().toISOString();

    const [updatedPrompt] = await db.update(patientPrompts)
      .set(updateData)
      .where(eq(patientPrompts.id, id))
      .returning();

    if (!updatedPrompt) {
      throw new Error(`Prompt with id ${id} not found`);
    }

    return updatedPrompt;
  }

  // Template methods for storing, retrieving, and using custom prompt templates
  async getPromptTemplate(patientId: string): Promise<{ template: string, originalTemplate?: string } | null> {
    try {
      // Get the latest patient prompt for this patient ID
      const [prompt] = await db.select().from(patientPrompts)
        .where(eq(patientPrompts.patientId, patientId))
        .orderBy(desc(patientPrompts.createdAt))
        .limit(1);

      if (!prompt) {
        return null;
      }

      // If there's a custom template stored, return it
      if (prompt.template) {
        return {
          template: prompt.template,
          originalTemplate: this.getDefaultTemplate() // Always provide the original as a reference
        };
      }

      // If no custom template, return the default
      return {
        template: this.getDefaultTemplate(),
        originalTemplate: this.getDefaultTemplate()
      };
    } catch (error) {
      console.error(`Error getting template for patient ${patientId}:`, error);
      // Fallback to default template
      return {
        template: this.getDefaultTemplate(),
        originalTemplate: this.getDefaultTemplate()
      };
    }
  }

  // Helper for the default template
  getDefaultTemplate(): string {
    return `Hello {name},

Based on your recent health data, I notice {condition}.

{current_values}

Your compliance rate is {compliance}%. {trend_analysis}

Let's discuss this at your next appointment to ensure you're on track with your treatment plan.

Best regards,
Your Healthcare Provider`;
  }

  async updatePromptTemplate(patientId: string, template: string): Promise<void> {
    try {
      // First sanitize the template
      const sanitizedTemplate = this.sanitizeTemplate(template);

      // Log that we received the update
      console.log(`Updated template for patient ${patientId}:`, sanitizedTemplate);

      // Find the patient prompt(s) for this patient ID and update them
      const [prompt] = await db.select().from(patientPrompts)
        .where(eq(patientPrompts.patientId, patientId))
        .orderBy(desc(patientPrompts.createdAt))
        .limit(1);

      if (prompt) {
        // Update the template field and updatedAt timestamp
        await db.update(patientPrompts)
          .set({
            template: sanitizedTemplate,
            updatedAt: new Date().toISOString()
          })
          .where(eq(patientPrompts.id, prompt.id));
      } else {
        console.warn(`No patient found with ID ${patientId} to update template`);
      }
    } catch (error) {
      console.error(`Error updating template for patient ${patientId}:`, error);
      throw error;
    }
  }

  // Helper to sanitize templates
  sanitizeTemplate(template: string): string {
    // Trim whitespace
    let sanitized = template.trim();

    // Enforce maximum length
    const MAX_TEMPLATE_LENGTH = 1000;
    if (sanitized.length > MAX_TEMPLATE_LENGTH) {
      sanitized = sanitized.substring(0, MAX_TEMPLATE_LENGTH);
    }

    // Ensure templates contain required placeholders
    const requiredPlaceholders = ['{name}'];
    const missingPlaceholders = requiredPlaceholders.filter(
      placeholder => !sanitized.includes(placeholder)
    );

    if (missingPlaceholders.length > 0) {
      // Add missing placeholders at the end
      sanitized += `\n\n(Required placeholders added: ${missingPlaceholders.join(', ')})`;
      sanitized += `\n${missingPlaceholders.join(' ')}`;
    }

    return sanitized;
  }

  // System Prompt methods
  async getSystemPrompt(batchId?: string): Promise<SystemPrompt | null> {
    try {
      let query = db.select()
        .from(systemPrompts)
        .orderBy(desc(systemPrompts.createdAt))
        .limit(1);

      if (batchId) {
        // If a batchId is provided, first try to get a batch-specific prompt
        const [batchPrompt] = await db.select()
          .from(systemPrompts)
          .where(eq(systemPrompts.batchId, batchId))
          .orderBy(desc(systemPrompts.createdAt))
          .limit(1);

        if (batchPrompt) {
          console.log(`Found batch-specific prompt (ID: ${batchPrompt.id}) for batch ${batchId}`);
          return batchPrompt;
        }
      }

      // If no batch-specific prompt found (or no batchId provided), get the most recent global prompt
      const [globalPrompt] = await db.select()
        .from(systemPrompts)
        .where(sql`${systemPrompts.batchId} IS NULL`)
        .orderBy(desc(systemPrompts.createdAt))
        .limit(1);

      if (globalPrompt) {
        console.log(`Using global prompt (ID: ${globalPrompt.id})`);
        return globalPrompt;
      }

      console.log('No system prompt found in database');
      return null;
    } catch (error) {
      console.error("Error fetching system prompt:", error);
      return null;
    }
  }

  async updateSystemPrompt(promptText: string, batchId?: string): Promise<SystemPrompt> {
    try {
      // Sanitize the prompt
      const sanitizedPrompt = this.sanitizeSystemPrompt(promptText);

      // Always create a new prompt entry instead of updating existing ones
      // This maintains a history and ensures we can track changes
        const [newPrompt] = await db.insert(systemPrompts)
          .values({
            batchId: batchId || null,
            prompt: sanitizedPrompt,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
          })
          .returning();

      console.log(`Created new system prompt (ID: ${newPrompt.id}, batchId: ${batchId || 'global'})`);
        return newPrompt;
    } catch (error) {
      console.error("Error updating system prompt:", error);
      throw error;
    }
  }

  // Helper for sanitizing system prompts
  sanitizeSystemPrompt(prompt: string): string {
    // Trim whitespace
    let sanitized = prompt.trim();

    // Enforce maximum length
    const MAX_SYSTEM_PROMPT_LENGTH = 2000;
    if (sanitized.length > MAX_SYSTEM_PROMPT_LENGTH) {
      sanitized = sanitized.substring(0, MAX_SYSTEM_PROMPT_LENGTH);
    }

    return sanitized;
  }

  // Patient System Prompt methods
  async getPatientSystemPrompt(batchId?: string): Promise<PatientSystemPrompt | null> {
    try {
      let prompt: PatientSystemPrompt | undefined;

      // If batch ID is provided, try to get the batch-specific prompt first
      if (batchId) {
        [prompt] = await db.select()
          .from(patientSystemPrompts)
          .where(eq(patientSystemPrompts.batchId, batchId))
          .orderBy(desc(patientSystemPrompts.createdAt))
          .limit(1);
      }

      // If no batch-specific prompt found or no batch ID provided, get global prompt
      if (!prompt) {
        [prompt] = await db.select()
          .from(patientSystemPrompts)
          .where(sql`${patientSystemPrompts.batchId} IS NULL`)
          .orderBy(desc(patientSystemPrompts.createdAt))
          .limit(1);
      }

      return prompt || null;
    } catch (error) {
      console.error("Error getting patient system prompt:", error);
      return null;
    }
  }

  async updatePatientSystemPrompt(promptText: string, batchId?: string): Promise<PatientSystemPrompt> {
    try {
      // Sanitize the prompt
      const sanitizedPrompt = this.sanitizeSystemPrompt(promptText);

      // Always create a new prompt entry instead of updating existing ones
      const [newPrompt] = await db.insert(patientSystemPrompts)
        .values({
          batchId: batchId || null,
          prompt: sanitizedPrompt,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
        .returning();

      console.log(`Created new patient system prompt (ID: ${newPrompt.id}, batchId: ${batchId || 'global'})`);
      return newPrompt;
    } catch (error) {
      console.error("Error updating patient system prompt:", error);
      throw error;
    }
  }

  // Template Variables methods
  async getTemplateVariables(batchId?: string): Promise<TemplateVariable[]> {
    try {
      // If batch ID is provided, get batch-specific variables
      if (batchId) {
        const batchVariables = await db.select()
          .from(templateVariables)
          .where(eq(templateVariables.batchId, batchId));

        if (batchVariables.length > 0) {
          return batchVariables;
        }
      }

      // Otherwise, get global variables (null batchId)
      const globalVariables = await db.select()
        .from(templateVariables)
        .where(sql`${templateVariables.batchId} IS NULL`);

      return globalVariables;
    } catch (error) {
      console.error("Error fetching template variables:", error);
      return [];
    }
  }

  async createTemplateVariable(variable: InsertTemplateVariable): Promise<TemplateVariable> {
    try {
      // Sanitize the variable
      const sanitizedVariable = {
        ...variable,
        placeholder: this.sanitizeVariablePlaceholder(variable.placeholder),
        description: this.sanitizeVariableDescription(variable.description),
        example: variable.example ? this.sanitizeVariableExample(variable.example) : null,
        createdAt: new Date().toISOString(),
      };

      // Insert the variable
      const [newVariable] = await db.insert(templateVariables)
        .values(sanitizedVariable)
        .returning();

      return newVariable;
    } catch (error) {
      console.error("Error creating template variable:", error);
      throw error;
    }
  }

  async updateTemplateVariable(id: number, updates: Partial<InsertTemplateVariable>): Promise<TemplateVariable> {
    try {
      // Sanitize the variable
      const sanitizedUpdates: Record<string, any> = {};

      if (updates.placeholder) {
        sanitizedUpdates.placeholder = this.sanitizeVariablePlaceholder(updates.placeholder);
      }
      if (updates.description) {
        sanitizedUpdates.description = this.sanitizeVariableDescription(updates.description);
      }
      if (updates.example) {
        sanitizedUpdates.example = this.sanitizeVariableExample(updates.example);
      }

      sanitizedUpdates.updatedAt = new Date().toISOString();

      // Update the variable
      const [updatedVariable] = await db.update(templateVariables)
        .set(sanitizedUpdates)
        .where(eq(templateVariables.id, id))
        .returning();

      if (!updatedVariable) {
        throw new Error(`Variable with id ${id} not found`);
      }

      return updatedVariable;
    } catch (error) {
      console.error("Error updating template variable:", error);
      throw error;
    }
  }

  async deleteTemplateVariable(id: number): Promise<void> {
    try {
      await db.delete(templateVariables)
        .where(eq(templateVariables.id, id));
    } catch (error) {
      console.error("Error deleting template variable:", error);
      throw error;
    }
  }

  // Helper functions for sanitizing variable inputs
  sanitizeVariablePlaceholder(placeholder: string): string {
    // Ensure placeholder starts and ends with braces
    let sanitized = placeholder.trim();
    if (!sanitized.startsWith('{')) sanitized = '{' + sanitized;
    if (!sanitized.endsWith('}')) sanitized = sanitized + '}';

    // Remove any spaces
    sanitized = sanitized.replace(/\s/g, '');

    // Enforce maximum length
    const MAX_PLACEHOLDER_LENGTH = 50;
    if (sanitized.length > MAX_PLACEHOLDER_LENGTH) {
      sanitized = sanitized.substring(0, MAX_PLACEHOLDER_LENGTH - 1) + '}';
    }

    return sanitized;
  }

  sanitizeVariableDescription(description: string): string {
    // Trim whitespace
    let sanitized = description.trim();

    // Enforce maximum length
    const MAX_DESCRIPTION_LENGTH = 200;
    if (sanitized.length > MAX_DESCRIPTION_LENGTH) {
      sanitized = sanitized.substring(0, MAX_DESCRIPTION_LENGTH);
    }

    return sanitized;
  }

  sanitizeVariableExample(example: string): string {
    // Trim whitespace
    let sanitized = example.trim();

    // Enforce maximum length
    const MAX_EXAMPLE_LENGTH = 100;
    if (sanitized.length > MAX_EXAMPLE_LENGTH) {
      sanitized = sanitized.substring(0, MAX_EXAMPLE_LENGTH);
    }

    return sanitized;
  }

  // Triage methods using real data from uploaded patient file with severity levels
  async getPatientAlerts(batchId?: string): Promise<any[]> {
    try {
      console.log(`Getting patient alerts for batch: ${batchId || 'most recent'}`);

      // Find the most recent batch if no batchId is provided
      let targetBatchId: string | null = batchId || null;

      // If no batchId provided, get the most recent batch
      if (!targetBatchId) {
        const latestBatches = await db.select()
          .from(patientBatches)
          .orderBy(desc(patientBatches.createdAt))
          .limit(1);

        if (latestBatches && latestBatches.length > 0) {
          targetBatchId = latestBatches[0].batchId;
          console.log(`Using most recent batch: ${targetBatchId}`);
        }
      }

      // Query database for patient prompts (with optional batch filter)
      let query = db.select({
        id: patientPrompts.id,
        patientId: patientPrompts.patientId,
        name: patientPrompts.name,
        age: patientPrompts.age,
        condition: patientPrompts.condition,
        isAlert: patientPrompts.isAlert,
        healthStatus: patientPrompts.healthStatus,
        createdAt: patientPrompts.createdAt,
        rawData: patientPrompts.rawData,
        prompt: patientPrompts.prompt,
        batchId: patientPrompts.batchId
      }).from(patientPrompts);

      // Apply batch filter if available
      if (targetBatchId) {
        query = query.where(eq(patientPrompts.batchId, targetBatchId));
      }

      const allPatients = await query;

      // Group all patients by ID (not just alerts)
      const patientMap = new Map();

      // Process all patients to categorize by severity
      allPatients.forEach(patient => {
        // Add debug logging for all patients
        console.log(`Processing patient ${patient.patientId}: isAlert=${patient.isAlert}, healthStatus=${patient.healthStatus}`);

        // Default severity is 'green' (healthy)
        let severity = 'green';
        let alertStatus = false;
        let alertReasons: string[] = [];
        let healthMetrics: any[] = [];

        // Parse raw data if available
        let parsedRawData: any = null;
        if (patient.rawData) {
          if (typeof patient.rawData === 'string') {
            try {
              parsedRawData = JSON.parse(patient.rawData);
            } catch (e) {
              console.warn(`Could not parse rawData for patient ${patient.patientId}:`, e);
            }
          } else {
            parsedRawData = patient.rawData;
          }
        }

        // Determine severity based on parsed data and alert status
        if (parsedRawData) {
          // Extract health variables
          if (parsedRawData.variables) {
            const variables = parsedRawData.variables;
            let hasAbnormalValue = false;

            Object.keys(variables).forEach(key => {
              if (key !== 'patientId' && key !== 'name' && key !== 'age' && key !== 'condition') {
                // Add to health metrics for display
                healthMetrics.push({
                  name: key,
                  value: variables[key],
                  timestamp: patient.createdAt
                });

                // Check for specific severe conditions
                const varName = key.toLowerCase();
                const varValue = variables[key];

                // Convert value to number if possible
                let numValue: number | null = null;
                if (typeof varValue === 'number') {
                  numValue = varValue;
                } else if (typeof varValue === 'string') {
                  const parsed = parseFloat(varValue);
                  if (!isNaN(parsed)) {
                    numValue = parsed;
                  }
                }

                // Apply severity rules if we have a numeric value
                if (numValue !== null) {
                  // RED level alerts - critical values requiring immediate action
                  if (
                    (varName.includes('glucose') && numValue > 300) ||
                    (varName.includes('blood pressure') && numValue > 180) ||
                    (varName.includes('heart rate') && (numValue > 150 || numValue < 40)) ||
                    (varName.includes('temperature') && numValue > 103) ||
                    (varName.includes('oxygen') && numValue < 85)
                  ) {
                    severity = 'red';
                    alertStatus = true;
                    hasAbnormalValue = true;
                    alertReasons.push(`CRITICAL: ${key} is ${numValue}`);
                  }
                  // YELLOW level alerts - concerning but not immediately life-threatening
                  else if (
                    (varName.includes('glucose') && (numValue > 180 || numValue < 70)) ||
                    (varName.includes('blood pressure') && (numValue > 140 || numValue < 90)) ||
                    (varName.includes('heart rate') && (numValue > 100 || numValue < 50)) ||
                    (varName.includes('temperature') && (numValue > 99.5 || numValue < 97)) ||
                    (varName.includes('oxygen') && numValue < 92)
                  ) {
                    // Only upgrade to yellow if we're not already at red
                    if (severity !== 'red') {
                      severity = 'yellow';
                      alertStatus = true;
                      hasAbnormalValue = true;
                      alertReasons.push(`ATTENTION: ${key} is ${numValue}`);
                    }
                  }
                }
              }
            });

            // If none of the values were abnormal, explicitly mark as green/healthy
            if (!hasAbnormalValue) {
              severity = 'green';
              alertStatus = false; // Not an alert
              if (alertReasons.length === 0) {
                alertReasons.push('All readings within normal range');
              }
            }
          }

          // Use existing alert reasons if available and none were determined above
          if (alertReasons.length === 0 && parsedRawData.alertReasons && parsedRawData.alertReasons.length > 0) {
            alertReasons = parsedRawData.alertReasons;

            // Check if any of the existing reasons indicate severity
            const containsCritical = alertReasons.some(reason =>
              reason.toLowerCase().includes('critical') ||
              reason.toLowerCase().includes('severe') ||
              reason.toLowerCase().includes('emergency')
            );

            if (containsCritical) {
              severity = 'red';
            } else if (alertReasons.length > 0) {
              severity = 'yellow';
            }

            alertStatus = true;
          }
        }

        // Check explicitly for healthStatus field first (highest priority)
        if (patient.healthStatus === 'healthy') {
          // Always override with healthy status if explicitly marked as such
          alertStatus = false;
          severity = 'green';
          if (alertReasons.length === 0) {
            alertReasons.push('All readings within normal range');
          }
        }
        // Then check isAlert field as a fallback
        else if (patient.isAlert === 'true' || patient.isAlert === true) {
          console.log(`Detected isAlert for patient ${patient.patientId}: ${patient.isAlert} of type ${typeof patient.isAlert}`);
          // Only set alert status if it wasn't already determined from variables
          if (!alertStatus) {
            alertStatus = true;
            severity = 'yellow';  // Default to yellow for general alerts

            if (alertReasons.length === 0) {
              alertReasons.push(`Alert for ${patient.condition}`);
            }
          }
        } else {
          // Explicitly mark as green/healthy if isAlert is false and no alert conditions were found
          if (!alertStatus) {
            alertStatus = false;
            severity = 'green';
            if (alertReasons.length === 0) {
              alertReasons.push('All readings within normal range');
            }
          }
        }

        // Create patient data object with severity
        const patientData = {
          id: `alert-${patient.id}`,
          patientId: patient.patientId,
          patientName: patient.name,
          age: patient.age,
          condition: patient.condition,
          createdAt: patient.createdAt,
          variables: healthMetrics,
          status: alertStatus ? "pending" : "healthy",
          sentAt: null,
          severity: severity,
          alertReasons: alertReasons,
          isAlert: alertStatus,
          prompt: patient.prompt
        };

        // Add message with the appropriate format for this severity
        patientData.message = this.formatSmsMessage(patientData);

        // Store count of alerts
        patientData.alertCount = alertReasons.length;

        // Add to patient map (this will overwrite with the most recent patient data)
        patientMap.set(patient.patientId, patientData);
      });

      // Convert all patients to array and sort by severity (red → yellow → green)
      const allPatientsArray = Array.from(patientMap.values());

      // Sort by severity (red first, then yellow, then green)
      allPatientsArray.sort((a, b) => {
        const severityOrder = {
          'red': 0,
          'yellow': 1,
          'green': 2
        };

        return severityOrder[a.severity] - severityOrder[b.severity];
      });

      console.log(`Processed ${allPatientsArray.length} patients: ` +
                 `${allPatientsArray.filter(p => p.severity === 'red').length} RED, ` +
                 `${allPatientsArray.filter(p => p.severity === 'yellow').length} YELLOW, ` +
                 `${allPatientsArray.filter(p => p.severity === 'green').length} GREEN`);

      return allPatientsArray;
    } catch (error) {
      console.error("Error getting patient alerts:", error);
      return [];
    }
  }

  // Format alert message based on severity level
  formatSmsMessage(alert: any): string {
    const { patientName, age, variables, alertReasons, severity } = alert;

    // Select the appropriate prefix based on severity
    let prefix = "";
    if (severity === 'red') {
      prefix = "🔴 URGENT ACTION REQUIRED";
    } else if (severity === 'yellow') {
      prefix = "🟡 ATTENTION NEEDED";
    } else {
      prefix = "🟢 ROUTINE CHECK";
    }

    // Build the variables section - only include most important metrics based on severity
    let variablesText = '';

    if (variables && variables.length > 0) {
      // For RED alerts, only show the critical variables
      // For YELLOW alerts, show up to 3 important variables
      // For GREEN, show just summary

      const variablesToShow = severity === 'red' ?
                              variables.filter((v: any) => alertReasons.some((r: string) => r.includes(v.name))) :
                              severity === 'yellow' ?
                              variables.slice(0, 3) :
                              variables.slice(0, 1);

      variablesText = variablesToShow.map((v: any) => {
        return `• ${v.name}: ${v.value}`;
      }).join('\n');
    }

    // Create reasoning text - keep it concise based on severity
    let reasoningText = '';
    if (alertReasons && alertReasons.length > 0) {
      if (severity === 'red') {
        // For red alerts, include all critical reasons
        reasoningText = alertReasons.filter(r => r.includes('CRITICAL')).join('\n');
      } else if (severity === 'yellow') {
        // For yellow alerts, include key attention reasons (max 2)
        reasoningText = alertReasons.slice(0, 2).join('\n');
      } else {
        // For green alerts, provide a positive note
        reasoningText = "No immediate health concerns, routine follow-up recommended";
      }
    } else if (severity === 'green') {
      reasoningText = "Routine wellness check, all readings within normal range";
    } else {
      reasoningText = "Please review patient data";
    }

    // Create the final message with appropriate length for severity
    if (severity === 'red') {
      // For RED alerts: Include all critical details
      return `${prefix} for ${patientName}, age ${age}:\n${variablesText}\n${reasoningText}\nREQUIRES IMMEDIATE CLINICAL ATTENTION`;
    } else if (severity === 'yellow') {
      // For YELLOW alerts: Include key details
      return `${prefix} for ${patientName}, age ${age}:\n${variablesText}\n${reasoningText}`;
    } else {
      // For GREEN alerts: Keep it brief
      return `${prefix}: ${patientName}, age ${age}\n${reasoningText}`;
    }
  }

  // System Settings methods
  async getSetting(key: string): Promise<string | null> {
    try {
      const [setting] = await db.select().from(systemSettings).where(eq(systemSettings.key, key));
      return setting?.value || null;
    } catch (error) {
      console.error(`Error getting setting ${key}:`, error);
      return null;
    }
  }

  async updateSetting(key: string, value: string): Promise<SystemSettings> {
    try {
      // Check if setting exists
      const existing = await this.getSetting(key);

      if (existing !== null) {
        // Update existing setting
        const [updated] = await db.update(systemSettings)
          .set({ value })
          .where(eq(systemSettings.key, key))
          .returning();
        return updated;
      } else {
        // Insert new setting
        const [newSetting] = await db.insert(systemSettings)
          .values({ key, value })
          .returning();
        return newSetting;
      }
    } catch (error) {
      console.error(`Error updating setting ${key}:`, error);
      throw error;
    }
  }

  async getAlertPhone(): Promise<string | null> {
    return this.getSetting('alertPhone');
  }

  async updateAlertPhone(phone: string): Promise<SystemSettings> {
    return this.updateSetting('alertPhone', phone);
  }

  async sendAlert(alertId: string): Promise<any> {
    try {
      // Get the configured alert phone number
      const alertPhone = await this.getAlertPhone();

      if (!alertPhone) {
        throw new Error("Alert phone number not configured");
      }

      // Get alert details from patient alerts (using the most recent batch)
      const alerts = await this.getPatientAlerts();
      const alert = alerts.find(a => a.id === alertId);

      if (!alert) {
        throw new Error(`No alert found with ID ${alertId}`);
      }

      const messageText = this.formatSmsMessage(alert);

      try {
        // Check for Twilio credentials
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

        if (!accountSid || !authToken || !twilioPhone) {
          throw new Error("Twilio credentials not configured");
        }

        // Initialize Twilio client
        const twilioClient = twilio(accountSid, authToken);

        // Send the message
        const message = await twilioClient.messages.create({
          body: messageText,
          from: twilioPhone,
          to: alertPhone
        });

        console.log(`SMS alert sent: ${messageText} (SID: ${message.sid})`);

        return {
          success: true,
          message: `Alert sent to ${alertPhone} for patient ${alert.patientName}`,
          alertId: alertId,
          sid: message.sid, // Include the Twilio SID in the response
          patientName: alert.patientName
        };
      } catch (error) {
        console.error(`Error sending SMS via Twilio:`, error);
        throw error; // Re-throw the error for the route handler to catch
      }
    } catch (error) {
      console.error(`Error in sendAlert:`, error);
      throw error;
    }
  }

  async sendAllAlerts(alertIds: string[]): Promise<{ sent: number }> {
    let sentCount = 0;

    for (const alertId of alertIds) {
      try {
        await this.sendAlert(alertId);
        sentCount++;
      } catch (error) {
        console.error(`Error sending alert ${alertId}:`, error);
      }
    }

    return { sent: sentCount };
  }

  // Monthly reports methods with sample data for demonstration
  async getMonthlyReports(): Promise<any[]> {
    // Query database for patient batches to count for monthly stats, selecting specific columns
    const batches = await db.select({
      id: patientBatches.id,
      batchId: patientBatches.batchId,
      fileName: patientBatches.fileName,
      createdAt: patientBatches.createdAt
    }).from(patientBatches);

    // Get count from database using drizzle ORM instead of raw query
    const countResult = await db.select({ count: sql`COUNT(*)` }).from(patientPrompts);
    const patientCount = parseInt(String(countResult[0]?.count || '0'), 10) || 0;

    // Only use real data from the database to generate reports
    if (batches.length > 0) {
      // Group batches by month and year
      const reportsByMonth: Record<string, any[]> = {};

      for (const batch of batches) {
        if (batch.createdAt) {
          const batchDate = new Date(batch.createdAt);
          const monthYear = `${batchDate.getFullYear()}-${String(batchDate.getMonth() + 1).padStart(2, '0')}`;

          if (!reportsByMonth[monthYear]) {
            reportsByMonth[monthYear] = [];
          }

          reportsByMonth[monthYear].push(batch);
        }
      }

      // Create one report per month from actual data
      const reports = Object.entries(reportsByMonth).map(([monthYear, monthBatches]) => {
        const [year, month] = monthYear.split('-');
        const batchCount = monthBatches.length;
        // Estimate file size based on patient count
        const estimatedFileSize = Math.max(0.2, Math.round(patientCount * 0.01 * 100) / 100).toFixed(1);

        return {
          id: `report-${monthYear}`,
          month,
          year: parseInt(year),
          status: "complete",
          generatedAt: new Date(monthBatches[0].createdAt).toISOString(),
          downloadUrl: `/api/download-report/${year}/${month}`,
          patientCount,
          batchCount,
          fileSize: `${estimatedFileSize} MB`
        };
      });

      console.log(`Returning ${reports.length} reports based on actual uploaded data`);
      return reports;
    }

    // If no batches exist, return an empty array
    console.log('No patient batches found in the database, returning empty reports array');
    return [];
  }

  async generateMonthlyReport(monthYear: string): Promise<any> {
    try {
      // Extract month and year from the parameter
      const [year, month] = monthYear.split('-');

      // Get patient data for the specific month and year
      const targetDate = new Date(`${year}-${month}-01`);
      const targetMonthStart = targetDate.toISOString().split('T')[0];

      // Calculate the month end date
      const targetMonthEnd = new Date(targetDate);
      targetMonthEnd.setMonth(targetMonthEnd.getMonth() + 1);
      targetMonthEnd.setDate(0); // Last day of the month
      const targetMonthEndStr = targetMonthEnd.toISOString().split('T')[0];

      console.log(`Generating report for period: ${targetMonthStart} to ${targetMonthEndStr}`);

      // Get all patients created within the month
      const periodPatients = await db.select({
        id: patientPrompts.id,
        patientId: patientPrompts.patientId,
        createdAt: patientPrompts.createdAt
      })
      .from(patientPrompts)
      .where(
        sql`${patientPrompts.createdAt} >= ${targetMonthStart} AND ${patientPrompts.createdAt} <= ${targetMonthEndStr}`
      );

      // Get batch information for the period
      const periodBatches = await db.select({
        id: patientBatches.id,
        batchId: patientBatches.batchId,
        fileName: patientBatches.fileName,
        createdAt: patientBatches.createdAt
      })
      .from(patientBatches)
      .where(
        sql`${patientBatches.createdAt} >= ${targetMonthStart} AND ${patientBatches.createdAt} <= ${targetMonthEndStr}`
      );

      // Get total patient count
      const totalPatientCount = periodPatients.length;
      console.log(`Found ${totalPatientCount} patients and ${periodBatches.length} batches for ${monthYear}`);

      // Create a pending report with actual data
      const report = {
        id: `report-${Date.now().toString(36)}`,
        month,
        year: parseInt(year),
        status: "pending",
        generatedAt: new Date().toISOString(),
        patientCount: totalPatientCount,
        batchCount: periodBatches.length,
        batchNames: periodBatches.map(b => b.fileName).join(', '),
        downloadUrl: `/api/download-report/${year}/${month}`
      };

      // Simulate report generation completed after a short delay
      // In a real implementation, this would be a background job
      setTimeout(async () => {
        console.log(`Report for ${monthYear} generation completed with ${totalPatientCount} patients.`);
      }, 2000);

      return report;
    } catch (error) {
      console.error(`Error generating report for ${monthYear}:`, error);
      throw error;
    }
  }

  // Call history methods
  async createCallHistory(callData: InsertCallHistory): Promise<CallHistory> {
    const [callRecord] = await db
      .insert(callHistory)
      .values(callData)
      .returning();
    return callRecord;
  }

  async getCallHistoryByPatient(patientId: string, limit?: number, offset?: number): Promise<CallHistory[]> {
    const baseQuery = db
      .select()
      .from(callHistory)
      .where(eq(callHistory.patientId, patientId))
      .orderBy(desc(callHistory.callDate));

    if (limit && offset) {
      return await baseQuery.limit(limit).offset(offset);
    } else if (limit) {
      return await baseQuery.limit(limit);
    } else if (offset) {
      return await baseQuery.offset(offset);
    } else {
      return await baseQuery;
    }
  }

  async getLatestCallForPatient(patientId: string): Promise<CallHistory | null> {
    const [latestCall] = await db
      .select()
      .from(callHistory)
      .where(eq(callHistory.patientId, patientId))
      .orderBy(desc(callHistory.callDate))
      .limit(1);
    return latestCall || null;
  }

  async updateCallHistory(callId: string, updates: Partial<InsertCallHistory>): Promise<CallHistory> {
    const [updatedCall] = await db
      .update(callHistory)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(callHistory.callId, callId))
      .returning();
    return updatedCall;
  }

  // Voice agent template methods
  async getVoiceAgentTemplate(): Promise<string> {
    try {
      // Try to get a saved template from system settings
      const template = await this.getSetting('voice_agent_template');
      if (template) {
        return template;
      }

      // Return default template if none saved
      return `You are a healthcare AI assistant calling PATIENT_NAME, a PATIENT_AGE-year-old patient with PATIENT_CONDITION.

PATIENT INFORMATION:
- Name: PATIENT_NAME
- Age: PATIENT_AGE
- Primary Condition: PATIENT_CONDITION

LATEST CARE ASSESSMENT:
PATIENT_PROMPT

CONVERSATION_HISTORY

CALL INSTRUCTIONS:
- You are calling on behalf of their healthcare team
- Be warm, professional, and empathetic in your approach
- Address the patient by their name (PATIENT_NAME)
- Reference their specific health condition (PATIENT_CONDITION) and any concerns mentioned above
- Ask about their current symptoms, medication adherence, and overall well-being
- Provide appropriate health guidance based on their condition and the care assessment
- Offer to schedule follow-up appointments if needed
- Keep the conversation focused on their health but maintain a natural, caring tone
- If they have questions about their condition or treatment, provide helpful information based on the care assessment

IMPORTANT: You have access to their latest health data and personalized care recommendations above. Use this information throughout the conversation to provide relevant, personalized care.`;
    } catch (error) {
      console.error("Error getting voice agent template:", error);
      // Return a basic default if there's an error
      return "You are a healthcare AI assistant. Be professional and empathetic when speaking with patients.";
    }
  }

  async updateVoiceAgentTemplate(template: string): Promise<void> {
    try {
      await this.updateSetting('voice_agent_template', template);
    } catch (error) {
      console.error("Error updating voice agent template:", error);
      throw error;
    }
  }

  // Add missing methods for call history management
  async getCallHistoryById(callId: string): Promise<CallHistory | null> {
    const [call] = await db
      .select()
      .from(callHistory)
      .where(eq(callHistory.callId, callId))
      .limit(1);
    return call || null;
  }

  async deleteCallHistory(callId: string): Promise<boolean> {
    const result = await db
      .delete(callHistory)
      .where(eq(callHistory.callId, callId));
    return result.rowCount > 0;
  }

  async getCallStatistics(filters: {
    startDate?: string;
    endDate?: string;
    patientId?: string;
  }): Promise<any> {
    let query = db.select({
      total: sql<number>`count(*)`,
      completed: sql<number>`sum(case when status = 'completed' then 1 else 0 end)`,
      failed: sql<number>`sum(case when status = 'failed' then 1 else 0 end)`,
      noAnswer: sql<number>`sum(case when status = 'no-answer' then 1 else 0 end)`,
      avgDuration: sql<number>`avg(duration)`,
    }).from(callHistory);

    // Apply filters
    const conditions = [];
    if (filters.startDate) {
      conditions.push(sql`${callHistory.callDate} >= ${filters.startDate}`);
    }
    if (filters.endDate) {
      conditions.push(sql`${callHistory.callDate} <= ${filters.endDate}`);
    }
    if (filters.patientId) {
      conditions.push(eq(callHistory.patientId, filters.patientId));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const [stats] = await query;
    return {
      totalCalls: stats?.total || 0,
      completedCalls: stats?.completed || 0,
      failedCalls: stats?.failed || 0,
      noAnswerCalls: stats?.noAnswer || 0,
      averageDuration: Math.round(stats?.avgDuration || 0),
      successRate: stats?.total ? Math.round((stats.completed / stats.total) * 100) : 0
    };
  }

  async getCallHistoryForExport(filters: {
    startDate?: string;
    endDate?: string;
    patientId?: string;
  }): Promise<CallHistory[]> {
    let query = db.select().from(callHistory);

    // Apply filters
    const conditions = [];
    if (filters.startDate) {
      conditions.push(sql`${callHistory.callDate} >= ${filters.startDate}`);
    }
    if (filters.endDate) {
      conditions.push(sql`${callHistory.callDate} <= ${filters.endDate}`);
    }
    if (filters.patientId) {
      conditions.push(eq(callHistory.patientId, filters.patientId));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    return await query.orderBy(desc(callHistory.callDate));
  }

  async getAllCallHistory(limit?: number, offset?: number): Promise<CallHistory[]> {
    let query = db
      .select()
      .from(callHistory)
      .orderBy(desc(callHistory.callDate));

    if (limit) {
      query = query.limit(limit);
    }
    if (offset) {
      query = query.offset(offset);
    }

    return await query;
  }

  // New method to get comprehensive call history context for system prompts
  async getCallHistoryContext(patientId: string, limit: number = 5): Promise<{
    hasHistory: boolean;
    contextText: string;
    recentCalls: number;
    allSummaries: string[];
    allKeyPoints: string[];
    allHealthConcerns: string[];
    allFollowUpItems: string[];
  }> {
    try {
      const callHistories = await this.getCallHistoryByPatient(patientId, limit);
      
      if (!callHistories || callHistories.length === 0) {
        return {
          hasHistory: false,
          contextText: "This is your first conversation with this patient.",
          recentCalls: 0,
          allSummaries: [],
          allKeyPoints: [],
          allHealthConcerns: [],
          allFollowUpItems: []
        };
      }

      // Extract all the data from call histories
      const allSummaries = callHistories
        .map(call => call.summary)
        .filter(summary => summary && summary.trim().length > 0);
      
      const allKeyPoints = callHistories
        .flatMap(call => call.keyPoints || [])
        .filter(point => point && point.trim().length > 0);
      
      const allHealthConcerns = callHistories
        .flatMap(call => call.healthConcerns || [])
        .filter(concern => concern && concern.trim().length > 0);
      
      const allFollowUpItems = callHistories
        .flatMap(call => call.followUpItems || [])
        .filter(item => item && item.trim().length > 0);

      // Create a comprehensive context text
      let contextText = `PREVIOUS CALL HISTORY (${callHistories.length} recent calls):\n`;
      
      // Add summaries from recent calls
      if (allSummaries.length > 0) {
        contextText += "\nCALL SUMMARIES:\n";
        allSummaries.forEach((summary, index) => {
          const callDate = callHistories[index]?.callDate;
          const dateStr = callDate ? new Date(callDate).toLocaleDateString() : 'Recent';
          contextText += `- ${dateStr}: ${summary}\n`;
        });
      }

      // Add key points
      if (allKeyPoints.length > 0) {
        contextText += "\nKEY DISCUSSION POINTS:\n";
        // Remove duplicates and limit to most relevant
        const uniqueKeyPoints = [...new Set(allKeyPoints)].slice(0, 10);
        uniqueKeyPoints.forEach(point => {
          contextText += `- ${point}\n`;
        });
      }

      // Add health concerns
      if (allHealthConcerns.length > 0) {
        contextText += "\nHEALTH CONCERNS MENTIONED:\n";
        const uniqueHealthConcerns = [...new Set(allHealthConcerns)].slice(0, 8);
        uniqueHealthConcerns.forEach(concern => {
          contextText += `- ${concern}\n`;
        });
      }

      // Add follow-up items
      if (allFollowUpItems.length > 0) {
        contextText += "\nFOLLOW-UP ITEMS:\n";
        const uniqueFollowUpItems = [...new Set(allFollowUpItems)].slice(0, 8);
        uniqueFollowUpItems.forEach(item => {
          contextText += `- ${item}\n`;
        });
      }

      contextText += "\nIMPORTANT: Reference relevant information from previous calls when appropriate and follow up on any outstanding concerns or action items.";

      return {
        hasHistory: true,
        contextText,
        recentCalls: callHistories.length,
        allSummaries,
        allKeyPoints,
        allHealthConcerns,
        allFollowUpItems
      };

    } catch (error) {
      console.error("Error getting call history context:", error);
      return {
        hasHistory: false,
        contextText: "This is your first conversation with this patient. (Note: Error retrieving call history)",
        recentCalls: 0,
        allSummaries: [],
        allKeyPoints: [],
        allHealthConcerns: [],
        allFollowUpItems: []
      };
    }
  }

  // Trend Report Prompt methods
  async getTrendReportPrompt(batchId?: string): Promise<TrendReportPrompt | null> {
    try {
      let prompt;
      
      if (batchId) {
        // Try to get batch-specific prompt first
        [prompt] = await db.select().from(trendReportPrompts)
          .where(eq(trendReportPrompts.batchId, batchId))
          .orderBy(desc(trendReportPrompts.id))
          .limit(1);
      }
      
      if (!prompt) {
        // Get global prompt (where batchId is null)
        [prompt] = await db.select().from(trendReportPrompts)
          .where(sql`${trendReportPrompts.batchId} IS NULL`)
          .orderBy(desc(trendReportPrompts.id))
          .limit(1);
      }
      
      return prompt || null;
    } catch (error) {
      console.error("Error fetching trend report prompt:", error);
      return null;
    }
  }

  async updateTrendReportPrompt(promptText: string, batchId?: string): Promise<TrendReportPrompt> {
    const timestamp = new Date().toISOString();
    
    const [prompt] = await db.insert(trendReportPrompts).values({
      prompt: this.sanitizeTrendReportPrompt(promptText),
      batchId: batchId || null,
      createdAt: timestamp,
      updatedAt: timestamp
    }).returning();
    
    return prompt;
  }

  sanitizeTrendReportPrompt(prompt: string): string {
    if (!prompt || typeof prompt !== 'string') return this.getDefaultTrendReportPrompt();
    
    // Remove potentially harmful content while preserving medical terminology
    const cleaned = prompt
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
      .replace(/javascript:/gi, '') // Remove javascript: URLs
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .trim();
    
    return cleaned || this.getDefaultTrendReportPrompt();
  }

  getDefaultTrendReportPrompt(): string {
    return `role: "system"
Senior Health Report, 250 words, easy to understand. 
You are a care team assistant that delivers reports based on the senior's unique health/activity data.
The goal is to provide a health and activity summary, highlighting data trends, improvements and also problematic points.
Your task is to:
1. Create a generic summary of around 100 words, the generated summary should be encased between the beginning start tag of <summary> and end tag of </summary>. 
   Analyze the provided measurements and look for trends and connections between data points.
   At the end make a small recommendation on what the care team's next steps should be with this patient (e.g.: continue monitoring, call in for a in person assessment etc)
2. Create a data submission compliance paragraph of around 30 words, the generated summary should be encased between the beginning start tag of <compliance> and end tag of </compliance>. 
   Taking into consideration that the patient needs to answer some questions, and make device measurements (as smart blood pressure cuff or sp02 devices) so that we have data to analyze, evaluate the patient's data submission compliance behavior.
   Point specific weaknesses or strong points when it comes to data submission consistency and clearly state the variables names for this situations (e.g.: Data appears consistent with all days having submission for blood pressure and heart rate).    
3. Create an insights paragraph of around 30 words, the generated summary should be encased between the beginning start tag of <insights> and end tag of </insights>. 
   For the provided data, extract a final insights paragraph that should make reference to the patient's condition.
 
role: "user"
Generate a personalized health report for the following patient:
Name: \${patient.name}
Age: \${patient.age}
Condition: \${patient.condition}
\${patient.isAlert ? 'Alert: Yes' : 'Alert: No'}
\${patient.variables ? \`Additional Variables: \${JSON.stringify(patient.variables, null, 2)}\` : ''} <-- in here we send a summary of the health and activity data for the selected period`;
  }
}

// Export an instance of DatabaseStorage
export const storage = new DatabaseStorage();