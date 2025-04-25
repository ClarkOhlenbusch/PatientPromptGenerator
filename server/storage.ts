import { 
  users,
  patientBatches,
  patientPrompts,
  systemPrompts,
  systemSettings,
  type User, 
  type InsertUser, 
  type PatientBatch, 
  type InsertPatientBatch, 
  type PatientPrompt, 
  type InsertPatientPrompt,
  type SystemPrompt,
  type InsertSystemPrompt,
  type SystemSettings
} from "@shared/schema";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { db } from "./db";
import { and, eq, sql, desc } from "drizzle-orm";
import twilio from "twilio";
import type { SystemPrompt as SystemPromptType } from '@shared/types';

// Modify the interface with any CRUD methods you might need
export interface IStorage {
  // User methods
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
  updatePatientPrompt(id: number, updates: Partial<InsertPatientPrompt>): Promise<PatientPrompt>;
  
  // System Prompt methods
  getSystemPrompt(batchId?: string): Promise<SystemPrompt | null>;
  updateSystemPrompt(promptText: string, batchId?: string): Promise<SystemPrompt>;
  
  // System Settings methods
  getSetting(key: string): Promise<string | null>;
  updateSetting(key: string, value: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  public sessionStore: session.Store;

  constructor() {
    const pgSession = connectPg(session);
    this.sessionStore = new pgSession({
      tableName: 'user_sessions',
      pool: db.config.pool,
      schemaName: 'public',
      createTableIfMissing: true
    });
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [newUser] = await db.insert(users).values(user).returning();
    return newUser;
  }

  // Patient Batch methods
  async createPatientBatch(batch: InsertPatientBatch): Promise<PatientBatch> {
    const [newBatch] = await db.insert(patientBatches).values(batch).returning();
    return newBatch;
  }

  async getPatientBatch(batchId: string): Promise<PatientBatch | undefined> {
    const [batch] = await db.select().from(patientBatches).where(eq(patientBatches.batchId, batchId));
    return batch;
  }

  async getAllPatientBatches(): Promise<PatientBatch[]> {
    return await db.select().from(patientBatches);
  }

  // Patient Prompt methods
  async createPatientPrompt(insertPrompt: InsertPatientPrompt): Promise<PatientPrompt> {
    // Create a cleaned up version of the insert data that matches our schema
    const promptData = {
      batchId: insertPrompt.batchId,
      patientId: insertPrompt.patientId,
      name: insertPrompt.name,
      age: insertPrompt.age,
      condition: insertPrompt.condition,
      prompt: insertPrompt.prompt,
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
    return await db.select().from(patientPrompts).where(eq(patientPrompts.batchId, batchId));
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

  async updatePatientPrompt(id: number, updates: Partial<InsertPatientPrompt>): Promise<PatientPrompt> {
    const [updatedPrompt] = await db.update(patientPrompts)
      .set({
        ...updates,
        updatedAt: new Date().toISOString()
      })
      .where(eq(patientPrompts.id, id))
      .returning();
    return updatedPrompt;
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

  async updateSetting(key: string, value: string): Promise<void> {
    try {
      await db.insert(systemSettings)
        .values({ key, value })
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: { value, updatedAt: new Date().toISOString() }
        });
    } catch (error) {
      console.error(`Error updating setting ${key}:`, error);
      throw error;
    }
  }
}