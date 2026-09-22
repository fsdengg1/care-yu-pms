import { env } from '../config/env.js';
import { store } from '../store/db.js';
import { Lead, Task, User } from '../types.js';
import { hoursFromNow, leadNeedsReminder, reportingManagerOf, taskNeedsReminder } from './responsibility.js';
import { notificationService } from './notificationService.js';
import {
  dispatchNotificationEmail,
  latestDeferredForRecipient,
  markNotificationsOverdue,
  recipientHasViewed,
} from './smartNotifications.js';
import { claimPendingEmailSend, completePendingEmailClaim } from './pendingEmailClaim.js';
import { classifyReminderDue, notificationDateKey } from './pendingEmailPolicy.js';

let started = false;

type ReminderTick = 'ignored' | 'stale' | 'sent' | 'already_sent' | 'duplicate';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function saveLead(lead: Lead) {
  const leads = store.getLeads();
  const index = leads.findIndex((item) => item.id === lead.id);
  if (index === -1) return;
  leads[index] = lead;
  store.saveLeads(leads);
}

function saveTask(task: Task) {
  const tasks = store.getTasks();
  const index = tasks.findIndex((item) => item.id === task.id);
  if (index === -1) return;
  tasks[index] = task;
  store.saveTasks(tasks);
}

function emailAlreadyRecorded(deferred: { email_dispatch?: string; email_status?: string } | undefined) {
  return Boolean(
    deferred &&
      (deferred.email_dispatch === 'MANUALLY_SENT' ||
        deferred.email_dispatch === 'AUTOMATICALLY_SENT' ||
        deferred.email_status === 'SENT' ||
        deferred.email_status === 'PENDING')
  );
}

async function deliverOnce(
  userId: string,
  taskId: string,
  notificationType: string,
  send: () => Promise<'sent' | 'already_sent' | 'failed'>
): Promise<ReminderTick> {
  const claim = {
    userId,
    taskId,
    notificationType,
    notificationDate: notificationDateKey(),
  };
  const slot = await claimPendingEmailSend(claim);
  if (slot === 'duplicate') return 'duplicate';
  try {
    const result = await send();
    await completePendingEmailClaim(claim, result === 'failed' ? 'FAILED' : 'SENT');
    return result === 'sent' ? 'sent' : 'already_sent';
  } catch (error) {
    await completePendingEmailClaim(claim, 'FAILED').catch(() => undefined);
    throw error;
  }
}

async function processLeadReminder(lead: Lead): Promise<ReminderTick> {
  if (!leadNeedsReminder(lead) || !lead.responsible_user_id) return 'ignored';
  const due = classifyReminderDue(lead.next_reminder_at);
  if (due === 'not_scheduled' || due === 'waiting') return 'ignored';
  if (due === 'stale') return 'stale';

  const owner = store.findUserById(lead.responsible_user_id);
  if (!owner) return 'ignored';

  const today = todayKey();
  if (lead.due_date && lead.due_date < today) {
    markNotificationsOverdue('LEAD', lead.id);
  }

  const viewed = recipientHasViewed('LEAD', lead.id, owner.id) || Boolean(lead.last_action_at);
  const deferred = latestDeferredForRecipient('LEAD', lead.id, owner.id);
  const emailAlreadySent = emailAlreadyRecorded(deferred);

  const count = lead.reminder_count || 0;
  if (count < env.maxReminders) {
    const nextCount = count + 1;
    let tick: ReminderTick = 'already_sent';
    if (deferred && !emailAlreadySent && !viewed && !deferred.completed_at) {
      tick = await deliverOnce(owner.id, lead.id, 'LEAD_PENDING', async () => {
        const dispatched = await dispatchNotificationEmail({ notification: deferred, mode: 'AUTOMATIC' });
        if (dispatched.error === 'already_sent' || dispatched.error === 'disabled') return 'already_sent';
        if (dispatched.error) return 'failed';
        return 'sent';
      });
    } else if (emailAlreadySent && !lead.last_action_at) {
      tick = await deliverOnce(owner.id, lead.id, 'LEAD_PENDING', async () => {
        const notified = await notificationService.notifyReminder({
          entityType: 'LEAD',
          entityId: lead.id,
          entityName: lead.title,
          recipientUserId: owner.id,
          stage: lead.pipeline_stage || lead.status,
          assignedOn: lead.assigned_at,
          status: lead.status,
          reminderCount: nextCount,
        });
        return notified.skipped ? 'already_sent' : 'sent';
      });
    }
    if (tick === 'sent') {
      saveLead({
        ...lead,
        reminder_count: nextCount,
        last_reminder_at: new Date().toISOString(),
        next_reminder_at: nextCount >= env.maxReminders ? undefined : hoursFromNow(env.reminderAfterHours),
      });
    }
    return tick;
  }

  if (lead.escalated_at || count < env.escalationAfterReminders) return 'already_sent';
  const manager = reportingManagerOf(owner);
  if (!manager || manager.id === owner.id) return 'already_sent';
  const tick = await deliverOnce(manager.id, lead.id, 'LEAD_ESCALATION', async () => {
    const notified = await notificationService.notifyEscalation({
      entityType: 'LEAD',
      entityId: lead.id,
      entityName: lead.title,
      recipientUserId: manager.id,
      employeeName: owner.name,
      assignedOn: lead.assigned_at,
      stage: lead.pipeline_stage || lead.status,
      reminderCount: count,
    });
    return notified.skipped ? 'already_sent' : 'sent';
  });
  if (tick === 'sent') {
    saveLead({
      ...lead,
      escalated_at: new Date().toISOString(),
      escalated_to_user_id: manager.id,
      next_reminder_at: undefined,
    });
  }
  return tick;
}

