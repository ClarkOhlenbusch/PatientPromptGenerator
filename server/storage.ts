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
  
  // Triage methods - stub implementations with sample data for demonstration
  async getPatientAlerts(date: string): Promise<any[]> {
    // Query database for patients with alerts from given date
    const patients = await db.select().from(patientPrompts).where(eq(patientPrompts.isAlert, "true"));
    
    // If we have real alerts, use those
    if (patients.length > 0) {
      // Convert patients to alert format
      return patients.map(patient => ({
        id: `alert-${patient.id}`,
        patientId: patient.patientId,
        patientName: patient.name,
        age: patient.age,
        condition: patient.condition,
        alertValue: "Abnormal reading detected",
        timestamp: new Date().toISOString(),
        status: "pending",
        message: `ALERT: Patient ${patient.name} (${patient.age}), with condition ${patient.condition}, needs attention. Please check their latest readings and contact them as soon as possible.`
      }));
    }
    
    // Otherwise, generate sample data for demonstration
    return [
      {
        id: "alert-1",
        patientId: "3164",
        patientName: "Fabien Deniau",
        age: 85,
        condition: "Hypertension",
        alertValue: "BP 180/95",
        timestamp: new Date().toISOString(),
        status: "pending",
        message: "ALERT: Patient Fabien Deniau (85), with hypertension, has a blood pressure reading of 180/95. Please contact them to adjust medication and schedule a follow-up appointment."
      },
      {
        id: "alert-2",
        patientId: "3166",
        patientName: "Amelia Rodriguez",
        age: 72,
        condition: "Diabetes",
        alertValue: "Glucose 210 mg/dL",
        timestamp: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        status: "sent",
        sentAt: new Date(Date.now() - 3300000).toISOString(), // 55 minutes ago
        message: "ALERT: Patient Amelia Rodriguez (72), with diabetes, has an elevated blood glucose level of 210 mg/dL. Please contact them to discuss insulin adjustment and dietary recommendations."
      },
      {
        id: "alert-3",
        patientId: "3167",
        patientName: "Robert Chen",
        age: 68,
        condition: "COPD",
        alertValue: "SpO2 89%",
        timestamp: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
        status: "failed",
        message: "ALERT: Patient Robert Chen (68), with COPD, has a low oxygen saturation of 89%. Please contact them immediately to assess respiratory status and consider supplemental oxygen."
      }
    ];
  }
  
  async sendAlert(alertId: string): Promise<any> {
    // This would update a patient_alerts table and call SMS service in a real implementation
    return { success: true, patientName: "Test Patient" };
  }
  
  async sendAllAlerts(alertIds: string[]): Promise<{ sent: number }> {
    // This would update multiple patient_alerts and call SMS service in a real implementation
    return { sent: alertIds.length };
  }
  
  // Monthly reports methods with sample data for demonstration
  async getMonthlyReports(): Promise<any[]> {
    // Query database for patient batches to count for monthly stats
    const batches = await db.select().from(patientBatches);
    const patients = await db.select().from(patientPrompts);
    
    // If we have real data, use it to create sample reports
    if (batches.length > 0) {
      // Get the current month
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();
      
      // Create a report for the current month
      return [
        {
          id: "report-current",
          month: String(currentMonth).padStart(2, '0'),
          year: currentYear,
          status: "complete",
          generatedAt: new Date(now.getTime() - 86400000).toISOString(), // Yesterday
          downloadUrl: "#",
          patientCount: patients.length,
          fileSize: "1.2 MB"
        }
      ];
    }
    
    // Otherwise, generate sample data for demonstration
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();
    
    // Generate reports for the last 3 months
    return [
      {
        id: "report-1",
        month: String(currentMonth).padStart(2, '0'),
        year: currentYear,
        generatedAt: new Date(currentDate.getTime() - 2 * 86400000).toISOString(), // 2 days ago
        downloadUrl: "#",
        patientCount: 145,
        status: "complete",
        fileSize: "2.3 MB"
      },
      {
        id: "report-2",
        month: String(currentMonth - 1).padStart(2, '0'),
        year: currentYear,
        generatedAt: new Date(currentDate.getTime() - 32 * 86400000).toISOString(), // Previous month
        downloadUrl: "#",
        patientCount: 138,
        status: "complete",
        fileSize: "2.1 MB"
      },
      {
        id: "report-3",
        month: String(currentMonth - 2).padStart(2, '0'),
        year: currentYear,
        generatedAt: new Date(currentDate.getTime() - 62 * 86400000).toISOString(), // 2 months ago
        downloadUrl: "#",
        patientCount: 129,
        status: "complete",
        fileSize: "2.0 MB"
      }
    ];
  }
  
  async generateMonthlyReport(monthYear: string): Promise<any> {
    // Extract month and year from the parameter
    const [year, month] = monthYear.split('-');
    
    // Create a pending report (simulating async generation)
    const report = {
      id: `report-${Date.now().toString(36)}`,
      month,
      year: parseInt(year),
      status: "pending",
      generatedAt: new Date().toISOString(),
      patientCount: Math.floor(Math.random() * 50) + 100, // Random patient count between 100-150
      downloadUrl: "#"
    };
    
    // Simulate report generation completed after a few seconds
    // (In a real implementation, this would be a background job)
    setTimeout(async () => {
      console.log(`Report for ${monthYear} generation completed.`);
      // We would update the database record here
    }, 5000);
    
    return report;
  }
}

export const storage = new DatabaseStorage();
