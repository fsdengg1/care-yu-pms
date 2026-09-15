import { store } from '../store/db.js';
import { DailyUpdate, Project, Task, User } from '../types.js';
import { canViewProject } from './dailyUpdates.js';
import { canAcceptAssignedTask, canEditTaskBaselineFields, canMutateWorkTask, isLeadBasedTask } from './workTasks.js';
import { formatEmployeeDisplayName, dedupeByStableId, personGivenKey } from './people.js';
import { sendEmail } from './email.js';
import {
  DELAY_REASON_OPTIONS,
  clockInAppTimezone,
  dateInAppTimezone,
  delayReasonRequired,
  isCompanyLeaveDay,
  isMorningPhaseLocked,
  isOverdueOnDate,
  normalizeDelayReason,
} from './workCalendar.js';
export { dateInAppTimezone, isCompanyLeaveDay } from './workCalendar.js';
import { attendanceForUsers, fullDayLeaveOnDate, leaveNonWorkingDays } from './leaveRequests.js';

export const COMPANY_LEAVE_MESSAGE =
  'Company leave day (Sunday or 2nd/4th Saturday). Daily Work Updates and email reports are not sent.';

export type DailySheetStatus = 'Yet to Start' | 'In Progress' | 'Waiting' | 'Completed' | 'Hold';
export type SnapshotPeriod = 'morning' | 'evening';

export interface DailyStatusSubtask {
  id: string;
  title: string;
  description?: string;
  status: DailySheetStatus;
  progressPercent: number;
  deadline: string;
  deadlineIso?: string;
  assignedTo: string;
  assignedToId?: string;
  hoursWorked: number;
  loggedHours?: string;
  startDate?: string;
  parentTaskId?: string;
}

export interface DailyStatusRow {
  id: string;
  personId: string;
  person: string;
  projectId?: string;
  project: string;
  taskDescription: string;
  dependencyIds: string[];
  dependencies: string;
  status: DailySheetStatus;
  currentDate: string;
  startDate: string;
  startDateIso?: string;
  deadline: string;
  deadlineIso?: string;
  reasonForDelay: string;
  isAdditional: boolean;
  blocked?: boolean;
  overdue?: boolean;
  progressPercent: number;
  /** Decimal hours from latest submitted daily update (e.g. 6.5). */
  hoursWorked: number;
  /** Display label e.g. "6h 30m". */
  loggedHours: string;
  workDate?: string;
  latestUpdateAt?: string;
  morningStatus?: DailySheetStatus;
  eveningStatus?: DailySheetStatus;
  subtasks?: DailyStatusSubtask[];
  hasSubtasks?: boolean;
  /** Evening Daily Work Update narrative for the selected work date. */
  currentUpdate?: string;
  /** Hidden from the default Daily Work Updates view on every dashboard. */
  sheetHidden?: boolean;
  isLeadTask?: boolean;
  taskType?: 'PROJECT_TASK' | 'NON_PROJECT_TASK' | 'LEAD_TASK';
  leadNumber?: string;
  leadName?: string;
  acceptanceStatus?: 'REQUESTED' | 'ACCEPTED' | 'REJECTED';
  createdById?: string;
  createdByName?: string;
  canEdit?: boolean;
  canEditBaseline?: boolean;
  canAccept?: boolean;
  eveningSubmitted?: boolean;
  delayReasonRequired?: boolean;
  rowKind?: 'task' | 'leave' | 'permission';
  attendanceLabel?: string;
  morningProgressPercent?: number;
  eveningProgressPercent?: number;
}

export interface DailyStatusKpis {
  updatesToday: number;
  pending: number;
  blocked: number;
  completed: number;
  projectsRequiringAttention: number;
}

const SNAPSHOT_PREFIX = 'dss:';
const MORNING_LOCK_META_PREFIX = 'morning-lock:';

export type MorningLockSource = 'manual' | 'schedule';

export type MorningLockState = {
  locked: boolean;
  lock_source?: MorningLockSource;
  locked_at?: string;
  locked_by?: string;
  locked_by_name?: string;
  unlocked_at?: string;
  unlocked_by?: string;
  unlocked_by_name?: string;
};

function morningLockMetaId(date: string) {
  return `${MORNING_LOCK_META_PREFIX}${date}`;
}

export function loadMorningLockState(date: string): MorningLockState | null {
  const record = store.getSystemMeta().find((item) => item.id === morningLockMetaId(date));
  const payload = record?.payload as MorningLockState | undefined;
  if (!payload || typeof payload.locked !== 'boolean') return null;
  return payload;
}

function saveMorningLockState(date: string, state: MorningLockState) {
  const id = morningLockMetaId(date);
  const records = store.getSystemMeta().filter((item) => item.id !== id);
  records.push({
    id,
    payloadType: 'MORNING_LOCK_STATE',
    payload: state,
  });
  store.saveSystemMeta(records);
}

export const MORNING_LOCKED_MESSAGE =
  'Morning Status is locked after 11:00 AM. Morning task changes are no longer allowed.';

/** Morning is locked for past dates, manual lock, or scheduled 11:00 lock — unless PM/Admin unlocked today. */
export function isMorningStatusLocked(workDate: string, when = new Date()): boolean {
  const clock = clockInAppTimezone(when);
  if (workDate < clock.date) return true;
  if (workDate > clock.date) return false;
  const state = loadMorningLockState(workDate);
  if (state?.locked === false) return false;
  if (state?.locked === true) return true;
  return isMorningPhaseLocked(workDate, when);
}

/** Evening opens once morning status is locked for the selected work date. */
export function isEveningStatusOpen(workDate: string, when = new Date()): boolean {
  const clock = clockInAppTimezone(when);
  if (workDate < clock.date) return true;
  if (workDate > clock.date) return false;
  return isMorningStatusLocked(workDate, when);
}

export function canManageMorningLock(user: User): boolean {
  return user.role_code === 'PROJECT_MANAGER' || user.role_code === 'SYSTEM_ADMIN';
}

function globalSheetActor(): User | undefined {
  const users = store.getUsers().filter((item) => item.status === 'ACTIVE');
  for (const role of ['PROJECT_MANAGER', 'ENG_DIRECTOR', 'CEO', 'SYSTEM_ADMIN'] as const) {
    const found = users.find((item) => item.role_code === role);
    if (found) return found;
  }
  return users[0];
}

function captureMorningSnapshot(date: string, actor: User, capturedBy: string, force = false) {
  const rows = visibleSheetRows(buildDailyStatusRows(actor, { date, period: 'morning' }));
  return persistDailyStatusSnapshot(date, 'morning', rows, capturedBy, { force });
}

export function lockMorningStatus(user: User, date = todayIso()) {
  if (isCompanyLeaveDay(date)) {
    return { date, locked: false, rows: [], phase: sheetPhase(date), skipped: true, reason: 'company-leave' as const };
  }
  const snapshot = captureMorningSnapshot(date, user, user.id, !isMorningPhaseLocked(date));
  const existing = loadMorningLockState(date);
  if (existing?.locked !== true) {
    saveMorningLockState(date, {
      locked: true,
      lock_source: isMorningPhaseLocked(date) ? 'schedule' : 'manual',
      locked_at: existing?.locked_at || new Date().toISOString(),
      locked_by: existing?.locked_by || user.id,
      locked_by_name: existing?.locked_by_name || user.name,
      unlocked_at: undefined,
      unlocked_by: undefined,
      unlocked_by_name: undefined,
    });
  }
  return { date, locked: true, rows: snapshot.rows, phase: sheetPhase(date) };
}

export function unlockMorningStatus(user: User, date = todayIso()) {
  const clock = clockInAppTimezone();
  if (date < clock.date) {
    return {
      error: 'Past Morning Status cannot be unlocked.',
      status: 400 as const,
      date,
      locked: true,
      phase: sheetPhase(date),
    };
  }
  const now = new Date().toISOString();
  saveMorningLockState(date, {
    locked: false,
    unlocked_at: now,
    unlocked_by: user.id,
    unlocked_by_name: user.name,
  });
  return { date, locked: false, phase: sheetPhase(date) };
}

/**
 * Idempotent 11:00 AM lock: capture the morning snapshot once and persist lock state once.
 * Safe for overlapping cron ticks and page loads after the lock hour.
 */
export function applyScheduledMorningLock(date = todayIso()) {
  if (isCompanyLeaveDay(date)) {
    return { applied: false, skipped: true, reason: 'company-leave', locked: false, date };
  }
  if (!isMorningPhaseLocked(date)) {
    return { applied: false, skipped: true, reason: 'before-lock-hour', locked: false, date };
  }
  const existingState = loadMorningLockState(date);
  if (existingState?.locked === false) {
    return {
      applied: false,
      skipped: true,
      reason: 'manually-unlocked',
      locked: false,
      date,
      phase: sheetPhase(date),
    };
  }
  const existingSnap = loadDailyStatusSnapshot(date, 'morning');
  // Only treat a non-empty snapshot as the locked baseline. An empty [] must not
  // permanently block re-capture after tasks are restored.
  if (existingState?.locked === true && Array.isArray(existingSnap) && existingSnap.length > 0) {
    return { applied: false, skipped: true, reason: 'already-locked', locked: true, date, phase: sheetPhase(date) };
  }
  const actor = globalSheetActor();
  if (!actor) {
    return { applied: false, skipped: true, reason: 'no-actor', locked: isMorningStatusLocked(date), date };
  }
  captureMorningSnapshot(date, actor, 'schedule', existingState?.locked !== true);
  if (existingState?.locked !== true) {
    saveMorningLockState(date, {
      locked: true,
      lock_source: 'schedule',
      locked_at: existingState?.locked_at || new Date().toISOString(),
      locked_by: 'schedule',
      locked_by_name: '11:00 AM scheduler',
      unlocked_at: undefined,
      unlocked_by: undefined,
      unlocked_by_name: undefined,
    });
  }
  return { applied: true, skipped: false, locked: true, date, phase: sheetPhase(date) };
}

export function isTaskInLockedMorningSnapshot(taskId: string, date = todayIso()): boolean {
  if (!isMorningStatusLocked(date)) return false;
  const snap = loadDailyStatusSnapshot(date, 'morning');
  if (!snap?.length) return false;
  return snap.some((row) => row.id === taskId || (row.subtasks || []).some((sub) => sub.id === taskId));
}

export function toSheetStatus(status?: string): DailySheetStatus {
  const value = (status || '').toUpperCase().replace(/\s+/g, '_');
  if (value === 'DONE' || value === 'COMPLETED') return 'Completed';
  if (value === 'IN_PROGRESS' || value === 'WORK_IN_PROGRESS') return 'In Progress';
  if (value === 'HOLD' || value === 'ON_HOLD') return 'Hold';
  if (value === 'WAITING' || value === 'BLOCKED') return 'Waiting';
  if (value === 'YET_TO_START' || value === 'TODO' || value === 'NOT_STARTED') return 'Yet to Start';
  return 'Yet to Start';
}

