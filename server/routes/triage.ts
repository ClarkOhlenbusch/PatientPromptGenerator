import { Express, Request, Response } from "express";
import { storage } from "../storage";

export function registerTriageRoutes(app: Express): void {
  // === TRIAGE ENDPOINTS ===

  // Get patient alerts for a specific date
  app.get("/api/triage/alerts", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      // Use batchId if provided, otherwise use most recent batch
      const batchId = req.query.batchId as string;

      // Get alerts for the specified batch or most recent if none provided
      const alerts = await storage.getPatientAlerts(batchId);

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
  app.post("/api/triage/send-alert", async (req: Request, res: Response) => {
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
  app.post("/api/triage/send-alerts", async (req: Request, res: Response) => {
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
}
