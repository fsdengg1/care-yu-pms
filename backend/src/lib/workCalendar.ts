import { env } from '../config/env.js';

export const MORNING_LOCK_HOUR = 11;

export const DELAY_REASON_OPTIONS = [
  'Customer dependency',
  'Internal dependency',
  'Development issue',
  'Testing issue',
  'Waiting for approval',
  'Waiting for customer input',
  'Resource issue',
  'Technical issue',
  'Other',
] as const;

export type DelayReasonOption = (typeof DELAY_REASON_OPTIONS)[number];

export function appTimezone(timezone?: string) {
  return timezone || env.appTimezone || 'Asia/Kolkata';
}

export function clockInAppTimezone(when = new Date(), timezone = appTimezone()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(when);
  const read = (type: string) => parts.find((part) => part.type === type)?.value || '';
  const date = `${read('year')}-${read('month')}-${read('day')}`;
  const hour = Number(read('hour')) || 0;
  const minute = Number(read('minute')) || 0;
  return { date, hour, minute, timezone };
}

export function dateInAppTimezone(when = new Date(), timezone = appTimezone()) {
  return clockInAppTimezone(when, timezone).date;
}

export function addDaysYmd(ymd: string, days: number) {
  const [y, m, d] = ymd.split('-').map(Number);
  const utc = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

export function enumerateDates(from: string, to: string): string[] {
  if (!from || !to || from > to) return [];
  const dates: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    dates.push(cursor);
    cursor = addDaysYmd(cursor, 1);
  }
  return dates;
}

export function isWeekendYmd(ymd: string) {
  const day = new Date(`${ymd}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

export function isMorningPhaseLocked(workDate: string, when = new Date(), timezone = appTimezone()) {
  const clock = clockInAppTimezone(when, timezone);
  if (workDate < clock.date) return true;
  if (workDate > clock.date) return false;
  return clock.hour >= MORNING_LOCK_HOUR;
}

export function isEveningPhaseOpen(workDate: string, when = new Date(), timezone = appTimezone()) {
  const clock = clockInAppTimezone(when, timezone);
  if (workDate < clock.date) return true;
  if (workDate > clock.date) return false;
  return clock.hour >= MORNING_LOCK_HOUR;
}

/** Working days strictly after `dueDate` through `asOf`, excluding weekends and provided non-working dates. */
export function delayWorkingDays(dueDate: string | undefined, asOf: string, nonWorking = new Set<string>()) {
  if (!dueDate || dueDate >= asOf) return 0;
  let count = 0;
  for (const day of enumerateDates(addDaysYmd(dueDate, 1), asOf)) {
    if (isWeekendYmd(day) || nonWorking.has(day)) continue;
    count += 1;
  }
  return count;
}

export function isOverdueOnDate(
  dueDate: string | undefined,
  status: string | undefined,
  asOf: string,
  nonWorking = new Set<string>()
) {
  const value = (status || '').toUpperCase();
  if (!dueDate) return false;
  if (value === 'DONE' || value === 'COMPLETED') return false;
  return delayWorkingDays(dueDate, asOf, nonWorking) > 0;
}

export function normalizeDelayReason(value?: string, otherText?: string) {
  const raw = String(value || '').trim();
  if (!raw || raw === '—' || /^no delay$/i.test(raw)) return '';
  if (raw === 'Other' || /^other:/i.test(raw)) {
    const detail = otherText?.trim() || raw.replace(/^other:\s*/i, '').trim();
    return detail ? `Other: ${detail}` : '';
  }
  return raw;
}

export function delayReasonRequired(existingReason: string | undefined, overdue: boolean, completed: boolean) {
  if (completed || !overdue) return false;
  return !normalizeDelayReason(existingReason);
}
