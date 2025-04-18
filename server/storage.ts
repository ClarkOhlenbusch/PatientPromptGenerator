import { 
  users,
  patientBatches,
  patientPrompts,
  type User, 
  type InsertUser, 
  type PatientBatch, 
  type InsertPatientBatch, 
  type PatientPrompt, 
  type InsertPatientPrompt 
} from "@shared/schema";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { db } from "./db";
import { and, eq } from "drizzle-orm";

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
  updatePatientPrompt(id: number, updates: Partial<InsertPatientPrompt>): Promise<PatientPrompt>;
  
  // Template methods
  getPromptTemplate(patientId: string): Promise<{ template: string, originalTemplate?: string } | null>;
  updatePromptTemplate(patientId: string, template: string): Promise<void>;
  
  // Triage methods
  getPatientAlerts(date: string): Promise<any[]>;
  sendAlert(alertId: string): Promise<any>;
  sendAllAlerts(alertIds: string[]): Promise<{ sent: number }>;
  
  // Monthly reports methods
  getMonthlyReports(): Promise<any[]>;
  generateMonthlyReport(monthYear: string): Promise<any>;
  
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
    return await db.select().from(patientBatches).orderBy(patientBatches.createdAt);
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

  async updatePatientPrompt(id: number, updates: Partial<InsertPatientPrompt>): Promise<PatientPrompt> {
    // Create a cleaned up version of the update data that matches our schema
    const updateData: Record<string, any> = {};
    
    if (updates.prompt) updateData.prompt = updates.prompt;
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
  
  // Template methods - stub implementations that we'll replace with actual DB operations
  async getPromptTemplate(patientId: string): Promise<{ template: string, originalTemplate?: string } | null> {
    // This would pull from a prompt_templates table in a real implementation
    const [prompt] = await db.select().from(patientPrompts).where(eq(patientPrompts.patientId, patientId));
    if (!prompt) {
      return null;
    }
    
    // For now, we'll return a default template based on the prompt
    return {
      template: `Hello {name}, 

Based on your recent health data, I notice {reasoning}.

Current reading: {current}
Trend: {slope}
Compliance: {compliance}%

Let's discuss this at your next appointment.`,
      originalTemplate: `Hello {name}, 

Based on your recent health data, I notice {reasoning}.

Current reading: {current}
Trend: {slope}
Compliance: {compliance}%

Let's discuss this at your next appointment.`
    };
  }
  
  async updatePromptTemplate(patientId: string, template: string): Promise<void> {
    // This would update a prompt_templates table in a real implementation
    // For now, we'll just log that we received the update
    console.log(`Updated template for patient ${patientId}:`, template);
  }
  
  // Triage methods - stub implementations that we'll replace with actual DB operations
  async getPatientAlerts(date: string): Promise<any[]> {
    // This would pull from a patient_alerts table in a real implementation
    // For now, return empty array
    return [];
  }
  
  async sendAlert(alertId: string): Promise<any> {
    // This would update a patient_alerts table and call SMS service in a real implementation
    return { success: true, patientName: "Test Patient" };
  }
  
  async sendAllAlerts(alertIds: string[]): Promise<{ sent: number }> {
    // This would update multiple patient_alerts and call SMS service in a real implementation
    return { sent: alertIds.length };
  }
  
  // Monthly reports methods - stub implementations that we'll replace with actual DB operations
  async getMonthlyReports(): Promise<any[]> {
    // This would pull from a monthly_reports table in a real implementation
    // For now, return empty array
    return [];
  }
  
  async generateMonthlyReport(monthYear: string): Promise<any> {
    // This would create an entry in monthly_reports table in a real implementation
    return { 
      id: Math.random().toString(36).substring(7),
      month: monthYear.split('-')[1],
      year: parseInt(monthYear.split('-')[0]),
      status: "pending",
      generatedAt: new Date().toISOString(),
      patientCount: 0
    };
  }
}

export const storage = new DatabaseStorage();