export function fromSheetStatus(status: string): Task['status'] {
  if (status === 'Completed') return 'DONE';
  if (status === 'In Progress') return 'IN_PROGRESS';
  if (status === 'Hold') return 'HOLD' as Task['status'];
  if (status === 'Waiting') return 'WAITING' as Task['status'];
  return 'TODO';
}

export function clampProgressPercent(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** In Progress / Hold / Waiting never display 100%. Completed is always 100%. */
export function progressForSheetStatus(status?: string, value?: unknown): number {
  const sheet = (['Yet to Start', 'In Progress', 'Waiting', 'Completed', 'Hold'] as DailySheetStatus[]).includes(
    status as DailySheetStatus
  )
    ? (status as DailySheetStatus)
    : toSheetStatus(status);
  const stored = clampProgressPercent(value);
  if (sheet === 'Completed') return 100;
  if (sheet === 'Yet to Start') return 0;
  return Math.min(99, stored);
}

export function formatSheetDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(+date)) return value;
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function todayIso(): string {
  return dateInAppTimezone();
}

/** Previous calendar day (app timezone) as YYYY-MM-DD. */
function yesterdayIso(): string {
  const today = todayIso();
  const [y, m, d] = today.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() - 1);
  return utc.toISOString().slice(0, 10);
}

function periodRowsAvailable(date: string, period: SnapshotPeriod): boolean {
  const rows = loadMailedOrSnapshotRows(date, period);
  return Boolean(rows && rows.length);
}

export type DeadlineTone = 'completed' | 'hold' | 'delay-1' | 'delay-2plus' | 'normal';

function parseSheetDate(value?: string): string | null {
  if (!value || value === '—') return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const match = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  const date = new Date(value);
  if (Number.isNaN(+date)) return null;
  return date.toISOString().slice(0, 10);
}

function overdueDays(deadlineIso: string | undefined, today = todayIso()): number {
  if (!deadlineIso) return 0;
  const start = Date.parse(`${deadlineIso}T00:00:00`);
  const end = Date.parse(`${today}T00:00:00`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.floor((end - start) / 86400000);
}

export function deadlineTone(status: string, deadline?: string, today?: string): DeadlineTone {
  const sheet = toSheetStatus(status);
  if (status === 'Completed' || sheet === 'Completed') return 'completed';
  if (status === 'Hold' || sheet === 'Hold') return 'hold';
  const iso = parseSheetDate(deadline);
  const days = iso ? overdueDays(iso, today) : 0;
  if (days >= 2) return 'delay-2plus';
  if (days === 1) return 'delay-1';
  return 'normal';
}

function deadlineInlineStyle(tone: DeadlineTone): string {
  if (tone === 'completed') return 'background:#dcfce7;color:#166534;font-weight:700;';
  if (tone === 'hold') return 'background:#fde68a;color:#78350f;font-weight:700;';
  if (tone === 'delay-1') return 'background:#dc2626;color:#ffffff;font-weight:700;';
  if (tone === 'delay-2plus') return 'background:#0f172a;color:#ffffff;font-weight:700;';
  return '';
}

function isOverdue(task: Task, asOf = todayIso()): boolean {
  const leaveDays = task.assigned_to_id ? leaveNonWorkingDays(task.assigned_to_id, task.due_date || asOf, asOf) : new Set<string>();
  return isOverdueOnDate(task.due_date, task.status, asOf, leaveDays);
}

function delayReason(task: Task, update?: DailyUpdate): string {
  const stored = normalizeDelayReason(task.delay_reason) || normalizeDelayReason(update?.blocker) || normalizeDelayReason(task.blocked_reason);
  if (stored) return stored;
  if (task.status === 'DONE' || !isOverdue(task)) return 'No delay';
  return normalizeDelayReason(task.remarks) || 'No delay';
}

function completedBeforeWorkDate(task: Task, workDate: string): boolean {
  if (task.status !== 'DONE') return false;
  const raw = task.completed_at || task.updated_at || task.last_update_at;
  if (!raw) return false;
  const doneOn = /^\d{4}-\d{2}-\d{2}$/.test(String(raw).slice(0, 10)) && String(raw).length <= 10
    ? String(raw).slice(0, 10)
    : dateInAppTimezone(new Date(raw));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(doneOn)) return false;
  return doneOn < workDate;
}

function dependencyIdsOf(task: Task): string[] {
  const ids = [
    ...(Array.isArray(task.depends_on_ids) ? task.depends_on_ids : []),
    task.depends_on_id,
  ]
    .map((id) => String(id || '').trim())
    .filter(Boolean);
  return [...new Set(ids)];
}

function formatDependencies(ids: string[], users: User[], fallback?: string): string {
  if (!ids.length) {
    const parsed = parseLegacyDependency(fallback);
    return parsed || '—';
  }
  const names = ids
    .map((id) => users.find((user) => user.id === id))
    .filter((user): user is User => Boolean(user))
    .map((user) => formatEmployeeDisplayName(user));
  return names.length ? names.join(', ') : '—';
}

function parseLegacyDependency(value?: string): string {
  if (!value?.trim()) return '';
  const raw = value.trim();
  if (raw.startsWith('{') || raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw) as { names?: string[]; ids?: string[] } | string[];
      if (Array.isArray(parsed)) return parsed.map((item) => formatEmployeeDisplayName(String(item))).join(', ');
      if (Array.isArray(parsed.names) && parsed.names.length) {
        return parsed.names.map((name) => formatEmployeeDisplayName(name)).join(', ');
      }
    } catch {
      return '';
    }
  }
  return raw
    .split(',')
    .map((part) => formatEmployeeDisplayName(part.trim()))
    .filter(Boolean)
    .join(', ');
}

function formatLoggedHours(hours?: number): string {
  const value = Math.max(0, Number(hours) || 0);
  const whole = Math.floor(value);
  const mins = Math.min(59, Math.round((value - whole) * 60));
  return `${whole}h ${String(mins).padStart(2, '0')}m`;
}

function periodOfUpdate(item: DailyUpdate): SnapshotPeriod | null {
  if (item.period === 'evening' || item.update_type === 'EVENING') return 'evening';
  if (item.period === 'morning' || item.update_type === 'MORNING') return 'morning';
  return item.period === 'morning' || item.period === 'evening' ? item.period : null;
}

function updatesForTask(task: Task, updates: DailyUpdate[]): DailyUpdate[] {
  return updates.filter((item) => item.task_id === task.id || item.assignment_id === task.id);
}

function sortUpdatesLatestFirst(items: DailyUpdate[]): DailyUpdate[] {
  return items.slice().sort((a, b) =>
    String(b.submitted_at || b.updated_at || '').localeCompare(String(a.submitted_at || a.updated_at || ''))
  );
}

function pickFromUpdatePool(pool: DailyUpdate[], employeeId?: string): DailyUpdate | undefined {
  if (!pool.length) return undefined;
  const ranked = sortUpdatesLatestFirst(pool);
  if (employeeId) {
    const owned = ranked.find((item) => item.user_id === employeeId);
    if (owned) return owned;
  }
  return ranked[0];
}

function pickUpdateForDate(
  forTask: DailyUpdate[],
  workDate: string,
  period?: SnapshotPeriod,
  employeeId?: string
): DailyUpdate | undefined {
  if (!forTask.length) return undefined;
  const onDate = forTask.filter((item) => item.work_date === workDate);
  if (!onDate.length) return undefined;
  if (!period) return pickFromUpdatePool(onDate, employeeId);

  const periodPool = onDate.filter((item) => periodOfUpdate(item) === period);
  const periodMatch = pickFromUpdatePool(periodPool, employeeId);
  if (periodMatch) return periodMatch;

  // Legacy rows saved before the morning/evening split had no period — surface them in evening view.
  if (period === 'evening') {
    const legacy = onDate.filter((item) => !periodOfUpdate(item));
    const legacyMatch = pickFromUpdatePool(legacy, employeeId);
    if (legacyMatch) return legacyMatch;
  }

  return undefined;
}

function normalizeComparableText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseHoursWorkedValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const direct = Number(raw);
  if (Number.isFinite(direct)) return Math.max(0, direct);
  const match = raw.match(/^(\d+)\s*h(?:\s*(\d+)\s*m)?$/i);
  if (!match) return 0;
  const hours = Number(match[1]) || 0;
  const mins = Number(match[2]) || 0;
  return hours + mins / 60;
}

function isHoursOnlyShell(update: DailyUpdate, masterText: string): boolean {
  const text = (update.work_completed || '').trim();
  if (!text) return true;
  const summary = String(update.summary || '');
  if (!/via Daily Work Updates/i.test(summary)) return false;
  return normalizeComparableText(text) === normalizeComparableText(masterText || '');
}

function isExplicitEveningUpdate(update: DailyUpdate): boolean {
  return periodOfUpdate(update) === 'evening' || update.update_type === 'EVENING';
}

function eveningNarrativeText(update: DailyUpdate | undefined, masterText: string): string | undefined {
  if (!update) return undefined;
  const text = (update.work_completed || '').trim();
  if (!text) return undefined;
  if (isExplicitEveningUpdate(update)) {
    if (isHoursOnlyShell(update, masterText)) return undefined;
    return text;
  }
  if (isHoursOnlyShell(update, masterText)) return undefined;
  return text;
}

function eveningSheetStatus(
  task: Task | undefined,
  eveningUpd: DailyUpdate | undefined,
  eveningSnapRow?: DailyStatusRow | null,
  hoursWorked = 0
): DailySheetStatus {
  const eveningSubmitted = Boolean(
    eveningUpd &&
      (eveningUpd.submission_status === 'SUBMITTED' ||
        Boolean((eveningUpd.work_completed || '').trim()) ||
        Number(eveningUpd.hours_worked) > 0)
  );
  if (eveningSubmitted && eveningUpd?.work_status) {
    const fromUpdate = toSheetStatus(eveningUpd.work_status);
    if (fromUpdate !== 'Yet to Start') return fromUpdate;
  }
  if (eveningSnapRow?.status) {
    const fromSnap = toSheetStatus(eveningSnapRow.status);
    if (fromSnap !== 'Yet to Start') return fromSnap;
  }
  if (task) {
    const fromTask = taskSheetStatus(task);
    if (fromTask !== 'Yet to Start') return fromTask;
  }
  if (eveningUpd?.work_status) {
    const fromUpdate = toSheetStatus(eveningUpd.work_status);
    if (fromUpdate !== 'Yet to Start') return fromUpdate;
  }
  if (hoursWorked > 0) return 'In Progress';
  return task ? taskSheetStatus(task) : 'Yet to Start';
}

