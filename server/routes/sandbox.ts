import { Express, Request, Response } from "express";
import { storage } from "../storage";
import { generatePromptWithTemplate, getDefaultSystemPrompt } from "../lib/openai";
import { db } from "../db";
import { patientPrompts } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export function registerSandboxRoutes(app: Express): void {
  // === PROMPT EDITING SANDBOX ENDPOINTS ===

  // Get prompt template for a patient
  app.get("/api/prompt-template/:patientId", async (req: Request, res: Response) => {
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
  app.post("/api/update-prompt-template", async (req: Request, res: Response) => {
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
  app.post("/api/regenerate-prompt-with-template", async (req: Request, res: Response) => {
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
      const { generatePromptWithSystemAndTemplate } = await import("../lib/openai");
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
  app.get("/api/sandbox/system-prompt", async (req: Request, res: Response) => {
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
  app.post("/api/sandbox/system-prompt", async (req: Request, res: Response) => {
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
  app.get("/api/sandbox/variables", async (req: Request, res: Response) => {
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
  app.post("/api/sandbox/variables", async (req: Request, res: Response) => {
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
  app.patch("/api/sandbox/variables/:id", async (req: Request, res: Response) => {
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
  app.delete("/api/sandbox/variables/:id", async (req: Request, res: Response) => {
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
    async (req: Request, res: Response) => {
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
          "../lib/openai"
        );

        // Format the variables list for the AI to reference, but include it in the system prompt
        const variablesList = variables
          .map(
            (v: any) =>
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
}
