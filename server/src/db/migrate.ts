import pg from 'pg';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const { Client, Pool } = pg;

const dbHost = process.env.DB_HOST || 'localhost';
const dbPort = parseInt(process.env.DB_PORT || '5432', 10);
const dbUser = process.env.DB_USER || 'postgres';
const dbPassword = process.env.DB_PASSWORD || '';
const targetDb = process.env.DB_NAME || 'supermarket_db';

async function ensureDatabaseExists() {
  console.log(`[DB SETUP] Checking if database "${targetDb}" exists on ${dbHost}:${dbPort}...`);
  
  const maintenanceClient = new Client({
    host: dbHost,
    port: dbPort,
    user: dbUser,
    password: dbPassword,
    database: 'postgres'
  });

  try {
    await maintenanceClient.connect();
    const res = await maintenanceClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [targetDb]
    );

    if (res.rowCount === 0) {
      console.log(`[DB SETUP] Database "${targetDb}" does not exist. Creating it now...`);
      // CREATE DATABASE cannot be executed inside a transaction block
      await maintenanceClient.query(`CREATE DATABASE "${targetDb}"`);
      console.log(`[DB SETUP] Database "${targetDb}" created successfully!`);
    } else {
      console.log(`[DB SETUP] Database "${targetDb}" already exists.`);
    }
  } catch (err: any) {
    console.error(`[DB SETUP] Error connecting to PostgreSQL:`, err.message);
    console.error(`[DB SETUP] Please make sure PostgreSQL is running and DB_PASSWORD in your .env file is correct.`);
    throw err;
  } finally {
    await maintenanceClient.end();
  }
}

async function runMigrationsAndSeeds() {
  await ensureDatabaseExists();

  const appPool = new Pool({
    host: dbHost,
    port: dbPort,
    user: dbUser,
    password: dbPassword,
    database: targetDb
  });

  const client = await appPool.connect();

  try {
    console.log(`[DB MIGRATION] Connected to "${targetDb}". Running schema migrations...`);
    
    // Read and run all migrations in sequence
    const migrationsDir = path.resolve(__dirname, 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    for (const file of migrationFiles) {
      console.log(`   - Applying migration: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await client.query(sql);
    }
    console.log(`[DB MIGRATION] All migrations applied successfully!`);

    // Read and run all seeds SQL in sequence
    console.log(`[DB SEED] Running seed data (roles, units, categories, products, store settings)...`);
    const seedsDir = path.resolve(__dirname, 'seeds');
    const seedFiles = fs.readdirSync(seedsDir).filter(f => f.endsWith('.sql')).sort();
    for (const file of seedFiles) {
      console.log(`   - Applying seed: ${file}`);
      const sql = fs.readFileSync(path.join(seedsDir, file), 'utf8');
      await client.query(sql);
    }

    // Create / seed default users with secure bcrypt hashes and viewable passwords for Super Admin
    console.log(`[DB SEED] Ensuring default Super Admin and System Admin users exist...`);
    const adminPasswordHash = await bcrypt.hash('Admin@123', 12);
    const cashierPasswordHash = await bcrypt.hash('Cashier@123', 12);

    // Super Admin user
    const superAdminRes = await client.query(
      `INSERT INTO users (username, email, password_hash, viewable_password, full_name, phone, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       ON CONFLICT (username) DO UPDATE
       SET full_name = EXCLUDED.full_name,
           email = EXCLUDED.email,
           viewable_password = EXCLUDED.viewable_password
       RETURNING id;`,
      ['admin', 'admin@supermarket.com', adminPasswordHash, 'Admin@123', 'Super Administrator', '+1 555-0100']
    );
    const superAdminId = superAdminRes.rows[0].id;

    await client.query(
      `INSERT INTO user_roles (user_id, role_id)
       VALUES ($1, 'SUPER_ADMIN')
       ON CONFLICT DO NOTHING;`,
      [superAdminId]
    );

    // System Admin / Cashier user
    const cashierRes = await client.query(
      `INSERT INTO users (username, email, password_hash, viewable_password, full_name, phone, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       ON CONFLICT (username) DO UPDATE
       SET full_name = EXCLUDED.full_name,
           email = EXCLUDED.email,
           viewable_password = EXCLUDED.viewable_password
       RETURNING id;`,
      ['cashier', 'cashier@supermarket.com', cashierPasswordHash, 'Cashier@123', 'Frontline Cashier', '+1 555-0101']
    );
    const cashierId = cashierRes.rows[0].id;

    await client.query(
      `INSERT INTO user_roles (user_id, role_id)
       VALUES ($1, 'SYSTEM_ADMIN')
       ON CONFLICT DO NOTHING;`,
      [cashierId]
    );

    console.log(`[DB SEED] Default Users Configured:`);
    console.log(`   - Super Admin : Username: 'admin'   (Role: SUPER_ADMIN)`);
    console.log(`   - System Admin: Username: 'cashier' (Role: SYSTEM_ADMIN)`);
    console.log(`   (Change development passwords after first login in Settings)`);
    console.log(`[DB SETUP COMPLETE] Database "${targetDb}" is ready for production use!`);

  } catch (err: any) {
    console.error(`[DB SETUP ERROR]:`, err);
    process.exit(1);
  } finally {
    client.release();
    await appPool.end();
  }
}

runMigrationsAndSeeds().catch(() => process.exit(1));
