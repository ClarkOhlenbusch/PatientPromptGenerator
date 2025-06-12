import { Express, Request, Response } from "express";
import multer from "multer";
import path from "path";
import { nanoid } from "nanoid";
import { processExcelFile } from "../lib/excelProcessor";
import { generatePrompt, extractReasoning, generateDualMessages } from "../lib/openai";
import { storage } from "../storage";
import { db } from "../db";
import { sql as SQL } from "drizzle-orm";

// Set up multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req: any, file: any, cb: any) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== ".xlsx") {
      return cb(new Error(`Invalid file type: ${ext}. Only Excel (.xlsx) files are allowed`));
    }
    cb(null, true);
  },
});

export function registerUploadRoutes(app: Express): void {
  // API endpoint for file upload
  app.post("/api/upload", upload.single("file"), async (req: Request, res: Response) => {
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

      // Additional file validation
      if (req.file.size === 0) {
        console.log("Upload failed: Empty file");
        return res
          .status(400)
          .json({ success: false, message: "File is empty" });
      }

      if (req.file.size > 10 * 1024 * 1024) { // 10MB limit
        console.log("Upload failed: File too large");
        return res
          .status(400)
          .json({ success: false, message: "File size exceeds 10MB limit" });
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
            console.log(`Processing patient: [REDACTED]`);

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

            console.log(`Generating dual messages for patient ID: ${patientId}...`);
            // Generate both caregiver and patient messages
            const { caregiverMessage, patientMessage } = await generateDualMessages(patientWithMetadata, batchId);

            // Extract reasoning from the caregiver message
            const { displayPrompt, reasoning } = extractReasoning(caregiverMessage);

            console.log(`Storing prompt for patient ${patientId}...`);
            console.log(`Attempting to create prompt record for patient ${patientId} in batch ${batchId}`);
            // Create the patient prompt record in the database
            await storage.createPatientPrompt({
              batchId,
              patientId,
              name: patient.name || "Unknown",
              age: patient.age || 0,
              condition: patient.condition || "Unknown",
              prompt: caregiverMessage,
              patientMessage: patientMessage,
              reasoning,
              isAlert: patient.isAlert ? "true" : "false",
              healthStatus: patient.healthStatus || "healthy",
              rawData: patientWithMetadata,
            });

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
            console.error(`Failed to process and store data for patient [REDACTED] (ID: ${patient.patientId || 'None'}) in batch ${batchId}`);
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
}
