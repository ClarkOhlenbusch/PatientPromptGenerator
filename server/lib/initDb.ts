
import { db } from '../db';
import { users, patientBatches, patientPrompts } from '@shared/schema';
import { sql } from 'drizzle-orm';

export async function initializeDatabase() {
  try {
    // Create users table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL
      );
    `);

    // Create patient_batches table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS patient_batches (
        id SERIAL PRIMARY KEY,
        batch_id TEXT NOT NULL UNIQUE,
        file_name TEXT NOT NULL DEFAULT 'unknown',
        created_at TEXT NOT NULL,
        total_patients INTEGER DEFAULT 0,
        processed_patients INTEGER DEFAULT 0,
        user_id INTEGER DEFAULT -1
      );
    `);

    // Create patient_prompts table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS patient_prompts (
        id SERIAL PRIMARY KEY,
        batch_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        name TEXT NOT NULL,
        age INTEGER NOT NULL,
        condition TEXT NOT NULL,
        is_alert TEXT DEFAULT 'false',
        health_status TEXT DEFAULT 'alert',
        prompt TEXT NOT NULL,
        raw_data JSONB,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT
      );
    `);

    console.log('Database tables initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}
