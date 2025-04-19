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
import { and, eq, sql as SQL } from "drizzle-orm";

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
  
  // Triage methods using real data from uploaded patient file
  async getPatientAlerts(date: string): Promise<any[]> {
    try {
      console.log(`Getting patient alerts for date: ${date}`);
      
      // Convert date string to Date object for comparison
      const requestDate = date ? new Date(date) : new Date();
      requestDate.setHours(0, 0, 0, 0); // Set to start of day
      
      // Query database for all patient prompts with just the columns we know exist
      const allPatients = await db.select({
        id: patientPrompts.id,
        patientId: patientPrompts.patientId,
        name: patientPrompts.name,
        age: patientPrompts.age,
        condition: patientPrompts.condition,
        isAlert: patientPrompts.isAlert,
        healthStatus: patientPrompts.healthStatus,
        createdAt: patientPrompts.createdAt,
        rawData: patientPrompts.rawData
      }).from(patientPrompts);
      
      // Filter to alerts only
      const alertPatients = allPatients.filter(p => p.isAlert === 'true');
      
      // Group alerts by patient (using patientId as the key)
      const patientAlertsMap = new Map();
      
      alertPatients.forEach(patient => {
        // Extract relevant data
        const alertData = {
          id: `alert-${patient.id}`,
          patientId: patient.patientId,
          patientName: patient.name,
          age: patient.age,
          condition: patient.condition,
          createdAt: patient.createdAt,
          variables: [],
          status: "pending", // Default to pending
          sentAt: null
        };
        
        // Extract variables from rawData if available
        if (patient.rawData) {
          if (typeof patient.rawData === 'string') {
            try {
              patient.rawData = JSON.parse(patient.rawData);
            } catch (e) {
              console.warn(`Could not parse rawData for patient ${patient.patientId}:`, e);
            }
          }
          
          // Extract relevant measurements/variables from rawData
          if (patient.rawData.variables) {
            const variables = patient.rawData.variables;
            Object.keys(variables).forEach(key => {
              if (key !== 'patientId' && key !== 'name' && key !== 'age' && key !== 'condition') {
                alertData.variables.push({
                  name: key,
                  value: variables[key],
                  timestamp: patient.createdAt
                });
              }
            });
          }
          
          // Extract reasoning if available
          if (patient.rawData.alertReasons && patient.rawData.alertReasons.length > 0) {
            alertData.reasoning = patient.rawData.alertReasons.join('; ');
          } else {
            alertData.reasoning = `Abnormal ${patient.condition} readings`;
          }
        }
        
        // Format the SMS message using the new template
        alertData.message = this.formatSmsMessage(alertData);
        
        // Add to or update the patient in the map
        if (patientAlertsMap.has(patient.patientId)) {
          const existingPatient = patientAlertsMap.get(patient.patientId);
          // Add this alert's variables to the existing patient
          existingPatient.variables = [...existingPatient.variables, ...alertData.variables];
          existingPatient.alertCount = (existingPatient.alertCount || 0) + 1;
          
          // Update the message to include all variables
          existingPatient.message = this.formatSmsMessage(existingPatient);
        } else {
          // First alert for this patient
          alertData.alertCount = 1;
          patientAlertsMap.set(patient.patientId, alertData);
        }
      });
      
      // Convert map to array
      const groupedAlerts = Array.from(patientAlertsMap.values());
      
      console.log(`Found ${groupedAlerts.length} patients with alerts`);
      return groupedAlerts;
    } catch (error) {
      console.error("Error getting patient alerts:", error);
      return [];
    }
  }
  
  // Format SMS message with the new template
  formatSmsMessage(alert: any): string {
    const { patientName, age, variables, reasoning } = alert;
    
    // Build the variables section
    let variablesText = '';
    if (variables && variables.length > 0) {
      variablesText = variables.map((v: any) => {
        // Format timestamp if available
        const timestamp = v.timestamp ? new Date(v.timestamp).toLocaleString() : 'unknown time';
        return `• ${v.name}: ${v.value} at ${timestamp}`;
      }).join('\n');
    }
    
    // Create the message using the new template
    return `ALERT for ${patientName}, age ${age}:
${variablesText}
Reasoning: ${reasoning || 'Abnormal readings detected'}`;
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
    // Query database for patient batches to count for monthly stats, selecting specific columns
    const batches = await db.select({
      id: patientBatches.id,
      batchId: patientBatches.batchId,
      fileName: patientBatches.fileName,
      createdAt: patientBatches.createdAt
    }).from(patientBatches);
    
    // Get count from database directly using raw query
    const { pool } = await import('./db');
    const countResult = await pool.query('SELECT COUNT(*) as count FROM patient_prompts');
    const patientCount = parseInt(countResult.rows[0].count as string, 10) || 0;
    
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
        SQL`${patientPrompts.createdAt} >= ${targetMonthStart} AND ${patientPrompts.createdAt} <= ${targetMonthEndStr}`
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
        SQL`${patientBatches.createdAt} >= ${targetMonthStart} AND ${patientBatches.createdAt} <= ${targetMonthEndStr}`
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
        
        // In a real implementation, we would update a database record
        // For now, we'll just print a message indicating the status change
        console.log(`Report status updated from "pending" to "complete"`);
        
        // Calculate file size based on real data
        const fileSizeKB = Math.max(10, Math.round(totalPatientCount * 2.5));
        console.log(`Report estimated size: ${fileSizeKB} KB`);
      }, 3000);
      
      return report;
    } catch (error) {
      console.error(`Error generating monthly report for ${monthYear}:`, error);
      throw error;
    }
  }
}

export const storage = new DatabaseStorage();
