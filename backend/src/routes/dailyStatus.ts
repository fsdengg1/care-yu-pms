import { Router } from 'express';
import { AuthedRequest, requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../lib/rbac.js';
import {
  buildDailyStatusKpis,
  buildDailyStatusRows,
  canManageMorningLock,
  canSeeAllDailyStatusRows,
  compareSnapshots,
  dateInAppTimezone,
  delayReasonMissingForTask,
  peopleForDailySheet,
  fromSheetStatus,
  loadDailyStatusSnapshot,
  ensureMorningSnapshot,
  lockMorningStatus,
  sheetPhase,
  renderDailyStatusEmailHtml,
  restoreDailyStatusReport,
  rowsForPeriod,
  saveDailyStatusSnapshot,
  sendDailyStatusReport,
  SnapshotPeriod,
  unlockMorningStatus,
  upsertLoggedHoursForTask,
  upsertEveningWorkCompleted,
  syncPeriodRecordFromTask,
  visibleProjects,
  isEveningStatusOpen,
  isMorningStatusLocked,
} from '../lib/dailyStatus.js';
import { formatEmployeeDisplayName } from '../lib/people.js';
import { updateWorkTask, setTaskSheetHidden } from '../lib/workTasks.js';
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
import { store } from '../store/db.js';

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
  (req: AuthedRequest, res) => {
    const user = req.user!;
    const date = readIsoDate(req.query.date);
    const period = typeof req.query.period === 'string' && req.query.period ? readPeriod(req.query.period) : undefined;
    ensureMorningSnapshot(user, date);
    const phase = sheetPhase(date);
    let rows = buildDailyStatusRows(user, { date, period });
    if (period === 'morning' && phase.morningLocked) {
      const snap = loadDailyStatusSnapshot(date, 'morning');
      if (snap?.length) {
        const liveById = new Map(rows.map((row) => [row.id, row]));
        rows = snap.map((row) => {
          const live = liveById.get(row.id);
          return live ? { ...row, canEdit: false, eveningSubmitted: live.eveningSubmitted } : { ...row, canEdit: false };
        });
        for (const row of rows) {
          if (row.rowKind === 'leave' && !snap.some((item) => item.id === row.id)) {
            /* keep */
          }
        }
        const snapIds = new Set(rows.map((row) => row.id));
        for (const row of buildDailyStatusRows(user, { date, period: 'morning' })) {
          if (row.rowKind === 'leave' && !snapIds.has(row.id)) rows.unshift(row);
        }
      }
    }
    const personIds = [...new Set(rows.map((row) => row.personId).filter(Boolean))];
    return res.json({
      rows,
      date,
      period: period || (phase.eveningOpen ? 'evening' : 'morning'),
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
    const action = String(req.body?.action || 'lock').toLowerCase() === 'unlock' ? 'unlock' : 'lock';
    const result = action === 'unlock' ? unlockMorningStatus(user, date) : lockMorningStatus(user, date);
    return res.json({
      message:
        action === 'unlock'
          ? 'Morning Status unlocked. Team members can edit morning task details again.'
          : 'Morning Status locked. Evening updates are now open for the same tasks.',
      ...result,
      rows: buildDailyStatusRows(user, { date, period: action === 'unlock' ? 'morning' : 'evening' }),
    });
  }
);

router.post(
  '/snapshot',
  requirePermission('view:daily-updates', 'submit:daily-update'),
  (req: AuthedRequest, res) => {
    if (!canSeeAllDailyStatusRows(req.user!)) {
      return res.status(403).json({
        message:
          'Only the Project Manager, Engineering Director, or CEO can save the shared morning/evening snapshot.',
      });
    }
    const period = readPeriod(req.body?.period);
    const date = readIsoDate(req.body?.date);
    const result = saveDailyStatusSnapshot(req.user!, period, date);
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
    const result = compareSnapshots(req.user!, date);
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
    const packed = rowsForPeriod(req.user!, period, date);
    const rendered = renderDailyStatusEmailHtml({
      period,
      date,
      rows: packed.rows,
      recipientName: formatEmployeeDisplayName(req.user!),
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      available: true,
      source: packed.source,
      html: rendered.html,
      text: rendered.text,
      subject: rendered.subject,
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
        { slot: 'noon', time: '11:15 AM', enabled: config.sendAtNoon },
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
  (req: AuthedRequest, res) => {
    const date = readIsoDate(req.query.date || req.body?.work_date);
    const period = typeof req.body?.period === 'string' && req.body.period ? readPeriod(req.body.period) : undefined;
    const taskId = String(req.params.id);
    if (taskId.startsWith('leave:') || taskId.startsWith('permission:')) {
      return res.status(400).json({ message: 'Leave and permission rows are not editable task records.' });
    }
    ensureMorningSnapshot(req.user!, date);
    if (period === 'morning' && isMorningStatusLocked(date)) {
      return res.status(400).json({
        message:
          'Morning Status is locked for this date. Switch to Evening Status to continue updates, or ask a Project Manager to unlock morning.',
      });
    }
    if (period === 'evening' && !isEveningStatusOpen(date)) {
      return res.status(400).json({
        message: 'Evening Status opens after Morning Status is locked for this date.',
      });
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
          ? ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED', 'WAITING', 'HOLD'].includes(body.status)
            ? body.status
            : fromSheetStatus(body.status)
          : existingTask.status;
      const probe = {
        ...existingTask,
        status: nextStatus as typeof existingTask.status,
        delay_reason: typeof body.delay_reason === 'string' ? body.delay_reason : existingTask.delay_reason,
      };
      if (delayReasonMissingForTask(probe, date, typeof body.delay_reason === 'string' ? body.delay_reason : undefined)) {
        return res.status(400).json({
          message: 'Reason for Delay is required because this task is overdue.',
          delayReasonRequired: true,
        });
      }
    }
    if (
      typeof body.status === 'string' &&
      !['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED', 'WAITING', 'HOLD'].includes(body.status)
    ) {
      body.status = fromSheetStatus(body.status);
    }

    const rebuildRows = () => buildDailyStatusRows(req.user!, { date, period });

    const eveningNarrative =
      typeof body.evening_update === 'string'
        ? body.evening_update
        : period === 'evening' && typeof body.description === 'string'
          ? body.description
          : undefined;
    if (eveningNarrative !== undefined) {
      const eveningResult = upsertEveningWorkCompleted(
        req.user!,
        String(req.params.id),
        String(eveningNarrative),
        readIsoDate(body.work_date, date)
      );
      if (!eveningResult.ok) {
        return res.status(eveningResult.status || 400).json({
          message:
            eveningResult.error === 'forbidden'
              ? 'You do not have permission to save this evening update.'
              : eveningResult.error === 'not_found'
                ? 'Task not found.'
                : eveningResult.error,
        });
      }
      delete body.evening_update;
      delete body.description;
      delete body.title;
    }
    delete body.period;

    if (body.hours_worked !== undefined) {
      const hoursResult = upsertLoggedHoursForTask(
        req.user!,
        String(req.params.id),
        Number(body.hours_worked),
        readIsoDate(body.work_date, date),
        period
      );
      if (!hoursResult.ok) {
        return res.status(hoursResult.status || 400).json({
          message:
            hoursResult.error === 'forbidden'
              ? 'You do not have permission to update logged hours.'
              : hoursResult.error === 'not_found'
                ? 'Task not found.'
                : hoursResult.error,
        });
      }
      delete body.hours_worked;
      delete body.work_date;
      if (Object.keys(body).length === 0) {
        return res.json({ update: hoursResult.update, rows: rebuildRows() });
      }
    }
    delete body.work_date;
    delete body.evening_update;

    if (Object.keys(body).length === 0) {
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
      return res.json({ task: hiddenResult.task, rows: rebuildRows() });
    }

    const result = updateWorkTask(req.user!, String(req.params.id), body);
    if ('error' in result && result.error === 'not_found') {
      return res.status(404).json({ message: 'Task not found.' });
    }
    if ('error' in result) {
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
    return res.json({ task: result.task, rows: rebuildRows() });
  }
);

export default router;
