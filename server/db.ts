import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

// Configure Neon database with WebSocket support
neonConfig.webSocketConstructor = ws;

import Database from 'better-sqlite3';
import { drizzle as drizzleSQLite } from 'drizzle-orm/better-sqlite3';

// Function to validate and get database URL
function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  
  if (!url) {
    console.warn("DATABASE_URL not set, using SQLite fallback database");
    return "sqlite";
  }
  
  return url;
}

// Function to create database client
function createDatabaseClient() {
  const url = getDatabaseUrl();
  
  if (url === "sqlite") {
    const sqlite = new Database(':memory:');
    return drizzleSQLite(sqlite, { schema });
  }
  
  const pool = new Pool({ 
    connectionString: url,
    connect_timeout: 10,
    max: 10,
    idleTimeoutMillis: 30000
  });
  
  return drizzle(pool, { schema });
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