import { Express } from "express";
import { createServer, Server } from "http";
import { setupAuth } from "./auth";
import { registerAllRoutes } from "./routes/index";

export function setupRoutes(app: Express): Server {
  // Set up authentication
  setupAuth(app);

  // Register all modular routes
  registerAllRoutes(app);

  // Create and return HTTP server
  const httpServer = createServer(app);
  return httpServer;
}
