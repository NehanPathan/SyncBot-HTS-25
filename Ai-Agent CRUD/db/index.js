import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
export const db = drizzle (process.env.DATABASE_URL);

import pkg from 'pg';

const { Pool } = pkg;

// Database connection
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,  // ❌ No SSL for Docker PostgreSQL
});
