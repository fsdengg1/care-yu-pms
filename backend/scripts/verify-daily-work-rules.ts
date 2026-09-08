import {
  delayReasonRequired,
  delayWorkingDays,
  isOverdueOnDate,
  normalizeDelayReason,
  addDaysYmd,
} from '../src/lib/workCalendar.ts';

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

const leave = new Set(['2026-09-09']);
assert(delayWorkingDays('2026-09-08', '2026-09-09', leave) === 0, 'leave day is not employee delay');
assert(delayWorkingDays('2026-09-08', '2026-09-10', leave) === 1, 'next working day still counts');
assert(!isOverdueOnDate('2026-09-10', 'IN_PROGRESS', '2026-09-10'), 'not overdue on deadline day');
assert(isOverdueOnDate('2026-09-08', 'IN_PROGRESS', '2026-09-09'), 'overdue without leave');
assert(!isOverdueOnDate('2026-09-08', 'DONE', '2026-09-09'), 'completed not overdue');
assert(!delayReasonRequired('Customer dependency', true, false), 'existing reason not requested again');
assert(delayReasonRequired('', true, false), 'missing reason required when overdue');
assert(!delayReasonRequired('', true, true), 'completed does not need delay reason');
assert(normalizeDelayReason('Other', 'Vendor delay') === 'Other: Vendor delay', 'other reason format');
assert(addDaysYmd('2026-09-08', 1) === '2026-09-09', 'date add');
console.log('workCalendar rules ok');
