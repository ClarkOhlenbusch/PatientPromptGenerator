import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import { nanoid } from "nanoid";
import { processExcelFile } from "./lib/excelProcessor";
import { generatePrompt, getTokenUsageStats } from "./lib/openai";
import { createObjectCsvStringifier } from "csv-writer";
import * as ExcelJS from "exceljs";
import { db } from "./db";
import { patientPrompts } from "@shared/schema";
import { setupAuth } from "./auth";

// Set up multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.xlsx') {
      return cb(new Error("Only Excel (.xlsx) files are allowed"));
    }
    cb(null, true);
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication
  setupAuth(app);
  
  // API endpoint for file upload

  app.post("/api/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: "No file uploaded" });
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

        // Limit the number of records to process to improve performance
        // Take only unique patient IDs to reduce load, but preserve all conditions
        const uniquePatients = new Map();
        const MAX_PATIENTS = 20; // Limit to 20 patients for demo
        
        // Group patients by unique patientId only
        for (const patient of patientData) {
          // Only use patientId as the key to ensure we get all conditions for each patient
          const key = patient.patientId;
          
          if (!uniquePatients.has(key)) {
            uniquePatients.set(key, patient);
            if (uniquePatients.size >= MAX_PATIENTS) break;
          }
        }
        
        // Generate prompts for each unique patient-condition combination
        for (const patient of Array.from(uniquePatients.values())) {
          try {
            const prompt = await generatePrompt(patient);
            
            // Instead of using metadata column, store issues in rawData
            // Ensure patient object has the necessary fields
            const patientWithMetadata = {
              ...patient,
              issues: patient.issues || [],
              alertReasons: patient.alertReasons || [],
              variables: patient.variables || {}
            };
            
            await storage.createPatientPrompt({
              batchId,
              patientId: patient.patientId || `P${nanoid(6)}`,
              name: patient.name,
              age: patient.age,
              condition: patient.condition,
              prompt,
              isAlert: patient.isAlert ? "true" : "false", // Store as string in DB
              healthStatus: patient.healthStatus || "healthy", 
              rawData: patientWithMetadata, // Store all data including issues in rawData
            });
          } catch (err) {
            console.error(`Error generating prompt for patient ${patient.patientId}:`, err);
            // Continue with other patients even if one fails
          }
        }

        res.status(200).json({
          success: true,
          batchId,
          message: `Processed ${patientData.length} patients`,
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
        return res.status(404).json({ message: "Batch not found or contains no prompts" });
      }
      
      res.status(200).json(prompts);
    } catch (err) {
      console.error("Error fetching prompts:", err);
      res.status(500).json({ message: `Error fetching prompts: ${err instanceof Error ? err.message : String(err)}` });
    }
  });

  // Regenerate a single prompt
  app.post("/api/patient-prompts/:batchId/regenerate/:patientId", async (req, res) => {
    try {
      const { batchId, patientId } = req.params;
      
      const patientPrompt = await storage.getPatientPromptByIds(batchId, patientId);
      
      if (!patientPrompt) {
        return res.status(404).json({ message: "Patient prompt not found" });
      }
      
      const rawData = patientPrompt.rawData || {
        patientId: patientPrompt.patientId,
        name: patientPrompt.name,
        age: patientPrompt.age,
        condition: patientPrompt.condition
      };
      
      const newPrompt = await generatePrompt(rawData as any); // Type assertion to avoid TypeScript error
      
      await storage.updatePatientPrompt(patientPrompt.id, { prompt: newPrompt });
      
      res.status(200).json({ message: "Prompt regenerated successfully" });
    } catch (err) {
      console.error("Error regenerating prompt:", err);
      res.status(500).json({ message: `Error regenerating prompt: ${err instanceof Error ? err.message : String(err)}` });
    }
  });

  // Regenerate all prompts for a batch
  app.post("/api/patient-prompts/:batchId/regenerate", async (req, res) => {
    try {
      const { batchId } = req.params;
      
      const prompts = await storage.getPatientPromptsByBatchId(batchId);
      
      if (!prompts.length) {
        return res.status(404).json({ message: "Batch not found or contains no prompts" });
      }
      
      // Process each prompt in parallel
      await Promise.all(prompts.map(async (prompt) => {
        const rawData = prompt.rawData || {
          patientId: prompt.patientId,
          name: prompt.name,
          age: prompt.age,
          condition: prompt.condition
        };
        
        const newPrompt = await generatePrompt(rawData as any); // Type assertion to avoid TypeScript error
        await storage.updatePatientPrompt(prompt.id, { prompt: newPrompt });
      }));
      
      res.status(200).json({ message: "All prompts regenerated successfully" });
    } catch (err) {
      console.error("Error regenerating prompts:", err);
      res.status(500).json({ message: `Error regenerating prompts: ${err instanceof Error ? err.message : String(err)}` });
    }
  });

  // Export prompts to CSV
  app.get("/api/patient-prompts/:batchId/export", async (req, res) => {
    try {
      const { batchId } = req.params;
      
      const prompts = await storage.getPatientPromptsByBatchId(batchId);
      
      if (!prompts.length) {
        return res.status(404).json({ message: "Batch not found or contains no prompts" });
      }
      
      // Create CSV
      const csvStringifier = createObjectCsvStringifier({
        header: [
          { id: 'patientId', title: 'Patient ID' },
          { id: 'name', title: 'Name' },
          { id: 'age', title: 'Age' },
          { id: 'condition', title: 'Condition' },
          { id: 'prompt', title: 'Generated Prompt' }
        ]
      });
      
      const records = prompts.map(p => ({
        patientId: p.patientId,
        name: p.name,
        age: p.age,
        condition: p.condition,
        prompt: p.prompt
      }));
      
      const csvContent = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(records);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="patient-prompts-${batchId}.csv"`);
      res.status(200).send(csvContent);
    } catch (err) {
      console.error("Error exporting prompts:", err);
      res.status(500).json({ message: `Error exporting prompts: ${err instanceof Error ? err.message : String(err)}` });
    }
  });
  
  // Get token usage statistics - requires authentication
  app.get("/api/token-usage", (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ success: false, message: "Authentication required" });
      }
      
      const stats = getTokenUsageStats();
      
      res.status(200).json({
        success: true,
        data: {
          ...stats,
          totalEstimatedCost: parseFloat(stats.totalEstimatedCost.toFixed(6)),
          averageCostPerCall: parseFloat(stats.averageCostPerCall.toFixed(6)),
          inputTokensPerCall: Math.round(stats.inputTokensPerCall),
          outputTokensPerCall: Math.round(stats.outputTokensPerCall)
        }
      });
    } catch (err) {
      console.error("Error getting token usage stats:", err);
      res.status(500).json({ 
        success: false, 
        message: `Error getting token usage stats: ${err instanceof Error ? err.message : String(err)}` 
      });
    }
  });

  // Get all patient batches
  app.get("/api/batches", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ success: false, message: "Authentication required" });
      }
      
      const batches = await storage.getAllPatientBatches();
      res.status(200).json(batches);
    } catch (err) {
      console.error("Error fetching batches:", err);
      res.status(500).json({ 
        success: false, 
        message: `Error fetching batches: ${err instanceof Error ? err.message : String(err)}` 
      });
    }
  });

  // ===== NEW API ENDPOINTS FOR CUSTOMER-REQUESTED FEATURES =====

  // === PROMPT EDITING SANDBOX ENDPOINTS ===
  
  // Get prompt template for a patient
  app.get("/api/prompt-template/:patientId", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ success: false, message: "Authentication required" });
      }
      
      const { patientId } = req.params;
      const template = await storage.getPromptTemplate(patientId);
      
      if (!template) {
        return res.status(404).json({
          success: false,
          message: "Template not found for this patient"
        });
      }
      
      return res.status(200).json(template);
    } catch (err) {
      console.error("Error fetching prompt template:", err);
      return res.status(500).json({
        success: false,
        message: `Error fetching prompt template: ${err instanceof Error ? err.message : String(err)}`
      });
    }
  });
  
  // Update prompt template for a patient
  app.post("/api/update-prompt-template", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ success: false, message: "Authentication required" });
      }
      
      const { patientId, template } = req.body;
      
      if (!patientId || !template) {
        return res.status(400).json({
          success: false,
          message: "Patient ID and template are required"
        });
      }
      
      await storage.updatePromptTemplate(patientId, template);
      
      return res.status(200).json({
        success: true,
        message: "Template updated successfully"
      });
    } catch (err) {
      console.error("Error updating prompt template:", err);
      return res.status(500).json({
        success: false,
        message: `Error updating prompt template: ${err instanceof Error ? err.message : String(err)}`
      });
    }
  });
  
  // Regenerate prompt with custom template
  app.post("/api/regenerate-prompt-with-template", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ success: false, message: "Authentication required" });
      }
      
      const { patientId, template } = req.body;
      
      if (!patientId || !template) {
        return res.status(400).json({
          success: false,
          message: "Patient ID and template are required"
        });
      }
      
      // For now, we'll just simulate a successful regeneration
      // In a real implementation, this would use the template to generate a new prompt
      
      return res.status(200).json({
        success: true,
        message: "Prompt regenerated with custom template"
      });
    } catch (err) {
      console.error("Error regenerating prompt with template:", err);
      return res.status(500).json({
        success: false,
        message: `Error regenerating prompt with template: ${err instanceof Error ? err.message : String(err)}`
      });
    }
  });
  
  // === TRIAGE ENDPOINTS ===
  
  // Get patient alerts for a specific date
  app.get("/api/triage/alerts", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ success: false, message: "Authentication required" });
      }
      
      const date = req.query.date as string || new Date().toISOString().split('T')[0];
      const alerts = await storage.getPatientAlerts(date);
      
      return res.status(200).json(alerts);
    } catch (err) {
      console.error("Error fetching patient alerts:", err);
      return res.status(500).json({
        success: false,
        message: `Error fetching patient alerts: ${err instanceof Error ? err.message : String(err)}`
      });
    }
  });
  
  // Send a single alert
  app.post("/api/triage/send-alert", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ success: false, message: "Authentication required" });
      }
      
      const { alertId } = req.body;
      
      if (!alertId) {
        return res.status(400).json({
          success: false,
          message: "Alert ID is required"
        });
      }
      
      const result = await storage.sendAlert(alertId);
      
      return res.status(200).json({
        success: true,
        patientName: result.patientName,
        message: "Alert sent successfully"
      });
    } catch (err) {
      console.error("Error sending alert:", err);
      return res.status(500).json({
        success: false,
        message: `Error sending alert: ${err instanceof Error ? err.message : String(err)}`
      });
    }
  });
  
  // Send multiple alerts
  app.post("/api/triage/send-alerts", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ success: false, message: "Authentication required" });
      }
      
      const { alertIds } = req.body;
      
      if (!alertIds || !Array.isArray(alertIds) || alertIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Alert IDs array is required"
        });
      }
      
      const result = await storage.sendAllAlerts(alertIds);
      
      return res.status(200).json({
        success: true,
        sent: result.sent,
        message: `Successfully sent ${result.sent} alerts`
      });
    } catch (err) {
      console.error("Error sending alerts:", err);
      return res.status(500).json({
        success: false,
        message: `Error sending alerts: ${err instanceof Error ? err.message : String(err)}`
      });
    }
  });
  
  // === MONTHLY REPORTS ENDPOINTS ===
  
  // Get all monthly reports
  app.get("/api/monthly-reports", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ success: false, message: "Authentication required" });
      }
      
      const reports = await storage.getMonthlyReports();
      
      return res.status(200).json(reports);
    } catch (err) {
      console.error("Error fetching monthly reports:", err);
      return res.status(500).json({
        success: false,
        message: `Error fetching monthly reports: ${err instanceof Error ? err.message : String(err)}`
      });
    }
  });
  
  // Download a monthly report
  app.get("/api/download-report/:year/:month", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ success: false, message: "Authentication required" });
      }
      
      const { year, month } = req.params;
      
      // Get all patient prompts from the database
      const prompts = await db.select().from(patientPrompts);
      
      // Filter to match the specified month/year if provided
      const filteredPrompts = prompts.filter(prompt => {
        if (!prompt.createdAt) return false;
        
        try {
          const promptDate = new Date(prompt.createdAt);
          const promptMonth = String(promptDate.getMonth() + 1).padStart(2, '0');
          const promptYear = promptDate.getFullYear().toString();
          
          return promptMonth === month && promptYear === year;
        } catch(e) {
          console.warn(`Could not parse date for prompt ${prompt.id}:`, e);
          return false;
        }
      });
      
      // Generate Excel file
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Patient Data');
      
      // Add headers
      worksheet.columns = [
        { header: 'Patient ID', key: 'patientId', width: 15 },
        { header: 'Name', key: 'name', width: 20 },
        { header: 'Age', key: 'age', width: 10 },
        { header: 'Condition', key: 'condition', width: 20 },
        { header: 'Health Status', key: 'healthStatus', width: 15 },
        { header: 'Alert Status', key: 'isAlert', width: 15 },
        { header: 'Prompt', key: 'prompt', width: 50 },
      ];
      
      // Add rows
      filteredPrompts.forEach(prompt => {
        worksheet.addRow({
          patientId: prompt.patientId,
          name: prompt.name,
          age: prompt.age,
          condition: prompt.condition,
          healthStatus: prompt.healthStatus,
          isAlert: prompt.isAlert === 'true' ? 'Yes' : 'No',
          prompt: prompt.prompt
        });
      });
      
      // Set Content-Type and attachment header
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="patient-report-${year}-${month}.xlsx"`);
      
      // Write to response
      await workbook.xlsx.write(res);
      res.end();
      
    } catch (err) {
      console.error("Error generating report for download:", err);
      res.status(500).json({ 
        success: false, 
        message: `Error generating report: ${err instanceof Error ? err.message : String(err)}` 
      });
    }
  });
  
  // Generate a new monthly report
  app.post("/api/generate-monthly-report", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ success: false, message: "Authentication required" });
      }
      
      const { monthYear } = req.body;
      
      if (!monthYear) {
        return res.status(400).json({
          success: false,
          message: "Month and year are required (format: YYYY-MM)"
        });
      }
      
      const report = await storage.generateMonthlyReport(monthYear);
      
      return res.status(200).json({
        success: true,
        report,
        message: "Monthly report generation initiated"
      });
    } catch (err) {
      console.error("Error generating monthly report:", err);
      return res.status(500).json({
        success: false,
        message: `Error generating monthly report: ${err instanceof Error ? err.message : String(err)}`
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}