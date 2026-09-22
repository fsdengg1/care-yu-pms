import {
  PENDING_REMINDER_GRACE_MS,
  classifyReminderDue,
  pendingEmailClaimKey,
} from '../src/lib/pendingEmailPolicy.ts';

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

const now = Date.parse('2026-09-22T08:00:00.000Z');

assert(classifyReminderDue(undefined, now) === 'not_scheduled', 'missing schedule must not send');
assert(classifyReminderDue('', now) === 'not_scheduled', 'blank schedule must not send');
assert(classifyReminderDue('not-a-date', now) === 'not_scheduled', 'invalid schedule must not send');
assert(
  classifyReminderDue(new Date(now + 60_000).toISOString(), now) === 'waiting',
  'future reminder must wait'
);
assert(
  classifyReminderDue(new Date(now - 30 * 60_000).toISOString(), now) === 'due',
  'reminder inside the grace window is due'
);
assert(
  classifyReminderDue(new Date(now - PENDING_REMINDER_GRACE_MS - 60_000).toISOString(), now) === 'stale',
  'historical pending reminder must not send'
);

const key = pendingEmailClaimKey({
  userId: 'user-1',
  taskId: 'task-9',
  notificationType: 'TASK_PENDING',
  notificationDate: '2026-09-22',
});
assert(key === 'user-1|task-9|TASK_PENDING|2026-09-22', 'claim identity is user + task + type + date');
assert(
  key ===
    pendingEmailClaimKey({
      userId: 'user-1',
      taskId: 'task-9',
      notificationType: 'TASK_PENDING',
      notificationDate: '2026-09-22',
    }),
  'same identity must stay stable'
);

console.log('pending email policy ok');
