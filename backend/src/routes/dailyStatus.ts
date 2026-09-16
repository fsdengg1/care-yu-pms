import { Router } from 'express';
import { AuthedRequest, requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../lib/rbac.js';
import {
  buildDailyStatusKpis,
  buildDailyStatusRows,
  canManageMorningLock,
  canSeeAllDailyStatusRows,
  compareSnapshots,
  COMPANY_LEAVE_MESSAGE,
  dateInAppTimezone,
  delayReasonMissingForTask,
  peopleForDailySheet,
  fromSheetStatus,
  isCompanyLeaveDay,
  loadDailyStatusSnapshot,
  sheetPhase,
  renderDailyStatusEmailHtml,
  restoreDailyStatusReport,
  rowsForEmailReport,
  rowsForPeriod,
  saveDailyStatusSnapshot,
  sendDailyStatusReport,
  SnapshotPeriod,
  upsertDailyPeriodRecord,
  syncPeriodRecordFromTask,
  workStatusFromSheet,
  visibleProjects,
} from '../lib/dailyStatus.js';
import { formatEmployeeDisplayName } from '../lib/people.js';
import { updateWorkTask, setTaskSheetHidden, canMutateWorkTask } from '../lib/workTasks.js';
import {
  getEmailReportScheduleConfig,
  listEmailReportHistory,
  saveEmailReportScheduleConfig,
  sendConfiguredEmailReport,
  EmailReportSlot,
} from '../lib/emailReportSchedule.js';
import { attendanceForUsers } from '../lib/leaveRequests.js';
import { normalizeDelayReason } from '../lib/workCalendar.js';
import { env } from '../config/env.js';
import { flushStore, replaceCollectionsFromPostgres, store } from '../store/db.js';

const router = Router();

function readPeriod(value: unknown): SnapshotPeriod {
  return String(value || '').toLowerCase() === 'evening' ? 'evening' : 'morning';
}

function readSlot(value: unknown): EmailReportSlot {
  return String(value || '').toLowerCase() === 'evening' ? 'evening' : 'noon';
}

function todayDate() {
  return dateInAppTimezone();
}

function readIsoDate(value: unknown, fallback = todayDate()) {
  const raw = String(value || '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : fallback;
}

router.use(requireAuth);

router.get(
  '/sheet',
  requirePermission('view:daily-updates', 'submit:daily-update', 'view:dashboard:ceo'),
  async (req: AuthedRequest, res) => {
    await replaceCollectionsFromPostgres(['tasks', 'systemMeta', 'dailyUpdates']);
    const user = req.user!;
    const date = readIsoDate(req.query.date);
    const period = typeof req.query.period === 'string' && req.query.period ? readPeriod(req.query.period) : undefined;
    const phase = sheetPhase(date);
    const rows = buildDailyStatusRows(user, { date, period: period || 'morning' });
    const personIds = [...new Set(rows.map((row) => row.personId).filter(Boolean))];
    return res.json({
      rows,
      date,
      period: period || 'morning',
      phase,
      attendance: attendanceForUsers(personIds, date),
      kpis: buildDailyStatusKpis(user, rows.filter((row) => !row.sheetHidden && row.rowKind !== 'leave')),
      people: peopleForDailySheet(rows),
      projects: visibleProjects(user).map((project) => ({
        id: project.id,
        name: project.name,
        code: project.code,
      })),
    });
  }
);

router.post(
  '/morning-lock',
  requirePermission('view:daily-updates', 'submit:daily-update'),
  (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!canManageMorningLock(user)) {
      return res.status(403).json({ message: 'Only a Project Manager or System Admin can lock or unlock Morning Status.' });
    }
    const date = readIsoDate(req.body?.date);
    return res.json({
      message: 'Morning and Evening are both editable. Locking is no longer used.',
      date,
      locked: false,
      phase: sheetPhase(date),
      rows: buildDailyStatusRows(user, { date, period: 'morning' }),
    });
  }
);

router.post(
  '/snapshot',
  requirePermission('view:daily-updates', 'submit:daily-update'),
  async (req: AuthedRequest, res) => {
    if (!canSeeAllDailyStatusRows(req.user!)) {
      return res.status(403).json({
        message:
          'Only the Project Manager, Engineering Director, or CEO can save the shared morning/evening snapshot.',
      });
    }
    const period = readPeriod(req.body?.period);
    const date = readIsoDate(req.body?.date);
    if (isCompanyLeaveDay(date)) {
      return res.status(400).json({ message: COMPANY_LEAVE_MESSAGE });
    }
    const result = saveDailyStatusSnapshot(req.user!, period, date);
    await flushStore();
    return res.json({
      message: `${period === 'morning' ? 'Morning' : 'Evening'} snapshot saved.`,
      ...result,
    });
  }
);

router.get(
  '/snapshot',
  requirePermission('view:daily-updates', 'submit:daily-update', 'view:dashboard:ceo'),
  (req: AuthedRequest, res) => {
    const period = readPeriod(req.query.period);
    const date = readIsoDate(req.query.date);
    const packed = rowsForPeriod(req.user!, period, date);
    return res.json({
      date,
      period,
      source: packed.source,
      available: packed.available,
      rows: packed.rows,
      snapshot: loadDailyStatusSnapshot(date, period),
    });
  }
);

router.get(
  '/compare',
  requirePermission('view:daily-updates', 'submit:daily-update', 'view:dashboard:ceo'),
  (req: AuthedRequest, res) => {
    const date = typeof req.query.date === 'string' && req.query.date ? req.query.date : undefined;
    const against = typeof req.query.against === 'string' && req.query.against ? req.query.against : undefined;
    const result = compareSnapshots(req.user!, date, against);
    return res.json({
      ...result,
      message: result.available
        ? undefined
        : result.message || 'Morning and evening updates are not yet available.',
    });
  }
);

router.get(
  '/email-preview',
  requirePermission('view:daily-updates', 'view:dashboard:ceo'),
  (req: AuthedRequest, res) => {
    const period = readPeriod(req.query.period);
    const date = readIsoDate(req.query.date);
    const packed = rowsForEmailReport(req.user!, period, date);
    const rendered = renderDailyStatusEmailHtml({
      period,
      date,
      rows: packed.rows,
      recipientName: formatEmployeeDisplayName(req.user!),
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      available: packed.available,
      message: packed.message,
      source: packed.source,
      html: packed.available ? rendered.html : '',
      text: packed.available ? rendered.text : '',
      subject: packed.available ? rendered.subject : '',
      rows: packed.rows,
      period,
      date,
    });
  }
);

router.post(
  '/email-send',
  requirePermission('view:daily-updates', 'view:dashboard:ceo'),
  async (req: AuthedRequest, res) => {
    const period = readPeriod(req.body?.period);
    const configured = getEmailReportScheduleConfig();
    const toEmail =
      (typeof req.body?.toEmail === 'string' && req.body.toEmail.trim()) ||
      configured.toEmail ||
      undefined;
    const date = readIsoDate(req.body?.date);
    const splitList = (raw: string) =>
      raw
        .split(/[,;]+/)
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean);
    const result = await sendDailyStatusReport({
      actor: req.user!,
      period,
      toEmail,
      date,
      fromEmail: configured.fromEmail || undefined,
      fromName: configured.fromName || undefined,
      ccEmails: configured.cc ? splitList(configured.cc) : undefined,
      bccEmails: configured.bcc ? splitList(configured.bcc) : undefined,
    });
    if ('error' in result) {
      return res.status(400).json({ message: result.error });
    }
    if (result.result.status === 'FAILED') {
      return res.status(502).json({ message: result.result.reason || 'Unable to send the email report.' });
    }
    return res.json({
      message: 'Email report sent.',
      subject: result.subject,
      html: result.html,
      rows: result.rows,
      date: result.date,
      period: result.period,
      toEmail,
    });
  }
);

