import { env } from '../config/env.js';
import { flushStore, replaceCollectionsFromPostgres, store } from '../store/db.js';
import { User } from '../types.js';
import {
  COMPANY_LEAVE_MESSAGE,
  isCompanyLeaveDay,
  persistDailyStatusSnapshot,
  renderDailyStatusEmailHtml,
  rowsForEmailReport,
  SnapshotPeriod,
  DAILY_WORK_SYNC_COLLECTIONS,
} from './dailyStatus.js';
import { sendEmail } from './email.js';
import { newId } from './leadWorkflow.js';
import { formatEmployeeDisplayName } from './people.js';

export type EmailReportSlot = 'noon' | 'evening';

export type EmailReportHistoryStatus = 'Sent' | 'Failed' | 'Pending';

export interface EmailReportScheduleConfig {
  fromEmail: string;
  fromName: string;
  toEmail: string;
  cc: string;
  bcc: string;
  subject: string;
  contentTemplate: string;
  sendAtNoon: boolean;
  sendAtEvening: boolean;
  timezone: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface EmailReportHistoryEntry {
  id: string;
  date: string;
  time: string;
  slot: EmailReportSlot;
  fromEmail: string;
  toEmail: string;
  subject: string;
  status: EmailReportHistoryStatus;
  error?: string;
  transactionId?: string;
  createdAt: string;
  updatedAt: string;
  source: 'schedule' | 'test' | 'manual';
}

const CONFIG_ID = 'email-report-schedule-config';
const HISTORY_PREFIX = 'email-report-run:';

const SLOT_META: Record<
  EmailReportSlot,
  { timeLabel: string; cronHint: string; period: SnapshotPeriod; reportLabel: string }
> = {
  noon: {
    timeLabel: '11:00 AM',
    cronHint: '0 11 * * *',
    period: 'morning',
    reportLabel: '11:00 AM Daily Report',
  },
  evening: {
    timeLabel: '7:15 PM',
    cronHint: '15 19 * * *',
    period: 'evening',
    reportLabel: '7:15 PM Daily Report',
  },
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase());
}

function parseAddressList(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[,;]+/)
        .map((part) => part.trim().toLowerCase())
        .filter((part) => isValidEmail(part))
    ),
  ];
}

export function defaultEmailReportScheduleConfig(): EmailReportScheduleConfig {
  return {
    fromEmail: 'aicareyuautomation@gmail.com',
    fromName: 'CareYu Automation',
    toEmail: 'engg.director@careyu.ai, robotlead1@careyu.ai',
    cc: 'ceo@careyu.ai, cto@careyu.ai, robottech@careyu.ai, fsdengg1@careyu.ai, fsdlead1@careyu.ai, projects@careyu.ai',
    bcc: '',
    subject: 'Daily Work Report',
    contentTemplate: '',
    sendAtNoon: true,
    sendAtEvening: true,
    timezone: env.appTimezone || 'Asia/Kolkata',
  };
}

export function getEmailReportScheduleConfig(): EmailReportScheduleConfig {
  const record = store.getSystemMeta().find((item) => item.id === CONFIG_ID);
  const payload = (record?.payload || {}) as Partial<EmailReportScheduleConfig>;
  const defaults = defaultEmailReportScheduleConfig();
  return {
    fromEmail: String(payload.fromEmail ?? '').trim() || defaults.fromEmail,
    fromName: String(payload.fromName ?? '').trim() || defaults.fromName,
    toEmail: String(payload.toEmail ?? '').trim() || defaults.toEmail,
    cc: String(payload.cc ?? '').trim() || defaults.cc,
    bcc: String(payload.bcc ?? '').trim(),
    subject: String(payload.subject ?? '').trim() || defaults.subject,
    contentTemplate: String(payload.contentTemplate ?? defaults.contentTemplate),
    sendAtNoon: payload.sendAtNoon !== false,
    sendAtEvening: payload.sendAtEvening !== false,
    timezone: String(payload.timezone || defaults.timezone).trim() || defaults.timezone,
    updatedAt: payload.updatedAt,
    updatedBy: payload.updatedBy,
  };
}

