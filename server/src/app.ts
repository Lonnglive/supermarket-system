import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { testConnection, isDbConnectionError, DB_UNAVAILABLE_MESSAGE } from './config/db.js';
import apiRoutes from './routes/api.routes.js';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const app = express();

// When served from a Netlify Function, requests may arrive prefixed with the
// function path; map them back onto the /api routes.
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (req.url.startsWith('/.netlify/functions/api')) {
    req.url = '/api' + req.url.slice('/.netlify/functions/api'.length);
  }
  next();
});

// Replace raw database connection errors with a friendly message for the UI
app.use((_req: Request, res: Response, next: NextFunction) => {
  const json = res.json.bind(res);
  res.json = (body: any) => {
    if (body && typeof body.message === 'string' && isDbConnectionError(body.message)) {
      console.error('[DB CONNECTION ERROR]:', body.message);
      res.status(503);
      return json({ ...body, error: 'Service Unavailable', message: DB_UNAVAILABLE_MESSAGE });
    }
    return json(body);
  };
  next();
});

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

export default app;
