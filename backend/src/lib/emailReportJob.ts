import { env } from '../config/env.js';
import {
  getEmailReportScheduleConfig,
  saveEmailReportScheduleConfig,
  sendConfiguredEmailReport,
} from './emailReportSchedule.js';

let started = false;

async function runSlot(slot: 'noon' | 'evening') {
  try {
    const result = await sendConfiguredEmailReport({ slot, source: 'schedule' });
    if (result.skipped) {
      console.info(`[email-report-scheduler] ${slot} skipped: ${result.message}`);
      return;
    }
    if (!result.ok) {
      console.error(`[email-report-scheduler] ${slot} failed: ${result.message}`);
      return;
    }
    console.info(`[email-report-scheduler] ${slot} ok: ${result.message}`);
  } catch (error) {
    console.error(`[email-report-scheduler] ${slot} crashed`, error);
  }
}

function ensureDefaultScheduleConfig() {
  // Official CareYu Daily Work Updates distribution (From / To / CC).
  const current = getEmailReportScheduleConfig();
  const saved = saveEmailReportScheduleConfig({
    fromEmail: 'aicareyuautomation@gmail.com',
    fromName: 'CareYu Automation',
    toEmail: 'engg.director@careyu.ai, robotlead1@careyu.ai',
    cc: 'ceo@careyu.ai, cto@careyu.ai, robottech@careyu.ai, fsdengg1@careyu.ai, fsdlead1@careyu.ai, projects@careyu.ai',
    bcc: current.bcc || '',
    subject: current.subject || 'Daily Work Report',
    contentTemplate: current.contentTemplate || '',
    sendAtNoon: current.sendAtNoon !== false,
    sendAtEvening: current.sendAtEvening !== false,
    timezone: current.timezone || env.appTimezone || 'Asia/Kolkata',
  });
  if (!saved.error) {
    console.info(
      `[email-report-scheduler] distribution set from=${saved.config.fromEmail} to=${saved.config.toEmail}`
    );
  }
}

export async function startEmailReportScheduler() {
  if (started || !env.schedulerEnabled) return;
  if (process.env.CF_PAGES || process.env.CLOUDFLARE_WORKER || process.env.WORKER_ENV) return;
  started = true;
  const timezone = env.appTimezone || 'Asia/Kolkata';
  ensureDefaultScheduleConfig();

  try {
    const cron = (await import('node-cron')).default;
    cron.schedule(
      '15 11 * * *',
      () => {
        void runSlot('noon');
      },
      { timezone }
    );

    cron.schedule(
      '15 19 * * *',
      () => {
        void runSlot('evening');
      },
      { timezone }
    );

    console.log(
      `[scheduler] email report jobs started (11:15 and 19:15, timezone=${timezone})`
    );
  } catch (error) {
    console.warn('[scheduler] node-cron not loaded:', error instanceof Error ? error.message : error);
  }
}