export function saveEmailReportScheduleConfig(
  input: Partial<EmailReportScheduleConfig>,
  actor?: User
): { config: EmailReportScheduleConfig; error?: string } {
  const current = getEmailReportScheduleConfig();
  const next: EmailReportScheduleConfig = {
    fromEmail: String(input.fromEmail ?? current.fromEmail).trim().toLowerCase(),
    fromName: String(input.fromName ?? current.fromName).trim(),
    toEmail: String(input.toEmail ?? current.toEmail)
      .split(/[,;]+/)
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean)
      .join(', '),
    cc: String(input.cc ?? current.cc)
      .split(/[,;]+/)
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean)
      .join(', '),
    bcc: String(input.bcc ?? current.bcc)
      .split(/[,;]+/)
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean)
      .join(', '),
    subject: String(input.subject ?? current.subject).trim() || 'Daily Work Report',
    contentTemplate: String(input.contentTemplate ?? current.contentTemplate),
    sendAtNoon: Boolean(input.sendAtNoon ?? current.sendAtNoon),
    sendAtEvening: Boolean(input.sendAtEvening ?? current.sendAtEvening),
    timezone: String(input.timezone ?? current.timezone ?? env.appTimezone).trim() || 'Asia/Kolkata',
    updatedAt: new Date().toISOString(),
    updatedBy: actor?.id,
  };

  if (next.fromEmail && !isValidEmail(next.fromEmail)) {
    return { config: current, error: 'From Email is invalid.' };
  }
  const toList = parseAddressList(next.toEmail);
  if (next.toEmail && toList.length === 0) {
    return { config: current, error: 'To Email is invalid.' };
  }
  for (const email of toList) {
    if (!isValidEmail(email)) return { config: current, error: 'To Email contains an invalid address.' };
  }
  for (const email of parseAddressList(next.cc)) {
    if (!isValidEmail(email)) return { config: current, error: 'CC contains an invalid email.' };
  }
  for (const email of parseAddressList(next.bcc)) {
    if (!isValidEmail(email)) return { config: current, error: 'BCC contains an invalid email.' };
  }

  const records = store.getSystemMeta().filter((item) => item.id !== CONFIG_ID);
  records.push({
    id: CONFIG_ID,
    payloadType: 'EMAIL_REPORT_SCHEDULE',
    payload: next,
  });
  store.saveSystemMeta(records);
  return { config: next };
}

export function dateInTimezone(timezone = env.appTimezone, when = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(when);
  } catch {
    return when.toISOString().slice(0, 10);
  }
}

function historyId(date: string, slot: EmailReportSlot) {
  return `${HISTORY_PREFIX}${date}:${slot}`;
}

function readHistoryEntry(id: string): EmailReportHistoryEntry | null {
  const record = store.getSystemMeta().find((item) => item.id === id);
  if (!record?.payload || record.payloadType !== 'EMAIL_REPORT_HISTORY') return null;
  return record.payload as EmailReportHistoryEntry;
}

function writeHistoryEntry(entry: EmailReportHistoryEntry) {
  const records = store.getSystemMeta().filter((item) => item.id !== entry.id);
  records.push({
    id: entry.id,
    payloadType: 'EMAIL_REPORT_HISTORY',
    payload: entry,
  });
  store.saveSystemMeta(records);
}

export function listEmailReportHistory(limit = 60): EmailReportHistoryEntry[] {
  return store
    .getSystemMeta()
    .filter((item) => item.payloadType === 'EMAIL_REPORT_HISTORY' && item.id.startsWith(HISTORY_PREFIX))
    .map((item) => item.payload as EmailReportHistoryEntry)
    .filter(Boolean)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.time.localeCompare(a.time))
    .slice(0, limit);
}

function resolveScheduleActor(preferred?: User): User | undefined {
  if (preferred && ['CEO', 'ENG_DIRECTOR', 'PROJECT_MANAGER', 'SYSTEM_ADMIN'].includes(preferred.role_code)) {
    return preferred;
  }
  const users = store.getUsers().filter((user) => user.status === 'ACTIVE');
  for (const role of ['PROJECT_MANAGER', 'ENG_DIRECTOR', 'CEO', 'SYSTEM_ADMIN'] as const) {
    const found = users.find((user) => user.role_code === role);
    if (found) return found;
  }
  return preferred || users[0];
}

function applyContentTemplate(html: string, template: string, reportLabel: string): string {
  const trimmed = template.trim();
  if (!trimmed) return html;
  if (trimmed.includes('{{report}}') || trimmed.includes('{{REPORT}}')) {
    return trimmed.replace(/\{\{\s*report\s*\}\}/gi, html);
  }
  return `<div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:16px 0;color:#0f172a;">
    <div style="margin-bottom:12px;white-space:pre-wrap;">${trimmed
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\{\{\s*label\s*\}\}/gi, reportLabel)}</div>
    ${html}
  </div>`;
}

