import { runDueDailyReports } from '../../server/src/netlify.js';

// Replaces the in-process node-cron job: checks every 15 minutes whether a
// configured daily report time has been reached and sends the report.
export default async () => {
  try {
    const sent = await runDueDailyReports();
    if (sent) {
      console.log('[SCHEDULER] Daily Sales Report email dispatched.');
    }
  } catch (err: any) {
    console.error('[SCHEDULER ERROR] Failed to send scheduled daily report email:', err.message);
  }
};

export const config = {
  schedule: '*/15 * * * *'
};
