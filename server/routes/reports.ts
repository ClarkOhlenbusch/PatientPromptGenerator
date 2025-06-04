import { Express, Request, Response } from "express";
import { storage } from "../storage";
import ExcelJS from "exceljs";

export function registerReportRoutes(app: Express): void {
  // === TREND REPORTS ENDPOINTS ===

  // Get trend report data
  app.get("/api/monthly-report", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      const { month, year } = req.query;

      if (!month || !year) {
        return res.status(400).json({
          success: false,
          message: "Month and year parameters are required",
        });
      }

      const monthNum = parseInt(month as string);
      const yearNum = parseInt(year as string);

      if (isNaN(monthNum) || isNaN(yearNum) || monthNum < 1 || monthNum > 12) {
        return res.status(400).json({
          success: false,
          message: "Invalid month or year format",
        });
      }

      const reportData = await storage.getMonthlyReportData(monthNum, yearNum);

      return res.status(200).json({
        success: true,
        data: reportData,
      });
    } catch (err) {
      console.error("Error generating trend report:", err);
      return res.status(500).json({
        success: false,
        message: `Error generating trend report: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  // Export monthly report to Excel
  app.get("/api/monthly-report/export", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      const { month, year } = req.query;

      if (!month || !year) {
        return res.status(400).json({
          success: false,
          message: "Month and year parameters are required",
        });
      }

      const monthNum = parseInt(month as string);
      const yearNum = parseInt(year as string);

      if (isNaN(monthNum) || isNaN(yearNum) || monthNum < 1 || monthNum > 12) {
        return res.status(400).json({
          success: false,
          message: "Invalid month or year format",
        });
      }

      const reportData = await storage.getMonthlyReportData(monthNum, yearNum);

      // Create Excel workbook
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Monthly Report");

      // Add headers
      worksheet.columns = [
        { header: "Patient ID", key: "patientId", width: 20 },
        { header: "Patient Name", key: "name", width: 25 },
        { header: "Age", key: "age", width: 10 },
        { header: "Condition", key: "condition", width: 30 },
        { header: "Health Status", key: "healthStatus", width: 15 },
        { header: "Is Alert", key: "isAlert", width: 10 },
        { header: "Batch ID", key: "batchId", width: 20 },
        { header: "Created Date", key: "createdAt", width: 20 },
      ];

      // Add data rows
      reportData.patients.forEach((patient: any) => {
        worksheet.addRow({
          patientId: patient.patientId,
          name: patient.name,
          age: patient.age,
          condition: patient.condition,
          healthStatus: patient.healthStatus,
          isAlert: patient.isAlert === "true" ? "Yes" : "No",
          batchId: patient.batchId,
          createdAt: new Date(patient.createdAt).toLocaleDateString(),
        });
      });

      // Style the header row
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      };

      // Add summary section
      const summaryStartRow = reportData.patients.length + 3;
      worksheet.addRow([]);
      worksheet.addRow([]);
      worksheet.addRow(["SUMMARY"]);
      worksheet.getRow(summaryStartRow).font = { bold: true, size: 14 };

      worksheet.addRow(["Total Patients", reportData.summary.totalPatients]);
      worksheet.addRow(["Alert Patients", reportData.summary.alertPatients]);
      worksheet.addRow(["Healthy Patients", reportData.summary.healthyPatients]);
      worksheet.addRow(["Total Batches", reportData.summary.totalBatches]);

      // Set response headers for file download
      const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
      ];
      const filename = `monthly-report-${monthNames[monthNum - 1]}-${yearNum}.xlsx`;

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

      // Write workbook to response
      await workbook.xlsx.write(res);
      res.end();
    } catch (err) {
      console.error("Error exporting monthly report:", err);
      return res.status(500).json({
        success: false,
        message: `Error exporting monthly report: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  // Get available report months/years
  app.get("/api/monthly-report/available-periods", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      const periods = await storage.getAvailableReportPeriods();

      return res.status(200).json({
        success: true,
        data: periods,
      });
    } catch (err) {
      console.error("Error fetching available report periods:", err);
      return res.status(500).json({
        success: false,
        message: `Error fetching available periods: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  // Get report statistics for dashboard
  app.get("/api/reports/stats", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      const stats = await storage.getReportStatistics();

      return res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (err) {
      console.error("Error fetching report statistics:", err);
      return res.status(500).json({
        success: false,
        message: `Error fetching report statistics: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });
}
