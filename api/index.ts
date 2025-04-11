// Vercel serverless function entrypoint for API
import express, { type Request, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import { nanoid } from "nanoid";
import { processExcelFile } from "../server/lib/excelProcessor";
import { generatePrompt } from "../server/lib/openai";
import { storage } from "../server/storage";
import { createObjectCsvStringifier } from "csv-writer";

// Initialize Express app
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

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

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
  });

  next();
});

// API endpoint for file upload
app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    console.log("Upload endpoint called, file:", req.file);
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    const file = req.file;
    const batchId = nanoid();
    const timestamp = new Date().toISOString();
    console.log("Processing file:", file.originalname, "size:", file.size);

    // Create a batch record
    await storage.createPatientBatch({
      batchId,
      fileName: file.originalname,
      createdAt: timestamp,
    });
    console.log("Created batch record with ID:", batchId);

    try {
      // Process the Excel file and extract patient data
      console.log("Starting Excel processing...");
      const patientData = await processExcelFile(file.buffer);
      console.log("Excel processing complete. Extracted patients:", patientData.length);

      // Limit the number of records to process to improve performance
      // Take only unique patient+condition combinations to reduce load
      const uniquePatients = new Map();
      const MAX_PATIENTS = 20; // Limit to 20 patient-condition combinations for demo
      
      // Group patients by unique patientId+condition
      for (const patient of patientData) {
        const key = `${patient.patientId}_${patient.condition}`;
        if (!uniquePatients.has(key)) {
          uniquePatients.set(key, patient);
          if (uniquePatients.size >= MAX_PATIENTS) break;
        }
      }
      
      console.log(`Processing ${uniquePatients.size} unique patient-condition combinations out of ${patientData.length} total records`);
      
      // Generate prompts for each unique patient-condition combination
      for (const patient of Array.from(uniquePatients.values())) {
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

// Error handling middleware
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  
  console.error("Server error:", err);
  res.status(status).json({ message });
});

// Export the Express app for Vercel
export default app;