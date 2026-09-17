import { apiRequest } from './api';
import {
  CompareItem,
  DailyStatusKpis,
  DailyStatusPerson,
  DailyStatusRow,
  SnapshotPeriod,
} from './dailyStatus';

export type EmailReportSlot = 'noon' | 'evening';

export type EmailReportScheduleConfig = {
  fromEmail: string;
  fromName: string;
  toEmail: string;
  cc: string;
  bcc: string;
  subject: string;
  contentTemplate: string;
  sendAtNoon: boolean;
  sendAtEvening: boolean;
  timezone: string;
  updatedAt?: string;
  updatedBy?: string;
};

export type EmailReportHistoryEntry = {
  id: string;
  date: string;
  time: string;
  slot: EmailReportSlot;
  fromEmail: string;
  toEmail: string;
  subject: string;
  status: 'Sent' | 'Failed' | 'Pending';
  error?: string;
  transactionId?: string;
  createdAt: string;
  updatedAt: string;
  source: 'schedule' | 'test' | 'manual';
};

type SheetResponse = {
  rows: DailyStatusRow[];
  kpis: DailyStatusKpis;
  people: DailyStatusPerson[];
  projects: Array<{ id: string; name: string; code: string }>;
  date?: string;
  period?: SnapshotPeriod;
  phase?: {
    morningLocked: boolean;
    eveningOpen: boolean;
    timezone: string;
    lockHour: number;
    companyLeave?: boolean;
    companyLeaveMessage?: string;
    lockSource?: 'manual' | 'schedule' | null;
    lockedAt?: string;
    lockedByName?: string;
    manuallyUnlocked?: boolean;
    scheduledLocked?: boolean;
  };
  attendance?: Array<{
    personId: string;
    person: string;
    onLeave?: boolean;
    halfDay?: string;
    permission?: { fromTime?: string; toTime?: string; reason?: string };
  }>;
};

const sheetInflight = new Map<string, Promise<ReturnType<typeof apiRequest<SheetResponse>>>>();

export const DailyStatusApi = {
  async sheet(date?: string, period?: SnapshotPeriod, employeeId?: string) {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (period) params.set('period', period);
    if (employeeId) params.set('employeeId', employeeId);
    const query = params.toString() ? `?${params.toString()}` : '';
    const key = `/api/daily-status/sheet${query}`;
    let pending = sheetInflight.get(key);
    if (!pending) {
      pending = apiRequest<SheetResponse>(key);
      sheetInflight.set(key, pending);
      void pending.finally(() => {
        if (sheetInflight.get(key) === pending) sheetInflight.delete(key);
      });
    }
    const result = await pending;
    if (!result.ok) {
      return {
        ok: false as const,
        message: result.message,
        rows: [] as DailyStatusRow[],
        kpis: null as DailyStatusKpis | null,
        people: [] as DailyStatusPerson[],
        projects: [] as Array<{ id: string; name: string; code: string }>,
      };
    }
    return { ok: true as const, ...result.data };
  },

  async morningLock(action: 'lock' | 'unlock', date?: string) {
    return apiRequest<{
      message: string;
      date: string;
      locked: boolean;
      rows: DailyStatusRow[];
      phase?: {
        morningLocked: boolean;
        eveningOpen: boolean;
        lockSource?: 'manual' | 'schedule' | null;
        lockedAt?: string;
        lockedByName?: string;
        manuallyUnlocked?: boolean;
      };
    }>('/api/daily-status/morning-lock', {
      method: 'POST',
      body: JSON.stringify({ action, date }),
    });
  },

  async snapshot(period: SnapshotPeriod, date?: string) {
    return apiRequest<{ message: string; rows: DailyStatusRow[]; date: string; period: SnapshotPeriod }>(
      '/api/daily-status/snapshot',
      { method: 'POST', body: JSON.stringify({ period, date }) }
    );
  },

  async compare(date?: string, against?: string) {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (against) params.set('against', against);
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<{
      items: CompareItem[];
      available: boolean;
      date: string;
      previousDate?: string;
      currentDate?: string;
      message?: string;
    }>(`/api/daily-status/compare${query}`);
  },

  async emailPreview(period: SnapshotPeriod, date?: string) {
    const params = new URLSearchParams({ period });
    if (date) params.set('date', date);
    return apiRequest<{
      available: boolean;
      message?: string;
      html: string;
      subject?: string;
      rows: DailyStatusRow[];
      period: SnapshotPeriod;
      date: string;
      source?: string;
    }>(`/api/daily-status/email-preview?${params.toString()}`);
  },

  async emailSend(period: SnapshotPeriod, toEmail?: string, date?: string) {
    return apiRequest<{
      message: string;
      html: string;
      subject: string;
      rows: DailyStatusRow[];
      toEmail?: string;
    }>('/api/daily-status/email-send', {
      method: 'POST',
      body: JSON.stringify({ period, toEmail, date }),
    });
  },

  async emailRestore() {
    return apiRequest<{
      html: string;
      subject: string;
      date?: string;
      period?: SnapshotPeriod;
      rows?: DailyStatusRow[];
    }>('/api/daily-status/email-restore');
  },

  async emailSchedule() {
    return apiRequest<{
      config: EmailReportScheduleConfig;
      timezone: string;
      schedule: Array<{ slot: EmailReportSlot; time: string; enabled: boolean }>;
    }>('/api/daily-status/email-schedule');
  },

  async saveEmailSchedule(config: Partial<EmailReportScheduleConfig>) {
    return apiRequest<{ message: string; config: EmailReportScheduleConfig }>('/api/daily-status/email-schedule', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  },

  async emailHistory(limit = 60) {
    return apiRequest<{ history: EmailReportHistoryEntry[] }>(
      `/api/daily-status/email-history?limit=${encodeURIComponent(String(limit))}`
    );
  },

  async emailScheduleTest(slot?: EmailReportSlot) {
    return apiRequest<{
      message: string;
      entry: EmailReportHistoryEntry;
      subject?: string;
      html?: string;
    }>('/api/daily-status/email-schedule/test', {
      method: 'POST',
      body: JSON.stringify({ slot }),
    });
  },

  async updateRow(id: string, body: Record<string, unknown>) {
    const params = new URLSearchParams();
    if (typeof body.work_date === 'string' && body.work_date) params.set('date', String(body.work_date).slice(0, 10));
    if (typeof body.period === 'string' && body.period) params.set('period', String(body.period));
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<{ task: { id: string }; rows: DailyStatusRow[] }>(`/api/daily-status/rows/${id}${query}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },
};
