import { Express } from "express";
import { registerHealthRoutes } from "./health";
import { registerUploadRoutes } from "./upload";
import { registerPromptRoutes } from "./prompts";
import { registerBatchRoutes } from "./batches";
import { registerSandboxRoutes } from "./sandbox";
import { registerTriageRoutes } from "./triage";
import { registerVapiRoutes } from "./vapi";
import { registerReportRoutes } from "./reports";
import { registerSettingsRoutes } from "./settings";
import { registerCallRoutes } from "./calls";

/**
 * Register all application routes
 * This function combines all the individual route modules into a single registration function
 */
export function registerAllRoutes(app: Express): void {
  // Health and system status routes
  registerHealthRoutes(app);
  
  // File upload and processing routes
  registerUploadRoutes(app);
  
  // Patient prompts management routes
  registerPromptRoutes(app);
  
  // Batch management routes
  registerBatchRoutes(app);
  
  // Prompt editing sandbox routes
  registerSandboxRoutes(app);
  
  // Triage and alerts routes
  registerTriageRoutes(app);
  
  // VAPI voice calling routes
  registerVapiRoutes(app);
  
  // Monthly reports routes
  registerReportRoutes(app);
  
  // System settings routes
  registerSettingsRoutes(app);
  
  // Call history management routes
  registerCallRoutes(app);
  
  console.log("✅ All routes registered successfully");
}
