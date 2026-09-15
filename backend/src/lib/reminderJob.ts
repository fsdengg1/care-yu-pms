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

let started = false;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function isDue(iso?: string) {
  if (!iso) return true;
  return Date.parse(iso) <= Date.now();
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

async function processLeadReminder(lead: Lead) {
  if (!leadNeedsReminder(lead) || !lead.responsible_user_id) return;
  if (!isDue(lead.next_reminder_at)) return;

  const owner = store.findUserById(lead.responsible_user_id);
  if (!owner) return;

  const today = todayKey();
  if (lead.due_date && lead.due_date < today) {
    markNotificationsOverdue('LEAD', lead.id);
  }

  const viewed = recipientHasViewed('LEAD', lead.id, owner.id) || Boolean(lead.last_action_at);
  const deferred = latestDeferredForRecipient('LEAD', lead.id, owner.id);
  const emailAlreadySent =
    deferred &&
    (deferred.email_dispatch === 'MANUALLY_SENT' || deferred.email_dispatch === 'AUTOMATICALLY_SENT' || deferred.email_status === 'SENT');

  const count = lead.reminder_count || 0;
  if (count < env.maxReminders) {
    const nextCount = count + 1;
    if (deferred && !emailAlreadySent && !viewed && !deferred.completed_at) {
      await dispatchNotificationEmail({ notification: deferred, mode: 'AUTOMATIC' });
    } else if (emailAlreadySent && !lead.last_action_at) {
      await notificationService.notifyReminder({
        entityType: 'LEAD',
        entityId: lead.id,
        entityName: lead.title,
        recipientUserId: owner.id,
        stage: lead.pipeline_stage || lead.status,
        assignedOn: lead.assigned_at,
        status: lead.status,
        reminderCount: nextCount,
      });
    }
    saveLead({
      ...lead,
      reminder_count: nextCount,
      last_reminder_at: new Date().toISOString(),
      next_reminder_at: nextCount >= env.maxReminders ? undefined : hoursFromNow(env.reminderAfterHours),
    });
    return;
  }

  if (lead.escalated_at || count < env.escalationAfterReminders) return;
  const manager = reportingManagerOf(owner);
  if (!manager || manager.id === owner.id) return;
  await notificationService.notifyEscalation({
    entityType: 'LEAD',
    entityId: lead.id,
    entityName: lead.title,
    recipientUserId: manager.id,
    employeeName: owner.name,
    assignedOn: lead.assigned_at,
    stage: lead.pipeline_stage || lead.status,
    reminderCount: count,
  });
  saveLead({
    ...lead,
    escalated_at: new Date().toISOString(),
    escalated_to_user_id: manager.id,
    next_reminder_at: undefined,
  });
}

async function processTaskReminder(task: Task) {
  if (!taskNeedsReminder(task)) return;
  const ownerId = task.responsible_user_id || task.assigned_to_id;
  if (!ownerId || !isDue(task.next_reminder_at)) return;
  const owner = store.findUserById(ownerId);
  if (!owner) return;

  const today = todayKey();
  if (task.due_date && task.due_date < today) {
    markNotificationsOverdue('TASK', task.id);
  }

  const viewed = recipientHasViewed('TASK', task.id, owner.id) || Boolean(task.last_action_at);
  const deferred = latestDeferredForRecipient('TASK', task.id, owner.id);
  const emailAlreadySent =
    deferred &&
    (deferred.email_dispatch === 'MANUALLY_SENT' || deferred.email_dispatch === 'AUTOMATICALLY_SENT' || deferred.email_status === 'SENT');

  const count = task.reminder_count || 0;
  if (count < env.maxReminders) {
    const nextCount = count + 1;
    if (deferred && !emailAlreadySent && !viewed && !deferred.completed_at) {
      await dispatchNotificationEmail({ notification: deferred, mode: 'AUTOMATIC' });
    } else if (emailAlreadySent && task.status !== 'DONE') {
      await notificationService.notifyReminder({
        entityType: 'TASK',
        entityId: task.id,
        entityName: task.title,
        recipientUserId: owner.id,
        stage: task.status,
        assignedOn: task.created_at,
        status: task.status,
        reminderCount: nextCount,
      });
    }
    saveTask({
      ...task,
      reminder_count: nextCount,
      last_reminder_at: new Date().toISOString(),
      next_reminder_at: nextCount >= env.maxReminders ? undefined : hoursFromNow(env.reminderAfterHours),
    });
    return;
  }

  if (task.escalated_at || count < env.escalationAfterReminders) return;
  const manager = reportingManagerOf(owner);
  if (!manager || manager.id === owner.id) return;
  await notificationService.notifyEscalation({
    entityType: 'TASK',
    entityId: task.id,
    entityName: task.title,
    recipientUserId: manager.id,
    employeeName: owner.name,
    assignedOn: task.created_at,
    stage: task.status,
    reminderCount: count,
  });
  saveTask({
    ...task,
    escalated_at: new Date().toISOString(),
    escalated_to_user_id: manager.id,
    next_reminder_at: undefined,
  });
}

export async function runPendingReminders() {
  for (const lead of store.getLeads()) {
    try {
      await processLeadReminder(lead);
    } catch (error) {
      console.error('[scheduler] lead reminder failed', lead.id, error);
    }
  }
  for (const task of store.getTasks()) {
    try {
      await processTaskReminder(task);
    } catch (error) {
      console.error('[scheduler] task reminder failed', task.id, error);
    }
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
    console.log(
      `[scheduler] notification jobs started (reminder every 15m, digest 08:00, after ${env.reminderAfterHours}h, max ${env.maxReminders})`
    );
  } catch (error) {
    console.warn('[scheduler] node-cron not loaded:', error instanceof Error ? error.message : error);
  }
}
