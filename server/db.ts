import pkg from 'pg';
const { Pool } = pkg;
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

// Function to create database client
function createDatabaseClient() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || "postgres://postgres:clarkee1@localhost:5432/caretaker_prompt",
    ssl: false,
    max: 10,
    idleTimeoutMillis: 30000
  });

  return drizzle(pool, { schema });
}

// Import initialization function
import { initializeDatabase } from './lib/initDb';

// Create database client
let db;
try {
  db = createDatabaseClient();
  console.log("Database client initialized successfully");
  
  // Initialize database tables
  initializeDatabase().then(() => {
    console.log("Database tables initialized successfully");
  }).catch(err => {
    console.error("Failed to initialize database tables:", err);
  });
} catch (err) {
  console.error("Failed to initialize database client:", err);
  throw err;
}

// Export the database client
export { db };