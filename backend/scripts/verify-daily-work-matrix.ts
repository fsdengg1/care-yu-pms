import { initStore, runWithoutPersisting, shutdownStore, store } from '../src/store/db.js';
import { User } from '../src/types.js';
import { canEditTaskBaselineFields, createWorkTask, updateWorkTask } from '../src/lib/workTasks.js';
import {
  compareSnapshots,
  getDailyWorkUpdates,
  rowsForEmailReport,
  upsertDailyPeriodRecord,
} from '../src/lib/dailyStatus.js';

type Check = { name: string; ok: boolean; detail?: string };
const checks: Check[] = [];

function assert(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function role(code: string): User {
  const user = store.getUsers().find((item) => item.role_code === code && item.status === 'ACTIVE');
  if (!user) throw new Error(`No active user with role ${code}`);
  return user;
}

function employeeNamed(skipId?: string): User {
  const user = store
    .getUsers()
    .find((item) => item.role_code === 'EMPLOYEE' && item.status === 'ACTIVE' && item.id !== skipId);
  if (!user) throw new Error('No employee found');
  return user;
}

function rowFor(user: User, date: string, period: 'morning' | 'evening', taskId: string) {
  return getDailyWorkUpdates(user, { date, period }).find((row) => row.id === taskId);
}

await initStore();
console.info('[verify-daily-work-matrix] In-memory only. Live Postgres will not be modified.');

await runWithoutPersisting(async () => {
  const pm = role('PROJECT_MANAGER');
  const employeeA = employeeNamed();
  const employeeB = employeeNamed(employeeA.id);
  const date = '2026-09-16';
  const previous = '2026-09-15';

  const createdA = createWorkTask(pm, {
    title: 'RFID Procurement',
    description: 'RFID Procurement',
    task_type: 'NON_PROJECT_TASK',
    assigned_to_id: employeeA.id,
    due_date: '2026-09-30',
    status: 'IN_PROGRESS',
  });
  const createdB = createWorkTask(pm, {
    title: 'Other Employee Task',
    description: 'Other Employee Task',
    task_type: 'NON_PROJECT_TASK',
    assigned_to_id: employeeB.id,
    due_date: '2026-09-30',
    status: 'IN_PROGRESS',
  });
  assert('TEST setup task A', !('error' in createdA));
  assert('TEST setup task B', !('error' in createdB));
  if ('error' in createdA || 'error' in createdB) return;
  const taskA = createdA.task.id;
  const taskB = createdB.task.id;

  const morningSave = upsertDailyPeriodRecord(employeeA, taskA, date, 'morning', {
    work_completed: 'Morning work',
    hours_worked: 2,
    progress_percent: 50,
    work_status: 'IN_PROGRESS',
    blocker: 'No delay',
  });
  assert('TEST 1 morning saved', morningSave.ok && morningSave.ok && morningSave.update.work_completed === 'Morning work');
  const morningRow = rowFor(employeeA, date, 'morning', taskA);
  assert(
    'TEST 1 morning retrieved by date+type',
    morningRow?.currentUpdate === 'Morning work' && morningRow.hoursWorked === 2 && morningRow.progressPercent === 50,
    morningRow ? `got "${morningRow.currentUpdate}" ${morningRow.hoursWorked}h ${morningRow.progressPercent}%` : 'missing row'
  );

  const eveningSave = upsertDailyPeriodRecord(employeeA, taskA, date, 'evening', {
    work_completed: 'Evening work',
    hours_worked: 4,
    progress_percent: 70,
    work_status: 'IN_PROGRESS',
    blocker: 'Vendor delay',
  });
  assert('TEST 2 evening saved', eveningSave.ok && eveningSave.update.work_completed === 'Evening work');

  const morningAfterEvening = rowFor(employeeA, date, 'morning', taskA);
  const eveningRow = rowFor(employeeA, date, 'evening', taskA);
  assert(
    'TEST 2 morning still exists after evening save',
    morningAfterEvening?.morningWorkCompleted === 'Morning work' &&
      morningAfterEvening.currentUpdate === 'Morning work' &&
      morningAfterEvening.hoursWorked === 2 &&
      morningAfterEvening.progressPercent === 50,
    morningAfterEvening
      ? `morning="${morningAfterEvening.currentUpdate}" hours=${morningAfterEvening.hoursWorked} progress=${morningAfterEvening.progressPercent}`
      : 'missing morning row'
  );
  assert(
    'TEST 2 evening is distinct',
    eveningRow?.currentUpdate === 'Evening work' &&
      eveningRow.eveningWorkCompleted === 'Evening work' &&
      eveningRow.morningWorkCompleted === 'Morning work' &&
      eveningRow.hoursWorked === 4 &&
      eveningRow.progressPercent === 70,
    eveningRow ? `evening="${eveningRow.currentUpdate}" hours=${eveningRow.hoursWorked}` : 'missing evening row'
  );

  const morningReload = rowFor(pm, date, 'morning', taskA);
  const eveningReload = rowFor(pm, date, 'evening', taskA);
  assert('TEST 3 / TEST 5 PM morning persists', morningReload?.morningWorkCompleted === 'Morning work');
  assert('TEST 3 / TEST 5 PM evening persists', eveningReload?.eveningWorkCompleted === 'Evening work');
  assert('TEST 6 employee dashboard morning', rowFor(employeeA, date, 'morning', taskA)?.currentUpdate === 'Morning work');
  assert('TEST 6 employee dashboard evening', rowFor(employeeA, date, 'evening', taskA)?.currentUpdate === 'Evening work');

  const morningMail = rowsForEmailReport(pm, 'morning', date);
  const eveningMail = rowsForEmailReport(pm, 'evening', date);
  const mailMorning = morningMail.rows.find((row) => row.id === taskA);
  const mailEvening = eveningMail.rows.find((row) => row.id === taskA);
  assert(
    'TEST 7 morning email uses morning records',
    mailMorning?.currentUpdate === 'Morning work' && mailMorning.morningWorkCompleted === 'Morning work'
  );
  assert(
    'TEST 7 evening email uses evening records',
    mailEvening?.currentUpdate === 'Evening work' && mailEvening.eveningWorkCompleted === 'Evening work'
  );

  const yesterdayEvening = upsertDailyPeriodRecord(employeeA, taskA, previous, 'evening', {
    work_completed: 'Yesterday evening',
    hours_worked: 8,
    progress_percent: 40,
    work_status: 'IN_PROGRESS',
  });
  assert('TEST 8 yesterday evening saved', yesterdayEvening.ok);
  const todayMorning = rowFor(employeeA, date, 'morning', taskA);
  assert(
    'TEST 8 today morning is not yesterday evening',
    todayMorning?.currentUpdate === 'Morning work' && todayMorning.currentUpdate !== 'Yesterday evening',
    todayMorning ? `got "${todayMorning.currentUpdate}"` : 'missing'
  );
  const emptyMorningOtherDate = rowFor(employeeA, '2026-09-14', 'morning', taskA);
  assert(
    'TEST 8 missing morning stays empty',
    !emptyMorningOtherDate?.currentUpdate,
    emptyMorningOtherDate ? `got "${emptyMorningOtherDate.currentUpdate}"` : 'empty as expected'
  );

  const compared = compareSnapshots(pm, date, previous);
  const compareItem = compared.items.find((item) => item.id === taskA);
  assert(
    'TEST 9 compare uses actual dates',
    compared.previousDate === previous && compared.currentDate === date
  );
  assert(
    'TEST 9 compare morning/evening per date',
    compareItem?.previousEveningWorkCompleted === 'Yesterday evening' &&
      compareItem.currentMorningWorkCompleted === 'Morning work' &&
      compareItem.currentEveningWorkCompleted === 'Evening work',
    compareItem
      ? `prevE="${compareItem.previousEveningWorkCompleted}" curM="${compareItem.currentMorningWorkCompleted}" curE="${compareItem.currentEveningWorkCompleted}"`
      : 'missing compare row'
  );

  const bMorning = upsertDailyPeriodRecord(employeeB, taskB, date, 'morning', {
    work_completed: 'B morning only',
    hours_worked: 1,
    progress_percent: 10,
    work_status: 'IN_PROGRESS',
  });
  assert('TEST 10 employee B morning saved', bMorning.ok);
  const aRows = getDailyWorkUpdates(employeeA, { date, period: 'morning', employeeId: employeeA.id });
  const bRows = getDailyWorkUpdates(employeeB, { date, period: 'morning', employeeId: employeeB.id });
  assert(
    'TEST 10 A does not see B update',
    aRows.some((row) => row.id === taskA && row.currentUpdate === 'Morning work') &&
      !aRows.some((row) => row.id === taskB || row.currentUpdate === 'B morning only')
  );
  assert(
    'TEST 10 B does not see A update',
    bRows.some((row) => row.id === taskB && row.currentUpdate === 'B morning only') &&
      !bRows.some((row) => row.id === taskA || row.currentUpdate === 'Morning work')
  );

  const sameMorningAgain = upsertDailyPeriodRecord(employeeA, taskA, date, 'morning', {
    work_completed: 'Morning work updated',
    hours_worked: 2.5,
  });
  assert('unique key updates existing morning', sameMorningAgain.ok);
  const morningRecords = store
    .getDailyUpdates()
    .filter(
      (item) =>
        (item.task_id === taskA || item.assignment_id === taskA) &&
        item.user_id === employeeA.id &&
        item.work_date === date &&
        (item.period === 'morning' || item.update_type === 'MORNING')
    );
  assert('no duplicate morning records', morningRecords.length === 1, `count=${morningRecords.length}`);
  assert(
    'logged hours persist on morning record',
    morningRecords[0]?.hours_worked === 2.5,
    `hours=${morningRecords[0]?.hours_worked}`
  );

  const eveningRecords = store
    .getDailyUpdates()
    .filter(
      (item) =>
        (item.task_id === taskA || item.assignment_id === taskA) &&
        item.user_id === employeeA.id &&
        item.work_date === date &&
        (item.period === 'evening' || item.update_type === 'EVENING')
    );
  assert('evening record still present after morning upsert', eveningRecords.length === 1);
  assert('evening hours unchanged', eveningRecords[0]?.hours_worked === 4, `hours=${eveningRecords[0]?.hours_worked}`);
  assert(
    'reason for delay is period-specific',
    morningRecords[0]?.blocker === 'No delay' && eveningRecords[0]?.blocker === 'Vendor delay'
  );

  assert('employee cannot edit task description', !canEditTaskBaselineFields(employeeA, createdA.task));
  const descAttempt = updateWorkTask(employeeA, taskA, { description: 'Should not save' });
  assert('employee description patch rejected', 'error' in descAttempt);
  assert('PM can edit task description', canEditTaskBaselineFields(pm, createdA.task));

  const missingPeriod = upsertDailyPeriodRecord(employeeA, taskA, date, 'morning', { hours_worked: 3 });
  assert('hours upsert still requires an explicit period in helper', missingPeriod.ok);
});

const failed = checks.filter((item) => !item.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
await shutdownStore();
if (failed.length) process.exit(1);
