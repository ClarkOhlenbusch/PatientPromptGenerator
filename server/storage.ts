import { 
  type User, 
  type InsertUser, 
  type PatientBatch, 
  type InsertPatientBatch, 
  type PatientPrompt, 
  type InsertPatientPrompt 
} from "@shared/schema";

// Modify the interface with any CRUD methods you might need
export interface IStorage {
  // User methods (kept from original)
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Patient Batch methods
  createPatientBatch(batch: InsertPatientBatch): Promise<PatientBatch>;
  getPatientBatch(batchId: string): Promise<PatientBatch | undefined>;
  
  // Patient Prompt methods
  createPatientPrompt(prompt: InsertPatientPrompt): Promise<PatientPrompt>;
  getPatientPromptsByBatchId(batchId: string): Promise<PatientPrompt[]>;
  getPatientPromptByIds(batchId: string, patientId: string): Promise<PatientPrompt | undefined>;
  updatePatientPrompt(id: number, updates: Partial<InsertPatientPrompt>): Promise<PatientPrompt>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private patientBatches: Map<string, PatientBatch>;
  private patientPrompts: Map<number, PatientPrompt>;
  
  private currentUserId: number;
  private currentPromptId: number;
  private currentBatchId: number;

  constructor() {
    this.users = new Map();
    this.patientBatches = new Map();
    this.patientPrompts = new Map();
    
    this.currentUserId = 1;
    this.currentPromptId = 1;
    this.currentBatchId = 1;
  }

  // User methods (kept from original)
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }
  
  // Patient Batch methods
  async createPatientBatch(insertBatch: InsertPatientBatch): Promise<PatientBatch> {
    const id = this.currentBatchId++;
    const batch: PatientBatch = { ...insertBatch, id };
    this.patientBatches.set(batch.batchId, batch);
    return batch;
  }
  
  async getPatientBatch(batchId: string): Promise<PatientBatch | undefined> {
    return this.patientBatches.get(batchId);
  }
  
  // Patient Prompt methods
  async createPatientPrompt(insertPrompt: InsertPatientPrompt): Promise<PatientPrompt> {
    const id = this.currentPromptId++;
    
    // Ensure rawData is not undefined to satisfy PatientPrompt type
    const prompt: PatientPrompt = { 
      ...insertPrompt, 
      id,
      rawData: insertPrompt.rawData ?? null
    };
    
    this.patientPrompts.set(id, prompt);
    return prompt;
  }
  
  async getPatientPromptsByBatchId(batchId: string): Promise<PatientPrompt[]> {
    return Array.from(this.patientPrompts.values()).filter(
      (prompt) => prompt.batchId === batchId
    );
  }
  
  async getPatientPromptByIds(batchId: string, patientId: string): Promise<PatientPrompt | undefined> {
    return Array.from(this.patientPrompts.values()).find(
      (prompt) => prompt.batchId === batchId && prompt.patientId === patientId
    );
  }
  
  async updatePatientPrompt(id: number, updates: Partial<InsertPatientPrompt>): Promise<PatientPrompt> {
    const prompt = this.patientPrompts.get(id);
    
    if (!prompt) {
      throw new Error(`Patient prompt with id ${id} not found`);
    }
    
    const updatedPrompt = { ...prompt, ...updates };
    this.patientPrompts.set(id, updatedPrompt);
    
    return updatedPrompt;
  }
}

export const storage = new MemStorage();