function resolveEveningNarrative(params: {
  masterDesc: string;
  taskUpdates: DailyUpdate[];
  workDate: string;
  employeeId?: string;
  eveningSnapRow?: DailyStatusRow;
  liveEveningRow?: DailyStatusRow;
  dayOverlayRow?: DailyStatusRow;
}): { text?: string; update?: DailyUpdate } {
  const { masterDesc, taskUpdates, workDate, employeeId } = params;
  const eveningUpd = pickUpdateForDate(taskUpdates, workDate, 'evening', employeeId);
  const direct = eveningNarrativeText(eveningUpd, masterDesc);
  if (direct) return { text: direct, update: eveningUpd };

  const substantive = sortUpdatesLatestFirst(
    taskUpdates.filter((item) => item.work_date === workDate && item.submission_status === 'SUBMITTED')
  ).find((item) => {
    const candidate = (item.work_completed || '').trim();
    if (!candidate) return false;
    if (isHoursOnlyShell(item, masterDesc)) return false;
    if (normalizeComparableText(candidate) === normalizeComparableText(masterDesc) && !isExplicitEveningUpdate(item)) {
      return false;
    }
    return true;
  });
  if (substantive) {
    return { text: substantive.work_completed.trim(), update: substantive };
  }

  const snapCurrent = (params.eveningSnapRow?.currentUpdate || '').trim();
  if (snapCurrent) return { text: snapCurrent, update: eveningUpd };

  const snapDesc = (params.eveningSnapRow?.taskDescription || '').trim();
  if (snapDesc && normalizeComparableText(snapDesc) !== normalizeComparableText(masterDesc)) {
    return { text: snapDesc, update: eveningUpd };
  }

  const liveCurrent = (params.liveEveningRow?.currentUpdate || '').trim();
  if (liveCurrent) return { text: liveCurrent, update: eveningUpd };

  const liveDesc = (params.liveEveningRow?.taskDescription || '').trim();
  if (liveDesc && normalizeComparableText(liveDesc) !== normalizeComparableText(masterDesc)) {
    return { text: liveDesc, update: eveningUpd };
  }

  const overlayDesc = (params.dayOverlayRow?.taskDescription || '').trim();
  if (overlayDesc && normalizeComparableText(overlayDesc) !== normalizeComparableText(masterDesc)) {
    return { text: overlayDesc, update: eveningUpd };
  }

  if (snapDesc) return { text: snapDesc, update: eveningUpd };

  return { text: undefined, update: eveningUpd };
}

/** Master task status is the source of truth for the sheet status column. */
function taskSheetStatus(task: Task): DailySheetStatus {
  return toSheetStatus(task.status === 'BLOCKED' ? 'WAITING' : task.status);
}

function masterTaskDescription(task: Task, morningRow?: DailyStatusRow | null): string {
  const fromMorning = (morningRow?.taskDescription || '').trim();
  const fromTask = (task.description || task.title || '').trim();
  return fromMorning || fromTask || task.title;
}

function latestUpdateForTask(
  task: Task,
  updates: DailyUpdate[],
  workDate = todayIso(),
  period?: SnapshotPeriod
): DailyUpdate | undefined {
  return pickUpdateForDate(updatesForTask(task, updates), workDate, period, task.assigned_to_id);
}

/** Logged hours are per calendar day. A day with no log is 0. */
function loggedHoursForDate(
  task: Task,
  updates: DailyUpdate[],
  workDate: string,
  period?: SnapshotPeriod
): number {
  const dayUpdate = pickUpdateForDate(updatesForTask(task, updates), workDate, period, task.assigned_to_id);
  return Math.max(0, Number(dayUpdate?.hours_worked) || 0);
}

function visibleUsers(user: User): User[] {
  return dedupeByStableId(
    store.getUsers().filter((item) => item.status === 'ACTIVE'),
    (item) => item.id
  );
}

export function canSeeAllDailyStatusRows(user: User) {
  return ['CEO', 'ENG_DIRECTOR', 'PROJECT_MANAGER', 'SYSTEM_ADMIN'].includes(user.role_code);
}

/** Shared Daily Work Updates visibility: leadership sees every row; others see assigned/created tasks. */
export function canSeeDailyStatusTask(user: User, task: Task): boolean {
  if (task.is_milestone) return false;
  if (task.acceptance_status === 'REJECTED') return false;
  // Global shared sheet for CEO / Engineering Director / Arivan (PM) / admin.
  if (canSeeAllDailyStatusRows(user)) return true;
  return (
    task.assigned_to_id === user.id ||
    task.created_by_id === user.id ||
    task.assigned_by_id === user.id ||
    task.responsible_user_id === user.id
  );
}

function scopedDailyStatusRows(user: User, rows: DailyStatusRow[]) {
  if (canSeeAllDailyStatusRows(user)) return rows;
  return rows.filter((row) => row.personId === user.id);
}

export function visibleSheetRows(rows: DailyStatusRow[]) {
  return rows.filter((row) => !row.sheetHidden);
}

export function buildDailyStatusRows(
  user: User,
  options?: { date?: string; period?: SnapshotPeriod; includeHistoricalCompleted?: boolean }
): DailyStatusRow[] {
  const workDate = options?.date && /^\d{4}-\d{2}-\d{2}$/.test(options.date) ? options.date : todayIso();
  // Sundays + 2nd/4th Saturdays: no sheet content and no mail (do not carry weekday tasks).
  if (isCompanyLeaveDay(workDate)) return [];
  const period = options?.period;
  const morningLocked = isMorningStatusLocked(workDate);
  const users = visibleUsers(user);
  const allUsers = store.getUsers();
  const projects = store.getProjects();
  const updates = store
    .getDailyUpdates()
    .filter((item) => item.submission_status === 'SUBMITTED')
    .slice()
    .sort((a, b) => (b.submitted_at || b.updated_at).localeCompare(a.submitted_at || a.updated_at));
  const visibleTasks = store.getTasks().filter((task) => canSeeDailyStatusTask(user, task));
  const visibleRootIds = new Set(visibleTasks.filter((task) => !task.parent_task_id).map((task) => task.id));
  // Nest children under visible parents even when the subtask assignee differs.
  const childrenByParent = new Map<string, Task[]>();
  for (const task of store.getTasks()) {
    if (task.is_milestone) continue;
    if (task.acceptance_status === 'REJECTED') continue;
    if (!task.parent_task_id || !visibleRootIds.has(task.parent_task_id)) continue;
    const list = childrenByParent.get(task.parent_task_id) || [];
    list.push(task);
    childrenByParent.set(task.parent_task_id, list);
  }

  const taskRows = visibleTasks
    .filter((task) => !task.parent_task_id)
    .filter((task) => options?.includeHistoricalCompleted || !completedBeforeWorkDate(task, workDate))
    .filter((task) => !fullDayLeaveOnDate(task.assigned_to_id, workDate))
    .map((task) => {
      const project = task.project_id ? projects.find((item) => item.id === task.project_id) : undefined;
      const assignee =
        users.find((item) => item.id === task.assigned_to_id) ||
        allUsers.find((item) => item.id === task.assigned_to_id);
      const update = latestUpdateForTask(task, updates, workDate, period);
      const deps = dependencyIdsOf(task);
      const masterDesc = (task.description || task.title || '').trim() || task.title;
      const eveningUpd = pickUpdateForDate(updatesForTask(task, updates), workDate, 'evening', task.assigned_to_id);
      const eveningResolved = period === 'evening'
        ? resolveEveningNarrative({
            masterDesc,
            taskUpdates: updatesForTask(task, updates),
            workDate,
            employeeId: task.assigned_to_id,
          })
        : { text: eveningNarrativeText(eveningUpd, masterDesc), update: eveningUpd };
      const eveningText = eveningResolved.text;
      const resolvedEveningUpd = eveningResolved.update || eveningUpd;
      const hoursToday = loggedHoursForDate(task, updates, workDate, period);
      const hoursWorkedValue =
        period === 'evening'
          ? Math.max(hoursToday, parseHoursWorkedValue(resolvedEveningUpd?.hours_worked))
          : hoursToday;
      const morningUpd = pickUpdateForDate(updatesForTask(task, updates), workDate, 'morning', task.assigned_to_id);
      const eveningSubmitted = Boolean(
        resolvedEveningUpd &&
          (resolvedEveningUpd.submission_status === 'SUBMITTED' || Boolean(eveningNarrativeText(resolvedEveningUpd, masterDesc)))
      );
      let status =
        period === 'evening'
          ? eveningSheetStatus(task, resolvedEveningUpd, undefined, hoursWorkedValue)
          : taskSheetStatus(task);
      if (period === 'morning' && morningLocked && morningUpd?.work_status) {
        status = toSheetStatus(morningUpd.work_status);
      }
      const delayUpdate = period === 'evening' ? resolvedEveningUpd || update : update;
      const children = (childrenByParent.get(task.id) || []).slice().sort((a, b) => a.title.localeCompare(b.title));
      const subtasks: DailyStatusSubtask[] = children.map((child) => ({
        id: child.id,
        title: child.title,
        description: child.description || child.title,
        status: toSheetStatus(child.status === 'BLOCKED' ? 'WAITING' : child.status),
        progressPercent: progressForSheetStatus(
          toSheetStatus(child.status === 'BLOCKED' ? 'WAITING' : child.status),
          child.progress_percent
        ),
        deadline: formatSheetDate(child.due_date),
        deadlineIso: child.due_date ? String(child.due_date).slice(0, 10) : undefined,
        assignedTo: formatEmployeeDisplayName(
          users.find((item) => item.id === child.assigned_to_id) ||
            allUsers.find((item) => item.id === child.assigned_to_id) ||
            child.assigned_to
        ),
        assignedToId: child.assigned_to_id,
        hoursWorked: loggedHoursForDate(child, updates, workDate, period),
        loggedHours: formatLoggedHours(loggedHoursForDate(child, updates, workDate, period)),
        startDate: formatSheetDate(child.start_date),
        parentTaskId: child.parent_task_id || task.id,
      }));
      let progressPercent = task.progress_percent || 0;
      if (period === 'morning' && morningLocked && morningUpd?.progress_percent != null) {
        progressPercent = morningUpd.progress_percent;
      }
      if (period === 'evening' && resolvedEveningUpd?.progress_percent != null) {
        progressPercent = resolvedEveningUpd.progress_percent;
      }
      if (children.length && !task.progress_manual_override && !(period === 'evening' && resolvedEveningUpd?.progress_percent != null)) {
        const doneWeight = children.reduce((sum, child) => {
          if (child.status === 'DONE') return sum + 1;
          if (child.status === 'IN_PROGRESS') return sum + 0.5;
          return sum;
        }, 0);
        progressPercent = Math.round((doneWeight / children.length) * 100);
      }
      const isLeadTask = isLeadBasedTask(task) || task.task_type === 'LEAD_TASK';
      const lead = task.lead_id ? store.getLeads().find((item) => item.id === task.lead_id) : undefined;
      const leadLabel = isLeadTask
        ? [lead?.lead_number, task.lead_name || lead?.title].filter(Boolean).join(' • ')
        : '';

      const sheetText = masterDesc;
      const reason = delayReason(task, delayUpdate);
      const overdue = isOverdue(task, workDate);

      return {
        id: task.id,
        personId: task.assigned_to_id,
        person: formatEmployeeDisplayName(assignee || task.assigned_to),
        projectId: isLeadTask ? undefined : task.project_id,
        project: isLeadTask ? leadLabel || task.lead_name || task.title : project?.name || task.project_name || update?.project_name || '—',
        taskDescription: sheetText,
        currentUpdate: eveningText,
        dependencyIds: deps,
        dependencies: formatDependencies(deps, allUsers, delayUpdate?.dependency),
        status,
        currentDate: formatSheetDate(workDate),
        startDate: formatSheetDate(task.start_date),
        startDateIso: task.start_date ? String(task.start_date).slice(0, 10) : undefined,
        deadline: formatSheetDate(task.due_date),
        deadlineIso: task.due_date ? String(task.due_date).slice(0, 10) : undefined,
        reasonForDelay: reason,
        isAdditional: Boolean(task.is_additional),
        blocked: task.status === 'BLOCKED' || task.status === ('WAITING' as Task['status']),
        overdue,
        progressPercent: progressForSheetStatus(status, progressPercent),
        hoursWorked: hoursWorkedValue,
        loggedHours: formatLoggedHours(hoursWorkedValue),
        workDate: pickUpdateForDate(updatesForTask(task, updates), workDate, period, task.assigned_to_id)?.work_date || workDate,
        latestUpdateAt: update?.submitted_at || update?.updated_at || task.last_update_at,
        subtasks,
        hasSubtasks: subtasks.length > 0,
        sheetHidden: task.sheet_hidden === true,
        isLeadTask,
        taskType: task.task_type || (task.project_id ? 'PROJECT_TASK' : 'NON_PROJECT_TASK'),
        leadNumber: lead?.lead_number,
        leadName: task.lead_name || lead?.title,
        acceptanceStatus: task.acceptance_status,
        createdById: task.created_by_id,
        createdByName: task.created_by || task.assigned_by,
        canEdit: canMutateWorkTask(user, task) && (period !== 'morning' || !morningLocked),
        canEditBaseline: canEditTaskBaselineFields(user, task) && (period !== 'morning' || !morningLocked),
        canAccept: canAcceptAssignedTask(user, task),
        eveningSubmitted,
        delayReasonRequired: delayReasonRequired(reason, overdue, status === 'Completed'),
        rowKind: 'task',
        morningStatus: morningUpd ? toSheetStatus(morningUpd.work_status) : taskSheetStatus(task),
        eveningStatus: period === 'evening' ? status : eveningSheetStatus(task, resolvedEveningUpd, undefined, hoursWorkedValue),
        morningProgressPercent: progressForSheetStatus(
          morningUpd ? toSheetStatus(morningUpd.work_status) : taskSheetStatus(task),
          morningUpd?.progress_percent ?? task.progress_percent
        ),
        eveningProgressPercent: progressForSheetStatus(status, progressPercent),
      } satisfies DailyStatusRow;
    })
    .sort((a, b) => a.person.localeCompare(b.person) || a.project.localeCompare(b.project));

  const leavePeople = (canSeeAllDailyStatusRows(user) ? users : users.filter((item) => item.id === user.id)).filter((person) =>
    fullDayLeaveOnDate(person.id, workDate)
  );
  const leaveRows: DailyStatusRow[] = attendanceForUsers(
    leavePeople.map((person) => person.id),
    workDate
  )
    .filter((item) => item.onLeave)
    .map((item) => ({
      id: `leave:${item.personId}:${workDate}`,
      personId: item.personId,
      person: item.person,
      project: '—',
      taskDescription: item.leaveType ? `Approved leave (${item.leaveType})` : 'Approved leave',
      dependencyIds: [],
      dependencies: '—',
      status: 'Hold' as DailySheetStatus,
      currentDate: formatSheetDate(workDate),
      startDate: formatSheetDate(workDate),
      deadline: '—',
      reasonForDelay: 'No delay',
      isAdditional: false,
      overdue: false,
      progressPercent: 0,
      hoursWorked: 0,
      loggedHours: formatLoggedHours(0),
      workDate,
      canEdit: false,
      canEditBaseline: false,
      canAccept: false,
      eveningSubmitted: true,
      delayReasonRequired: false,
      rowKind: 'leave' as const,
      attendanceLabel: 'On Leave',
      currentUpdate: item.leaveReason || '',
    }));

  let combined = [...leaveRows, ...taskRows];
  if (period === 'evening' && morningLocked) {
    combined = applyMorningBaselineToEveningRows(combined, workDate);
  }
  return combined.sort((a, b) => a.person.localeCompare(b.person) || a.project.localeCompare(b.project));
}

