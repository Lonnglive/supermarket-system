import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { testConnection } from './config/db.js';
import apiRoutes from './routes/api.routes.js';
import { initDailyReportScheduler } from './services/scheduler.service.js';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = express();
const PORT = process.env.PORT || 5000;

// Security & Request Parsing Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging (sanitized, no secrets)
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV !== 'test') {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  }
  next();
});

// API Routes
app.use('/api', apiRoutes);

// Health check endpoint
app.get('/api/health', async (_req: Request, res: Response) => {
  const dbHealth = await testConnection();
  res.json({
    status: 'ONLINE',
    system: 'AeroPOS Supermarket Management System',
    timestamp: new Date().toISOString(),
    database: dbHealth
  });
});

// Global Centralized Error Handler (Never expose raw stack trace)
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[UNHANDLED ERROR]:', err);
  const status = err.status || 500;
  const message = err.message || 'An unexpected server error occurred. Please contact the administrator.';
  res.status(status).json({
    error: 'Internal Server Error',
    message
  });
});

// Start Server
async function startServer() {
  console.log('===============================================================');
  console.log('  AEROPOS SUPERMARKET MANAGEMENT SYSTEM - PRODUCTION SERVER    ');
  console.log('===============================================================');
  
  // Test DB connection
  const dbStatus = await testConnection();
  if (dbStatus.success) {
    console.log(`[DB STATUS] ${dbStatus.message}`);
  } else {
    console.warn(`[DB WARNING] ${dbStatus.message}`);
    console.warn(`[DB WARNING] Please ensure PostgreSQL is running and .env credentials are set.`);
  }

  // Initialize daily sales email scheduler
  await initDailyReportScheduler();

  app.listen(PORT, () => {
    console.log(`[SERVER READY] Listening on http://localhost:${PORT}`);
    console.log(`[API ROOT] Available at http://localhost:${PORT}/api`);
    console.log('===============================================================');
  });
}

startServer();
