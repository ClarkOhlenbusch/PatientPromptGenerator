import { db } from "../db";
import { sql } from "drizzle-orm";

/**
 * Check database connection health
 * @returns Promise<{ connected: boolean, latency: number, error?: string }>
 */
export async function checkDatabaseConnection(): Promise<{ connected: boolean, latency: number, error?: string }> {
  const startTime = Date.now();
  try {
    // Execute a simple query to check connectivity
    await db.execute(sql`SELECT 1`);
    const latency = Date.now() - startTime;
    return { 
      connected: true, 
      latency 
    };
  } catch (error) {
    const latency = Date.now() - startTime;
    console.error("Database connection check failed:", error);
    return { 
      connected: false, 
      latency,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Execute a query with proper error handling and reconnection attempts
 * @param queryFn Function that executes the query
 * @param maxRetries Maximum number of retry attempts
 * @returns The result of the query
 */
export async function executeQueryWithRetry<T>(
  queryFn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let attempts = 0;
  let lastError: Error | null = null;

  while (attempts < maxRetries) {
    try {
      return await queryFn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`Database query failed (attempt ${attempts + 1}/${maxRetries}):`, lastError.message);

      // Check if this is a connection error that might be resolved by waiting
      const isConnectionError = 
        lastError.message.includes('Connection terminated') ||
        lastError.message.includes('Connection closed') ||
        lastError.message.includes('Connection reset') ||
        lastError.message.includes('ECONNRESET') ||
        lastError.message.includes('timeout');

      if (isConnectionError && attempts < maxRetries - 1) {
        // Exponential backoff: 2^attempts * 100ms
        const delay = Math.min(1000, Math.pow(2, attempts) * 100);
        console.log(`Retrying database query in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        attempts++;
      } else {
        // Either not a connection error or we've exhausted our attempts
        throw lastError;
      }
    }
  }

  // This should never be reached due to the throw in the catch block
  throw lastError || new Error('Failed to execute database query after multiple attempts');
}