async function processTaskReminder(task: Task): Promise<ReminderTick> {
  if (!taskNeedsReminder(task)) return 'ignored';
  const ownerId = task.responsible_user_id || task.assigned_to_id;
  if (!ownerId) return 'ignored';
  const due = classifyReminderDue(task.next_reminder_at);
  if (due === 'not_scheduled' || due === 'waiting') return 'ignored';
  if (due === 'stale') return 'stale';

  const owner = store.findUserById(ownerId);
  if (!owner) return 'ignored';

  const today = todayKey();
  if (task.due_date && task.due_date < today) {
    markNotificationsOverdue('TASK', task.id);
  }

  const viewed = recipientHasViewed('TASK', task.id, owner.id) || Boolean(task.last_action_at);
  const deferred = latestDeferredForRecipient('TASK', task.id, owner.id);
  const emailAlreadySent = emailAlreadyRecorded(deferred);

  const count = task.reminder_count || 0;
  if (count < env.maxReminders) {
    const nextCount = count + 1;
    let tick: ReminderTick = 'already_sent';
    if (deferred && !emailAlreadySent && !viewed && !deferred.completed_at) {
      tick = await deliverOnce(owner.id, task.id, 'TASK_PENDING', async () => {
        const dispatched = await dispatchNotificationEmail({ notification: deferred, mode: 'AUTOMATIC' });
        if (dispatched.error === 'already_sent' || dispatched.error === 'disabled') return 'already_sent';
        if (dispatched.error) return 'failed';
        return 'sent';
      });
    } else if (emailAlreadySent && task.status !== 'DONE') {
      tick = await deliverOnce(owner.id, task.id, 'TASK_PENDING', async () => {
        const notified = await notificationService.notifyReminder({
          entityType: 'TASK',
          entityId: task.id,
          entityName: task.title,
          recipientUserId: owner.id,
          stage: task.status,
          assignedOn: task.created_at,
          status: task.status,
          reminderCount: nextCount,
        });
        return notified.skipped ? 'already_sent' : 'sent';
      });
    }
    if (tick === 'sent') {
      saveTask({
        ...task,
        reminder_count: nextCount,
        last_reminder_at: new Date().toISOString(),
        next_reminder_at: nextCount >= env.maxReminders ? undefined : hoursFromNow(env.reminderAfterHours),
      });
    }
    return tick;
  }

  if (task.escalated_at || count < env.escalationAfterReminders) return 'already_sent';
  const manager = reportingManagerOf(owner);
  if (!manager || manager.id === owner.id) return 'already_sent';
  const tick = await deliverOnce(manager.id, task.id, 'TASK_ESCALATION', async () => {
    const notified = await notificationService.notifyEscalation({
      entityType: 'TASK',
      entityId: task.id,
      entityName: task.title,
      recipientUserId: manager.id,
      employeeName: owner.name,
      assignedOn: task.created_at,
      stage: task.status,
      reminderCount: count,
    });
    return notified.skipped ? 'already_sent' : 'sent';
  });
  if (tick === 'sent') {
    saveTask({
      ...task,
      escalated_at: new Date().toISOString(),
      escalated_to_user_id: manager.id,
      next_reminder_at: undefined,
    });
  }
  return tick;
}