/** Morning snapshot fields stay fixed as the evening baseline once morning is locked. */
function applyMorningBaselineToEveningRows(rows: DailyStatusRow[], workDate: string): DailyStatusRow[] {
  const morningSnap = loadDailyStatusSnapshot(workDate, 'morning');
  if (!morningSnap?.length) return rows;
  const morningById = new Map(morningSnap.map((row) => [row.id, row]));
  return rows.map((row) => {
    if (row.rowKind === 'leave' || row.rowKind === 'permission') return row;
    const baseline = morningById.get(row.id);
    if (!baseline) return row;
    return {
      ...row,
      person: baseline.person,
      project: baseline.project,
      projectId: baseline.projectId,
      taskDescription: baseline.taskDescription,
      dependencyIds: baseline.dependencyIds,
      dependencies: baseline.dependencies,
      startDate: baseline.startDate,
      startDateIso: baseline.startDateIso,
      deadline: baseline.deadline,
      deadlineIso: baseline.deadlineIso,
      morningStatus: baseline.status,
      morningProgressPercent: baseline.progressPercent,
    };
  });
}

const MORNING_BASELINE_PATCH_KEYS = new Set([
  'description',
  'title',
  'project_name',
  'project_id',
  'start_date',
  'due_date',
  'depends_on_ids',
  'assigned_to_id',
]);

export function rejectMorningBaselinePatch(
  period: SnapshotPeriod | undefined,
  workDate: string,
  body: Record<string, unknown>
): string | null {
  if (period !== 'evening' || !isMorningStatusLocked(workDate)) return null;
  const blocked = Object.keys(body).filter((key) => MORNING_BASELINE_PATCH_KEYS.has(key));
  if (!blocked.length) return null;
  return MORNING_LOCKED_MESSAGE;
}

export function buildDailyStatusKpis(user: User, rows = visibleSheetRows(buildDailyStatusRows(user))): DailyStatusKpis {
  const today = todayIso();
  const summaryUpdates = store.getDailyUpdates().filter((item) => item.work_date === today && item.submission_status === 'SUBMITTED');
  const visibleProjectIds = new Set(
    store.getProjects().filter((project) => canViewProject(user, project)).map((project) => project.id)
  );
  const attention = rows.filter((row) => row.blocked || row.overdue || row.status === 'Hold');
  return {
    updatesToday: summaryUpdates.filter((item) => !item.project_id || visibleProjectIds.has(item.project_id) || item.user_id === user.id).length,
    pending: rows.filter((row) => row.status === 'Yet to Start' || row.status === 'In Progress').length,
    blocked: rows.filter((row) => row.status === 'Waiting' || row.blocked).length,
    completed: rows.filter((row) => row.status === 'Completed').length,
    projectsRequiringAttention: new Set(attention.map((row) => row.projectId || row.project)).size,
  };
}

function snapshotId(date: string, period: SnapshotPeriod) {
  return `${SNAPSHOT_PREFIX}${date}:${period}`;
}

export function saveDailyStatusSnapshot(user: User, period: SnapshotPeriod, date = todayIso()) {
  const rows = visibleSheetRows(buildDailyStatusRows(user, { date, period }));
  // Prefer force when unlocked so Save always refreshes the shared Email Reports source.
  const force = period !== 'morning' || loadMorningLockState(date)?.locked !== true;
  return persistDailyStatusSnapshot(date, period, rows, user.id, { force });
}

/** Persist the exact rows that were (or will be) mailed for morning/evening compare. */
export function persistDailyStatusSnapshot(
  date: string,
  period: SnapshotPeriod,
  rows: DailyStatusRow[],
  capturedBy = 'system',
  options?: { force?: boolean }
) {
  const records = store.getSystemMeta();
  const id = snapshotId(date, period);
  const existing = records.find((item) => item.id === id);
  const existingRows = (existing?.payload as { rows?: DailyStatusRow[] } | undefined)?.rows;
  if (period === 'morning' && !options?.force) {
    const frozen =
      loadMorningLockState(date)?.locked === true && Array.isArray(existingRows) && existingRows.length > 0;
    if (frozen) {
      return {
        date,
        period,
        rows: existingRows,
        captured_at: String((existing?.payload as { captured_at?: string } | undefined)?.captured_at || ''),
      };
    }
  }
  // Never replace a non-empty saved sheet with an empty capture during init/refresh.
  if (!options?.force && Array.isArray(existingRows) && existingRows.length > 0 && rows.length === 0) {
    return {
      date,
      period,
      rows: existingRows,
      captured_at: String((existing?.payload as { captured_at?: string } | undefined)?.captured_at || ''),
    };
  }
  const next = records.filter((item) => item.id !== id);
  const captured_at = new Date().toISOString();
  next.push({
    id,
    payloadType: 'DAILY_STATUS_SNAPSHOT',
    payload: {
      date,
      period,
      captured_at,
      captured_by: capturedBy,
      rows,
    },
  });
  store.saveSystemMeta(next);
  return { date, period, rows, captured_at };
}

export function loadDailyStatusSnapshot(date: string, period: SnapshotPeriod): DailyStatusRow[] | null {
  const record = store.getSystemMeta().find((item) => item.id === snapshotId(date, period));
  const rows = (record?.payload as { rows?: DailyStatusRow[] } | undefined)?.rows;
  return Array.isArray(rows) ? rows : null;
}

/** Prefer snapshot; else rows stored on outbound morning/evening mail bodies. */
export function loadMailedOrSnapshotRows(date: string, period: SnapshotPeriod): DailyStatusRow[] | null {
  const snap = loadDailyStatusSnapshot(date, period);
  if (snap?.length) return snap;
  const mailed = loadRowsFromOutboundMails(date, period);
  if (mailed?.length) return mailed;
  return snap;
}

function inferPeriodFromSubject(subject: string): SnapshotPeriod | null {
  if (/7:15|7\.15\s*pm|evening/i.test(subject)) return 'evening';
  if (/11:00|11:15|11\.00\s*am|11\.15\s*am|12:00|12\s*pm|noon|morning/i.test(subject)) return 'morning';
  return null;
}

function subjectMentionsReportDate(subject: string, date: string): boolean {
  if (!subject) return false;
  if (subject.includes(date)) return true;
  const display = formatSheetDate(date); // dd-mm-yyyy
  if (display !== '—' && subject.includes(display)) return true;
  const [y, m, d] = date.split('-');
  if (!y || !m || !d) return false;
  const monthIdx = Number(m) - 1;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mon = months[monthIdx];
  if (!mon) return false;
  const variants = [
    `${d}-${mon}-${y}`,
    `${d} ${mon} ${y}`,
    `${Number(d)} ${mon} ${y}`,
    `${d}/${m}/${y}`,
    `${d}-${m}-${y}`,
  ];
  return variants.some((value) => subject.includes(value));
}

