import { Express, Request, Response, NextFunction } from "express";
import { Server, createServer } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { patientPrompts, patientBatches, systemPrompts, phoneSchema } from "@shared/schema";
import { desc, eq, and, sql as SQL } from "drizzle-orm";
import ExcelJS from "exceljs";
import { 
  generatePrompt,
  getTokenUsageStats,
  getDefaultSystemPrompt,
  setDefaultSystemPrompt,
  extractReasoning
} from "./lib/openai";
import multer from "multer";
import path from "path";
import { nanoid } from "nanoid";
import { processExcelFile } from "./lib/excelProcessor";
import twilio from "twilio";
import { createObjectCsvStringifier } from "csv-writer";
import { setupAuth } from "./auth";
import fs from "fs";
import OpenAI from "openai";

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Set up multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== ".xlsx") {
      return cb(new Error("Only Excel (.xlsx) files are allowed"));
    }
    cb(null, true);
  },
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication
  setupAuth(app);

  // API endpoint for file upload

  app.post("/api/upload", upload.single("file"), async (req, res) => {
    try {
      console.log("Starting file upload process...");
      
      if (!req.isAuthenticated()) {
        console.log("Upload failed: Authentication required");
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      if (!req.file) {
        console.log("Upload failed: No file uploaded");
        return res
          .status(400)
          .json({ success: false, message: "No file uploaded" });
      }

      const file = req.file;
      const batchId = nanoid();
      const timestamp = new Date().toISOString();

      console.log(`Creating new batch: ${batchId} for file: ${file.originalname}`);

      // Create a batch record
      await storage.createPatientBatch({
        batchId,
        fileName: file.originalname,
        createdAt: timestamp,
      });

      try {
        // Process the Excel file and extract patient data
        console.log("Processing Excel file...");
        const patientData = await processExcelFile(file.buffer);
        console.log(`Successfully processed ${patientData.length} rows from Excel file`);

        // Deduplicate patients by name to ensure we only process each patient once
        const patientMap = new Map<string, typeof patientData[0]>();

        // First pass: organize patients by name and keep only the most complete record
        for (const patient of patientData) {
          const patientName = patient.name || 'Unknown';
          
          // If this is a duplicate patient name, decide which record to keep
          if (patientMap.has(patientName)) {
            const existing = patientMap.get(patientName)!;
            
            // Determine if the new record has more complete data
            const existingVarsCount = existing.variables ? Object.keys(existing.variables).length : 0;
            const newVarsCount = patient.variables ? Object.keys(patient.variables).length : 0;
            const existingIssuesCount = existing.issues ? existing.issues.length : 0;
            const newIssuesCount = patient.issues ? patient.issues.length : 0;
            
            // Keep the record with more data points
            if (newVarsCount > existingVarsCount || newIssuesCount > existingIssuesCount) {
              console.log(`Found more detailed record for ${patientName}, replacing previous entry`);
              patientMap.set(patientName, patient);
            }
          } else {
            // First time seeing this patient
            patientMap.set(patientName, patient);
          }
        }
        
        // Get unique patient records
        const uniquePatients = Array.from(patientMap.values());
        console.log(`Filtered ${patientData.length} rows to ${uniquePatients.length} unique patients`);
        
        // Update batch record with total unique patients
        await db.execute(SQL`
          UPDATE patient_batches 
          SET total_patients = ${uniquePatients.length}
          WHERE batch_id = ${batchId}
        `);

        const successfullyStored = [];

        // Process each unique patient record
        for (const patient of uniquePatients) {
          try {
            console.log(`Processing patient: ${patient.name || 'Unknown'}`);
            
            // Ensure patient has a unique ID
            const patientId = patient.patientId || `P${nanoid(6)}`;

            // Ensure patient object has the necessary fields
            const patientWithMetadata = {
              ...patient,
              patientId,
              issues: patient.issues || [],
              alertReasons: patient.alertReasons || [],
              variables: patient.variables || {},
            };

            console.log(`Generating prompt for patient ${patientId}...`);
            // Generate a prompt for the patient
            const prompt = await generatePrompt(patientWithMetadata, batchId);

            // Extract reasoning from the generated prompt
            const { displayPrompt, reasoning } = extractReasoning(prompt);

            console.log(`Storing prompt for patient ${patientId}...`);
            // Create the patient prompt record in the database
            await storage.createPatientPrompt({
              batchId,
              patientId,
              name: patient.name || "Unknown",
              age: patient.age || 0,
              condition: patient.condition || "Unknown",
              prompt,
              reasoning,
              isAlert: patient.isAlert ? "true" : "false",
              healthStatus: patient.healthStatus || "healthy",
              rawData: patientWithMetadata,
            });

            // Update processed patients count
            console.log(`Updating processed patients count for batch ${batchId}...`);
            await db.execute(SQL`
              UPDATE patient_batches 
              SET processed_patients = processed_patients + 1 
              WHERE batch_id = ${batchId}
            `);

            successfullyStored.push(patientId);
            console.log(`Successfully stored patient ${patientId}`);
          } catch (err) {
            console.error(`Error storing patient data:`, err);
            // Continue with other patients even if one fails
          }
        }

        console.log(`Upload complete. Processed ${patientData.length} patients, stored ${successfullyStored.length} records`);
        res.status(200).json({
          success: true,
          batchId,
          processed: patientData.length,
          stored: successfullyStored.length,
          message: `Processed ${patientData.length} patients, stored ${successfullyStored.length} records`,
        });
      } catch (err) {
        console.error("Error in Excel processing:", err);
        throw err; // Re-throw to be caught by the outer catch
      }
    } catch (err) {
      console.error("Error processing upload:", err);
      res.status(500).json({
        success: false,
        message: `Error processing file: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  // Get patient prompts for a batch
  app.get("/api/patient-prompts/:batchId", async (req, res) => {
    try {
      const { batchId } = req.params;
      const prompts = await storage.getPatientPromptsByBatchId(batchId);

      if (!prompts.length) {
        return res
          .status(404)
          .json({ message: "Batch not found or contains no prompts" });
      }

      res.status(200).json(prompts);
    } catch (err) {
      console.error("Error fetching prompts:", err);
      res
        .status(500)
        .json({
          message: `Error fetching prompts: ${err instanceof Error ? err.message : String(err)}`,
        });
    }
  });

  // Individual prompt regeneration endpoint
  app.post("/api/prompts/:id/regenerate", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        console.log("Regenerate prompt failed: Authentication required");
        return res.status(401).json({ 
          success: false, 
          message: "Authentication required" 
        });
      }

      const promptId = parseInt(req.params.id);
      if (isNaN(promptId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid prompt ID"
        });
      }

      // Get the prompt from the database
      const prompt = await storage.getPatientPromptById(promptId);
      if (!prompt) {
        return res.status(404).json({
          success: false,
          message: "Prompt not found"
        });
      }

      // Create patient data object from the prompt data
      let patientData;
      
      if (prompt.rawData) {
        // Use the original raw data if available
        patientData = prompt.rawData;
      } else {
        patientData = {
          patientId: prompt.patientId,
          name: prompt.name || 'Unknown Patient',
          age: prompt.age || 0,
          condition: prompt.condition || 'Unknown Condition',
          healthStatus: prompt.healthStatus || "alert",
          isAlert: prompt.isAlert === "true" || false
        };
      }
      
      // Try to get the system prompt from database first, fall back to default
      const systemPrompt = await storage.getSystemPrompt(prompt.batchId);
      const systemPromptText = systemPrompt ? systemPrompt.prompt : getDefaultSystemPrompt();
      
      // Generate new prompt using our main generatePrompt function with the current system prompt
      console.log(`Regenerating prompt for patient ${prompt.name} (${prompt.patientId})`);
      const newPrompt = await generatePrompt(patientData, prompt.batchId, systemPromptText);
      
      // Extract reasoning from the generated prompt
      const { displayPrompt, reasoning } = extractReasoning(newPrompt);
      
      // Update in the database with both the full prompt and the extracted reasoning
      await storage.updatePatientPrompt(prompt.id, { 
        prompt: newPrompt,
        reasoning: reasoning 
      });

      return res.status(200).json({
        success: true,
        message: "Prompt regenerated successfully"
      });
    } catch (err) {
      console.error("Error regenerating prompt:", err);
      return res.status(500).json({ 
        success: false, 
        message: `Error regenerating prompt: ${err instanceof Error ? err.message : String(err)}`
      });
    }
  });

  // Batch regeneration endpoint
  app.post("/api/prompts/regenerate-all", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        console.log("Regenerate all prompts failed: Authentication required");
        return res.status(401).json({ 
          success: false, 
          message: "Authentication required" 
        });
      }

      const batchId = req.query.batchId as string;
      if (!batchId) {
        return res.status(400).json({
          success: false,
          message: "Batch ID is required"
        });
      }

      // Get all prompts for this batch
      const allPrompts = await storage.getPatientPromptsByBatchId(batchId);
      
      if (!allPrompts.length) {
        return res.status(404).json({
          success: false,
          message: "No prompts found for this batch"
        });
      }
      
      // First, deduplicate the prompts by patientId
      // This ensures we regenerate only one prompt per patient
      const uniquePromptMap = new Map();
      
      // Group by patientId and take the prompt with the highest ID for each patient
      allPrompts.forEach(prompt => {
        const existing = uniquePromptMap.get(prompt.patientId);
        if (!existing || prompt.id > existing.id) {
          uniquePromptMap.set(prompt.patientId, prompt);
        }
      });
      
      const uniquePrompts = Array.from(uniquePromptMap.values());
      console.log(`Regenerating ${uniquePrompts.length} unique prompts (from ${allPrompts.length} total prompts)...`);
      
      let successCount = 0;
      const failedPrompts = [];
      
      // Process each prompt
      for (const prompt of uniquePrompts) {
        try {
          // Create patient data object from the prompt data
          let patientData;
          
          if (prompt.rawData) {
            // Use the original raw data if available
            patientData = prompt.rawData;
          } else {
            const parsedData = typeof prompt.rawData === 'string' ? 
              JSON.parse(prompt.rawData) : prompt.rawData || {};
              
            patientData = {
              patientId: prompt.patientId, // Most important field - ensures we're using the existing ID
              name: prompt.name || parsedData.name || 'Unknown Patient',
              age: prompt.age || parsedData.age || 0,
              condition: prompt.condition || parsedData.condition || 'Unknown Condition',
              healthStatus: prompt.healthStatus || parsedData.healthStatus || "alert",
              isAlert: prompt.isAlert === "true" || patientData.isAlert || false
            };
          }
          
          // Try to get the system prompt from database first, fall back to default
          const systemPrompt = await storage.getSystemPrompt(batchId);
          const systemPromptText = systemPrompt ? systemPrompt.prompt : getDefaultSystemPrompt();
          
          // Generate new prompt using our main generatePrompt function with the current system prompt
          console.log(`Regenerating prompt for patient ${prompt.name} (${prompt.patientId})`);
          const newPrompt = await generatePrompt(patientData, batchId, systemPromptText);
          
          // Extract reasoning from the generated prompt
          const { displayPrompt, reasoning } = extractReasoning(newPrompt);
          
          // Update in the database with both the full prompt and the extracted reasoning
          await storage.updatePatientPrompt(prompt.id, { 
            prompt: newPrompt,
            reasoning: reasoning 
          });
          successCount++;
        } catch (err) {
          console.error(`Error regenerating prompt for patient ${prompt.name}:`, err);
          failedPrompts.push({
            id: prompt.id,
            name: prompt.name,
            error: err instanceof Error ? err.message : String(err)
          });
        }
      }

      console.log(`Successfully regenerated ${successCount} of ${uniquePrompts.length} prompts${failedPrompts.length > 0 ? `, ${failedPrompts.length} failed` : ''}`);
      res.status(200).json({ 
        success: true, 
        message: `Successfully regenerated ${successCount} of ${uniquePrompts.length} prompts${failedPrompts.length > 0 ? `, ${failedPrompts.length} failed` : ''}`,
        regenerated: successCount,
        total: uniquePrompts.length,
        failed: failedPrompts.length,
        failedDetails: failedPrompts.length > 0 ? failedPrompts : undefined
      });
    } catch (err) {
      console.error("Error regenerating prompts:", err);
      return res.status(500).json({ 
        success: false, 
        message: `Error regenerating prompts: ${err instanceof Error ? err.message : String(err)}`
      });
    }
  });

  // Get system prompt (global or batch-specific)
  app.get("/api/sandbox/system-prompt", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      const batchId = req.query.batchId as string;
      const systemPrompt = await storage.getSystemPrompt(batchId);

      return res.status(200).json({
        success: true,
        prompt: systemPrompt?.prompt || "",
      });
    } catch (err) {
      console.error("Error getting system prompt:", err);
      return res.status(500).json({
        success: false,
        message: `Error getting system prompt: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  // Update system prompt
  app.post("/api/sandbox/system-prompt", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      const { prompt, batchId } = req.body;

      if (!prompt) {
        return res.status(400).json({
          success: false,
          message: "Prompt text is required",
        });
      }

      const updatedPrompt = await storage.updateSystemPrompt(prompt, batchId);

      return res.status(200).json({
        success: true,
        message: "Settings updated successfully"
      });
    }
    catch (err) {
      console.error("Error updating system prompt:", err);
      return res.status(500).json({
        success: false,
        message: `Error updating system prompt: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}