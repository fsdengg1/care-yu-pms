import { env } from '../config/env.js';
import { store } from '../store/db.js';
import {
  EmailChannel,
  EmailDispatchStatus,
  NotificationEmailPayload,
  NotificationHistoryEntry,
  NotificationItem,
  NotificationLifecycleStatus,
  User,
} from '../types.js';
import { sendEmail } from './email.js';
import { hoursFromNow } from './responsibility.js';

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function reminderDueAt(hours = env.reminderAfterHours) {
  return hoursFromNow(hours);
}

export function historyEntry(
  status: NotificationLifecycleStatus,
  reason: string,
  actor?: Pick<User, 'id' | 'name'> | null
): NotificationHistoryEntry {
  return {
    status,
    reason,
    actor_id: actor?.id,
    actor_name: actor?.name,
    created_at: new Date().toISOString(),
  };
}

export function deriveNotificationStatus(item: NotificationItem): NotificationLifecycleStatus {
  if (item.completed_at || item.notification_status === 'COMPLETED') return 'COMPLETED';
  if (item.overdue_at || item.notification_status === 'OVERDUE') return 'OVERDUE';
  if (item.viewed_at) return 'VIEWED';
  if (item.email_dispatch === 'MANUALLY_SENT') return 'MANUALLY_SENT';
  if (item.email_dispatch === 'AUTOMATICALLY_SENT') return 'AUTOMATICALLY_SENT';
  return item.notification_status || 'NOT_SENT';
}

export function patchNotification(
  id: string,
  patch: Partial<NotificationItem>
): NotificationItem | undefined {
  const notifications = store.getNotifications();
  const index = notifications.findIndex((item) => item.id === id);
  if (index === -1) return undefined;
  notifications[index] = { ...notifications[index], ...patch };
  store.saveNotifications(notifications);
  return notifications[index];
}

export function appendNotificationHistory(
  item: NotificationItem,
  status: NotificationLifecycleStatus,
  reason: string,
  actor?: Pick<User, 'id' | 'name'> | null
): NotificationItem {
  const next: NotificationItem = {
    ...item,
    notification_status: status,
    notification_history: [...(item.notification_history || []), historyEntry(status, reason, actor)],
  };
  return patchNotification(item.id, next) || next;
}

export function canManuallySendEmail(user: User, item: NotificationItem) {
  if (item.email_channel === 'CLIENT') return false;
  if (item.email_dispatch === 'MANUALLY_SENT' || item.email_dispatch === 'AUTOMATICALLY_SENT') return false;
  if (item.email_status === 'SENT') return false;
  if (item.completed_at) return false;
  if (user.role_code === 'SYSTEM_ADMIN') return true;
  return Boolean(item.sender_id && item.sender_id === user.id);
}

export function notificationsForEntity(entityType: string, entityId: string) {
  return store
    .getNotifications()
    .filter((item) => item.entity_type === entityType && item.entity_id === entityId)
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
}

export function pendingInternalEmails(entityType: string, entityId: string) {
  return notificationsForEntity(entityType, entityId).filter(
    (item) =>
      (item.email_channel || 'INTERNAL') === 'INTERNAL' &&
      item.email_policy === 'DEFERRED' &&
      item.email_dispatch !== 'MANUALLY_SENT' &&
      item.email_dispatch !== 'AUTOMATICALLY_SENT' &&
      item.email_status !== 'SENT' &&
      !item.completed_at
  );
}

function payloadFromNotification(item: NotificationItem): NotificationEmailPayload | undefined {
  if (item.email_payload?.html && item.email_payload.subject) return item.email_payload;
  if (!item.title) return undefined;
  return {
    subject: item.title,
    html: `<p>${item.message}</p>`,
    text: item.message,
    type: item.email_payload?.type || item.type,
  };
}

export async function dispatchNotificationEmail(params: {
  notification: NotificationItem;
  mode: 'MANUAL' | 'AUTOMATIC';
  actor?: User;
}): Promise<{ notification: NotificationItem; error?: string }> {
  const item = store.getNotifications().find((row) => row.id === params.notification.id) || params.notification;
  if (params.mode === 'AUTOMATIC' && !env.pendingEmailNotificationsEnabled) {
    console.info('[EMAIL_NOTIFICATION] Disabled by configuration');
    return { notification: item, error: 'disabled' };
  }
  const alreadyDispatched =
    item.email_status === 'SENT' ||
    item.email_dispatch === 'MANUALLY_SENT' ||
    item.email_dispatch === 'AUTOMATICALLY_SENT';
  if (alreadyDispatched || (params.mode === 'AUTOMATIC' && item.email_status === 'PENDING')) {
    return { notification: item, error: 'already_sent' };
  }
  const recipient = store.findUserById(item.recipient_id);
  if (!recipient?.email) {
    return { notification: item, error: 'recipient_missing' };
  }
  const payload = payloadFromNotification(item);
  if (!payload) {
    return { notification: item, error: 'missing_payload' };
  }

  const dispatch: EmailDispatchStatus = params.mode === 'MANUAL' ? 'MANUALLY_SENT' : 'AUTOMATICALLY_SENT';
  const now = new Date().toISOString();
  const result = await sendEmail({
    toEmail: recipient.email,
    toName: recipient.name,
    toUserId: recipient.id,
    subject: payload.subject,
    htmlContent: payload.html,
    text: payload.text,
    emailChannel: item.email_channel || 'INTERNAL',
    emailType: payload.type,
    notificationId: item.id,
  });

  const status = result.status === 'FAILED' ? 'FAILED' : result.status === 'QUEUED' ? 'PENDING' : 'SENT';
  const deliveries = store.getNotificationDeliveries();
  deliveries.unshift({
    id: newId('ndel'),
    notification_id: item.id,
    event_key: item.event_key || item.id,
    recipient_user_id: recipient.id,
    recipient_email: recipient.email,
    subject: payload.subject,
    email_type: payload.type,
    status: status === 'PENDING' ? 'PENDING' : status === 'FAILED' ? 'FAILED' : 'SENT',
    transaction_id: result.transactionId,
    sent_at: status === 'SENT' ? now : undefined,
    failure_reason: status === 'FAILED' ? result.reason : undefined,
    retry_count: 0,
    created_at: now,
    updated_at: now,
    email_channel: item.email_channel || 'INTERNAL',
    dispatch_mode: params.mode,
  });
  store.saveNotificationDeliveries(deliveries);

  const lifecycle: NotificationLifecycleStatus =
    status === 'SENT' || status === 'PENDING' ? dispatch : item.notification_status || 'NOT_SENT';
  const reason =
    params.mode === 'MANUAL'
      ? `${params.actor?.name || 'A user'} sent this internal PMS notification manually.`
      : `Automatic reminder sent because the assigned person had not viewed or acted within ${env.reminderAfterHours} hours.`;

  const updated = appendNotificationHistory(
    {
      ...item,
      email_status: status === 'PENDING' ? 'PENDING' : status === 'FAILED' ? 'FAILED' : 'SENT',
      email_sent_at: status === 'SENT' ? now : item.email_sent_at,
      email_dispatch: status === 'FAILED' ? 'FAILED' : dispatch,
    },
    status === 'FAILED' ? 'NOT_SENT' : lifecycle,
    status === 'FAILED' ? result.reason || 'Email delivery failed.' : reason,
    params.actor
  );

  return { notification: updated };
}