function tally(tick: ReminderTick, counts: { found: number; already: number; sending: number; duplicate: number; stale: number }) {
  if (tick === 'ignored') return;
  if (tick === 'stale') {
    counts.stale += 1;
    return;
  }
  counts.found += 1;
  if (tick === 'sent') counts.sending += 1;
  else if (tick === 'duplicate') counts.duplicate += 1;
  else counts.already += 1;
}

export async function runPendingReminders() {
  if (!env.pendingEmailNotificationsEnabled) {
    console.info('[EMAIL_NOTIFICATION] Disabled by configuration');
    return;
  }

  console.info('[EMAIL_NOTIFICATION] Scheduler started');
  const counts = { found: 0, already: 0, sending: 0, duplicate: 0, stale: 0 };
  for (const lead of store.getLeads()) {
    try {
      tally(await processLeadReminder(lead), counts);
    } catch (error) {
      console.error('[scheduler] lead reminder failed', lead.id, error);
    }
  }
  for (const task of store.getTasks()) {
    try {
      tally(await processTaskReminder(task), counts);
    } catch (error) {
      console.error('[scheduler] task reminder failed', task.id, error);
    }
  }
  console.info(`[EMAIL_NOTIFICATION] Pending notifications found: ${counts.found}`);
  console.info(`[EMAIL_NOTIFICATION] Already sent: ${counts.already}`);
  console.info(`[EMAIL_NOTIFICATION] Sending: ${counts.sending}`);
  console.info(`[EMAIL_NOTIFICATION] Skipped duplicate: ${counts.duplicate}`);
  if (counts.stale) {
    console.info(`[EMAIL_NOTIFICATION] Skipped historical pending (not due): ${counts.stale}`);
  }
}

function pendingCountsFor(user: User) {
  const leads = store.getLeads().filter(
    (lead) => lead.responsible_user_id === user.id && leadNeedsReminder(lead)
  );
  const tasks = store.getTasks().filter((task) => {
    const ownerId = task.responsible_user_id || task.assigned_to_id;
    return ownerId === user.id && taskNeedsReminder(task);
  });
  const today = todayKey();
  const newCount = [...leads, ...tasks].filter(
    (item) =>
      (item as Lead).assigned_at?.slice(0, 10) === today || item.created_at.slice(0, 10) === today
  ).length;
  const overdue = [
    ...leads.filter((lead) => lead.expected_decision_date && lead.expected_decision_date < today),
    ...tasks.filter((task) => task.due_date && task.due_date < today),
  ].length;
  return { newCount, pendingCount: leads.length + tasks.length, overdueCount: overdue };
}

/**
 * Daily Work Summary is only for newly assigned/created actionable work today.
 * Existing pending/overdue queues are handled by runPendingReminders (15m) with
 * reminder_count / next_reminder_at — not by re-mailing the digest every morning.
 */
export function shouldSendDailyDigest(counts: {
  newCount: number;
  pendingCount: number;
  overdueCount: number;
}): boolean {
  return counts.newCount > 0;
}

export async function runDailyDigests() {
  if (!env.dailyDigestEnabled) return;
  const dayKey = todayKey();
  for (const user of store.getUsers().filter((item) => item.status === 'ACTIVE')) {
    const counts = pendingCountsFor(user);
    if (!shouldSendDailyDigest(counts)) continue;
    try {
      await notificationService.notifyDigest({
        recipientUserId: user.id,
        dayKey,
        ...counts,
      });
    } catch (error) {
      console.error('[scheduler] digest failed', user.id, error);
    }
  }
}

export async function startNotificationScheduler() {
  if (started || !env.schedulerEnabled) return;
  started = true;
  try {
    const cron = (await import('node-cron')).default;
    cron.schedule('*/15 * * * *', () => {
      void runPendingReminders();
    });
    cron.schedule('0 8 * * *', () => {
      void runDailyDigests();
    });
    const pending = env.pendingEmailNotificationsEnabled ? 'enabled' : 'disabled';
    console.log(
      `[scheduler] notification jobs started (reminder every 15m is ${pending}, digest 08:00, after ${env.reminderAfterHours}h, max ${env.maxReminders})`
    );
    if (!env.pendingEmailNotificationsEnabled) {
      console.info('[EMAIL_NOTIFICATION] Disabled by configuration');
    }
  } catch (error) {
    console.warn('[scheduler] node-cron not loaded:', error instanceof Error ? error.message : error);
  }
}
