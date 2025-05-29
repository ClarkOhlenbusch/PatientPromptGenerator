import { Express, Request, Response } from "express";
import { checkDatabaseConnection } from "../lib/dbHealth";

export function registerHealthRoutes(app: Express): void {
  // API Health Check endpoint (deliberately unauthenticated for monitoring tools)
  app.get("/api/health", async (req: Request, res: Response) => {
    try {
      // Check database connection
      const dbStatus = await checkDatabaseConnection();

      // Check if OpenAI API key is configured
      const openaiConfigured = Boolean(process.env.OPENAI_API_KEY);

      // Check if Twilio is configured
      const twilioConfigured = Boolean(
        process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_PHONE_NUMBER
      );

      // Return health status
      return res.status(200).json({
        success: true,
        data: {
          status: 'ok',
          database: dbStatus,
          services: {
            openai: {
              configured: openaiConfigured,
              status: openaiConfigured ? 'configured' : 'missing'
            },
            twilio: {
              configured: twilioConfigured,
              status: twilioConfigured ? 'configured' : 'missing'
            }
          },
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV || 'development'
        }
      });
    } catch (error) {
      console.error('Health check failed:', error);
      return res.status(500).json({
        success: false,
        data: null,
        error: 'Health check failed: ' + (error instanceof Error ? error.message : String(error))
      });
    }
  });
}
