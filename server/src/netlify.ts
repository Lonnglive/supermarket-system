import serverless from 'serverless-http';
import { app } from './app.js';

// Netlify Function entry point: serves the Express API without app.listen()
export const handler = serverless(app);

export { runDueDailyReports } from './services/scheduler.service.js';
