import cron from 'node-cron';
import { getEmailSettings, sendDailySalesReport } from './email.service.js';

let activeCronTasks: cron.ScheduledTask[] = [];
// In-process cron only runs for the long-lived local server. Serverless
// deployments use a scheduled function that calls runDueDailyReports instead.
let inProcessSchedulerEnabled = false;

export async function initDailyReportScheduler() {
  inProcessSchedulerEnabled = true;
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
  if (inProcessSchedulerEnabled) {
    initDailyReportScheduler();
  }
}

// Sends the daily report if a configured report time falls within the last
// `windowMinutes`. Times are interpreted in STORE_TIMEZONE (default Asia/Kolkata).
export async function runDueDailyReports(now = new Date(), windowMinutes = 15) {
  const settings = await getEmailSettings();
  if (!settings.daily_report_enabled) {
    return false;
  }

  const timeZone = process.env.STORE_TIMEZONE || 'Asia/Kolkata';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now);
  const hour = Number(parts.find(p => p.type === 'hour')?.value || 0);
  const minute = Number(parts.find(p => p.type === 'minute')?.value || 0);
  const nowMinutes = hour * 60 + minute;

  const isDue = (settings.daily_report_time || '21:00')
    .split(',')
    .map((time: string) => time.trim())
    .filter(Boolean)
    .some((timeValue: string) => {
      const [h, m] = timeValue.split(':');
      const target = Number(h || 21) * 60 + Number(m || 0);
      const elapsed = (nowMinutes - target + 1440) % 1440;
      return elapsed < windowMinutes;
    });

  if (!isDue) {
    return false;
  }

  console.log(`[SCHEDULER] Triggering scheduled Daily Sales Report at ${now.toISOString()}...`);
  await sendDailySalesReport();
  return true;
}
