import { Express, Request, Response } from "express";
import { storage } from "../storage";
import { generatePrompt, extractReasoning, getDefaultSystemPrompt, getTokenUsageStats } from "../lib/openai";
import { createObjectCsvStringifier } from "csv-writer";
import { db } from "../db";
import { patientPrompts } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export function registerPromptRoutes(app: Express): void {
  // Get patient prompts for a batch
  app.get("/api/patient-prompts/:batchId", async (req: Request<{ batchId: string }>, res: Response) => {
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

  // ROUTE 1: Regenerate a single prompt by batch and patient IDs
  // This is a legacy route kept for backward compatibility
  app.post(
    "/api/patient-prompts/:batchId/regenerate/:patientId",
    async (req: Request<{ batchId: string, patientId: string }>, res: Response) => {
      try {
        if (!req.isAuthenticated()) {
          return res.status(401).json({
            success: false,
            data: null,
            error: "Authentication required"
          });
        }

        // Extract parameters from URL
        const { batchId, patientId } = req.params;
        console.log(`Legacy endpoint: Regenerating prompt for patient ${patientId} in batch ${batchId}`);

        const patientPrompt = await storage.getPatientPromptByIds(
          batchId,
          patientId,
        );

        // Handle specific resource not found with 404 + standard wrapper
        if (!patientPrompt) {
          return res.status(404).json({
            success: false,
            data: null,
            error: `Patient prompt not found for patient ${patientId} in batch ${batchId}`
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

        // Extract reasoning from the generated prompt
        const { displayPrompt, reasoning } = extractReasoning(newPrompt);

        // Use standard wrapper for success
        res.status(200).json({
          success: true,
          data: {
            ...updatedPrompt,
            promptText: displayPrompt,
            reasoning: reasoning || updatedPrompt.reasoning
          },
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

  // ROUTE 2: Regenerate all prompts for a batch by batch ID in URL params
  // This is a legacy route kept for backward compatibility
  app.post("/api/patient-prompts/:batchId/regenerate", async (req: Request<{ batchId: string }>, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({
          success: false,
          data: null,
          error: "Authentication required"
        });
      }

      const { batchId } = req.params;
      console.log(`Legacy endpoint: Regenerating all prompts for batch ${batchId}`);

      const prompts = await storage.getPatientPromptsByBatchId(batchId);

      // Handle case where collection is empty - 200 OK + standard wrapper
      if (!prompts.length) {
        console.log(`No prompts found for batch ${batchId}, returning empty success`);
        // Use standard wrapper
        return res.status(200).json({
          success: true,
          // Provide consistent data structure even if empty
          data: { regenerated: 0, total: 0, failedPrompts: [] },
          message: `No prompts found for batch ${batchId}. This batch exists but has no associated prompts.`,
        });
      }

      // Fetch the custom system prompt for this batch if available
      const systemPrompt = await storage.getSystemPrompt(batchId);
      const customSystemPrompt = systemPrompt?.prompt;

      console.log(`Regenerating ${prompts.length} prompts with ${customSystemPrompt ? 'custom' : 'default'} system prompt`);

      // Create a map to get unique patients by name
      const patientMap = new Map<string, typeof prompts[0]>();

      // Get the most recent prompt for each patient (by ID)
      for (const prompt of prompts) {
        const patientName = prompt.name;

        if (!patientMap.has(patientName) || patientMap.get(patientName)!.id < prompt.id) {
          patientMap.set(patientName, prompt);
        }
      }

      // Convert the map values to an array of unique patient prompts
      const uniquePrompts = Array.from(patientMap.values());
      console.log(`Found ${uniquePrompts.length} unique patients to regenerate prompts for`);

      let successCount = 0;
      const failedPrompts: Array<{id: number, name: string, error: string}> = [];

      for (const prompt of uniquePrompts) {
        try {
          console.log(`Processing prompt ${prompt.id} for patient [REDACTED] (${prompt.patientId})`);

          // Get the raw patient data
          let patientData: any = {
            patientId: prompt.patientId,
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
          console.log(`Regenerating prompt for patient [REDACTED] (${prompt.patientId})`);
          const newPrompt = await generatePrompt(patientData, batchId, customSystemPrompt);

          // Extract reasoning from the generated prompt
          const { displayPrompt, reasoning } = extractReasoning(newPrompt);

          // Update in the database with both the full prompt and the extracted reasoning
          await storage.updatePatientPrompt(prompt.id, {
            prompt: newPrompt,
            reasoning: reasoning
          });
          successCount++;
        } catch (err) {
          console.error(`Error regenerating prompt for patient [REDACTED] (ID: ${prompt.patientId}):`, err);
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
        // Report how many were processed
        data: {
          regenerated: successCount,
          total: uniquePrompts.length,
          failedPrompts: failedPrompts.length > 0 ? failedPrompts : []
        },
        message: `Successfully regenerated ${successCount} of ${uniquePrompts.length} prompts${failedPrompts.length > 0 ? `. ${failedPrompts.length} failed.` : '.'}`
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
  app.get("/api/patient-prompts/:batchId/export", async (req: Request, res: Response) => {
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

      const records = prompts.map((p: any) => ({
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
  app.get("/api/token-usage", (req: Request, res: Response) => {
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

  // ROUTE 4: Get all prompts for a specific batch with standardized response format
  // This route uses "prompts" in the path for consistency with the other "/api/prompts/..." endpoints
  app.get("/api/prompts", async (req: Request<{}, {}, {}, { batchId: string }>, res: Response) => {
    try {
      // Authentication check - all prompt endpoints should require authentication
      if (!req.isAuthenticated()) {
        return res.status(401).json({
          success: false,
          data: null,
          error: "Authentication required"
        });
      }

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

      // Check if batch exists
      const batch = await storage.getPatientBatch(batchId);
      if (!batch) {
        console.error(`Batch ID ${batchId} does not exist`);
        return res.status(404).json({
          success: false,
          data: null,
          error: `Batch ID '${batchId}' not found. Please check that you are using a valid batch ID.`
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

  // ROUTE 3: Regenerate a single prompt by ID - primary endpoint used by the client
  app.post("/api/prompts/:id/regenerate", async (req: Request<{ id: string }>, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({
          success: false,
          data: null,
          error: "Authentication required"
        });
      }

      // Get the prompt ID from the request parameters - ensure it's an integer
      const promptId = parseInt(req.params.id, 10);
      if (isNaN(promptId)) {
        return res.status(400).json({
          success: false,
          data: null,
          error: "Invalid prompt ID format. Must be a number."
        });
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
          error: `Prompt with ID ${promptId} not found`
        });
      }

      // Get the batch ID to ensure we're using the correct system prompt
      const batchId = prompt.batchId;
      const patientName = prompt.name;
      console.log(`Regenerating prompt ${promptId} for patient "${patientName}" in batch ${batchId}`);

      // Get all prompts for this batch and this patient
      const allPrompts = await storage.getPatientPromptsByBatchId(batchId);
      const patientPrompts = allPrompts.filter((p: any) => p.name === patientName);

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
        try {
          patientData = typeof mostRecentPrompt.rawData === "string"
            ? JSON.parse(mostRecentPrompt.rawData)
            : mostRecentPrompt.rawData;
        } catch (error) {
          console.error(`Error parsing rawData for prompt ${mostRecentPrompt.id}:`, error);
          // If JSON parsing fails, log the error but continue with the basic patientData
          console.log(`Using basic patient data for ${mostRecentPrompt.patientId} after JSON parse error`);
        }
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

  // ROUTE 4: Regenerate all prompts using query parameters - used by frontend
  app.post("/api/prompts/regenerate-all", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({
          success: false,
          data: null,
          error: "Authentication required"
        });
      }

      const batchId = req.query.batchId as string;
      if (!batchId) {
        return res.status(400).json({
          success: false,
          data: null,
          error: "batchId query parameter is required"
        });
      }

      console.log(`Regenerating all prompts for batch ${batchId}`);

      const prompts = await storage.getPatientPromptsByBatchId(batchId);

      if (!prompts.length) {
        console.log(`No prompts found for batch ${batchId}, returning empty success`);
        return res.status(200).json({
          success: true,
          data: { regenerated: 0, total: 0, failedPrompts: [] },
          message: `No prompts found for batch ${batchId}. This batch exists but has no associated prompts.`,
        });
      }

      // Fetch the custom system prompt for this batch if available
      const systemPrompt = await storage.getSystemPrompt(batchId);
      const customSystemPrompt = systemPrompt?.prompt;

      console.log(`Regenerating ${prompts.length} prompts with ${customSystemPrompt ? 'custom' : 'default'} system prompt`);

      // Create a map to get unique patients by name
      const patientMap = new Map<string, typeof prompts[0]>();

      // Get the most recent prompt for each patient (by ID)
      for (const prompt of prompts) {
        const patientName = prompt.name;

        if (!patientMap.has(patientName) || patientMap.get(patientName)!.id < prompt.id) {
          patientMap.set(patientName, prompt);
        }
      }

      // Convert the map values to an array of unique patient prompts
      const uniquePrompts = Array.from(patientMap.values());
      console.log(`Found ${uniquePrompts.length} unique patients to regenerate prompts for`);

      let successCount = 0;
      const failedPrompts: Array<{id: number, name: string, error: string}> = [];

      for (const prompt of uniquePrompts) {
        try {
          console.log(`Processing prompt ${prompt.id} for patient [REDACTED] (${prompt.patientId})`);

          // Get the raw patient data
          let patientData: any = {
            patientId: prompt.patientId,
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

            if (parsedData) {
              patientData = {
                ...patientData,
                ...parsedData
              };
            }
          }

          // Generate new prompt
          const newPrompt = await generatePrompt(patientData, batchId, customSystemPrompt);
          const { displayPrompt, reasoning } = extractReasoning(newPrompt);

          // Update in the database with both the full prompt and the extracted reasoning
          await storage.updatePatientPrompt(prompt.id, {
            prompt: newPrompt,
            reasoning: reasoning
          });
          successCount++;
        } catch (err) {
          console.error(`Error regenerating prompt for patient [REDACTED] (ID: ${prompt.patientId}):`, err);
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
        data: {
          regenerated: successCount,
          total: uniquePrompts.length,
          failedPrompts: failedPrompts.length > 0 ? failedPrompts : []
        },
        message: `Successfully regenerated ${successCount} of ${uniquePrompts.length} prompts${failedPrompts.length > 0 ? `. ${failedPrompts.length} failed.` : '.'}`
      });
    } catch (err) {
      console.error("Error regenerating prompts:", err);
      res.status(500).json({
        success: false,
        data: null,
        error: `Error regenerating prompts: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });
}
