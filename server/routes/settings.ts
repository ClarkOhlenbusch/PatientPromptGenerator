import { Express, Request, Response } from "express";
import { storage } from "../storage";
import { phoneSchema } from "@shared/schema";

export function registerSettingsRoutes(app: Express): void {
  // === SYSTEM SETTINGS ENDPOINTS ===

  // Get all system settings
  app.get("/api/settings", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      const settings = await storage.getAllSettings();

      return res.status(200).json({
        success: true,
        data: settings,
      });
    } catch (err) {
      console.error("Error fetching settings:", err);
      return res.status(500).json({
        success: false,
        message: `Error fetching settings: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  // Update a specific setting
  app.patch("/api/settings/:key", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      const { key } = req.params;
      const { value } = req.body;

      if (!key) {
        return res.status(400).json({
          success: false,
          message: "Setting key is required",
        });
      }

      if (value === undefined) {
        return res.status(400).json({
          success: false,
          message: "Setting value is required",
        });
      }

      const updatedSetting = await storage.updateSetting(key, value);

      return res.status(200).json({
        success: true,
        message: "Setting updated successfully",
        data: updatedSetting,
      });
    } catch (err) {
      console.error("Error updating setting:", err);
      return res.status(500).json({
        success: false,
        message: `Error updating setting: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  // Get phone number configuration
  app.get("/api/settings/phone", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      const phoneConfig = await storage.getPhoneConfiguration();

      return res.status(200).json({
        success: true,
        data: phoneConfig,
      });
    } catch (err) {
      console.error("Error fetching phone configuration:", err);
      return res.status(500).json({
        success: false,
        message: `Error fetching phone configuration: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  // Update phone number configuration
  app.post("/api/settings/phone", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      const phoneData = req.body;

      // Validate phone data using schema
      const validationResult = phoneSchema.safeParse(phoneData);
      if (!validationResult.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid phone configuration",
          errors: validationResult.error.errors,
        });
      }

      const updatedConfig = await storage.updatePhoneConfiguration(validationResult.data);

      return res.status(200).json({
        success: true,
        message: "Phone configuration updated successfully",
        data: updatedConfig,
      });
    } catch (err) {
      console.error("Error updating phone configuration:", err);
      return res.status(500).json({
        success: false,
        message: `Error updating phone configuration: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  // Get notification settings
  app.get("/api/settings/notifications", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      const notificationSettings = await storage.getNotificationSettings();

      return res.status(200).json({
        success: true,
        data: notificationSettings,
      });
    } catch (err) {
      console.error("Error fetching notification settings:", err);
      return res.status(500).json({
        success: false,
        message: `Error fetching notification settings: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  // Update notification settings
  app.post("/api/settings/notifications", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      const notificationData = req.body;

      if (!notificationData || typeof notificationData !== 'object') {
        return res.status(400).json({
          success: false,
          message: "Invalid notification settings data",
        });
      }

      const updatedSettings = await storage.updateNotificationSettings(notificationData);

      return res.status(200).json({
        success: true,
        message: "Notification settings updated successfully",
        data: updatedSettings,
      });
    } catch (err) {
      console.error("Error updating notification settings:", err);
      return res.status(500).json({
        success: false,
        message: `Error updating notification settings: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  // Get API configuration
  app.get("/api/settings/api", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      const apiConfig = await storage.getApiConfiguration();

      return res.status(200).json({
        success: true,
        data: apiConfig,
      });
    } catch (err) {
      console.error("Error fetching API configuration:", err);
      return res.status(500).json({
        success: false,
        message: `Error fetching API configuration: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  // Update API configuration
  app.post("/api/settings/api", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      const apiData = req.body;

      if (!apiData || typeof apiData !== 'object') {
        return res.status(400).json({
          success: false,
          message: "Invalid API configuration data",
        });
      }

      const updatedConfig = await storage.updateApiConfiguration(apiData);

      return res.status(200).json({
        success: true,
        message: "API configuration updated successfully",
        data: updatedConfig,
      });
    } catch (err) {
      console.error("Error updating API configuration:", err);
      return res.status(500).json({
        success: false,
        message: `Error updating API configuration: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  // Reset settings to defaults
  app.post("/api/settings/reset", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });
      }

      const { category } = req.body;

      if (!category) {
        return res.status(400).json({
          success: false,
          message: "Settings category is required",
        });
      }

      await storage.resetSettingsToDefaults(category);

      return res.status(200).json({
        success: true,
        message: `${category} settings reset to defaults successfully`,
      });
    } catch (err) {
      console.error("Error resetting settings:", err);
      return res.status(500).json({
        success: false,
        message: `Error resetting settings: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });
}
