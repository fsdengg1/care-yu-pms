import { env } from '../config/env.js';

/** How long after next_reminder_at a pending item is still considered due. Older items are historical and are not emailed. */
export const PENDING_REMINDER_GRACE_MS = 2 * 60 * 60 * 1000;

export type ReminderDueState = 'not_scheduled' | 'waiting' | 'due' | 'stale';

export function notificationDateKey(now = new Date(), timeZone = env.appTimezone): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** Unique identity: userId + taskId + notificationType + notificationDate */
export function pendingEmailClaimKey(parts: {
  userId: string;
  taskId: string;
  notificationType: string;
  notificationDate: string;
}): string {
  return [parts.userId, parts.taskId, parts.notificationType, parts.notificationDate].join('|');
}

/**
 * Pending status alone is not enough. A reminder email is due only when
 * next_reminder_at is set, has arrived, and is still inside the grace window.
 */
export function classifyReminderDue(nextReminderAt?: string, now = Date.now()): ReminderDueState {
  if (!nextReminderAt) return 'not_scheduled';
  const dueAt = Date.parse(nextReminderAt);
  if (!Number.isFinite(dueAt)) return 'not_scheduled';
  if (dueAt > now) return 'waiting';
  if (now - dueAt > PENDING_REMINDER_GRACE_MS) return 'stale';
  return 'due';
}
