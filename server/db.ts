import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

// Configure Neon database with WebSocket support
neonConfig.webSocketConstructor = ws;

// Function to validate and get database URL
function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  
  if (!url) {
    console.error("DATABASE_URL environment variable is not set");
    
    // For development mode, use a fallback connection string that will still allow the app to start
    // but database functions won't work
    if (process.env.NODE_ENV === 'development') {
      console.warn("Using fallback database connection for development. Database operations will fail.");
      return "postgresql://postgres:postgres@localhost:5432/postgres";
    }
    
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }
  
  return url;
}

// Create a safe connection pool
let pool: Pool;
try {
  pool = new Pool({ 
    connectionString: getDatabaseUrl(),
    // Add connection timeout for improved resilience
    connect_timeout: 10,
    // Add connection pool settings
    max: 10, // maximum number of clients
    idleTimeoutMillis: 30000
  });
  
  // Test the connection
  pool.query('SELECT NOW()').then(() => {
    console.log("Database connection established successfully");
  }).catch(err => {
    console.error("Database connection test failed:", err.message);
  });
} catch (err) {
  console.error("Failed to initialize database pool:", err);
  throw err;
}

// Export pool and drizzle instance
export { pool };
export const db = drizzle({ client: pool, schema });