import { Express, Request, Response } from "express";
import { storage } from "../storage";

export function registerCallRoutes(app: Express): void {
  // === CALL HISTORY ENDPOINTS ===

  // Get call history for all patients or a specific patient
  app.get("/api/call-history", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({
          success: false,
          message: "Authentication required"
        });
      }

      const { patientId, limit = 50, offset = 0 } = req.query;

      let callHistory;
      if (patientId) {
        callHistory = await storage.getCallHistoryByPatient(
          patientId as string,
          parseInt(limit as string),
          parseInt(offset as string)
        );
      } else {
        callHistory = await storage.getAllCallHistory(
          parseInt(limit as string),
          parseInt(offset as string)
        );
      }

      return res.status(200).json({
        success: true,
        data: callHistory
      });

    } catch (error) {
      console.error("❌ Error fetching call history:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch call history"
      });
    }
  });

  // Get detailed call information by call ID
  app.get("/api/call-history/:callId", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({
          success: false,
          message: "Authentication required"
        });
      }

      const { callId } = req.params;

      const callDetails = await storage.getCallHistoryById(callId);

      if (!callDetails) {
        return res.status(404).json({
          success: false,
          message: "Call not found"
        });
      }

      return res.status(200).json({
        success: true,
        data: callDetails
      });

    } catch (error) {
      console.error("❌ Error fetching call details:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch call details"
      });
    }
  });

  // Update call notes or status
  app.patch("/api/call-history/:callId", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({
          success: false,
          message: "Authentication required"
        });
      }

      const { callId } = req.params;
      const updates = req.body;

      if (!updates || Object.keys(updates).length === 0) {
        return res.status(400).json({
          success: false,
          message: "No updates provided"
        });
      }

      const updatedCall = await storage.updateCallHistory(callId, updates);

      if (!updatedCall) {
        return res.status(404).json({
          success: false,
          message: "Call not found"
        });
      }

      return res.status(200).json({
        success: true,
        message: "Call updated successfully",
        data: updatedCall
      });

    } catch (error) {
      console.error("❌ Error updating call:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to update call"
      });
    }
  });

  // Delete call history record
  app.delete("/api/call-history/:callId", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({
          success: false,
          message: "Authentication required"
        });
      }

      const { callId } = req.params;

      const deleted = await storage.deleteCallHistory(callId);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: "Call not found"
        });
      }

      return res.status(200).json({
        success: true,
        message: "Call deleted successfully"
      });

    } catch (error) {
      console.error("❌ Error deleting call:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to delete call"
      });
    }
  });

  // Get call statistics
  app.get("/api/call-history/stats", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({
          success: false,
          message: "Authentication required"
        });
      }

      const { startDate, endDate, patientId } = req.query;

      const stats = await storage.getCallStatistics({
        startDate: startDate as string,
        endDate: endDate as string,
        patientId: patientId as string
      });

      return res.status(200).json({
        success: true,
        data: stats
      });

    } catch (error) {
      console.error("❌ Error fetching call statistics:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch call statistics"
      });
    }
  });

  // Export call history to CSV
  app.get("/api/call-history/export", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({
          success: false,
          message: "Authentication required"
        });
      }

      const { startDate, endDate, patientId, format = 'csv' } = req.query;

      const callHistory = await storage.getCallHistoryForExport({
        startDate: startDate as string,
        endDate: endDate as string,
        patientId: patientId as string
      });

      if (format === 'csv') {
        // Generate CSV
        const csvHeader = 'Call ID,Patient ID,Patient Name,Phone Number,Call Date,Duration (seconds),Status,Summary\n';
        const csvRows = callHistory.map((call: any) => 
          `"${call.callId}","${call.patientId}","${call.patientName}","${call.phoneNumber}","${call.callDate}","${call.duration}","${call.status}","${call.summary?.replace(/"/g, '""') || ''}"`
        ).join('\n');

        const csvContent = csvHeader + csvRows;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="call-history.csv"');
        return res.send(csvContent);
      }

      return res.status(400).json({
        success: false,
        message: "Unsupported export format"
      });

    } catch (error) {
      console.error("❌ Error exporting call history:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to export call history"
      });
    }
  });
}
