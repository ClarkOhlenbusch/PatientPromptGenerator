import { Express, Request, Response } from "express";
import { storage } from "../storage";

export function registerVapiTemplateRoutes(app: Express): void {
  app.get("/api/voice-agent-template", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      const template = await storage.getVoiceAgentTemplate();
      return res.status(200).json({ success: true, template });
    } catch (error) {
      console.error("Error fetching voice agent template:", error);
      return res.status(500).json({
        success: false,
        message: `Error fetching template: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  });

  app.post("/api/voice-agent-template", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      const { template } = req.body;
      if (!template) {
        return res.status(400).json({ success: false, message: "Template is required" });
      }

      await storage.updateVoiceAgentTemplate(template);
      return res.status(200).json({ success: true, message: "Voice agent template updated successfully" });
    } catch (error) {
      console.error("Error updating voice agent template:", error);
      return res.status(500).json({
        success: false,
        message: `Error updating template: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  });
}
