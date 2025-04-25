
import { db } from '../db';
import { users, patientBatches, patientPrompts } from '@shared/schema';
import { sql } from 'drizzle-orm';
import { scrypt, randomBytes } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

/**
 * Hash a password for secure storage
 */
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString('hex')}.${salt}`;
}

/**
 * Initialize database tables and add a test user if needed
 */
export async function initializeDatabase() {
  try {
    console.log('Database client initialized successfully');
    
    // Create users table first
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create patient_batches table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS patient_batches (
        id SERIAL PRIMARY KEY,
        batch_id TEXT NOT NULL UNIQUE,
        total_patients INTEGER DEFAULT 0,
        processed_patients INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create patient_prompts table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS patient_prompts (
        id SERIAL PRIMARY KEY,
        batch_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        name TEXT NOT NULL,
        age TEXT,
        condition TEXT,
        is_alert TEXT DEFAULT 'false',
        health_status TEXT DEFAULT 'alert',
        prompt TEXT,
        reasoning TEXT,
        raw_data TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create system_prompts table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS system_prompts (
        id SERIAL PRIMARY KEY,
        batch_id TEXT,
        prompt TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create template_variables table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS template_variables (
        id SERIAL PRIMARY KEY,
        batch_id TEXT,
        placeholder TEXT NOT NULL,
        description TEXT NOT NULL,
        example TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT
      );
    `);

    // Create system_settings table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS system_settings (
        id SERIAL PRIMARY KEY,
        key TEXT NOT NULL UNIQUE,
        value TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Check if sessions table exists, if not create it
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL,
        CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
      );
    `);
    
    // Check if any users exist, if not create test user
    const userCheck = await db.execute(sql`SELECT COUNT(*) FROM users`);
    const userCount = parseInt(userCheck.rows[0].count);
    console.log(`${userCount} users exist in the database`);
    
    if (userCount === 0) {
      // Create a default admin user: CalicoCare/CalicoCare
      const hashedPassword = await hashPassword('CalicoCare');
      await db.execute(sql`
        INSERT INTO users (username, password) 
        VALUES ('CalicoCare', ${hashedPassword})
      `);
      console.log('Created default admin user: CalicoCare');
    }
    
    // Check that tables were created properly
    const tableCheck = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    console.log('Available tables:', tableCheck.rows.map(row => row.table_name).join(', '));

    console.log('Database tables initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}
