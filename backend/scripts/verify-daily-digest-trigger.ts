import { shouldSendDailyDigest } from '../src/lib/reminderJob.ts';

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

assert(!shouldSendDailyDigest({ newCount: 0, pendingCount: 0, overdueCount: 0 }), 'empty queue must not send');
assert(
  !shouldSendDailyDigest({ newCount: 0, pendingCount: 1, overdueCount: 0 }),
  'existing pending alone must not send'
);
assert(
  !shouldSendDailyDigest({ newCount: 0, pendingCount: 1, overdueCount: 1 }),
  'existing pending+overdue must not send (matches received email case)'
);
assert(
  !shouldSendDailyDigest({ newCount: 0, pendingCount: 0, overdueCount: 1 }),
  'existing overdue alone must not send'
);
assert(
  shouldSendDailyDigest({ newCount: 1, pendingCount: 1, overdueCount: 0 }),
  'new actionable item today must send'
);
assert(
  shouldSendDailyDigest({ newCount: 2, pendingCount: 5, overdueCount: 1 }),
  'new items today must send even if other pending/overdue exist'
);

console.log('daily digest trigger rules ok');
