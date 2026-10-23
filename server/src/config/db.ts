import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from server root or project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const { Pool } = pg;

export const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'supermarket_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  connectionString: process.env.DATABASE_URL
};

// Main application pool
export const pool = new Pool(
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
