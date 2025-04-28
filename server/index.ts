import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import cors from 'cors';
import { initializeDatabase } from "./lib/initDb";

// Global error handlers to prevent server crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Promise Rejection:', reason);
  // Log the promise details to help with debugging
  console.error('Promise:', promise);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Log the error but don't exit the process in production
  if (process.env.NODE_ENV !== 'production') {
    console.error('Server will continue running, but may be in an unstable state');
  }
});

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors({ 
  origin: process.env.NODE_ENV === 'production' ? 'https://' + process.env.REPL_SLUG + '.repl.co' : true,
  credentials: true 
}));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Initialize database first
  try {
    await initializeDatabase();
  } catch (err) {
    console.error('Failed to initialize database:', err);
  }
  
  const server = await registerRoutes(app);

  // Standardized error handling middleware
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    // Log the error with full details
    console.error(`Server error: ${err.message || 'Unknown error'}`, {
      status: err.status || err.statusCode || 500,
      stack: err.stack,
      name: err.name,
      code: err.code
    });
    
    // Determine appropriate status code
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    
    // Send standardized error response
    res.status(status).json({ 
      success: false, 
      data: null,
      error: message,
      timestamp: new Date().toISOString()
    });
    
    // Don't throw the error after handling it - this would crash the server
    // Instead just log it and let the server continue
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();