function loadRowsFromOutboundMails(date: string, period: SnapshotPeriod): DailyStatusRow[] | null {
  const types = new Set(['DAILY_STATUS_REPORT', 'DAILY_STATUS_REPORT_SCHEDULED', 'DAILY_STATUS_REPORT_TEST']);
  const emails = store
    .getOutboundEmails()
    .filter((email) => types.has(String(email.email_type || '')))
    .slice()
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

  for (const email of emails) {
    const subject = String(email.subject || '');
    try {
      const parsed = JSON.parse(email.body || '{}') as {
        date?: string;
        period?: SnapshotPeriod | string;
        rows?: DailyStatusRow[];
        slot?: string;
      };
      if (Array.isArray(parsed.rows) && parsed.rows.length) {
        const parsedDate = parsed.date
          ? /^\d{4}-\d{2}-\d{2}/.test(parsed.date)
            ? parsed.date.slice(0, 10)
            : parseSheetDate(parsed.date)
          : null;
        const dateMatch =
          parsedDate === date ||
          (!parsedDate && subjectMentionsReportDate(subject, date));
        if (!dateMatch) continue;
        const inferredPeriod: SnapshotPeriod | null =
          parsed.period === 'morning' || parsed.period === 'evening'
            ? parsed.period
            : parsed.slot === 'noon'
              ? 'morning'
              : parsed.slot === 'evening'
                ? 'evening'
                : inferPeriodFromSubject(subject);
        if (inferredPeriod === period) return parsed.rows;
      }
    } catch {
      /* ignore non-json bodies */
    }

    if (subjectMentionsReportDate(subject, date) && inferPeriodFromSubject(subject) === period) {
      try {
        const parsed = JSON.parse(email.body || '{}') as { rows?: DailyStatusRow[] };
        if (Array.isArray(parsed.rows) && parsed.rows.length) return parsed.rows;
      } catch {
        /* no rows in body */
      }
    }
  }
  return null;
}

/** For a past date: overlay that day's submitted updates onto morning rows as evening state. */
function eveningRowsFromDayUpdates(date: string, morningRows: DailyStatusRow[]): DailyStatusRow[] | null {
  const updates = store
    .getDailyUpdates()
    .filter((item) => item.work_date === date && item.submission_status === 'SUBMITTED')
    .slice()
    .sort((a, b) => (b.submitted_at || b.updated_at || '').localeCompare(a.submitted_at || a.updated_at || ''));
  if (!updates.length) return null;

  const eveningPreferred = updates.filter((item) => item.period === 'evening');
  const pool = eveningPreferred.length ? eveningPreferred : updates;
  let applied = 0;
  const rows = morningRows.map((row) => {
    const update =
      pool.find((item) => item.task_id === row.id || item.assignment_id === row.id) ||
      pool.find(
        (item) =>
          item.user_id === row.personId &&
          (item.project_id === row.projectId || item.project_name === row.project || item.task_title === row.taskDescription)
      );
    if (!update) return { ...row, taskDescription: row.taskDescription };
    applied += 1;
    const status = toSheetStatus(update.work_status || row.status);
    const hours = Math.max(0, Number(update.hours_worked) || 0);
    return {
      ...row,
      taskDescription: row.taskDescription,
      currentUpdate: (update.work_completed || '').trim() || row.currentUpdate,
      eveningSubmitted: Boolean((update.work_completed || '').trim() || update.period === 'evening'),
      status,
      progressPercent: progressForSheetStatus(status, update.progress_percent ?? row.progressPercent),
      hoursWorked: hours || row.hoursWorked,
      loggedHours: hours ? formatLoggedHours(hours) : row.loggedHours,
      reasonForDelay: (update.blocker || row.reasonForDelay || '—').trim() || '—',
      workDate: date,
      latestUpdateAt: update.submitted_at || update.updated_at || row.latestUpdateAt,
    } satisfies DailyStatusRow;
  });
  return applied > 0 ? rows : null;
}

/**
 * Recreate missing task records from a saved morning/evening snapshot so the live
 * Daily Work Updates sheet can render the same rows after refresh/restart.
 */
export function rehydrateTasksFromSnapshot(rows: DailyStatusRow[] | null | undefined): number {
  if (!Array.isArray(rows) || !rows.length) return 0;
  const tasks = store.getTasks().slice();
  const users = store.getUsers();
  const now = new Date().toISOString();
  let changed = 0;
  for (const row of rows) {
    if (!row?.id || row.rowKind === 'leave' || row.rowKind === 'permission') continue;
    const description = String(row.taskDescription || '').trim();
    const existingIndex = tasks.findIndex((task) => task.id === row.id);
    if (existingIndex >= 0) {
      const existing = tasks[existingIndex];
      const currentText = String(existing.description || existing.title || '').trim();
      if (!currentText && description) {
        tasks[existingIndex] = {
          ...existing,
          description,
          title: description.slice(0, 120) || existing.title,
          updated_at: now,
        };
        changed += 1;
      }
      continue;
    }
    const assignee =
      users.find((item) => item.id === row.personId) ||
      users.find((item) => item.name === row.person || formatEmployeeDisplayName(item) === row.person);
    const status = fromSheetStatus(row.status);
    const task = {
      id: row.id,
      title: description.slice(0, 120) || 'Restored task',
      description: description || undefined,
      status,
      priority: 'Medium' as const,
      start_date: row.startDateIso || parseSheetDate(row.startDate) || undefined,
      due_date: row.deadlineIso || parseSheetDate(row.deadline) || undefined,
      assigned_to: assignee?.name || row.person,
      assigned_to_id: row.personId || assignee?.id || '',
      created_by: row.createdByName || 'Snapshot restore',
      created_by_id: row.createdById || 'snapshot-restore',
      project_id: row.projectId,
      project_name: row.project && row.project !== '—' ? row.project : undefined,
      task_type: row.taskType || (row.isLeadTask ? 'LEAD_TASK' : row.projectId ? 'PROJECT_TASK' : 'NON_PROJECT_TASK'),
      is_additional: Boolean(row.isAdditional),
      sheet_hidden: Boolean(row.sheetHidden),
      progress_percent: progressForSheetStatus(row.status, row.progressPercent),
      delay_reason: row.reasonForDelay && row.reasonForDelay !== 'No delay' ? row.reasonForDelay : undefined,
      depends_on_ids: Array.isArray(row.dependencyIds) ? row.dependencyIds : undefined,
      acceptance_status: row.acceptanceStatus,
      lead_name: row.leadName,
      comments: [],
      created_at: now,
      updated_at: now,
    } as Task;
    tasks.unshift(task);
    changed += 1;
  }
  if (changed) store.saveTasks(tasks);
  return changed;
}

export function ensureMorningSnapshot(user: User, date = todayIso()) {
  if (!isMorningStatusLocked(date)) return null;
  applyScheduledMorningLock(date);
  const existing = loadDailyStatusSnapshot(date, 'morning');
  const actor = globalSheetActor() || user;
  const live = visibleSheetRows(buildDailyStatusRows(actor, { date, period: 'morning' }));
  if (Array.isArray(existing) && existing.length > 0) {
    // Snapshot is the locked source of truth — restore any missing tasks into live store.
    rehydrateTasksFromSnapshot(existing);
    return existing;
  }
  // Empty or missing snapshot: capture from live when possible (do not freeze []).
  if (live.length) {
    return persistDailyStatusSnapshot(date, 'morning', live, 'morning-lock', { force: true }).rows;
  }
  return existing;
}

export function sheetPhase(date = todayIso()) {
  const clock = clockInAppTimezone();
  const lockState = loadMorningLockState(date);
  const companyLeave = isCompanyLeaveDay(date);
  const morningLocked = !companyLeave && isMorningStatusLocked(date);
  const scheduledLocked = !companyLeave && isMorningPhaseLocked(date);
  let lockSource: MorningLockSource | null = null;
  if (morningLocked) {
    lockSource = lockState?.locked === true && lockState.lock_source === 'manual' ? 'manual' : 'schedule';
  }
  return {
    date,
    timezone: clock.timezone,
    morningLocked,
    eveningOpen: !companyLeave && isEveningStatusOpen(date),
    companyLeave,
    companyLeaveMessage: companyLeave ? COMPANY_LEAVE_MESSAGE : undefined,
    lockHour: 11,
    lockSource,
    lockedAt: lockState?.locked_at,
    lockedByName: lockState?.locked_by_name,
    manuallyUnlocked: lockState?.locked === false,
    now: `${clock.date} ${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}`,
    delayReasonOptions: DELAY_REASON_OPTIONS,
    scheduledLocked,
  };
}

export function rowsForPeriod(user: User, period: SnapshotPeriod, date = todayIso()): {
  rows: DailyStatusRow[];
  source: 'snapshot' | 'live';
  available: boolean;
  message?: string;
} {
  if (isCompanyLeaveDay(date)) {
    return { rows: [], source: 'live', available: false, message: COMPANY_LEAVE_MESSAGE };
  }
  if (period === 'morning') {
    const frozen = ensureMorningSnapshot(user, date);
    if (frozen?.length && isMorningStatusLocked(date)) {
      return { rows: scopedDailyStatusRows(user, frozen), source: 'snapshot', available: true };
    }
    // Unlocked (or pre-lock): if live tasks were lost but a saved snapshot exists, restore it.
    const saved = loadDailyStatusSnapshot(date, 'morning');
    if (saved?.length) {
      rehydrateTasksFromSnapshot(saved);
      const live = visibleSheetRows(buildDailyStatusRows(user, { date, period: 'morning' }));
      if (live.length) {
        return { rows: live, source: 'live', available: true };
      }
      return { rows: scopedDailyStatusRows(user, saved), source: 'snapshot', available: true };
    }
  }
  if (period === 'evening' && isMorningStatusLocked(date)) {
    ensureMorningSnapshot(user, date);
  }
  // Evening reports always use live Daily Work Updates — never mailed/snapshot rows.
  return {
    rows: visibleSheetRows(buildDailyStatusRows(user, { date, period })),
    source: 'live',
    available: true,
  };
}

