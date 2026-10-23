import pg from 'pg';
import { getDatabase } from '@netlify/database';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from server root or project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const { Pool } = pg;

export const DB_UNAVAILABLE_MESSAGE =
  'The store database is temporarily unavailable. Please try again in a moment or contact the administrator.';

// Detects low-level connection failures so they are never shown raw to users
export function isDbConnectionError(message: string = ''): boolean {
  return /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|Connection terminated|connect timeout|not been configured to use Netlify Database|database is temporarily unavailable/i.test(message);
}

export const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'supermarket_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  connectionString: process.env.DATABASE_URL
};

// Main application pool.
// Local installs use DATABASE_URL / DB_* from .env. When deployed on Netlify
// the managed Netlify Database is always used, never a localhost fallback.
export const isNetlifyRuntime = Boolean(
  process.env.NETLIFY || process.env.NETLIFY_DB_URL || process.env.AWS_LAMBDA_FUNCTION_NAME
);

function createPool(): pg.Pool {
  if (isNetlifyRuntime || (!dbConfig.connectionString && !process.env.DB_HOST)) {
    try {
      return getDatabase().pool as unknown as pg.Pool;
    } catch (err: any) {
      if (isNetlifyRuntime) {
        console.error('[DB ERROR] Netlify Database is not connected:', err.message);
        // Pool that fails fast with a clear message instead of dialing localhost
        return {
          query: () => Promise.reject(new Error(DB_UNAVAILABLE_MESSAGE)),
          connect: () => Promise.reject(new Error(DB_UNAVAILABLE_MESSAGE)),
          end: () => Promise.resolve(),
          on: () => undefined
        } as unknown as pg.Pool;
      }
      // No Netlify Database available, fall back to local defaults below
    }
  }

  return new Pool(
    dbConfig.connectionString
      ? { connectionString: dbConfig.connectionString }
      : {
          host: dbConfig.host,
          port: dbConfig.port,
          database: dbConfig.database,
          user: dbConfig.user,
          password: dbConfig.password,
          max: 20,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        }
  );
}

export const pool = createPool();

// Health check / connection test
export async function testConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const client = await pool.connect();
    const res = await client.query('SELECT current_database(), current_user, version()');
    client.release();
    return {
      success: true,
      message: `Connected successfully to ${res.rows[0].current_database} as ${res.rows[0].current_user}`
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Failed to connect to PostgreSQL'
    };
  }
}

export default pool;
