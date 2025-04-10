import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import { nanoid } from "nanoid";
import { processExcelFile } from "./lib/excelProcessor";
import { generatePrompt } from "./lib/openai";
import { createObjectCsvStringifier } from "csv-writer";

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
  // Test route for direct file upload testing
  app.get("/test-upload", (req, res) => {
    res.sendFile("test-upload.html", { root: "public" });
  });
  
  // API endpoint for file upload
  // Add a debug route to test file upload
  app.post("/api/test-upload", upload.single("file"), (req, res) => {
    console.log("Test upload received request:", {
      body: req.body,
      file: req.file,
      headers: req.headers
    });
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded in test" });
    }
    return res.status(200).json({ success: true, message: "File received in test", file: req.file.originalname });
  });

  app.post("/api/upload", upload.single("file"), async (req, res) => {
    try {
      console.log("Upload endpoint called, file:", req.file);
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

      // Process the Excel file and extract patient data
      const patientData = await processExcelFile(file.buffer);

      // Generate prompts for each patient and save to database
      for (const patient of patientData) {
        try {
          const prompt = await generatePrompt(patient);
          
          await storage.createPatientPrompt({
            batchId,
            patientId: patient.patientId || `P${nanoid(6)}`,
            name: patient.name,
            age: patient.age,
            condition: patient.condition,
            prompt,
            rawData: patient,
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
      console.error("Error processing upload:", err);
      res.status(500).json({
        success: false,
        message: `Error processing file: ${err.message}`,
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
      res.status(500).json({ message: `Error fetching prompts: ${err.message}` });
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
      
      const newPrompt = await generatePrompt(rawData);
      
      await storage.updatePatientPrompt(patientPrompt.id, { prompt: newPrompt });
      
      res.status(200).json({ message: "Prompt regenerated successfully" });
    } catch (err) {
      console.error("Error regenerating prompt:", err);
      res.status(500).json({ message: `Error regenerating prompt: ${err.message}` });
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
        
        const newPrompt = await generatePrompt(rawData);
        await storage.updatePatientPrompt(prompt.id, { prompt: newPrompt });
      }));
      
      res.status(200).json({ message: "All prompts regenerated successfully" });
    } catch (err) {
      console.error("Error regenerating prompts:", err);
      res.status(500).json({ message: `Error regenerating prompts: ${err.message}` });
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
      res.status(500).json({ message: `Error exporting prompts: ${err.message}` });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