/** Morning email uses the locked snapshot; evening email uses live Daily Work Updates. */
export function rowsForEmailReport(
  user: User,
  period: SnapshotPeriod,
  date = todayIso(),
  options?: { preferLive?: boolean }
): {
  rows: DailyStatusRow[];
  source: 'snapshot' | 'live';
  available: boolean;
  message?: string;
} {
  if (isCompanyLeaveDay(date)) {
    return {
      rows: [],
      source: 'live',
      available: false,
      message: COMPANY_LEAVE_MESSAGE,
    };
  }
  if (period === 'morning' && !options?.preferLive) {
    const frozen = ensureMorningSnapshot(user, date);
    if (frozen?.length && isMorningStatusLocked(date)) {
      return { rows: scopedDailyStatusRows(user, frozen), source: 'snapshot', available: true };
    }
    const saved = loadDailyStatusSnapshot(date, 'morning');
    if (saved?.length) {
      rehydrateTasksFromSnapshot(saved);
      const live = visibleSheetRows(buildDailyStatusRows(user, { date, period: 'morning' }));
      if (live.length) {
        return { rows: live, source: 'live', available: true };
      }
      return { rows: scopedDailyStatusRows(user, saved), source: 'snapshot', available: true };
    }
  }
  if (period === 'evening' && isMorningStatusLocked(date)) {
    ensureMorningSnapshot(user, date);
  }
  return {
    rows: visibleSheetRows(buildDailyStatusRows(user, { date, period })),
    source: 'live',
    available: true,
  };
}

export type CompareKind =
  | 'Improved'
  | 'Completed'
  | 'No Change'
  | 'Hold'
  | 'Status Changed'
  | 'Deadline Changed'
  | 'Dependency Changed'
  | 'Task Description Changed';

export interface CompareItem {
  id: string;
  person: string;
  project: string;
  taskDescription: string;
  dependencies?: string;
  status: string;
  startDate?: string;
  taskDeadline?: string;
  currentUpdate: string;
  onTimeDelay?: string;
  progressPercent?: number;
  reasonForDelay?: string;
  loggedHours?: string;
  hoursWorked?: number;
  kinds: CompareKind[];
  morningUpdate?: string;
  eveningUpdate?: string;
  morningStatus?: string;
  eveningStatus?: string;
  morningProgressPercent?: number;
  eveningProgressPercent?: number;
  morningHours?: string;
  eveningHours?: string;
  eveningSubmitted?: boolean;
  morningDeadline?: string;
  eveningDeadline?: string;
  morningDependencies?: string;
  eveningDependencies?: string;
}

function delayLabel(row?: DailyStatusRow): string {
  if (!row) return '—';
  if (row.status === 'Completed') return 'On Time';
  if (row.status === 'Hold') return 'Hold';
  if (row.overdue) return 'Delay';
  return 'On Time';
}

function compareKinds(morning?: DailyStatusRow, evening?: DailyStatusRow): CompareKind[] {
  if (!morning || !evening) return ['No Change'];
  const kinds: CompareKind[] = [];
  if (morning.status !== evening.status) {
    if (evening.status === 'Completed') kinds.push('Completed', 'Improved');
    else if (evening.status === 'Hold') kinds.push('Hold');
    else if (morning.status === 'Yet to Start' && evening.status === 'In Progress') kinds.push('Improved', 'Status Changed');
    else kinds.push('Status Changed');
  }
  if (morning.deadline !== evening.deadline) kinds.push('Deadline Changed');
  if (morning.dependencies !== evening.dependencies) kinds.push('Dependency Changed');
  if (morning.taskDescription !== evening.taskDescription) kinds.push('Task Description Changed');
  if (!kinds.length) kinds.push('No Change');
  return [...new Set(kinds)];
}

function resolveCompareDate(requested?: string): string {
  if (requested && /^\d{4}-\d{2}-\d{2}$/.test(requested)) return requested;
  const today = todayIso();
  const yesterday = yesterdayIso();
  // Prefer today when morning (or evening) mail exists; otherwise fall back to previous day.
  if (periodRowsAvailable(today, 'morning') || periodRowsAvailable(today, 'evening')) return today;
  if (periodRowsAvailable(yesterday, 'morning') && periodRowsAvailable(yesterday, 'evening')) return yesterday;
  return today;
}

export function compareSnapshots(
  user: User,
  date?: string
): { items: CompareItem[]; available: boolean; date: string; message?: string } {
  const resolved = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayIso();
  ensureMorningSnapshot(user, resolved);

  const allUpdates = store
    .getDailyUpdates()
    .filter((item) => item.work_date === resolved && item.submission_status === 'SUBMITTED');
  const allUsers = store.getUsers();
  const projects = store.getProjects();
  const morningSnapRows = loadMailedOrSnapshotRows(resolved, 'morning') || [];
  const eveningSnapRows = loadMailedOrSnapshotRows(resolved, 'evening') || [];

  const liveMorning = visibleSheetRows(buildDailyStatusRows(user, { date: resolved, period: 'morning' }));
  const liveEvening = visibleSheetRows(buildDailyStatusRows(user, { date: resolved, period: 'evening' }));
  const morningList = morningSnapRows.length ? morningSnapRows : liveMorning;
  const dayOverlayRows = eveningRowsFromDayUpdates(resolved, morningList) || [];
  const dayOverlayById = new Map(dayOverlayRows.map((row) => [row.id, row]));
  const scopedMorning = canSeeAllDailyStatusRows(user)
    ? morningList
    : morningList.filter((row) => row.personId === user.id || row.createdById === user.id);

  const items: CompareItem[] = scopedMorning
    .filter((row) => row.id && row.rowKind !== 'leave' && !String(row.id).startsWith('leave:'))
    .map((morningRow) => {
      const task = store.getTasks().find((item) => item.id === morningRow.id);
      const employeeId = morningRow.personId || task?.assigned_to_id || '';
      const assignee = allUsers.find((item) => item.id === employeeId);
      const personName = morningRow.person || formatEmployeeDisplayName(assignee || task?.assigned_to);

      const isLeadTask = Boolean(task && (isLeadBasedTask(task) || task.task_type === 'LEAD_TASK'));
      const lead = task?.lead_id ? store.getLeads().find((item) => item.id === task.lead_id) : undefined;
      const leadLabel = isLeadTask
        ? [lead?.lead_number, task?.lead_name || lead?.title].filter(Boolean).join(' • ')
        : '';
      const project = task?.project_id ? projects.find((item) => item.id === task.project_id) : undefined;
      const projectName =
        morningRow.project ||
        (isLeadTask ? leadLabel || task?.lead_name || task?.title : project?.name || task?.project_name || '—');

      const masterDesc = masterTaskDescription(
        task || ({ description: morningRow.taskDescription, title: morningRow.taskDescription } as Task),
        morningRow
      );

      const eveningSnapRow = eveningSnapRows.find((row) => row.id === morningRow.id);
      const liveEveningRow = liveEvening.find((row) => row.id === morningRow.id);
      const dayOverlayRow = dayOverlayById.get(morningRow.id);
      const taskUpdates = task ? updatesForTask(task, allUpdates) : [];
      const { text: resolvedEveningText, update: eveningUpd } = resolveEveningNarrative({
        masterDesc,
        taskUpdates,
        workDate: resolved,
        employeeId,
        eveningSnapRow,
        liveEveningRow,
        dayOverlayRow,
      });
      const eveningText = resolvedEveningText || '';
      const eveningSubmitted = Boolean(
        (eveningUpd && periodOfUpdate(eveningUpd) === 'evening') || Boolean(eveningText)
      );
      const currentUpdateText = eveningText;
      const morningHours = parseHoursWorkedValue(morningRow.hoursWorked) || parseHoursWorkedValue(morningRow.loggedHours);
      const hoursWorked = Math.max(
        parseHoursWorkedValue(eveningUpd?.hours_worked),
        parseHoursWorkedValue(eveningSnapRow?.hoursWorked),
        parseHoursWorkedValue(eveningSnapRow?.loggedHours),
        parseHoursWorkedValue(liveEveningRow?.hoursWorked),
        parseHoursWorkedValue(dayOverlayRow?.hoursWorked)
      );
      const status = task
        ? eveningSheetStatus(task, eveningUpd, eveningSnapRow || liveEveningRow || dayOverlayRow, hoursWorked)
        : toSheetStatus(eveningUpd?.work_status || eveningSnapRow?.status || morningRow.status);
      const reasonForDelay = (
        eveningUpd?.blocker ||
        eveningSnapRow?.reasonForDelay ||
        liveEveningRow?.reasonForDelay ||
        (task ? delayReason(task, eveningUpd) : morningRow.reasonForDelay) ||
        'No delay'
      ).trim() || 'No delay';
      const progress = progressForSheetStatus(
        status,
        eveningUpd?.progress_percent ??
          eveningSnapRow?.progressPercent ??
          liveEveningRow?.progressPercent ??
          task?.progress_percent ??
          morningRow.progressPercent
      );
      const onTimeDelay =
        status === 'Completed' ? 'On Time' : status === 'Hold' ? 'Hold' : task && isOverdue(task, resolved) ? 'Delay' : 'On Time';
      const depsText = task
        ? formatDependencies(dependencyIdsOf(task), allUsers, eveningUpd?.dependency || eveningSnapRow?.dependencies || morningRow.dependencies)
        : morningRow.dependencies;

      return {
        id: morningRow.id,
        person: personName,
        project: projectName || '—',
        taskDescription: masterDesc,
        dependencies: depsText,
        status,
        startDate: morningRow.startDate || (task ? formatSheetDate(task.start_date) : '—'),
        taskDeadline: morningRow.deadline || (task ? formatSheetDate(task.due_date) : '—'),
        currentUpdate: currentUpdateText,
        onTimeDelay,
        progressPercent: progress,
        reasonForDelay,
        loggedHours: formatLoggedHours(hoursWorked),
        hoursWorked,
        kinds: compareKinds(morningRow, {
          ...morningRow,
          status,
          progressPercent: progress,
          hoursWorked,
          taskDescription: masterDesc,
        }),
        morningStatus: morningRow.status,
        eveningStatus: status,
        morningProgressPercent: progressForSheetStatus(morningRow.status, morningRow.progressPercent),
        eveningProgressPercent: progress,
        morningHours: formatLoggedHours(morningHours),
        eveningHours: formatLoggedHours(hoursWorked),
        eveningSubmitted,
        morningUpdate: masterDesc,
        eveningUpdate: currentUpdateText,
      };
    })
    .sort((a, b) => a.person.localeCompare(b.person) || a.project.localeCompare(b.project));

  return {
    items,
    available: true,
    date: resolved,
  };
}

function workStatusFromTask(task: Task): DailyUpdate['work_status'] {
  if (task.status === 'DONE') return 'COMPLETED';
  if (task.status === 'IN_PROGRESS') return 'IN_PROGRESS';
  if (task.status === 'BLOCKED' || task.status === 'WAITING' || task.status === 'HOLD') return 'BLOCKED';
  return 'NOT_STARTED';
}