router.get(
  '/email-restore',
  requirePermission('view:daily-updates', 'view:dashboard:ceo'),
  (_req, res) => {
    const restored = restoreDailyStatusReport();
    if (!restored) return res.status(404).json({ message: 'No previous report is available to restore.' });
    return res.json(restored);
  }
);

router.get(
  '/email-schedule',
  requirePermission('view:daily-updates', 'view:dashboard:ceo'),
  (_req, res) => {
    const config = getEmailReportScheduleConfig();
    return res.json({
      config,
      timezone: config.timezone || env.appTimezone,
      schedule: [
        { slot: 'noon', time: '11:00 AM', enabled: config.sendAtNoon },
        { slot: 'evening', time: '7:15 PM', enabled: config.sendAtEvening },
      ],
    });
  }
);

router.put(
  '/email-schedule',
  requirePermission('view:daily-updates', 'view:dashboard:ceo'),
  (req: AuthedRequest, res) => {
    const body = req.body || {};
    const saved = saveEmailReportScheduleConfig(
      {
        fromEmail: body.fromEmail,
        fromName: body.fromName,
        toEmail: body.toEmail,
        cc: body.cc,
        bcc: body.bcc,
        subject: body.subject,
        contentTemplate: body.contentTemplate,
        sendAtNoon: body.sendAtNoon,
        sendAtEvening: body.sendAtEvening,
        timezone: body.timezone || env.appTimezone,
      },
      req.user
    );
    if (saved.error) return res.status(400).json({ message: saved.error });
    return res.json({
      message: 'Email schedule configuration saved.',
      config: saved.config,
    });
  }
);