function buildSubject(config: EmailReportScheduleConfig, reportLabel: string, date: string): string {
  const base = (config.subject || 'Daily Work Report').trim();
  if (/\{label\}|\{reportTitle\}/i.test(base)) {
    return base.replace(/\{label\}/gi, reportLabel).replace(/\{reportTitle\}/gi, reportLabel);
  }
  return `${base} — ${reportLabel} (${date})`;
}

export async function sendConfiguredEmailReport(params: {
  slot: EmailReportSlot;
  source: 'schedule' | 'test' | 'manual';
  actor?: User;
  force?: boolean;
  date?: string;
}): Promise<{
  ok: boolean;
  skipped?: boolean;
  entry: EmailReportHistoryEntry;
  message: string;
  html?: string;
  subject?: string;
}> {
  const config = getEmailReportScheduleConfig();
  const meta = SLOT_META[params.slot];
  const timezone = config.timezone || env.appTimezone;
  const date = params.date || dateInTimezone(timezone);
  const id =
    params.source === 'schedule' ? historyId(date, params.slot) : `${HISTORY_PREFIX}adhoc:${newId('run')}`;
  const existing = params.source === 'schedule' ? readHistoryEntry(id) : null;

  if (isCompanyLeaveDay(date) && params.source === 'schedule' && !params.force) {
    return {
      ok: true,
      skipped: true,
      entry:
        existing ||
        ({
          id,
          date,
          time: meta.timeLabel,
          slot: params.slot,
          fromEmail: config.fromEmail,
          toEmail: config.toEmail,
          subject: config.subject,
          status: 'Pending',
          error: COMPANY_LEAVE_MESSAGE,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          source: params.source,
        } satisfies EmailReportHistoryEntry),
      message: COMPANY_LEAVE_MESSAGE,
    };
  }

  if (params.source === 'schedule' && !params.force && existing) {
    if (existing.status === 'Sent') {
      return {
        ok: true,
        skipped: true,
        entry: existing,
        message: `Already sent for ${meta.timeLabel} on ${date}.`,
      };
    }
    if (existing.status === 'Pending') {
      const ageMs = Date.now() - Date.parse(existing.updatedAt || existing.createdAt);
      if (Number.isFinite(ageMs) && ageMs < 10 * 60 * 1000) {
        return {
          ok: false,
          skipped: true,
          entry: existing,
          message: `Send already in progress for ${meta.timeLabel} on ${date}.`,
        };
      }
    }
  }

  if (params.source === 'schedule') {
    if (params.slot === 'noon' && !config.sendAtNoon) {
      return {
        ok: false,
        skipped: true,
        entry:
          existing ||
          ({
            id,
            date,
            time: meta.timeLabel,
            slot: params.slot,
            fromEmail: config.fromEmail,
            toEmail: config.toEmail,
            subject: config.subject,
            status: 'Failed',
            error: 'Noon schedule disabled',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            source: params.source,
          } satisfies EmailReportHistoryEntry),
        message: '11:00 AM schedule is disabled.',
      };
    }
    if (params.slot === 'evening' && !config.sendAtEvening) {
      return {
        ok: false,
        skipped: true,
        entry:
          existing ||
          ({
            id,
            date,
            time: meta.timeLabel,
            slot: params.slot,
            fromEmail: config.fromEmail,
            toEmail: config.toEmail,
            subject: config.subject,
            status: 'Failed',
            error: 'Evening schedule disabled',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            source: params.source,
          } satisfies EmailReportHistoryEntry),
        message: '7:15 PM schedule is disabled.',
      };
    }
  }

  const configuredFrom = config.fromEmail.trim().toLowerCase();
  const verifiedFrom = (env.emailFrom || '').trim().toLowerCase();
  // Elastic Email only accepts verified senders; fall back to env From when UI value is not allowed.
  const fromEmail =
    configuredFrom && configuredFrom === verifiedFrom
      ? configuredFrom
      : verifiedFrom || configuredFrom;
  const toList = parseAddressList(config.toEmail);
  const toEmail = toList[0] || '';
  const extraTo = toList.slice(1);
  if (!fromEmail || !isValidEmail(fromEmail)) {
    const entry: EmailReportHistoryEntry = {
      id,
      date,
      time: meta.timeLabel,
      slot: params.slot,
      fromEmail: configuredFrom,
      toEmail: config.toEmail,
      subject: config.subject,
      status: 'Failed',
      error: 'From Email is not configured. Set a verified Elastic Email sender in ELASTIC_EMAIL_FROM_EMAIL.',
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: params.source,
    };
    if (params.source === 'schedule') writeHistoryEntry(entry);
    return { ok: false, entry, message: entry.error! };
  }
  if (configuredFrom && configuredFrom !== fromEmail) {
    console.warn(
      `[email-report] From "${configuredFrom}" is not the verified sender; using "${fromEmail}" instead.`
    );
  }
  if (!toEmail || !isValidEmail(toEmail)) {
    const entry: EmailReportHistoryEntry = {
      id,
      date,
      time: meta.timeLabel,
      slot: params.slot,
      fromEmail,
      toEmail: config.toEmail,
      subject: config.subject,
      status: 'Failed',
      error: 'To Email is not configured.',
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: params.source,
    };
    if (params.source === 'schedule') writeHistoryEntry(entry);
    return { ok: false, entry, message: entry.error! };
  }

  const actor = resolveScheduleActor(params.actor);
  if (!actor) {
    const entry: EmailReportHistoryEntry = {
      id,
      date,
      time: meta.timeLabel,
      slot: params.slot,
      fromEmail,
      toEmail,
      subject: config.subject,
      status: 'Failed',
      error: 'No active user available to build the report.',
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: params.source,
    };
    writeHistoryEntry(entry);
    return { ok: false, entry, message: entry.error! };
  }

  const pending: EmailReportHistoryEntry = {
    id,
    date,
    time: meta.timeLabel,
    slot: params.slot,
    fromEmail,
    toEmail: toList.join(', '),
    subject: config.subject,
    status: 'Pending',
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: params.source,
  };
  writeHistoryEntry(pending);

  await replaceCollectionsFromPostgres([...DAILY_WORK_SYNC_COLLECTIONS]);
  const packed = rowsForEmailReport(actor, meta.period, date, { preferLive: true });
  persistDailyStatusSnapshot(date, meta.period, packed.rows, actor.id, {
    force: true,
  });
  await flushStore();
  const rendered = renderDailyStatusEmailHtml({
    period: meta.period,
    date,
    rows: packed.rows,
    recipientName: formatEmployeeDisplayName(actor),
    reportLabel: meta.reportLabel,
    subjectOverride: buildSubject(config, meta.reportLabel, date),
  });
  const html = applyContentTemplate(rendered.html, config.contentTemplate, meta.reportLabel);
  const subject = rendered.subject;

  const result = await sendEmail({
    toEmail,
    toName: toEmail,
    toUserId: store.findUserByEmail(toEmail)?.id,
    toEmails: extraTo,
    fromEmail,
    fromName: config.fromName || undefined,
    ccEmails: parseAddressList(config.cc),
    bccEmails: parseAddressList(config.bcc),
    subject,
    htmlContent: html,
    text: rendered.text,
    emailChannel: 'INTERNAL',
    emailType: params.source === 'test' ? 'DAILY_STATUS_REPORT_TEST' : 'DAILY_STATUS_REPORT_SCHEDULED',
  });

  const emails = store.getOutboundEmails();
  if (emails[0] && (emails[0].email_type === 'DAILY_STATUS_REPORT_SCHEDULED' || emails[0].email_type === 'DAILY_STATUS_REPORT_TEST')) {
    store.saveOutboundEmails([
      {
        ...emails[0],
        body: JSON.stringify({ date, period: meta.period, html, rows: packed.rows, slot: params.slot }),
      },
      ...emails.slice(1),
    ]);
  }

  const entry: EmailReportHistoryEntry = {
    ...pending,
    subject,
    status: result.status === 'SENT' ? 'Sent' : 'Failed',
    error: result.status === 'SENT' ? undefined : result.reason || 'Unable to send email report.',
    transactionId: result.transactionId,
    updatedAt: new Date().toISOString(),
  };
  writeHistoryEntry(entry);

  if (result.status === 'SENT') {
    console.info(`[email-report] ${meta.reportLabel} sent to ${toList.join(', ')} (${date})`);
    return {
      ok: true,
      entry,
      message: params.source === 'test' ? 'Test email sent.' : 'Email report sent.',
      html,
      subject,
    };
  }

  console.error(`[email-report] ${meta.reportLabel} failed:`, entry.error);
  return {
    ok: false,
    entry,
    message: entry.error || 'Unable to send email report.',
    html,
    subject,
  };
}

export function slotMeta(slot: EmailReportSlot) {
  return SLOT_META[slot];
}