export function markNotificationsViewed(entityType: string, entityId: string, userId: string) {
  const now = new Date().toISOString();
  let changed = 0;
  for (const item of notificationsForEntity(entityType, entityId)) {
    if (item.recipient_id !== userId) continue;
    if (item.completed_at) continue;
    const alreadyViewed = Boolean(item.viewed_at);
    const alreadyRead = Boolean(item.read_status);
    if (alreadyViewed && alreadyRead) continue;
    if (alreadyViewed && !alreadyRead) {
      patchNotification(item.id, { read_status: true, read_at: item.read_at || now });
      changed += 1;
      continue;
    }
    appendNotificationHistory(
      {
        ...item,
        viewed_at: now,
        acted_at: item.acted_at || now,
        read_status: true,
        read_at: now,
      },
      'VIEWED',
      'Assigned person opened this item in the PMS dashboard.'
    );
    changed += 1;
  }
  return changed;
}

export function markNotificationsCompleted(entityType: string, entityId: string) {
  const now = new Date().toISOString();
  let changed = 0;
  for (const item of notificationsForEntity(entityType, entityId)) {
    if (item.completed_at) continue;
    if ((item.email_channel || 'INTERNAL') !== 'INTERNAL') continue;
    appendNotificationHistory(
      { ...item, completed_at: now, acted_at: now, reminder_due_at: undefined },
      'COMPLETED',
      'The assigned person completed this stage or task.'
    );
    changed += 1;
  }
  return changed;
}

export function markNotificationsOverdue(entityType: string, entityId: string) {
  const now = new Date().toISOString();
  let changed = 0;
  for (const item of notificationsForEntity(entityType, entityId)) {
    if (item.completed_at || item.overdue_at) continue;
    if ((item.email_channel || 'INTERNAL') !== 'INTERNAL') continue;
    appendNotificationHistory(
      { ...item, overdue_at: now },
      'OVERDUE',
      'This item passed its due date without completion.'
    );
    changed += 1;
  }
  return changed;
}

export function markAllNotificationsRead(userId: string) {
  const now = new Date().toISOString();
  const notifications = store.getNotifications();
  let changed = 0;
  const next = notifications.map((item) => {
    if (item.recipient_id !== userId || item.read_status) return item;
    changed += 1;
    return {
      ...item,
      read_status: true,
      read_at: now,
      viewed_at: item.viewed_at || now,
    };
  });
  if (changed) store.saveNotifications(next);
  return changed;
}

export function recipientHasViewed(entityType: string, entityId: string, recipientId: string) {
  return notificationsForEntity(entityType, entityId).some(
    (item) => item.recipient_id === recipientId && Boolean(item.viewed_at || item.read_status || item.completed_at)
  );
}

export function latestDeferredForRecipient(entityType: string, entityId: string, recipientId: string) {
  return notificationsForEntity(entityType, entityId).find(
    (item) =>
      item.recipient_id === recipientId &&
      item.email_policy === 'DEFERRED' &&
      (item.email_channel || 'INTERNAL') === 'INTERNAL'
  );
}

export function publicNotificationView(item: NotificationItem, actor?: User) {
  const recipient = store.findUserById(item.recipient_id);
  const sender = item.sender_id ? store.findUserById(item.sender_id) : undefined;
  return {
    ...item,
    notification_status: deriveNotificationStatus(item),
    recipient_name: recipient?.name,
    recipient_email: recipient?.email,
    sender_name: sender?.name,
    can_send_email: actor ? canManuallySendEmail(actor, item) : false,
  };
}

export function isInternalWorkflowNotification(item: NotificationItem) {
  return (item.email_channel || 'INTERNAL') === 'INTERNAL';
}

export function isClientNotification(item: NotificationItem) {
  return item.email_channel === 'CLIENT' || item.type.startsWith('CLIENT_');
}

export type { EmailChannel };
