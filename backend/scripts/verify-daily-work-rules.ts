import {
  delayReasonRequired,
  delayWorkingDays,
  isCompanyLeaveDay,
  isOverdueOnDate,
  isWorkingDayYmd,
  normalizeDelayReason,
  addDaysYmd,
  saturdayOrdinalInMonth,
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

// September 2026: Sun=6, 2nd Sat=12, 4th Sat=26; 1st Sat=5 and 3rd Sat=19 are working.
assert(isCompanyLeaveDay('2026-09-06'), 'Sunday is company leave');
assert(isCompanyLeaveDay('2026-09-12'), '2nd Saturday is company leave');
assert(isCompanyLeaveDay('2026-09-26'), '4th Saturday is company leave');
assert(!isCompanyLeaveDay('2026-09-05'), '1st Saturday is a working day');
assert(!isCompanyLeaveDay('2026-09-19'), '3rd Saturday is a working day');
assert(!isCompanyLeaveDay('2026-09-15'), 'weekday is a working day');
assert(isWorkingDayYmd('2026-09-05'), '1st Saturday counts as working');
assert(saturdayOrdinalInMonth('2026-09-12') === 2, 'ordinal 2');
assert(saturdayOrdinalInMonth('2026-09-26') === 4, 'ordinal 4');
assert(saturdayOrdinalInMonth('2026-09-15') === null, 'weekday has no Saturday ordinal');
console.log('workCalendar rules ok');
