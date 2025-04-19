import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";
import Database from 'better-sqlite3';
import { drizzle as drizzleSQLite } from 'drizzle-orm/better-sqlite3';

// Configure Neon database with WebSocket support
neonConfig.webSocketConstructor = ws;

// Function to create database client
function createDatabaseClient() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    console.warn("DATABASE_URL not set, using SQLite fallback database");
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

// Create database client
let db;
try {
  db = createDatabaseClient();
  console.log("Database client initialized successfully");
} catch (err) {
  console.error("Failed to initialize database client:", err);
  throw err;
}

// Export the database client
export { db };