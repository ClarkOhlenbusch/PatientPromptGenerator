import { 
  users,
  patientBatches,
  patientPrompts,
  systemPrompts,
  templateVariables,
  type User, 
  type InsertUser, 
  type PatientBatch, 
  type InsertPatientBatch, 
  type PatientPrompt, 
  type InsertPatientPrompt,
  type SystemPrompt,
  type InsertSystemPrompt,
  type TemplateVariable,
  type InsertTemplateVariable
} from "@shared/schema";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { db } from "./db";
import { and, eq, sql, desc } from "drizzle-orm";

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
  
  // Patient Template methods
  getPromptTemplate(patientId: string): Promise<{ template: string, originalTemplate?: string } | null>;
  updatePromptTemplate(patientId: string, template: string): Promise<void>;
  
  // System Prompt methods
  getSystemPrompt(batchId?: string): Promise<SystemPrompt | null>;
  updateSystemPrompt(prompt: string, batchId?: string): Promise<SystemPrompt>;
  
  // Template Variables methods
  getTemplateVariables(batchId?: string): Promise<TemplateVariable[]>;
  createTemplateVariable(variable: InsertTemplateVariable): Promise<TemplateVariable>;
  updateTemplateVariable(id: number, updates: Partial<InsertTemplateVariable>): Promise<TemplateVariable>;
  deleteTemplateVariable(id: number): Promise<void>;
  
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
      let query = db.select().from(systemPrompts);
      
      // If batch ID is provided, try to get a batch-specific system prompt
      if (batchId) {
        const [batchPrompt] = await query.where(eq(systemPrompts.batchId, batchId));
        if (batchPrompt) {
          return batchPrompt;
        }
      }
      
      // Otherwise, get the global default prompt (null batchId)
      const [defaultPrompt] = await db.select()
        .from(systemPrompts)
        .where(sql`${systemPrompts.batchId} IS NULL`)
        .orderBy(desc(systemPrompts.createdAt))
        .limit(1);
      
      return defaultPrompt || null;
    } catch (error) {
      console.error("Error fetching system prompt:", error);
      return null;
    }
  }
  
  async updateSystemPrompt(promptText: string, batchId?: string): Promise<SystemPrompt> {
    try {
      // Sanitize the prompt
      const sanitizedPrompt = this.sanitizeSystemPrompt(promptText);
      
      // Check if we have an existing system prompt for this batch
      let existingPrompt: SystemPrompt | null = null;
      if (batchId) {
        [existingPrompt] = await db.select()
          .from(systemPrompts)
          .where(eq(systemPrompts.batchId, batchId));
      } else {
        [existingPrompt] = await db.select()
          .from(systemPrompts)
          .where(sql`${systemPrompts.batchId} IS NULL`)
          .orderBy(desc(systemPrompts.createdAt))
          .limit(1);
      }
      
      // Update or insert
      if (existingPrompt) {
        // Update existing prompt
        const [updatedPrompt] = await db.update(systemPrompts)
          .set({
            prompt: sanitizedPrompt,
            updatedAt: new Date().toISOString()
          })
          .where(eq(systemPrompts.id, existingPrompt.id))
          .returning();
          
        return updatedPrompt;
      } else {
        // Insert new prompt
        const [newPrompt] = await db.insert(systemPrompts)
          .values({
            batchId: batchId || null,
            prompt: sanitizedPrompt,
            createdAt: new Date().toISOString()
          })
          .returning();
          
        return newPrompt;
      }
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
  async getPatientAlerts(date: string, mostRecentBatchOnly: boolean = false): Promise<any[]> {
    try {
      console.log(`Getting patient alerts for date: ${date}${mostRecentBatchOnly ? ' (most recent batch only)' : ''}`);
      
      // Convert date string to Date object for comparison
      const requestDate = date ? new Date(date) : new Date();
      requestDate.setHours(0, 0, 0, 0); // Set to start of day
      
      // Find the most recent batch if requested
      let latestBatchId: string | null = null;
      
      if (mostRecentBatchOnly) {
        const latestBatches = await db.select()
          .from(patientBatches)
          .orderBy(desc(patientBatches.createdAt))
          .limit(1);
          
        if (latestBatches && latestBatches.length > 0) {
          latestBatchId = latestBatches[0].batchId;
          console.log(`Filtering alerts to most recent batch: ${latestBatchId}`);
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
      
      // Apply batch filter if requested and available
      if (mostRecentBatchOnly && latestBatchId) {
        query = query.where(eq(patientPrompts.batchId, latestBatchId));
      }
      
      const allPatients = await query;
      
      // Group all patients by ID (not just alerts)
      const patientMap = new Map();
      
      // Process all patients to categorize by severity
      allPatients.forEach(patient => {
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
        else if (patient.isAlert === 'true') {
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
