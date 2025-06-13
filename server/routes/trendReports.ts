import { Express, Request, Response } from "express";
import { storage } from "../storage";
import { generateTrendReport } from "../lib/trendReports";

export function registerTrendReportRoutes(app: Express): void {
  // Get trend report prompt
  app.get("/api/trend-report-prompt", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({
          success: false,
          message: "Authentication required"
        });
      }

      const batchId = req.query.batchId as string;
      const prompt = await storage.getTrendReportPrompt(batchId);
      
      return res.status(200).json({
        success: true,
        data: {
          prompt: prompt?.prompt || storage.getDefaultTrendReportPrompt()
        }
      });
    } catch (error) {
      console.error("Error fetching trend report prompt:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch trend report prompt"
      });
    }
  });

  // Update trend report prompt
  app.post("/api/trend-report-prompt", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({
          success: false,
          message: "Authentication required"
        });
      }

      const { prompt, batchId } = req.body;
      
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({
          success: false,
          message: "Prompt is required and must be a string"
        });
      }

      const updatedPrompt = await storage.updateTrendReportPrompt(prompt, batchId);
      
      return res.status(200).json({
        success: true,
        data: updatedPrompt,
        message: "Trend report prompt updated successfully"
      });
    } catch (error) {
      console.error("Error updating trend report prompt:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to update trend report prompt"
      });
    }
  });

  // Generate trend report for a specific patient
  app.post("/api/generate-trend-report", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({
          success: false,
          message: "Authentication required"
        });
      }

      const { patientId, batchId } = req.body;

      if (!patientId) {
        return res.status(400).json({
          success: false,
          message: "Patient ID is required"
        });
      }

      // Get patient data
      let patientData;
      if (batchId) {
        patientData = await storage.getPatientPromptByIds(batchId, patientId);
      } else {
        patientData = await storage.getLatestPatientPrompt(patientId);
      }

      if (!patientData) {
        return res.status(404).json({
          success: false,
          message: "Patient not found"
        });
      }

      // Generate the trend report using OpenAI
      const trendReport = await generateTrendReport(patientData, batchId);

      return res.status(200).json({
        success: true,
        data: {
          report: trendReport,
          patient: {
            name: patientData.name,
            patientId: patientData.patientId,
            age: patientData.age,
            condition: patientData.condition
          }
        }
      });
    } catch (error) {
      console.error("Error generating trend report:", error);
      return res.status(500).json({
        success: false,
        message: `Failed to generate trend report: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  });
}