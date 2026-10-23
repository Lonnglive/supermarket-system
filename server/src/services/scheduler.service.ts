import cron from 'node-cron';
import { getEmailSettings, sendDailySalesReport } from './email.service.js';

let activeCronTasks: cron.ScheduledTask[] = [];

export async function initDailyReportScheduler() {
  try {
    const settings = await getEmailSettings();
    if (!settings.daily_report_enabled) {
      console.log('[SCHEDULER] Daily Sales Report email is disabled in settings.');
      return;
    }

    activeCronTasks.forEach(task => task.stop());
    activeCronTasks = [];

    const configuredTimes = (settings.daily_report_time || '21:00')
      .split(',')
      .map((time: string) => time.trim())
      .filter(Boolean);

    if (configuredTimes.length === 0) {
      console.log('[SCHEDULER] No daily report times configured.');
      return;
    }

    configuredTimes.forEach((timeValue: string) => {
      const [hour, minute] = timeValue.split(':');
      const cronExp = `${minute || 0} ${hour || 21} * * *`;

      const task = cron.schedule(cronExp, async () => {
        console.log(`[SCHEDULER] Triggering scheduled Daily Sales Report at ${new Date().toISOString()}...`);
        try {
          await sendDailySalesReport();
          console.log('[SCHEDULER] Daily Sales Report email successfully dispatched to configured profile recipients.');
        } catch (err: any) {
          console.error('[SCHEDULER ERROR] Failed to send scheduled daily report email:', err.message);
        }
      });

      activeCronTasks.push(task);
      console.log(`[SCHEDULER] Automated Daily Sales Email scheduled for ${timeValue} daily (Cron: ${cronExp}).`);
    });
  } catch (err: any) {
    console.error('[SCHEDULER INITIALIZATION ERROR]:', err.message);
  }
}

export function restartDailyReportScheduler() {
  initDailyReportScheduler();
}