router.get(
  '/email-history',
  requirePermission('view:daily-updates', 'view:dashboard:ceo'),
  (req, res) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 60));
    return res.json({ history: listEmailReportHistory(limit) });
  }
);

router.post(
  '/email-schedule/test',
  requirePermission('view:daily-updates', 'view:dashboard:ceo'),
  async (req: AuthedRequest, res) => {
    const slot = readSlot(req.body?.slot ?? (new Date().getHours() >= 16 ? 'evening' : 'noon'));
    const result = await sendConfiguredEmailReport({
      slot,
      source: 'test',
      actor: req.user!,
      force: true,
    });
    if (!result.ok) {
      return res.status(502).json({
        message: result.message,
        entry: result.entry,
      });
    }
    return res.json({
      message: result.message,
      entry: result.entry,
      subject: result.subject,
      html: result.html,
    });
  }
);

router.patch(
  '/rows/:id',
  requirePermission('view:daily-updates', 'create:task', 'submit:daily-update'),
  async (req: AuthedRequest, res) => {
    const date = readIsoDate(req.query.date || req.body?.work_date);
    const period = typeof req.body?.period === 'string' && req.body.period ? readPeriod(req.body.period) : 'morning';
    const taskId = String(req.params.id);
    if (isCompanyLeaveDay(date)) {
      return res.status(400).json({ message: COMPANY_LEAVE_MESSAGE });
    }
    if (taskId.startsWith('leave:') || taskId.startsWith('permission:')) {
      return res.status(400).json({ message: 'Leave and permission rows are not editable task records.' });
    }
    const body: Record<string, unknown> = { ...(req.body || {}) };
    if (body.remarks !== undefined && body.delay_reason === undefined && body.reason_for_delay === undefined) {
      body.delay_reason = body.remarks;
    }
    if (body.delay_reason !== undefined || body.reason_for_delay !== undefined) {
      body.delay_reason = normalizeDelayReason(
        String(body.delay_reason || body.reason_for_delay || ''),
        String(body.delay_reason_other || '')
      );
    }
    body.work_date = date;
    const existingTask = store.getTasks().find((item) => item.id === taskId);
    if (existingTask) {
      const nextStatus =
        typeof body.status === 'string'
          ? ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED', 'WAITING', 'HOLD', 'CANCELLED'].includes(body.status)
            ? body.status
            : fromSheetStatus(body.status)
          : existingTask.status;
      const probe = {
        ...existingTask,
        status: nextStatus as typeof existingTask.status,
        delay_reason: typeof body.delay_reason === 'string' ? body.delay_reason : existingTask.delay_reason,
      };
      if (delayReasonMissingForTask(probe, date, typeof body.delay_reason === 'string' ? body.delay_reason : undefined)) {
        if (!body.delay_reason) body.delay_reason = existingTask.delay_reason || 'Other: update pending';
      }
    }
    if (
      typeof body.status === 'string' &&
      !['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED', 'WAITING', 'HOLD', 'CANCELLED'].includes(body.status)
    ) {
      body.status = fromSheetStatus(body.status);
    }

    const rebuildRows = () => buildDailyStatusRows(req.user!, { date, period });
    const today = todayDate();
    const periodPatch: {
      work_completed?: string;
      hours_worked?: number;
      progress_percent?: number;
      work_status?: ReturnType<typeof workStatusFromSheet>;
      blocker?: string;
    } = {};
    if (typeof body.status === 'string') periodPatch.work_status = workStatusFromSheet(String(body.status));
    if (body.progress_percent !== undefined) periodPatch.progress_percent = Math.max(0, Math.min(100, Number(body.progress_percent) || 0));
    if (typeof body.delay_reason === 'string') periodPatch.blocker = body.delay_reason;
    if (body.hours_worked !== undefined) periodPatch.hours_worked = Number(body.hours_worked);
    if (typeof body.work_completed === 'string') periodPatch.work_completed = body.work_completed;
    else if (typeof body.current_update === 'string') periodPatch.work_completed = body.current_update;
    else if (typeof body.evening_update === 'string') periodPatch.work_completed = body.evening_update;
    if (Object.keys(periodPatch).length) {
      const periodResult = upsertDailyPeriodRecord(req.user!, taskId, date, period, periodPatch);
      if (!periodResult.ok) {
        return res.status(periodResult.status || 400).json({
          message:
            periodResult.error === 'forbidden'
              ? 'You do not have permission to save this update.'
              : periodResult.error === 'not_found'
                ? 'Task not found.'
                : periodResult.error,
        });
      }
    }

    delete body.hours_worked;
    delete body.work_completed;
    delete body.current_update;
    delete body.evening_update;
    delete body.period;
    delete body.work_date;
    delete body.remarks;
    delete body.progress_manual_override;
    delete body.reason_for_delay;
    delete body.delay_reason_other;

    const mayTouchTask = Boolean(existingTask && canMutateWorkTask(req.user!, existingTask));
    if (!mayTouchTask || date !== today) {
      delete body.status;
      delete body.progress_percent;
      delete body.delay_reason;
    }

    if (Object.keys(body).length === 0) {
      await flushStore();
      return res.json({ rows: rebuildRows() });
    }

    if (body.sheet_hidden !== undefined && Object.keys(body).every((key) => key === 'sheet_hidden')) {
      const hiddenResult = setTaskSheetHidden(req.user!, String(req.params.id), body.sheet_hidden === true);
      if ('error' in hiddenResult && hiddenResult.error === 'not_found') {
        return res.status(404).json({ message: 'Task not found.' });
      }
      if ('error' in hiddenResult) {
        return res.status(hiddenResult.status || 403).json({ message: 'You do not have permission to hide this task.' });
      }
      await flushStore();
      return res.json({ task: hiddenResult.task, rows: rebuildRows() });
    }

    const result = updateWorkTask(req.user!, String(req.params.id), body);
    if ('error' in result && result.error === 'not_found') {
      return res.status(404).json({ message: 'Task not found.' });
    }
    if ('error' in result) {
      if (Object.keys(periodPatch).length && result.error === 'forbidden') {
        await flushStore();
        return res.json({ rows: rebuildRows() });
      }
      return res.status(result.status || 400).json({
        message:
          result.error === 'forbidden'
            ? 'You do not have permission to update this task.'
            : result.error,
      });
    }
    if (body.progress_percent !== undefined || body.status !== undefined) {
      const syncResult = syncPeriodRecordFromTask(
        req.user!,
        String(req.params.id),
        date,
        period,
        result.task
      );
      if (!syncResult.ok && syncResult.error !== 'forbidden') {
        return res.status(syncResult.status || 400).json({
          message:
            syncResult.error === 'not_found'
              ? 'Task not found.'
              : syncResult.error,
        });
      }
    }
    await flushStore();
    return res.json({ task: result.task, rows: rebuildRows() });
  }
);

export default router;
