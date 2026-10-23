import { app } from './app.js';
import { testConnection } from './config/db.js';
import { initDailyReportScheduler } from './services/scheduler.service.js';

const PORT = process.env.PORT || 5000;

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
