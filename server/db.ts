import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle, NeonDatabase } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

// Configure Neon database with WebSocket support
neonConfig.webSocketConstructor = ws;

// Import initialization function

// Declare db with the specific NeonDatabase type
let db: NeonDatabase<typeof schema>;

try {
  // Get DATABASE_URL and throw error if missing
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL environment variable is not set. Production database connection is required.");
  }

  // Initialize the Neon Pool
  const pool = new Pool({ 
    connectionString: url,
    max: 10,
    idleTimeoutMillis: 30000
  });

  // Initialize Drizzle with the Neon pool and schema
  db = drizzle(pool, { schema });
  console.log("Neon database client initialized successfully");
  

} catch (err) {
  console.error("Failed to initialize database client:", err);
  // Re-throw the error to potentially halt application startup
  throw err;
}

// Export the initialized database client
export { db };