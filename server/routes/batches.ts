import { Express, Request, Response } from "express";
import { storage } from "../storage";
import { getDefaultSystemPrompt, setDefaultSystemPrompt } from "../lib/openai";

export function registerBatchRoutes(app: Express): void {
  // Get all patient batches
  app.get("/api/batches", async (req: Request, res: Response) => {
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
  app.get("/api/batches/latest", async (req: Request, res: Response) => {
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
      const sortedBatches = batches.sort((a: any, b: any) =>
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

  // Get simplified core prompt - ALWAYS returns the exact prompt from openai.ts
  app.get("/api/system-prompt", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      // Get the in-memory prompt directly from openai.ts
      const inMemoryPrompt = getDefaultSystemPrompt();

      // Also get the database-stored prompt if it exists
      const systemPrompt = await storage.getSystemPrompt();
      const dbPrompt = systemPrompt ? systemPrompt.prompt : null;

      console.log("Returning system prompt:");
      console.log(`- In-memory prompt: ${inMemoryPrompt.substring(0, 50)}...`);
      console.log(`- Database prompt: ${dbPrompt ? dbPrompt.substring(0, 50) + '...' : 'not found'}`);

      // If the database prompt exists and differs from the in-memory one,
      // return the database version as it's likely more up-to-date
      const promptToUse = dbPrompt || inMemoryPrompt;

      return res.status(200).json({
        prompt: promptToUse,
        inMemoryPrompt: inMemoryPrompt,
        dbPrompt: dbPrompt,
        source: dbPrompt ? 'database' : 'in-memory'
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
  app.post("/api/system-prompt", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      const { prompt } = req.body;

      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({
          success: false,
          message: "Prompt is required and must be a string",
        });
      }

      if (prompt.length > 10000) {
        return res.status(400).json({
          success: false,
          message: "Prompt is too long (maximum 10,000 characters)",
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

  // Reset system prompt to default
  app.post("/api/system-prompt/reset", async (req: Request, res: Response) => {
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
}
