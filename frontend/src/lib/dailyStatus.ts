import type { CSSProperties } from 'react';

export type DailySheetStatus = 'Yet to Start' | 'In Progress' | 'Waiting' | 'Completed' | 'Hold';
export type SnapshotPeriod = 'morning' | 'evening';

export type DeadlineTone = 'completed' | 'hold' | 'delay-1' | 'delay-2plus' | 'normal';

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
  hoursWorked?: number;
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
  hoursWorked?: number;
  loggedHours?: string;
  workDate?: string;
  latestUpdateAt?: string;
  currentUpdate?: string;
  morningStatus?: DailySheetStatus;
  eveningStatus?: DailySheetStatus;
  subtasks?: DailyStatusSubtask[];
  hasSubtasks?: boolean;
  sheetHidden?: boolean;
  isLeadTask?: boolean;
  taskType?: 'PROJECT_TASK' | 'NON_PROJECT_TASK' | 'LEAD_TASK';
  leadNumber?: string;
  leadName?: string;
  acceptanceStatus?: 'REQUESTED' | 'ACCEPTED' | 'REJECTED';
  createdById?: string;
  createdByName?: string;
  canEdit?: boolean;
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

export interface DailyStatusPerson {
  id: string;
  name: string;
  displayName: string;
  email: string;
  role_name: string;
}

export const SHEET_STATUSES: DailySheetStatus[] = [
  'Yet to Start',
  'In Progress',
  'Waiting',
  'Completed',
  'Hold',
];

export function toSheetStatus(status?: string): DailySheetStatus {
  const value = (status || '').toUpperCase().replace(/\s+/g, '_');
  if (value === 'DONE' || value === 'COMPLETED') return 'Completed';
  if (value === 'IN_PROGRESS' || value === 'WORK_IN_PROGRESS') return 'In Progress';
  if (value === 'HOLD' || value === 'ON_HOLD') return 'Hold';
  if (value === 'WAITING' || value === 'BLOCKED') return 'Waiting';
  if (value === 'YET_TO_START' || value === 'TODO' || value === 'NOT_STARTED') return 'Yet to Start';
  return 'Yet to Start';
}

export function fromSheetStatus(status: string): 'TODO' | 'IN_PROGRESS' | 'DONE' | 'WAITING' | 'HOLD' {
  if (status === 'Completed' || status === 'DONE' || status === 'COMPLETED') return 'DONE';
  if (status === 'In Progress' || status === 'IN_PROGRESS') return 'IN_PROGRESS';
  if (status === 'Hold' || status === 'HOLD') return 'HOLD';
  if (status === 'Waiting' || status === 'WAITING' || status === 'BLOCKED') return 'WAITING';
  return 'TODO';
}

