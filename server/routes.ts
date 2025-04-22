import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import { nanoid } from "nanoid";
import { processExcelFile } from "./lib/excelProcessor";
import {
  generatePrompt,
  getTokenUsageStats,
  generatePromptWithTemplate,
} from "./lib/openai";
import twilio from "twilio";
import { createObjectCsvStringifier } from "csv-writer";
import ExcelJS from "exceljs";
import { db } from "./db";
import { patientPrompts, patientBatches } from "@shared/schema";
import { setupAuth } from "./auth";
import fs from "fs";
import { eq, and, desc, sql as SQL } from "drizzle-orm";
import { phoneSchema } from "@shared/schema";

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
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, message: "No file uploaded" });
      }

      const file = req.file;
      const batchId = nanoid();
      const timestamp = new Date().toISOString();

      // Create a batch record
      await storage.createPatientBatch({
        batchId,
        fileName: file.originalname,
        createdAt: timestamp,
      });

      try {
        // Process the Excel file and extract patient data
        const patientData = await processExcelFile(file.buffer);
        console.log(`Processed ${patientData.length} rows from Excel file`);

        // Store all patients without limiting the number
        const successfullyStored = [];

        // Process each patient record
        for (const patient of patientData) {
          try {
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

            // Generate a prompt for the patient
            const prompt = await generatePrompt(patientWithMetadata);

            // Create the patient prompt record in the database
            await storage.createPatientPrompt({
              batchId,
              patientId,
              name: patient.name || "Unknown",
              age: patient.age || 0,
              condition: patient.condition || "Unknown",
              prompt,
              isAlert: patient.isAlert ? "true" : "false",
              healthStatus: patient.healthStatus || "healthy",
              rawData: patientWithMetadata,
            });

            // Update processed patients count
            await db.execute(SQL`
              UPDATE patient_batches 
              SET processed_patients = processed_patients + 1 
              WHERE batch_id = ${batchId}
            `);

            successfullyStored.push(patientId);
          } catch (err) {
            console.error(`Error storing patient data:`, err);
            // Continue with other patients even if one fails
          }
        }

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

  // Regenerate a single prompt
  app.post(
    "/api/patient-prompts/:batchId/regenerate/:patientId",
    async (req, res) => {
      try {
        const { batchId, patientId } = req.params;

        const patientPrompt = await storage.getPatientPromptByIds(
          batchId,
          patientId,
        );

        if (!patientPrompt) {
          return res.status(404).json({ message: "Patient prompt not found" });
        }

        const rawData = patientPrompt.rawData || {
          patientId: patientPrompt.patientId,
          name: patientPrompt.name,
          age: patientPrompt.age,
          condition: patientPrompt.condition,
        };

        const newPrompt = await generatePrompt(rawData as any); // Type assertion to avoid TypeScript error

        await storage.updatePatientPrompt(patientPrompt.id, {
          prompt: newPrompt,
        });

        res.status(200).json({ message: "Prompt regenerated successfully" });
      } catch (err) {
        console.error("Error regenerating prompt:", err);
        res
          .status(500)
          .json({
            message: `Error regenerating prompt: ${err instanceof Error ? err.message : String(err)}`,
          });
      }
    },
  );

  // Regenerate all prompts for a batch
  app.post("/api/patient-prompts/:batchId/regenerate", async (req, res) => {
    try {
      const { batchId } = req.params;

      const prompts = await storage.getPatientPromptsByBatchId(batchId);

      if (!prompts.length) {
        return res
          .status(404)
          .json({ message: "Batch not found or contains no prompts" });
      }

      // Process each prompt in parallel
      await Promise.all(
        prompts.map(async (prompt) => {
          const rawData = prompt.rawData || {
            patientId: prompt.patientId,
            name: prompt.name,
            age: prompt.age,
            condition: prompt.condition,
          };

          const newPrompt = await generatePrompt(rawData as any); // Type assertion to avoid TypeScript error
          await storage.updatePatientPrompt(prompt.id, { prompt: newPrompt });
        }),
      );

      res.status(200).json({ message: "All prompts regenerated successfully" });
    } catch (err) {
      console.error("Error regenerating prompts:", err);
      res
        .status(500)
        .json({
          message: `Error regenerating prompts: ${err instanceof Error ? err.message : String(err)}`,
        });
    }
  });

  // Export prompts to CSV
  app.get("/api/patient-prompts/:batchId/export", async (req, res) => {
    try {
      const { batchId } = req.params;

      const prompts = await storage.getPatientPromptsByBatchId(batchId);

      if (!prompts.length) {
        return res
          .status(404)
          .json({ message: "Batch not found or contains no prompts" });
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

  // Get all patient batches
  app.get("/api/batches", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      const batches = await storage.getAllPatientBatches();
      res.status(200).json(batches);
    } catch (err) {
      console.error("Error fetching batches:", err);
      res.status(500).json({
        success: false,
        message: `Error fetching batches: ${err instanceof Error ? err.message : String(err)}`,
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

      // Use the openai module to generate a new prompt with the template
      const { generatePromptWithTemplate } = await import("./lib/openai");
      const newPrompt = await generatePromptWithTemplate(
        patientData,
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

      const date =
        (req.query.date as string) || new Date().toISOString().split("T")[0];

      // Default to showing only the most recent batch for triage
      const mostRecentBatchOnly = req.query.mostRecentBatchOnly !== "false";

      // Pass the mostRecentBatchOnly flag to storage function
      const alerts = await storage.getPatientAlerts(date, mostRecentBatchOnly);

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
          (p) => p.patientId === patientId,
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

      pdfDoc.on("data", (chunk) => {
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
  function calculateComplianceRate(patients) {
    // A simplified compliance calculation based on alert status
    // In a real system, this would be based on scheduled vs. actual measurements
    const alertPatients = patients.filter((p) => p.isAlert === "true").length;
    const complianceRate =
      ((patients.length - alertPatients) / patients.length) * 100;
    return Math.round(complianceRate);
  }

  function calculateAverageAge(patients) {
    if (patients.length === 0) return 0;
    const totalAge = patients.reduce(
      (sum, patient) => sum + (patient.age || 0),
      0,
    );
    return Math.round(totalAge / patients.length);
  }

  function trendsSummary(patients) {
    // Generate a simple summary of patient trends
    const totalPatients = patients.length;
    const alertPatients = patients.filter((p) => p.isAlert === "true").length;
    const alertPercentage = (alertPatients / totalPatients) * 100;

    // Group patients by condition
    const conditionGroups = {};
    patients.forEach((patient) => {
      const condition = patient.condition || "Unknown";
      if (!conditionGroups[condition]) {
        conditionGroups[condition] = [];
      }
      conditionGroups[condition].push(patient);
    });

    // Generate trend summary text
    let trendText = `Based on the data for ${totalPatients} patients, ${alertPercentage.toFixed(1)}% have alerts that require attention.\n\n`;

    // Add condition-specific summaries
    Object.entries(conditionGroups).forEach(([condition, patients]) => {
      const count = patients.length;
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
      let filteredPrompts = prompts.filter((prompt) => {
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
          (p) => p.patientId === patientId,
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
      filteredPrompts.forEach((patient) => {
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
      let filteredPrompts = prompts.filter((prompt) => {
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
      filteredPrompts.forEach((prompt) => {
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

  const httpServer = createServer(app);
  return httpServer;
}
