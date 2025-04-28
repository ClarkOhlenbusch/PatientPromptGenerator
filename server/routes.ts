import { Express, Request, Response } from "express";
import { createServer, Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import { nanoid } from "nanoid";
import { processExcelFile } from "./lib/excelProcessor";
import {
  generatePrompt,
  getTokenUsageStats,
  generatePromptWithTemplate,
  getDefaultSystemPrompt,
  setDefaultSystemPrompt,
  extractReasoning
} from "./lib/openai";
import twilio from "twilio";
import { createObjectCsvStringifier } from "csv-writer";
import ExcelJS from "exceljs";
import { db } from "./db";
import { patientPrompts, patientBatches, PatientPrompt } from "@shared/schema";
import { setupAuth } from "./auth";
import fs from "fs";
import { eq, and, desc, sql as SQL } from "drizzle-orm";
import { phoneSchema } from "@shared/schema";
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
        // Assert db type as NeonDatabase using double assertion
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
            // ---> ADDED: Log just before creating the prompt record
            console.log(`Attempting to create prompt record for patient ${patientId} in batch ${batchId}`);
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

            // ---> ADDED: Log successful prompt creation
            console.log(`Successfully created prompt record for patient ${patientId} in batch ${batchId}`);

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
            // ---> ADDED: Log which patient failed specifically
            console.error(`Failed to process and store data for patient ${patient.name || 'Unknown'} (ID attempt: ${patient.patientId || 'None'}) in batch ${batchId}`);
            // Continue with other patients even if one fails
          }
        }

        console.log(`Upload complete. Processed ${patientData.length} patients, stored ${successfullyStored.length} records`);
        // Use standard wrapper for success
        res.status(200).json({
          success: true,
          data: {
            batchId,
            processed: patientData.length,
            stored: successfullyStored.length,
          },
          message: `Processed ${patientData.length} patients, stored ${successfullyStored.length} records`,
        });
      } catch (err) {
        console.error("Error in Excel processing or patient storing:", err);
        // Ensure error response uses standard wrapper
        res.status(500).json({
          success: false,
          data: null,
          error: `Error processing file: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    } catch (err) {
      console.error("Outer error processing upload:", err);
      // Ensure error response uses standard wrapper
      res.status(500).json({
        success: false,
        data: null,
        error: `Error processing file: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  // Get patient prompts for a batch
  app.get("/api/patient-prompts/:batchId", async (req: Request<{ batchId: string }>, res) => {
    try {
      const { batchId } = req.params;
      const prompts = await storage.getPatientPromptsByBatchId(batchId);

      // Use standard wrapper, return 200 OK with empty/populated array
      res.status(200).json({
        success: true,
        data: prompts || [],
        message: prompts.length > 0 ? "Prompts retrieved successfully" : "No prompts found for this batch"
      });
    } catch (err) {
      console.error("Error fetching prompts:", err);
      // Use standard wrapper for error
      res.status(500).json({
          success: false,
          data: null,
          error: `Error fetching prompts: ${err instanceof Error ? err.message : String(err)}`,
        });
    }
  });

  // Regenerate a single prompt
  app.post(
    "/api/patient-prompts/:batchId/regenerate/:patientId",
    async (req: Request<{ batchId: string, patientId: string }>, res) => {
      try {
        // No auth check here? Assuming protected by middleware
        const { batchId, patientId } = req.params;

        const patientPrompt = await storage.getPatientPromptByIds(
          batchId,
          patientId,
        );

        // Handle specific resource not found with 404 + standard wrapper
        if (!patientPrompt) {
          return res.status(404).json({
            success: false,
            data: null,
            error: "Patient prompt not found"
           });
        }

        const rawData = patientPrompt.rawData || {
          patientId: patientPrompt.patientId,
          name: patientPrompt.name,
          age: patientPrompt.age,
          condition: patientPrompt.condition,
        };

        // Fetch the custom system prompt for this batch if available
        const systemPrompt = await storage.getSystemPrompt(batchId);
        const customSystemPrompt = systemPrompt?.prompt;

        console.log(`Regenerating prompt for patient ${patientId} with ${customSystemPrompt ? 'custom' : 'default'} system prompt`);

        const newPrompt = await generatePrompt(rawData as any, batchId, customSystemPrompt);

        // Update prompt in storage (assuming this returns the updated prompt or ID)
        const updatedPrompt = await storage.updatePatientPrompt(patientPrompt.id, {
          prompt: newPrompt,
        });

        // Use standard wrapper for success, maybe return the updated prompt?
        res.status(200).json({ 
          success: true, 
          data: updatedPrompt, // Return the updated prompt object
          message: "Prompt regenerated successfully" 
        });
      } catch (err) {
        console.error("Error regenerating prompt:", err);
        // Use standard wrapper for error
        res.status(500).json({
            success: false,
            data: null,
            error: `Error regenerating prompt: ${err instanceof Error ? err.message : String(err)}`,
          });
      }
    },
  );

  // Regenerate all prompts for a batch
  app.post("/api/patient-prompts/:batchId/regenerate", async (req: Request<{ batchId: string }>, res) => {
    try {
      // No auth check here? Assuming protected by middleware
      const { batchId } = req.params;

      const prompts = await storage.getPatientPromptsByBatchId(batchId);

      // Handle case where collection is empty - 200 OK + standard wrapper
      if (!prompts.length) {
        console.log(`No prompts found for batch ${batchId}, returning empty success`);
        // Use standard wrapper
        return res.status(200).json({ 
          success: true,
          // Provide consistent data structure even if empty
          data: { regenerated: 0, total: 0 }, 
          message: "No prompts to regenerate for this batch", 
        });
      }

      // Fetch the custom system prompt for this batch if available
      const systemPrompt = await storage.getSystemPrompt(batchId);
      const customSystemPrompt = systemPrompt?.prompt;

      console.log(`Regenerating ${prompts.length} prompts with ${customSystemPrompt ? 'custom' : 'default'} system prompt`);

      // Process each prompt in parallel
      // NOTE: This assumes Promise.all succeeds or fails entirely.
      // More granular error handling might be needed if individual regenerations can fail.
      await Promise.all(
        prompts.map(async (prompt) => {
          const rawData = prompt.rawData || {
            patientId: prompt.patientId,
            name: prompt.name,
            age: prompt.age,
            condition: prompt.condition,
          };

          const newPrompt = await generatePrompt(rawData as any, batchId, customSystemPrompt);
          await storage.updatePatientPrompt(prompt.id, { prompt: newPrompt });
        }),
      );

      // Use standard wrapper for success
      res.status(200).json({ 
        success: true,
        // Report how many were processed
        data: { regenerated: prompts.length, total: prompts.length }, 
        message: "All prompts regenerated successfully" 
      });
    } catch (err) {
      console.error("Error regenerating prompts:", err);
      // Use standard wrapper for error
      res.status(500).json({
          success: false,
          data: null,
          error: `Error regenerating prompts: ${err instanceof Error ? err.message : String(err)}`,
        });
    }
  });

  // Export prompts to CSV
  app.get("/api/patient-prompts/:batchId/export", async (req, res) => {
    try {
      const { batchId } = req.params;

      const prompts = await storage.getPatientPromptsByBatchId(batchId);

      if (!prompts.length) {
        // Return empty array instead of 404 for CSV export
        return res.status(200).json({
          message: "No prompts to export",
          data: []
        });
      }

      // Create CSV
      const csvStringifier = createObjectCsvStringifier({
        header: [
          { id: "patientId", title: "Patient ID" },
          { id: "name", title: "Name" },
          { id: "age", title: "Age" },
          { id: "condition", title: "Condition" },
          { id: "prompt", title: "Generated Prompt" },
        ],
      });

      const records = prompts.map((p) => ({
        patientId: p.patientId,
        name: p.name,
        age: p.age,
        condition: p.condition,
        prompt: p.prompt,
      }));

      const csvContent =
        csvStringifier.getHeaderString() +
        csvStringifier.stringifyRecords(records);

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="patient-prompts-${batchId}.csv"`,
      );
      res.status(200).send(csvContent);
    } catch (err) {
      console.error("Error exporting prompts:", err);
      res
        .status(500)
        .json({
          message: `Error exporting prompts: ${err instanceof Error ? err.message : String(err)}`,
        });
    }
  });

  // Get token usage statistics - requires authentication
  app.get("/api/token-usage", (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      const stats = getTokenUsageStats();

      res.status(200).json({
        success: true,
        data: {
          ...stats,
          totalEstimatedCost: parseFloat(stats.totalEstimatedCost.toFixed(6)),
          averageCostPerCall: parseFloat(stats.averageCostPerCall.toFixed(6)),
          inputTokensPerCall: Math.round(stats.inputTokensPerCall),
          outputTokensPerCall: Math.round(stats.outputTokensPerCall),
        },
      });
    } catch (err) {
      console.error("Error getting token usage stats:", err);
      res.status(500).json({
        success: false,
        message: `Error getting token usage stats: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });
  
  // Get simplified core prompt - ALWAYS returns the exact prompt from openai.ts
  app.get("/api/system-prompt", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      // Always return the exact prompt directly from openai.ts file
      const defaultPrompt = getDefaultSystemPrompt();
      console.log("Returning default system prompt from openai.ts:", defaultPrompt.substring(0, 50) + "...");
      
      return res.status(200).json({
        prompt: defaultPrompt,
      });
    } catch (err) {
      console.error("Error getting system prompt:", err);
      return res.status(500).json({
        success: false,
        message: `Error getting system prompt: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  // Update system prompt with simplified approach
  app.post("/api/system-prompt", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      const { prompt } = req.body;

      if (!prompt) {
        return res.status(400).json({
          success: false,
          message: "Prompt is required",
        });
      }

      // Save to database
      const updatedPrompt = await storage.updateSystemPrompt(prompt);
      
      // Also update the in-memory version that's used directly by the OpenAI module
      setDefaultSystemPrompt(prompt);
      
      console.log("Core prompt updated successfully");

      return res.status(200).json({
        success: true,
        message: "System prompt updated successfully",
        systemPrompt: updatedPrompt,
      });
    } catch (err) {
      console.error("Error updating system prompt:", err);
      return res.status(500).json({
        success: false,
        message: `Error updating system prompt: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  // Get all patient batches
  app.get("/api/batches", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, data: null, error: "Authentication required" });
      }

      const batches = await storage.getAllPatientBatches();
      // Use standard wrapper, return empty array if no batches
      res.status(200).json({
        success: true,
        data: batches || [],
        message: batches.length > 0 ? "Batches retrieved successfully" : "No batches found"
      });
    } catch (err) {
      console.error("Error fetching batches:", err);
      res.status(500).json({
        success: false,
        data: null,
        error: `Error fetching batches: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  // Get latest batch
  app.get("/api/batches/latest", async (req, res) => {
    try {
      // No authentication check here previously, should we add one? Assuming public for now.
      console.log("Fetching latest batch...");
      // Assuming getAllPatientBatches returns sorted batches (or we should sort here)
      const batches = await storage.getAllPatientBatches();
      console.log(`Retrieved ${batches.length} total batches`);

      // Handle case where NO batches exist at all - return 404 as per plan
      if (!batches || batches.length === 0) {
        console.log("No batches found in the system");
        return res.status(404).json({
          success: false,
          data: null,
          error: "No batches found in the system"
        });
      }

      // Get the last batch (assuming sorted newest first or last)
      // Let's explicitly sort by createdAt descending just to be sure
      const sortedBatches = batches.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      const latestBatch = sortedBatches[0];

      // Use correct DB column name 'processedPatients' (or 'processed_patients' if that's correct)
      // Let's assume 'processedPatients' based on user's last edit
      console.log(`Latest batch found: ${latestBatch.batchId} with ${latestBatch.processedPatients ?? 0} processed patients`);

      // Return successful response with standard wrapper
      res.status(200).json({
        success: true,
        data: latestBatch,
        message: "Latest batch retrieved successfully"
      });
    } catch (error) {
      console.error("Error fetching latest batch:", error);
      // Use standard error wrapper
      res.status(500).json({
        success: false,
        data: null,
        error: `Error fetching latest batch: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  });

  // ===== NEW API ENDPOINTS FOR CUSTOMER-REQUESTED FEATURES =====

  // === PROMPT EDITING SANDBOX ENDPOINTS ===

  // Get prompt template for a patient
  app.get("/api/prompt-template/:patientId", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      const { patientId } = req.params;
      const template = await storage.getPromptTemplate(patientId);

      if (!template) {
        return res.status(404).json({
          success: false,
          message: "Template not found for this patient",
        });
      }

      return res.status(200).json(template);
    } catch (err) {
      console.error("Error fetching prompt template:", err);
      return res.status(500).json({
        success: false,
        message: `Error fetching prompt template: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  // Update prompt template for a patient
  app.post("/api/update-prompt-template", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      const { patientId, template } = req.body;

      if (!patientId || !template) {
        return res.status(400).json({
          success: false,
          message: "Patient ID and template are required",
        });
      }

      await storage.updatePromptTemplate(patientId, template);

      return res.status(200).json({
        success: true,
        message: "Template updated successfully",
      });
    } catch (err) {
      console.error("Error updating prompt template:", err);
      return res.status(500).json({
        success: false,
        message: `Error updating prompt template: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  // Regenerate prompt with custom template
  app.post("/api/regenerate-prompt-with-template", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      const { patientId, batchId } = req.body;

      if (!patientId) {
        return res.status(400).json({
          success: false,
          message: "Patient ID is required",
        });
      }

      // Get the patient data from our database
      const prompt = batchId
        ? await storage.getPatientPromptByIds(batchId, patientId)
        : (
            await db
              .select()
              .from(patientPrompts)
              .where(eq(patientPrompts.patientId, patientId))
              .orderBy(desc(patientPrompts.createdAt))
              .limit(1)
          )[0];

      if (!prompt) {
        return res.status(404).json({
          success: false,
          message: "Patient not found",
        });
      }

      // Get the saved template for this patient
      const templateData = await storage.getPromptTemplate(patientId);

      if (!templateData) {
        return res.status(404).json({
          success: false,
          message: "Template not found for this patient",
        });
      }

      // Parse any raw data if available
      let patientData: any = {
        patientId: prompt.patientId,
        name: prompt.name,
        age: prompt.age,
        condition: prompt.condition,
      };

      // Also extract any raw data
      if (prompt.rawData) {
        try {
          const rawData =
            typeof prompt.rawData === "string"
              ? JSON.parse(prompt.rawData)
              : prompt.rawData;

          if (rawData.variables) {
            patientData.variables = rawData.variables;
          }
          if (rawData.issues) {
            patientData.issues = rawData.issues;
          }
          if (rawData.alertReasons) {
            patientData.alertReasons = rawData.alertReasons;
          }
        } catch (e) {
          console.warn("Error parsing raw data for regeneration:", e);
        }
      }

      // Fetch system prompt if available
      const systemPrompt = await storage.getSystemPrompt(batchId);
      const customSystemPrompt = systemPrompt?.prompt;
      
      console.log(`Regenerating template-based prompt for patient ${patientId} with ${customSystemPrompt ? 'custom' : 'default'} system prompt`);
      
      // Use the openai module to generate a new prompt using both system prompt and template
      const { generatePromptWithSystemAndTemplate, getDefaultSystemPrompt } = await import("./lib/openai");
      const newPrompt = await generatePromptWithSystemAndTemplate(
        patientData,
        customSystemPrompt || getDefaultSystemPrompt(),
        templateData.template,
      );

      // Update the patient's prompt in the database
      const updatedPatient = await storage.updatePatientPrompt(prompt.id, {
        prompt: newPrompt,
      });

      return res.status(200).json({
        success: true,
        message: "Prompt regenerated with custom template",
        prompt: newPrompt,
      });
    } catch (err) {
      console.error("Error regenerating prompt with template:", err);
      return res.status(500).json({
        success: false,
        message: `Error regenerating prompt with template: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  // === SANDBOX ADVANCED CUSTOMIZATION ENDPOINTS ===

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
          message: "System prompt text is required",
        });
      }

      const updatedPrompt = await storage.updateSystemPrompt(prompt, batchId);

      return res.status(200).json({
        success: true,
        message: "System prompt updated successfully",
        systemPrompt: updatedPrompt,
      });
    } catch (err) {
      console.error("Error updating system prompt:", err);
      return res.status(500).json({
        success: false,
        message: `Error updating system prompt: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  // Get template variables
  app.get("/api/sandbox/variables", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      const batchId = req.query.batchId as string;
      const variables = await storage.getTemplateVariables(batchId);

      return res.status(200).json({
        success: true,
        variables,
      });
    } catch (err) {
      console.error("Error getting template variables:", err);
      return res.status(500).json({
        success: false,
        message: `Error getting template variables: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  // Create a new template variable
  app.post("/api/sandbox/variables", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      const { placeholder, description, example, batchId } = req.body;

      if (!placeholder || !description) {
        return res.status(400).json({
          success: false,
          message: "Placeholder and description are required",
        });
      }

      const variable = {
        placeholder,
        description,
        example,
        batchId,
      };

      const newVariable = await storage.createTemplateVariable(variable);

      return res.status(201).json({
        success: true,
        message: "Template variable created successfully",
        variable: newVariable,
      });
    } catch (err) {
      console.error("Error creating template variable:", err);
      return res.status(500).json({
        success: false,
        message: `Error creating template variable: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  // Update a template variable
  app.patch("/api/sandbox/variables/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      const { id } = req.params;
      const updates = req.body;

      if (!id || !updates) {
        return res.status(400).json({
          success: false,
          message: "Variable ID and updates are required",
        });
      }

      const updatedVariable = await storage.updateTemplateVariable(
        parseInt(id),
        updates,
      );

      return res.status(200).json({
        success: true,
        message: "Template variable updated successfully",
        variable: updatedVariable,
      });
    } catch (err) {
      console.error(`Error updating template variable:`, err);
      return res.status(500).json({
        success: false,
        message: `Error updating template variable: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  // Delete a template variable
  app.delete("/api/sandbox/variables/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Variable ID is required",
        });
      }

      await storage.deleteTemplateVariable(parseInt(id));

      return res.status(200).json({
        success: true,
        message: "Template variable deleted successfully",
      });
    } catch (err) {
      console.error(`Error deleting template variable:`, err);
      return res.status(500).json({
        success: false,
        message: `Error deleting template variable: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  // Updated regenerate-prompt-with-template to use system prompt and variables
  app.post(
    "/api/regenerate-prompt-with-system-and-variables",
    async (req, res) => {
      try {
        if (!req.isAuthenticated()) {
          return res
            .status(401)
            .json({ success: false, message: "Authentication required" });
        }

        const { patientId, batchId } = req.body;

        if (!patientId) {
          return res.status(400).json({
            success: false,
            message: "Patient ID is required",
          });
        }

        // Get the patient data
        const prompt = batchId
          ? await storage.getPatientPromptByIds(batchId, patientId)
          : (
              await db
                .select()
                .from(patientPrompts)
                .where(eq(patientPrompts.patientId, patientId))
                .orderBy(desc(patientPrompts.createdAt))
                .limit(1)
            )[0];

        if (!prompt) {
          return res.status(404).json({
            success: false,
            message: "Patient not found",
          });
        }

        // Get the template
        const templateData = await storage.getPromptTemplate(patientId);
        if (!templateData) {
          return res.status(404).json({
            success: false,
            message: "Template not found for this patient",
          });
        }

        // Get the system prompt
        const systemPrompt = await storage.getSystemPrompt(batchId);
        if (!systemPrompt) {
          return res.status(404).json({
            success: false,
            message: "System prompt not found",
          });
        }

        // Get the variables
        const variables = await storage.getTemplateVariables(batchId);

        // Parse any raw data if available
        let patientData: any = {
          patientId: prompt.patientId,
          name: prompt.name,
          age: prompt.age,
          condition: prompt.condition,
        };

        // Also extract any raw data
        if (prompt.rawData) {
          try {
            const rawData =
              typeof prompt.rawData === "string"
                ? JSON.parse(prompt.rawData)
                : prompt.rawData;

            if (rawData.variables) {
              patientData.variables = rawData.variables;
            }
            if (rawData.issues) {
              patientData.issues = rawData.issues;
            }
            if (rawData.alertReasons) {
              patientData.alertReasons = rawData.alertReasons;
            }
          } catch (e) {
            console.warn("Error parsing raw data for regeneration:", e);
          }
        }

        // Use the openai module to generate a new prompt with the template but pass system prompt separately
        const { generatePromptWithSystemAndTemplate } = await import(
          "./lib/openai"
        );

        // Format the variables list for the AI to reference, but include it in the system prompt
        const variablesList = variables
          .map(
            (v) =>
              `${v.placeholder} — ${v.description}${v.example ? ` (Example: ${v.example})` : ""}`,
          )
          .join("\n");

        // Create the enhanced system prompt that includes the variables list
        const enhancedSystemPrompt =
          `${systemPrompt.prompt.trim()}\n\n` +
          `Available placeholders:\n${variablesList}`;

        // Generate the prompt using separate system instructions and template
        const newPrompt = await generatePromptWithSystemAndTemplate(
          patientData,
          enhancedSystemPrompt,
          templateData.template,
        );

        // Update the patient's prompt in the database
        const updatedPatient = await storage.updatePatientPrompt(prompt.id, {
          prompt: newPrompt,
        });

        return res.status(200).json({
          success: true,
          message: "Prompt regenerated with system prompt and variables",
          prompt: newPrompt,
        });
      } catch (err) {
        console.error(
          "Error regenerating prompt with system and variables:",
          err,
        );
        return res.status(500).json({
          success: false,
          message: `Error regenerating prompt: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    },
  );

  // === TRIAGE ENDPOINTS ===

  // Get patient alerts for a specific date
  app.get("/api/triage/alerts", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      // Use batchId if provided, otherwise use most recent batch
      const batchId = req.query.batchId as string;

      // Get alerts for the specified batch or most recent if none provided
      const alerts = await storage.getPatientAlerts(batchId);

      return res.status(200).json(alerts);
    } catch (err) {
      console.error("Error fetching patient alerts:", err);
      return res.status(500).json({
        success: false,
        message: `Error fetching patient alerts: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  // Send a single alert
  app.post("/api/triage/send-alert", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      const { alertId } = req.body;

      if (!alertId) {
        return res.status(400).json({
          success: false,
          message: "Alert ID is required",
        });
      }

      const result = await storage.sendAlert(alertId);

      return res.status(200).json({
        success: true,
        patientName: result.patientName,
        message: "Alert sent successfully",
      });
    } catch (err) {
      console.error("Error sending alert:", err);
      return res.status(500).json({
        success: false,
        message: `Error sending alert: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  // Send multiple alerts
  app.post("/api/triage/send-alerts", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      const { alertIds } = req.body;

      if (!alertIds || !Array.isArray(alertIds) || alertIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Alert IDs array is required",
        });
      }

      const result = await storage.sendAllAlerts(alertIds);

      return res.status(200).json({
        success: true,
        sent: result.sent,
        message: `Successfully sent ${result.sent} alerts`,
      });
    } catch (err) {
      console.error("Error sending alerts:", err);
      return res.status(500).json({
        success: false,
        message: `Error sending alerts: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  // === MONTHLY REPORTS ENDPOINTS ===

  // Dedicated server-side monthly-report endpoint for PDF generation using latest data
  app.get("/api/monthly-report", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      // Get the patient ID from query if provided - for individual patient reports
      const patientId = req.query.patientId as string | undefined;

      // Current date info for filename
      const currentDate = new Date();
      const month = String(currentDate.getMonth() + 1).padStart(2, "0");
      const year = String(currentDate.getFullYear());

      console.log(
        `Generating report using latest patient data${patientId ? ` for patient ${patientId}` : ""}`,
      );

      // Import schema explicitly to avoid reference issues
      const { patientBatches: batchesTable, patientPrompts: promptsTable } =
        await import("@shared/schema");

      // Get the most recent batch
      const [latestBatch] = await db
        .select()
        .from(batchesTable)
        .orderBy(SQL`${batchesTable.createdAt} DESC`)
        .limit(1);

      if (!latestBatch) {
        return res.status(404).json({
          success: false,
          message: "No data uploads found. Please upload patient data first.",
        });
      }

      console.log(
        `Using most recent batch: ${latestBatch.batchId} from ${latestBatch.createdAt}`,
      );

      // Get patient data from this latest batch
      let periodPatients = await db
        .select()
        .from(promptsTable)
        .where(eq(promptsTable.batchId, latestBatch.batchId));

      // Filter by patient ID if specified
      if (patientId) {
        periodPatients = periodPatients.filter(
          (p: PatientPrompt) => p.patientId === patientId,
        );

        if (periodPatients.length === 0) {
          return res.status(404).json({
            success: false,
            message: `Patient ${patientId} not found in the latest data`,
          });
        }
      }

      if (periodPatients.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No patient data found in the latest upload",
        });
      }

      // Now generate PDF with patient data summary using pdfmake
      const pdfmake = await import("pdfmake");
      // Use only core PDF built-in fonts to avoid file path issues
      const fonts = {
        // Primary font for body text
        Helvetica: {
          normal: "Helvetica",
          bold: "Helvetica-Bold",
          italics: "Helvetica-Oblique",
          bolditalics: "Helvetica-BoldOblique",
        },
        // Alternative for headings
        Times: {
          normal: "Times-Roman",
          bold: "Times-Bold",
          italics: "Times-Italic",
          bolditalics: "Times-BoldItalic",
        },
        // Fallback font
        Courier: {
          normal: "Courier",
          bold: "Courier-Bold",
          italics: "Courier-Oblique",
          bolditalics: "Courier-BoldOblique",
        },
      };

      // Import our enhanced PDF generator
      const { generatePatientReportDefinition, generateSampleVitals } =
        await import("./lib/enhancedPdfGenerator");

      // Get the target patient for the report (use the first one if multiple)
      const targetPatient = periodPatients[0];

      // Generate sample vitals data for the patient
      // In a production environment, this would fetch real patient measurements from the database
      const patientVitals = generateSampleVitals(targetPatient);

      // Create the enhanced PDF document definition
      const docDefinition = generatePatientReportDefinition(
        targetPatient,
        patientVitals,
      );

      // Generate the PDF
      const printer = new pdfmake.default(fonts);
      const pdfDoc = printer.createPdfKitDocument(docDefinition);

      // Instead of writing to a file, collect the chunks in memory
      const chunks: any[] = [];
      let result: Buffer;

      pdfDoc.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });

      pdfDoc.on("end", () => {
        result = Buffer.concat(chunks);

        // Send the PDF directly to the browser with proper headers
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `inline; filename="monthly-report-${year}-${month}.pdf"`,
        );
        res.setHeader("Content-Length", result.length);

        res.end(result);
      });

      // Finalize the PDF
      pdfDoc.end();
    } catch (err) {
      console.error("Error generating monthly report PDF:", err);
      return res.status(500).json({
        success: false,
        message: `Error generating monthly report: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  // Helper functions for the PDF report
  function calculateComplianceRate(patients: PatientPrompt[]) {
    // A simplified compliance calculation based on alert status
    // In a real system, this would be based on scheduled vs. actual measurements
    const alertPatients = patients.filter((p: PatientPrompt) => p.isAlert === "true").length;
    const complianceRate =
      ((patients.length - alertPatients) / patients.length) * 100;
    return Math.round(complianceRate);
  }

  function calculateAverageAge(patients: PatientPrompt[]) {
    if (patients.length === 0) return 0;
    const totalAge = patients.reduce(
      (sum: number, patient: PatientPrompt) => sum + (patient.age || 0),
      0,
    );
    return Math.round(totalAge / patients.length);
  }

  function trendsSummary(patients: PatientPrompt[]) {
    // Generate a simple summary of patient trends
    const totalPatients = patients.length;
    const alertPatients = patients.filter((p: PatientPrompt) => p.isAlert === "true").length;
    const alertPercentage = (alertPatients / totalPatients) * 100;

    // Group patients by condition
    const conditionGroups: { [key: string]: PatientPrompt[] } = {};
    patients.forEach((patient: PatientPrompt) => {
      const condition = patient.condition || "Unknown";
      if (!conditionGroups[condition]) {
        conditionGroups[condition] = [];
      }
      conditionGroups[condition].push(patient);
    });

    // Generate trend summary text
    let trendText = `Based on the data for ${totalPatients} patients, ${alertPercentage.toFixed(1)}% have alerts that require attention.\n\n`;

    // Add condition-specific summaries
    Object.entries(conditionGroups).forEach(([condition, groupPatients]: [string, PatientPrompt[]]) => {
      const count = groupPatients.length;
      const percentage = (count / totalPatients) * 100;
      trendText += `${condition}: ${count} patients (${percentage.toFixed(1)}% of total)\n`;
    });

    return trendText;
  }

  // Get all monthly reports
  app.get("/api/monthly-reports", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      const reports = await storage.getMonthlyReports();

      return res.status(200).json(reports);
    } catch (err) {
      console.error("Error fetching monthly reports:", err);
      return res.status(500).json({
        success: false,
        message: `Error fetching monthly reports: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  // Download monthly report (as Excel for now, PDFs are coming in next sprint)
  app.get("/api/download-report/:year/:month", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      const { year, month } = req.params;
      const patientId = req.query.patientId as string | undefined; // Optional patient ID for individual reports

      // Import schema explicitly to avoid reference issues
      const { patientPrompts: promptsTable } = await import("@shared/schema");

      // Get all patient prompts from the database
      const prompts = await db.select().from(promptsTable);

      // Filter to match the specified month/year if provided
      let filteredPrompts = prompts.filter((prompt: PatientPrompt) => {
        if (!prompt.createdAt) return false;

        try {
          const promptDate = new Date(prompt.createdAt);
          const promptMonth = String(promptDate.getMonth() + 1).padStart(
            2,
            "0",
          );
          const promptYear = promptDate.getFullYear().toString();

          return promptMonth === month && promptYear === year;
        } catch (e) {
          console.warn(`Could not parse date for prompt ${prompt.id}:`, e);
          return false;
        }
      });

      if (filteredPrompts.length === 0) {
        return res.status(404).json({
          success: false,
          message: `No patient data found for ${year}-${month}`,
        });
      }

      // Filter by specific patient if requested
      if (patientId) {
        filteredPrompts = filteredPrompts.filter(
          (p: PatientPrompt) => p.patientId === patientId,
        );

        if (filteredPrompts.length === 0) {
          return res.status(404).json({
            success: false,
            message: `Patient ${patientId} not found for ${year}-${month}`,
          });
        }
      }

      // Generate Excel file as a simpler initial approach (PDF coming in next sprint)
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Patient Monthly Report");

      // Add header with report title
      worksheet.mergeCells("A1:G1");
      const titleCell = worksheet.getCell("A1");
      titleCell.value = `Monthly Health Report - ${month}/${year}`;
      titleCell.font = { size: 16, bold: true };
      titleCell.alignment = { horizontal: "center" };

      // Add date generated
      worksheet.mergeCells("A2:G2");
      const dateCell = worksheet.getCell("A2");
      dateCell.value = `Generated: ${new Date().toLocaleDateString()}`;
      dateCell.font = { size: 10, italic: true };
      dateCell.alignment = { horizontal: "center" };

      // Add empty row
      worksheet.addRow([]);

      // Add headers
      const headerRow = worksheet.addRow([
        "Patient ID",
        "Name",
        "Age",
        "Condition",
        "Health Status",
        "Alert Status",
        "Notes/Recommendations",
      ]);

      // Style headers
      headerRow.eachCell((cell: any) => {
        cell.font = { bold: true };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFE0E0E0" },
        };
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });

      // Set column widths
      worksheet.columns = [
        { key: "patientId", width: 15 },
        { key: "name", width: 25 },
        { key: "age", width: 8 },
        { key: "condition", width: 20 },
        { key: "healthStatus", width: 15 },
        { key: "isAlert", width: 12 },
        { key: "notes", width: 50 },
      ];

      // Add data rows
      filteredPrompts.forEach((patient: PatientPrompt) => {
        const row = worksheet.addRow({
          patientId: patient.patientId,
          name: patient.name,
          age: patient.age,
          condition: patient.condition,
          healthStatus: patient.healthStatus || "Not Specified",
          isAlert: patient.isAlert === "true" ? "ALERT" : "Normal",
          notes: patient.prompt,
        });

        // Color the alert status
        const alertCell = row.getCell("isAlert");
        if (patient.isAlert === "true") {
          alertCell.font = { color: { argb: "FFFF0000" }, bold: true };
        } else {
          alertCell.font = { color: { argb: "FF00AA00" } };
        }

        // Add borders to the row
        row.eachCell((cell: any) => {
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
        });
      });

      // Set Content-Type and attachment header
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );

      // Set appropriate filename
      if (patientId) {
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="patient-report-${patientId}-${year}-${month}.xlsx"`,
        );
      } else {
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="monthly-report-${year}-${month}.xlsx"`,
        );
      }

      // Write to response
      await workbook.xlsx.write(res);
      res.end();
    } catch (err) {
      console.error("Error generating report for download:", err);
      res.status(500).json({
        success: false,
        message: `Error generating report: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  // Download monthly report as Excel (fallback)
  app.get("/api/download-report-excel/:year/:month", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      const { year, month } = req.params;

      // Import schema explicitly to avoid reference issues
      const { patientPrompts: promptsTable } = await import("@shared/schema");

      // Get all patient prompts from the database
      const prompts = await db.select().from(promptsTable);

      // Filter to match the specified month/year if provided
      let filteredPrompts = prompts.filter((prompt: PatientPrompt) => {
        if (!prompt.createdAt) return false;

        try {
          const promptDate = new Date(prompt.createdAt);
          const promptMonth = String(promptDate.getMonth() + 1).padStart(
            2,
            "0",
          );
          const promptYear = promptDate.getFullYear().toString();

          return promptMonth === month && promptYear === year;
        } catch (e) {
          console.warn(`Could not parse date for prompt ${prompt.id}:`, e);
          return false;
        }
      });

      // Generate Excel file
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Patient Data");

      // Add headers
      worksheet.columns = [
        { header: "Patient ID", key: "patientId", width: 15 },
        { header: "Name", key: "name", width: 20 },
        { header: "Age", key: "age", width: 10 },
        { header: "Condition", key: "condition", width: 20 },
        { header: "Health Status", key: "healthStatus", width: 15 },
        { header: "Alert Status", key: "isAlert", width: 15 },
        { header: "Prompt", key: "prompt", width: 50 },
      ];

      // Add rows
      filteredPrompts.forEach((prompt: PatientPrompt) => {
        worksheet.addRow({
          patientId: prompt.patientId,
          name: prompt.name,
          age: prompt.age,
          condition: prompt.condition,
          healthStatus: prompt.healthStatus,
          isAlert: prompt.isAlert === "true" ? "Yes" : "No",
          prompt: prompt.prompt,
        });
      });

      // Set Content-Type and attachment header
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="patient-report-${year}-${month}.xlsx"`,
      );

      // Write to response
      await workbook.xlsx.write(res);
      res.end();
    } catch (err) {
      console.error("Error generating Excel report for download:", err);
      res.status(500).json({
        success: false,
        message: `Error generating report: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  // Generate a new monthly report
  app.post("/api/generate-monthly-report", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      const { monthYear } = req.body;

      if (!monthYear) {
        return res.status(400).json({
          success: false,
          message: "Month and year are required (format: YYYY-MM)",
        });
      }

      const report = await storage.generateMonthlyReport(monthYear);

      return res.status(200).json({
        success: true,
        report,
        message: "Monthly report generation initiated",
      });
    } catch (err) {
      console.error("Error generating monthly report:", err);
      return res.status(500).json({
        success: false,
        message: `Error generating monthly report: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  // === SYSTEM SETTINGS ENDPOINTS ===

  // Get alert phone number
  app.get("/api/settings/alertPhone", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      const phone = await storage.getAlertPhone();
      return res.status(200).json({
        success: true,
        phone,
      });
    } catch (err) {
      console.error("Error fetching alert phone:", err);
      return res.status(500).json({
        success: false,
        message: `Error fetching alert phone: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  // Update alert phone number
  app.post("/api/settings/alertPhone", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      const { phone } = req.body;

      if (!phone) {
        return res.status(400).json({
          success: false,
          message: "Phone number is required",
        });
      }

      // Validate phone number using the schema from shared/schema.ts
      const phoneResult = phoneSchema.safeParse(phone);
      
      if (!phoneResult.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid phone number format. Please use E.164 format (e.g., +12345678901)",
          errors: phoneResult.error.errors,
        });
      }

      // Update the phone number in the database
      const result = await storage.updateAlertPhone(phone);
      
      return res.status(200).json({
        success: true,
        result,
        message: "Alert phone number updated successfully",
      });
    } catch (err) {
      console.error("Error updating alert phone:", err);
      return res.status(500).json({
        success: false,
        message: `Error updating alert phone: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  // Send test SMS alert
  app.post("/api/settings/send-test-sms", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }
      
      // Check if alert phone is configured
      const phone = await storage.getAlertPhone();
      
      if (!phone) {
        return res.status(400).json({
          success: false,
          message: "Alert phone number not configured. Please set it first.",
        });
      }
      
      // Check for Twilio credentials
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
      
      if (!accountSid || !authToken || !twilioPhone) {
        return res.status(400).json({
          success: false,
          message: "Twilio credentials not configured. Please check your environment variables.",
        });
      }
      
      // Initialize Twilio client
      const twilioClient = twilio(accountSid, authToken);
      
      // Send a test message
      const message = await twilioClient.messages.create({
        body: "🔔 This is a test alert message from CalicoCare Patient Prompt Generator. Your alerts are working correctly!",
        from: twilioPhone,
        to: phone
      });
      
      return res.status(200).json({
        success: true,
        sid: message.sid,
        message: `Test SMS sent successfully to ${phone}`,
      });
    } catch (err) {
      console.error("Error sending test SMS:", err);
      return res.status(500).json({
        success: false,
        message: `Error sending test SMS: ${err instanceof Error ? err.message : String(err)}`,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Check Twilio configuration
  app.get("/api/settings/twilio-status", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }
      
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
      
      const isConfigured = Boolean(accountSid && authToken && twilioPhone);
      
      // Check if alert phone is configured
      const phone = await storage.getAlertPhone();
      
      return res.status(200).json({
        success: true,
        isConfigured,
        phoneConfigured: Boolean(phone),
        twilioPhone: twilioPhone || null,
      });
    } catch (err) {
      console.error("Error checking Twilio status:", err);
      return res.status(500).json({
        success: false,
        message: `Error checking Twilio status: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  // Send SMS alert for a specific prompt
  app.post("/api/alerts/sms", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }
      
      const { promptId } = req.body;
      
      if (!promptId) {
        return res.status(400).json({
          success: false,
          message: "Prompt ID is required",
        });
      }
      
      // Get the prompt details
      const prompt = await storage.getPatientPromptById(promptId);
      
      if (!prompt) {
        return res.status(404).json({
          success: false,
          message: "Prompt not found",
        });
      }
      
      // Check if alert phone is configured
      const phone = await storage.getAlertPhone();
      
      if (!phone) {
        return res.status(400).json({
          success: false,
          message: "Alert phone number not configured. Please set it first.",
        });
      }
      
      // Check for Twilio credentials
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
      
      if (!accountSid || !authToken || !twilioPhone) {
        return res.status(400).json({
          success: false,
          message: "Twilio credentials not configured. Please check your environment variables.",
        });
      }
      
      // Initialize Twilio client
      const twilioClient = twilio(accountSid, authToken);
      
      // Send the message
      const message = await twilioClient.messages.create({
        body: prompt.prompt,
        from: twilioPhone,
        to: phone
      });
      
      return res.status(200).json({
        success: true,
        sid: message.sid,
        message: `SMS sent successfully to ${phone}`,
        patientName: prompt.name
      });
    } catch (err) {
      console.error("Error sending SMS:", err);
      return res.status(500).json({
        success: false,
        message: `Error sending SMS: ${err instanceof Error ? err.message : String(err)}`,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Get all prompts for a specific batch (Refactored from regeneration logic)
  app.get("/api/prompts", async (req: Request<{}, {}, {}, { batchId: string }>, res) => {
    try {
      console.log("Fetching prompts...");
      const batchId = req.query.batchId;
      console.log(`Using batchId: ${batchId}`);

      // Require batchId
      if (!batchId) {
        console.log("No batchId provided");
        return res.status(400).json({ 
          success: false, 
          data: null,
          error: "batchId query parameter is required"
        });
      }

      // Get all prompts for the specified batch
      const allPrompts = await storage.getPatientPromptsByBatchId(batchId);
      console.log(`Retrieved ${allPrompts.length} total prompts from storage for batch ${batchId}`);

      // Use standard wrapper, return 200 OK with empty/populated array
      res.status(200).json({
        success: true,
        data: allPrompts || [],
        message: allPrompts.length > 0 ? "Prompts retrieved successfully" : "No prompts found for this batch"
      });

    } catch (error) {
      console.error("Error fetching prompts:", error);
      // Use standard wrapper
      res.status(500).json({ 
        success: false, 
        data: null,
        error: `Failed to fetch prompts: ${error instanceof Error ? error.message : String(error)}` 
      });
    }
  });

  // Regenerate a single prompt
  app.post("/api/prompts/:id/regenerate", async (req: Request<{ id: string }>, res) => {
    try {
      // Get the prompt ID from the request parameters
      // Ensure ID is parsed correctly as integer
      const promptId = parseInt(req.params.id, 10);
      if (isNaN(promptId)) {
        return res.status(400).json({ success: false, data: null, error: "Invalid prompt ID format" });
      }
      console.log(`Request to regenerate prompt ID: ${promptId}`);

      // Find the specific prompt by ID
      const prompt = await storage.getPatientPromptById(promptId);

      // Handle specific resource not found with 404 + standard wrapper
      if (!prompt) {
        console.error(`Prompt with ID ${promptId} not found`);
        return res.status(404).json({ 
          success: false, 
          data: null,
          error: "Prompt not found" 
        });
      }
      
      // Get the batch ID to ensure we're using the correct system prompt
      const batchId = prompt.batchId;
      const patientName = prompt.name;
      console.log(`Regenerating prompt ${promptId} for patient "${patientName}" in batch ${batchId}`);
      
      // Get all prompts for this batch and this patient
      const allPrompts = await storage.getPatientPromptsByBatchId(batchId);
      const patientPrompts = allPrompts.filter(p => p.name === patientName);
      
      // Find the most recent prompt for this patient (should be the one with the highest ID)
      let mostRecentPrompt = prompt;
      for (const p of patientPrompts) {
        if (p.id > mostRecentPrompt.id) {
          mostRecentPrompt = p;
        }
      }
      
      console.log(`Using most recent prompt (ID: ${mostRecentPrompt.id}) for patient "${patientName}"`);
      
      // Try to get the system prompt from database first, fall back to default
      const systemPrompt = await storage.getSystemPrompt(batchId);
      const systemPromptText = systemPrompt ? systemPrompt.prompt : getDefaultSystemPrompt();
      
      // Extract patient data from the stored prompt
      let patientData: any = {
        patientId: mostRecentPrompt.patientId,
        name: mostRecentPrompt.name,
        age: mostRecentPrompt.age,
        condition: mostRecentPrompt.condition,
        healthStatus: mostRecentPrompt.healthStatus,
        isAlert: mostRecentPrompt.isAlert === "true"
      };
      
      // Extract raw data if available
      if (mostRecentPrompt.rawData) {
        patientData = typeof mostRecentPrompt.rawData === "string" 
          ? JSON.parse(mostRecentPrompt.rawData) 
          : mostRecentPrompt.rawData;
      }
      
      // Generate new prompt using our main generatePrompt function
      console.log(`Generating new prompt for patient "${patientName}"`);
      const newPromptText = await generatePrompt(patientData, batchId, systemPromptText);
      
      // Extract reasoning from the generated prompt
      const { displayPrompt, reasoning } = extractReasoning(newPromptText);
      
      // Update the prompt in the database
      console.log(`Updating prompt ${promptId} in database`);
      const updatedPrompt = await storage.updatePatientPrompt(promptId, {
        prompt: newPromptText, // Store the full generated prompt
        reasoning: reasoning
      });
      
      // Format the response using the standard wrapper
      // Include relevant fields from the *updated* prompt
      res.status(200).json({
        success: true,
        data: {
          id: updatedPrompt.id,
          patientName: updatedPrompt.name,
          age: updatedPrompt.age,
          condition: updatedPrompt.condition,
          promptText: displayPrompt, // Send the display-friendly prompt
          reasoning: reasoning || updatedPrompt.reasoning || "No reasoning provided",
          isAlert: updatedPrompt.isAlert === "true",
          status: updatedPrompt.healthStatus || "alert"
        },
        message: "Prompt regenerated successfully"
      });
    } catch (error) {
      console.error("Error regenerating prompt:", error);
      // Use standard wrapper for error
      res.status(500).json({ 
        success: false, 
        data: null,
        error: `Failed to regenerate prompt: ${error instanceof Error ? error.message : String(error)}` 
      });
    }
  });

  // Regenerate all prompts
  app.post("/api/prompts/regenerate-all", async (req: Request<{}, {}, {}, { batchId: string }>, res) => {
    try {
      if (!req.isAuthenticated()) {
        // Use standard wrapper
        return res
          .status(401)
          .json({ success: false, data: null, error: "Authentication required" });
      }

      // Extract batchId from query parameters
      const batchId = req.query.batchId;
      console.log(`Regenerating all prompts for batch ${batchId || 'latest - ERROR: batchId required'}`);

      // Validate that we have a batch ID - return 400 if missing
      if (!batchId) {
        console.error("No batch ID provided for regeneration");
        return res.status(400).json({ 
          success: false,
          data: null,
          error: "No batch ID provided. Please specify which batch to regenerate via batchId query parameter."
        });
      }
      
      // Check if batch exists (optional but good practice? storage doesn't have getBatchById)
      // We implicitly check by trying to get prompts

      // First try to get the saved system prompt from the database
      const systemPrompt = await storage.getSystemPrompt(batchId);
      const promptText = systemPrompt ? systemPrompt.prompt : getDefaultSystemPrompt();
      console.log(`Using system prompt (${systemPrompt ? 'from database' : 'default'}): ${promptText.substring(0, 50)}...`);

      // Get all prompts for the specified batch
      const allPrompts = await storage.getPatientPromptsByBatchId(batchId);
      console.log(`Found ${allPrompts.length} total prompts for batch ${batchId}`);

      // Handle empty collection with 200 OK + standard wrapper
      if (allPrompts.length === 0) {
        return res.status(200).json({
          success: true,
          data: { regenerated: 0, total: 0, failedPrompts: [] },
          message: `No prompts found for batch ${batchId}`,
        });
      }

      // Create a map to get unique patients by name
      // This ensures we only have one prompt per patient, using the latest prompt version
      const patientMap = new Map<string, typeof allPrompts[0]>();
      
      // Get the most recent prompt for each patient (by ID)
      for (const prompt of allPrompts) {
        const patientName = prompt.name;
        
        if (!patientMap.has(patientName) || patientMap.get(patientName)!.id < prompt.id) {
          patientMap.set(patientName, prompt);
        }
      }
      
      // Convert the map values to an array of unique patient prompts
      const uniquePrompts = Array.from(patientMap.values());
      console.log(`Found ${uniquePrompts.length} unique patients to regenerate prompts for`);
      
      let successCount = 0;
      const failedPrompts = [];
      
      for (const prompt of uniquePrompts) {
        try {
          console.log(`Processing prompt ${prompt.id} for patient ${prompt.name} (${prompt.patientId})`);
          
          // Verify that we have a patient ID
          if (!prompt.patientId) {
            console.error(`Missing patient ID for prompt ${prompt.id}, skipping`);
            failedPrompts.push({
              id: prompt.id,
              name: prompt.name,
              error: "Missing patient ID"
            });
            continue;
          }
          
          // Get the raw patient data
          let patientData: any = {
            patientId: prompt.patientId, // Most important field - ensures we're using the existing ID
            name: prompt.name,
            age: prompt.age,
            condition: prompt.condition,
            healthStatus: prompt.healthStatus || "alert",
            isAlert: prompt.isAlert === "true"
          };
          
          // Extract raw data if available
          if (prompt.rawData) {
            const parsedData = typeof prompt.rawData === "string"
              ? JSON.parse(prompt.rawData)
              : prompt.rawData;
              
            // Make sure we preserve the required fields from the original prompt
            patientData = {
              ...parsedData,
              patientId: prompt.patientId, // Ensure we're using the stored patient ID
              name: prompt.name || parsedData.name || 'Unknown Patient',
              age: prompt.age || parsedData.age || 0,
              condition: prompt.condition || parsedData.condition || 'Unknown Condition',
              healthStatus: prompt.healthStatus || parsedData.healthStatus || "alert",
              isAlert: prompt.isAlert === "true" || patientData.isAlert || false
            };
          }
          
          // Generate new prompt using our main generatePrompt function with the current system prompt
          console.log(`Regenerating prompt for patient ${prompt.name} (${prompt.patientId})`);
          const newPrompt = await generatePrompt(patientData, batchId, promptText);
          
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
      // Use standard wrapper for success
      res.status(200).json({ 
        success: true, 
        data: {
          regenerated: successCount,
          total: uniquePrompts.length,
          // Include failed prompts details if any occurred
          failedPrompts: failedPrompts.length > 0 ? failedPrompts : [] 
        },
        message: `Successfully regenerated ${successCount} of ${uniquePrompts.length} prompts${failedPrompts.length > 0 ? `. ${failedPrompts.length} failed.` : '.'}`,
      });
    } catch (err) {
      console.error("Error regenerating all prompts:", err);
      // Use standard wrapper for error
      res.status(500).json({ 
        success: false, 
        data: null,
        error: `Error regenerating prompts: ${err instanceof Error ? err.message : String(err)}` 
      });
    }
  });

  // Reset system prompt to default
  app.post("/api/system-prompt/reset", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401)
          .set('Content-Type', 'application/json')
          .json({ success: false, message: "Authentication required" });
      }

      // Get the default system prompt from openai.ts
      const defaultPrompt = getDefaultSystemPrompt();
      
      // Update the system prompt in the database
      const updatedPrompt = await storage.updateSystemPrompt(defaultPrompt);
      
      // Also update the in-memory version
      setDefaultSystemPrompt(defaultPrompt);
      
      // Return the updated prompt as JSON with explicit Content-Type
      return res.status(200)
        .set('Content-Type', 'application/json')
        .json({
          success: true,
          prompt: defaultPrompt
        });
    } catch (err) {
      console.error("Error resetting system prompt:", err);
      return res.status(500)
        .set('Content-Type', 'application/json')
        .json({
          success: false,
          message: `Error resetting system prompt: ${err instanceof Error ? err.message : String(err)}`,
        });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
