import express, { type Request, Response, NextFunction } from "express";
import { setupRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { db } from "./db";
import cors from 'cors';
import { initializeDatabase } from "./lib/initDb";

// Validate required environment variables at startup
function validateEnvironment() {
  const required = ['DATABASE_URL', 'SESSION_SECRET'];
  const optional = ['OPENAI_API_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'];

  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing.join(', '));
    process.exit(1);
  }

  const missingOptional = optional.filter(key => !process.env[key]);
  if (missingOptional.length > 0) {
    console.warn('⚠️  Missing optional environment variables:', missingOptional.join(', '));
    console.warn('   Some features may not work properly.');
  }

  console.log('✅ Environment validation passed');
}

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
  // Validate environment variables first
  validateEnvironment();

  // Initialize database
  try {
    await initializeDatabase(db);
  } catch (err) {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  }

  const server = setupRoutes(app);

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

  // Use PORT environment variable for deployment compatibility
  // Fall back to 5000 for local development
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    console.log('\n🏥 Patient Prompt Generator Server');
    console.log('=====================================');
    console.log(`🚀 Server running on port ${port}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📊 Database: ${process.env.DATABASE_URL ? '✅ Connected' : '❌ Not configured'}`);
    console.log(`🤖 OpenAI: ${process.env.OPENAI_API_KEY ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`📱 Twilio: ${process.env.TWILIO_ACCOUNT_SID ? '✅ Configured' : '❌ Not configured'}`);
    console.log('=====================================\n');
    log(`serving on port ${port}`);
  });
})();