export function clampProgressPercent(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** In Progress / Hold / Waiting never display 100%. Completed is always 100%. */
export function progressForSheetStatus(status?: string, value?: unknown): number {
  const sheet = SHEET_STATUSES.includes(status as DailySheetStatus) ? (status as DailySheetStatus) : toSheetStatus(status);
  const stored = clampProgressPercent(value);
  if (sheet === 'Completed') return 100;
  if (sheet === 'Yet to Start') return 0;
  return Math.min(99, stored);
}

export function sheetStatusClass(status: string): string {
  if (status === 'Completed') return 'border-[#86efac] bg-[#dcfce7] text-[#166534]';
  if (status === 'In Progress') return 'border-[#93c5fd] bg-[#dbeafe] text-[#1d4ed8]';
  if (status === 'Waiting') return 'border-[#fdba74] bg-[#ffedd5] text-[#9a3412]';
  if (status === 'Hold') return 'border-[#f59e0b] bg-[#fef3c7] text-[#92400e]';
  return 'border-[#cbd5e1] bg-[#f8fafc] text-[#334155]';
}

export function parseSheetDate(value?: string): string | null {
  if (!value || value === '—') return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const match = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  const date = new Date(value);
  if (Number.isNaN(+date)) return null;
  return date.toISOString().slice(0, 10);
}

export function formatSheetDate(value?: string): string {
  const iso = parseSheetDate(value);
  if (!iso) return value && value !== '—' ? value : '—';
  const [year, month, day] = iso.split('-');
  return `${day}-${month}-${year}`;
}

export function overdueDays(deadlineIso: string | undefined, today = new Date().toISOString().slice(0, 10)): number {
  if (!deadlineIso) return 0;
  const start = Date.parse(`${deadlineIso}T00:00:00`);
  const end = Date.parse(`${today}T00:00:00`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.floor((end - start) / 86400000);
}

export function deadlineTone(status: string, deadline?: string, today?: string): DeadlineTone {
  const sheet = SHEET_STATUSES.includes(status as DailySheetStatus) ? status : toSheetStatus(status);
  if (sheet === 'Completed') return 'completed';
  if (sheet === 'Hold') return 'hold';
  const iso = parseSheetDate(deadline);
  const days = iso ? overdueDays(iso, today) : 0;
  if (days >= 2) return 'delay-2plus';
  if (days === 1) return 'delay-1';
  return 'normal';
}

export function deadlineCellClass(tone: DeadlineTone): string {
  if (tone === 'completed') return 'tone-completed bg-[#dcfce7] text-[#166534] font-semibold';
  if (tone === 'hold') return 'tone-hold bg-[#fde68a] text-[#78350f] font-semibold';
  if (tone === 'delay-1') return 'tone-delay-1 bg-[#dc2626] text-white font-semibold';
  if (tone === 'delay-2plus') return 'tone-delay-2plus bg-[#0f172a] text-white font-semibold';
  return 'tone-normal bg-transparent text-[#0f172a]';
}

export function deadlineInlineStyle(tone: DeadlineTone): string {
  if (tone === 'completed') return 'background:#dcfce7;color:#166534;font-weight:700;';
  if (tone === 'hold') return 'background:#fde68a;color:#78350f;font-weight:700;';
  if (tone === 'delay-1') return 'background:#dc2626;color:#ffffff;font-weight:700;';
  if (tone === 'delay-2plus') return 'background:#0f172a;color:#ffffff;font-weight:700;';
  return '';
}

/** React style object — beats sheet CSS the same way mail inline styles do. */
export function deadlineCellStyle(tone: DeadlineTone): CSSProperties | undefined {
  if (tone === 'completed') return { background: '#dcfce7', color: '#166534', fontWeight: 700 };
  if (tone === 'hold') return { background: '#fde68a', color: '#78350f', fontWeight: 700 };
  if (tone === 'delay-1') return { background: '#dc2626', color: '#ffffff', fontWeight: 700 };
  if (tone === 'delay-2plus') return { background: '#0f172a', color: '#ffffff', fontWeight: 700 };
  return undefined;
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
  currentUpdate?: string;
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

export const DELAY_REASON_OPTIONS = [
  'Customer dependency',
  'Internal dependency',
  'Development issue',
  'Testing issue',
  'Waiting for approval',
  'Waiting for customer input',
  'Resource issue',
  'Technical issue',
  'Other',
] as const;

export function inferDefaultEmailPeriod(now = new Date()): SnapshotPeriod {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hourCycle: 'h23' }).format(now)
  );
  return hour >= 11 ? 'evening' : 'morning';
}

/** Calendar date in Asia/Kolkata as YYYY-MM-DD. */
export function appTodayIso() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

const WORK_DATE_KEY = 'careyu.dailyWorkDate';

export function readStoredWorkDate(): string {
  try {
    const stored = sessionStorage.getItem(WORK_DATE_KEY);
    if (stored && /^\d{4}-\d{2}-\d{2}$/.test(stored)) return stored;
  } catch {
    /* ignore */
  }
  return appTodayIso();
}

export function writeStoredWorkDate(date: string) {
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) sessionStorage.setItem(WORK_DATE_KEY, date);
  } catch {
    /* ignore */
  }
}