function upsertDailyPeriodRecord(
  actor: User,
  taskId: string,
  workDate: string,
  period: SnapshotPeriod,
  patch: {
    work_completed?: string;
    hours_worked?: number;
    progress_percent?: number;
    work_status?: DailyUpdate['work_status'];
    blocker?: string;
  }
): { ok: true; update: DailyUpdate } | { ok: false; error: string; status?: number } {
  const task = store.getTasks().find((item) => item.id === taskId);
  if (!task) return { ok: false, error: 'not_found', status: 404 };
  if (!canSeeDailyStatusTask(actor, task) && task.assigned_to_id !== actor.id) {
    return { ok: false, error: 'forbidden', status: 403 };
  }
  if (!canMutateWorkTask(actor, task)) {
    return {
      ok: false,
      error: 'Accept this task before logging hours or editing it.',
      status: 403,
    };
  }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(workDate) ? workDate : todayIso();
  const updateType = period === 'evening' ? 'EVENING' : 'MORNING';
  const now = new Date().toISOString();
  const updates = store.getDailyUpdates();
  const employeeId = task.assigned_to_id || actor.id;
  const existing =
    updates.find(
      (item) =>
        (item.task_id === taskId || item.assignment_id === taskId) &&
        item.work_date === date &&
        periodOfUpdate(item) === period &&
        item.user_id === employeeId
    ) ||
    updates.find(
      (item) =>
        (item.task_id === taskId || item.assignment_id === taskId) &&
        item.work_date === date &&
        periodOfUpdate(item) === period
    );

  if (existing) {
    const next: DailyUpdate = {
      ...existing,
      user_id: employeeId,
      period,
      update_type: updateType,
      updated_at: now,
    };
    if (patch.hours_worked !== undefined) {
      next.hours_worked = Math.max(0, Number(patch.hours_worked) || 0);
      if (!patch.work_completed) {
        next.summary = `Logged ${formatLoggedHours(next.hours_worked)} via Daily Work Updates (${period}).`;
      }
    }
    if (patch.progress_percent !== undefined) {
      next.progress_percent = Math.max(0, Math.min(100, Number(patch.progress_percent) || 0));
    }
    if (patch.work_completed !== undefined) {
      next.work_completed = patch.work_completed;
      next.summary = patch.work_completed || next.summary;
      next.submission_status = 'SUBMITTED';
      next.submitted_at = next.submitted_at || now;
    }
    if (patch.work_status !== undefined) {
      next.work_status = patch.work_status;
    }
    if (patch.blocker !== undefined) {
      next.blocker = patch.blocker;
    }
    const index = updates.findIndex((item) => item.id === existing.id);
    updates[index] = next;
    store.saveDailyUpdates(updates);
    return { ok: true, update: next };
  }

  const project = task.project_id ? store.getProjects().find((item) => item.id === task.project_id) : undefined;
  const assignee = store.findUserById(task.assigned_to_id) || actor;
  const hours = Math.max(0, Number(patch.hours_worked) || 0);
  const workCompleted = patch.work_completed ?? '';
  const created: DailyUpdate = {
    id: `upd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    user_id: assignee.id,
    user_name: assignee.name,
    user_role: assignee.role_name,
    team_id: assignee.team_id,
    team_name: assignee.team_name,
    assignment_id: task.id,
    assignment_source: 'TASK',
    task_id: task.id,
    lead_id: task.lead_id || project?.lead_id,
    lead_number: project?.lead_number,
    project_id: project?.id,
    project_code: project?.code,
    project_name: project?.name || task.project_name || '—',
    customer_name: project?.customer_name || '',
    task_title: task.title,
    work_date: date,
    work_completed: workCompleted,
    progress_percent:
      patch.progress_percent != null
        ? Math.max(0, Math.min(100, Number(patch.progress_percent) || 0))
        : task.progress_percent ?? 0,
    hours_worked: hours,
    work_status: patch.work_status ?? workStatusFromTask(task),
    blocker: patch.blocker,
    next_plan: '—',
    attachments: [],
    submission_status: 'SUBMITTED',
    submitted_at: now,
    summary: workCompleted
      ? workCompleted
      : `Logged ${formatLoggedHours(hours)} via Daily Work Updates (${period}).`,
    period,
    update_type: updateType,
    created_at: now,
    updated_at: now,
  };
  updates.unshift(created);
  store.saveDailyUpdates(updates);
  return { ok: true, update: created };
}

/** Upsert morning/evening DailyUpdate hours for a task on the selected work date. */
export function upsertLoggedHoursForTask(
  actor: User,
  taskId: string,
  hoursWorked: number,
  workDate = todayIso(),
  period?: SnapshotPeriod
) {
  return upsertDailyPeriodRecord(actor, taskId, workDate, period || inferDefaultEmailPeriod(), { hours_worked: hoursWorked });
}

export function upsertProgressForTask(
  actor: User,
  taskId: string,
  progressPercent: number,
  workDate = todayIso(),
  period?: SnapshotPeriod
) {
  const task = store.getTasks().find((item) => item.id === taskId);
  return upsertDailyPeriodRecord(actor, taskId, workDate, period || inferDefaultEmailPeriod(), {
    progress_percent: Math.max(0, Math.min(100, Number(progressPercent) || 0)),
    work_status: task ? workStatusFromTask(task) : undefined,
  });
}

/** Keep the morning/evening daily-update row aligned with the master task after sheet edits. */
export function syncPeriodRecordFromTask(
  actor: User,
  taskId: string,
  workDate: string,
  period?: SnapshotPeriod,
  task?: Task
) {
  const resolvedTask = task || store.getTasks().find((item) => item.id === taskId);
  if (!resolvedTask) return { ok: false as const, error: 'not_found', status: 404 };
  return upsertDailyPeriodRecord(actor, taskId, workDate, period || inferDefaultEmailPeriod(), {
    work_status: workStatusFromTask(resolvedTask),
    progress_percent: resolvedTask.progress_percent ?? 0,
    blocker: resolvedTask.delay_reason || undefined,
  });
}

/** Save Evening narrative onto the same task/employee/date. Does not modify the master task. */
export function upsertEveningWorkCompleted(
  actor: User,
  taskId: string,
  workCompleted: string,
  workDate = todayIso()
) {
  return upsertDailyPeriodRecord(actor, taskId, workDate, 'evening', {
    work_completed: workCompleted.trim(),
  });
}

function statusBadgeStyle(status: DailySheetStatus): { bg: string; color: string } {
  if (status === 'Completed') return { bg: '#dcfce7', color: '#166534' };
  if (status === 'In Progress') return { bg: '#dbeafe', color: '#1d4ed8' };
  if (status === 'Waiting') return { bg: '#ffedd5', color: '#9a3412' };
  if (status === 'Hold') return { bg: '#fef3c7', color: '#92400e' };
  return { bg: '#f8fafc', color: '#334155' };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatSubjectDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(+date)) return value;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(date.getDate()).padStart(2, '0')}-${months[date.getMonth()]}-${date.getFullYear()}`;
}

function emailPeriodCopy(period: SnapshotPeriod, reportLabel?: string) {
  const isMorning = period === 'morning';
  const reportTitle =
    reportLabel || (isMorning ? 'Morning Status Report' : 'Evening Status Report');
  return {
    reportTitle,
    periodWord: isMorning ? 'morning' : 'evening',
    greeting: 'Dear Team,',
    intro: `Please find the ${reportTitle} below. This table uses the same Daily Work Updates records as the hub.`,
  };
}

/** Evening reports keep the master task description and append submitted evening work below it. */
function emailTaskDescriptionText(row: DailyStatusRow, period: SnapshotPeriod): string {
  const master = (row.taskDescription || '').trim() || '—';
  if (period !== 'evening') return master;
  const evening = (row.currentUpdate || '').trim();
  if (!evening) return master;
  return `${master}\n\nEvening Work Completed:\n${evening}`;
}

function emailTaskDescriptionHtml(row: DailyStatusRow, period: SnapshotPeriod): string {
  const master = escapeHtml((row.taskDescription || '').trim() || '—');
  if (period !== 'evening') return master;
  const evening = (row.currentUpdate || '').trim();
  if (!evening) return master;
  return `${master}<div style="margin-top:8px;padding-top:8px;border-top:1px solid #e2e8f0;"><div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.04em;color:#64748b;margin-bottom:4px;">Evening Work Completed</div><div>${escapeHtml(evening)}</div></div>`;
}

export function inferDefaultEmailPeriod(now = new Date()): SnapshotPeriod {
  return clockInAppTimezone(now).hour >= 11 ? 'evening' : 'morning';
}

export function renderDailyStatusEmailHtml(params: {
  period: SnapshotPeriod;
  date: string;
  rows: DailyStatusRow[];
  recipientName: string;
  reportLabel?: string;
  subjectOverride?: string;
}): { html: string; text: string; subject: string } {
  const copy = emailPeriodCopy(params.period, params.reportLabel);
  const today = params.date || todayIso();
  const subject =
    (params.subjectOverride || '').trim() || `${copy.reportTitle} - ${formatSubjectDate(today)}`;
  const reportDate = formatSheetDate(today);
  const headerCell =
    'padding:10px 8px;background:#facc15;color:#0f172a;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.02em;border:1px solid #d4a017;text-align:center;white-space:nowrap;vertical-align:middle;height:40px;';
  const cell =
    'padding:10px 8px;border:1px solid #d8dee6;font-size:12px;line-height:1.4;color:#0f172a;vertical-align:top;word-wrap:break-word;overflow-wrap:break-word;';
  const personCell = `${cell}font-weight:700;text-align:center;background:#fffef6;white-space:nowrap;vertical-align:middle;`;
  const statusCell = `${cell}text-align:center;white-space:nowrap;`;
  const dateCell = `${cell}text-align:center;white-space:nowrap;`;
  const hoursCell = `${cell}text-align:center;white-space:nowrap;`;
  const depsCell = `${cell}`;
  const delayCell = `${cell}text-align:center;white-space:nowrap;`;
  const sorted = [...params.rows].sort(
    (a, b) => a.person.localeCompare(b.person) || a.project.localeCompare(b.project) || a.id.localeCompare(b.id)
  );
  const groups: Array<{ person: string; personId: string; rows: DailyStatusRow[] }> = [];
  for (const row of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.personId === row.personId) last.rows.push(row);
    else groups.push({ person: row.person, personId: row.personId, rows: [row] });
  }
  const formatDepsHtml = (value: string) => {
    const parts = value
      .split(/[,;]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (!parts.length || parts[0] === '—') return '—';
    return parts.map((part) => escapeHtml(part)).join('<br />');
  };
  const rowsHtml = groups
    .map((group) =>
      group.rows
        .map((row, index) => {
          const badge = statusBadgeStyle(row.status);
          const personTd =
            index === 0
              ? `<td width="110" style="${personCell}" rowspan="${group.rows.length}">${escapeHtml(group.person)}</td>`
              : '';
          const deadlineStyle = deadlineInlineStyle(
            deadlineTone(row.status, row.deadlineIso || row.deadline, today)
          );
          const statusLabel = escapeHtml(row.status).replace(/ /g, '&nbsp;');
          const startDate = escapeHtml(row.startDate || '—').replace(/-/g, '&#8209;');
          const deadline = escapeHtml(row.deadline).replace(/-/g, '&#8209;');
          const hours = escapeHtml(row.loggedHours || formatLoggedHours(row.hoursWorked));
          const progress = progressForSheetStatus(row.status, row.progressPercent);
          const progressBar = `<div style="width:100%;height:6px;background:#e2e8f0;border-radius:999px;overflow:hidden;"><div style="width:${progress}%;height:100%;background:${progress >= 100 ? '#16a34a' : '#2563eb'};"></div></div><div style="margin-top:4px;font-size:11px;font-weight:700;color:${progress >= 100 ? '#166534' : '#1d4ed8'};">${progress}%</div>`;
          return `<tr>
        ${personTd}
        <td width="140" style="${cell}">${escapeHtml(row.project)}</td>
        <td width="260" style="${cell}">${emailTaskDescriptionHtml(row, params.period)}</td>
        <td width="130" style="${depsCell}">${formatDepsHtml(row.dependencies)}</td>
        <td width="100" style="${statusCell}"><span style="display:inline-block;padding:4px 8px;border-radius:999px;background:${badge.bg};color:${badge.color};font-size:11px;font-weight:700;line-height:1.2;white-space:nowrap;">${statusLabel}</span></td>
        <td width="95" style="${dateCell}">${startDate}</td>
        <td width="95" style="${dateCell}${deadlineStyle}">${deadline}</td>
        <td width="90" style="${hoursCell}">${progressBar}<div style="margin-top:4px;font-size:11px;font-weight:600;">${hours}</div></td>
        <td width="150" style="${delayCell}">${escapeHtml(row.reasonForDelay)}</td>
      </tr>`;
        })
        .join('')
    )
    .join('');
  const empty = `<tr><td colspan="9" style="${cell}text-align:center;color:#64748b;">No tasks found.</td></tr>`;
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#F4F7FB;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F4F7FB;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="1280" cellspacing="0" cellpadding="0" style="width:1280px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;">
          <tr>
            <td style="background:#0B1F3A;padding:18px 22px;color:#ffffff;border-radius:12px 12px 0 0;">
              <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#facc15;">CareYu Automation</div>
              <div style="font-size:20px;font-weight:700;margin-top:4px;">${escapeHtml(copy.reportTitle)}</div>
              <div style="font-size:13px;color:#cbd5e1;margin-top:4px;">Report date: ${escapeHtml(reportDate)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 22px 8px;font-size:14px;line-height:1.6;color:#0f172a;">
              <div style="font-weight:700;margin-bottom:8px;">${escapeHtml(copy.greeting)}</div>
              <div>${escapeHtml(copy.intro)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 16px 24px;">
              <table role="presentation" width="1280" cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:1280px;table-layout:fixed;mso-table-lspace:0pt;mso-table-rspace:0pt;">
                <thead>
                  <tr>
                    <th width="110" style="${headerCell}">Person</th>
                    <th width="140" style="${headerCell}">Project</th>
                    <th width="260" style="${headerCell}">Task Description</th>
                    <th width="130" style="${headerCell}">Dependencies</th>
                    <th width="100" style="${headerCell}">Status</th>
                    <th width="95" style="${headerCell}">Start Date</th>
                    <th width="95" style="${headerCell}">Task Deadline</th>
                    <th width="90" style="${headerCell}">Logged Hours</th>
                    <th width="150" style="${headerCell}">Reason For Delay</th>
                  </tr>
                </thead>
                <tbody>
                  ${sorted.length ? rowsHtml : empty}
                </tbody>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 22px 20px;font-size:14px;line-height:1.6;color:#0f172a;">
              <div>Regards,</div>
              <div style="font-weight:700;margin-top:4px;">Automation Team</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  const text = [
    copy.reportTitle,
    `Report date: ${reportDate}`,
    '',
    copy.greeting,
    copy.intro,
    '',
    ...sorted.map(
      (row) =>
        `${row.person} | ${row.project} | ${emailTaskDescriptionText(row, params.period)} | ${row.dependencies} | ${row.status} | ${row.startDate || '—'} | ${row.deadline} | ${progressForSheetStatus(row.status, row.progressPercent)}% ${row.loggedHours || formatLoggedHours(row.hoursWorked)} | ${row.reasonForDelay}`
    ),
    '',
    'Regards,',
    'Automation Team',
  ].join('\n');
  return { html, text, subject };
}

export async function sendDailyStatusReport(params: {
  actor: User;
  period: SnapshotPeriod;
  toEmail?: string;
  date?: string;
  fromEmail?: string;
  fromName?: string;
  ccEmails?: string[];
  bccEmails?: string[];
}) {
  const date = params.date || todayIso();
  const packed = rowsForEmailReport(params.actor, params.period, date);
  // Freeze the exact mailed rows so Compare can show morning vs evening mail text.
  persistDailyStatusSnapshot(date, params.period, packed.rows, params.actor.id);
  const toEmail = (params.toEmail || params.actor.email || '').trim().toLowerCase();
  const rendered = renderDailyStatusEmailHtml({
    period: params.period,
    date,
    rows: packed.rows,
    recipientName: formatEmployeeDisplayName(params.actor),
  });
  const result = await sendEmail({
    toEmail,
    toName: params.actor.name,
    toUserId: params.actor.id,
    subject: rendered.subject,
    htmlContent: rendered.html,
    text: rendered.text,
    emailChannel: 'INTERNAL',
    emailType: 'DAILY_STATUS_REPORT',
    fromEmail: params.fromEmail,
    fromName: params.fromName,
    ccEmails: params.ccEmails,
    bccEmails: params.bccEmails,
  });
  const emails = store.getOutboundEmails();
  if (emails[0]?.email_type === 'DAILY_STATUS_REPORT') {
    store.saveOutboundEmails([
      {
        ...emails[0],
        body: JSON.stringify({ date, period: params.period, html: rendered.html, rows: packed.rows }),
      },
      ...emails.slice(1),
    ]);
  }
  return { result, html: rendered.html, subject: rendered.subject, rows: packed.rows, date, period: params.period };
}

export function restoreDailyStatusReport(): {
  html: string;
  subject: string;
  date?: string;
  period?: SnapshotPeriod;
  rows?: DailyStatusRow[];
} | null {
  const latest = store
    .getOutboundEmails()
    .find(
      (item) =>
        item.email_type === 'DAILY_STATUS_REPORT_SCHEDULED' ||
        item.email_type === 'DAILY_STATUS_REPORT_TEST' ||
        item.email_type === 'DAILY_STATUS_REPORT'
    );
  if (!latest) return null;
  try {
    const parsed = JSON.parse(latest.body || '{}') as {
      html?: string;
      date?: string;
      period?: SnapshotPeriod;
      rows?: DailyStatusRow[];
    };
    if (parsed.html) {
      return {
        html: parsed.html,
        subject: latest.subject,
        date: parsed.date,
        period: parsed.period,
        rows: parsed.rows,
      };
    }
  } catch {
    /* use body as html */
  }
  if (!latest.body) return null;
  return { html: latest.body, subject: latest.subject };
}

type DirectoryPerson = { id: string; name: string; displayName: string; email: string; role_name: string };

function isRemovedDirectoryPerson(user: { name?: string; email?: string }): boolean {
  const given = personGivenKey(user.name);
  const local = String(user.email || '')
    .split('@')[0]
    .toLowerCase();
  const email = String(user.email || '').trim().toLowerCase();
  // Only hide Sanjay / Aravind. Do not hide by "fsd*" email locals — live accounts
  // use fsdlead1 (Arun) and fsdengg1 (Kabitha), and they must stay in pickers.
  return given === 'sanjay' || given === 'aravind' || local === 'sanjay' || local === 'aravind' || email === 'sanjay@careyu.ai' || email === 'aravind@careyu.ai';
}

function toDirectoryPerson(user: User): DirectoryPerson {
  return {
    id: user.id,
    name: user.name,
    displayName: formatEmployeeDisplayName(user),
    email: user.email,
    role_name: user.role_name,
  };
}

const SHEET_PICKER_EMAILS = new Set([
  'robottech@careyu.ai',
  'fsdlead1@careyu.ai',
  'arun@careyu.ai',
  'kabitha@careyu.ai',
  'fsdengg1@careyu.ai',
  'raja@careyu.ai',
  'projects@careyu.ai',
]);

const SHEET_PICKER_NAMES = new Set(['aakash', 'arun', 'kabitha', 'raja', 'vanippriya', 'vani']);

export function directoryPeople(): DirectoryPerson[] {
  const active = store.getUsers().filter((user) => user.status === 'ACTIVE' && !isRemovedDirectoryPerson(user));
  return dedupeByStableId(active, (user) => user.id)
    .map(toDirectoryPerson)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** People pickers for the sheet: directory + anyone already assigned or listed as a dependency. */
export function peopleForDailySheet(rows: DailyStatusRow[]): DirectoryPerson[] {
  const people = directoryPeople();
  const byId = new Map(people.map((person) => [person.id, person]));

  const pushPerson = (entry: DirectoryPerson) => {
    if (!entry.id || byId.has(entry.id)) return;
    byId.set(entry.id, entry);
    people.push(entry);
  };

  const ensureUser = (user: User) => {
    if (isRemovedDirectoryPerson(user)) return;
    pushPerson(toDirectoryPerson(user));
  };

  // Always keep known functional leads/members selectable (Aakash, Arun, …).
  for (const user of store.getUsers()) {
    if (user.status !== 'ACTIVE') continue;
    const email = String(user.email || '').trim().toLowerCase();
    const given = personGivenKey(user.name);
    if (SHEET_PICKER_EMAILS.has(email) || SHEET_PICKER_NAMES.has(given) || user.role_code === 'TEAM_LEAD') {
      ensureUser(user);
    }
  }

  const ensureId = (idRaw: string, fallbackName?: string) => {
    const id = String(idRaw || '').trim();
    if (!id || byId.has(id)) return;
    const user = store.getUsers().find((item) => item.id === id);
    if (user) {
      // Assignees/deps on the sheet must remain selectable even if directory hide rules change.
      pushPerson(toDirectoryPerson(user));
      return;
    }
    const byName = fallbackName
      ? store.getUsers().find((item) => item.status === 'ACTIVE' && personGivenKey(item.name) === personGivenKey(fallbackName))
      : undefined;
    if (byName && !isRemovedDirectoryPerson(byName)) {
      // Prefer the live directory person when the task points at an orphan id.
      pushPerson(toDirectoryPerson(byName));
    }
    pushPerson({
      id,
      name: fallbackName || id,
      displayName: formatEmployeeDisplayName(fallbackName || id),
      email: '',
      role_name: '',
    });
  };

  for (const row of rows) {
    ensureId(row.personId, row.person);
    for (const depId of row.dependencyIds || []) ensureId(depId);
  }

  return people.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function delayReasonMissingForTask(task: Task, workDate = todayIso(), incomingReason?: string) {
  const completed = task.status === 'DONE';
  const overdue = isOverdue(task, workDate);
  const existing = normalizeDelayReason(incomingReason) || normalizeDelayReason(task.delay_reason);
  return delayReasonRequired(existing, overdue, completed);
}

export function visibleProjects(user: User): Project[] {
  return store.getProjects().filter((project) => canViewProject(user, project));
}
