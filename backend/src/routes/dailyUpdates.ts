import { Router } from 'express';
import { AuthedRequest, requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../lib/rbac.js';
import { store } from '../store/db.js';
import { DailyUpdate, DailyWorkStatus } from '../types.js';
import {
  applyUpdateToTask,
  buildProjectActivity,
  buildSummary,
  canCommentOnUpdates,
  canEscalateUpdates,
  canSubmitOwnUpdates,
  canViewUpdate,
  createEscalationFromUpdate,
  findAssignment,
  listAssignmentsForUser,
  listVisibleAssignments,
  listVisibleUpdates,
  newId,
  notifyForSubmittedUpdate,
  resolveOrCreateTask,
  todayDate,
} from '../lib/dailyUpdates.js';

const router = Router();

const WORK_STATUSES: DailyWorkStatus[] = ['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'ON_HOLD', 'CANCELLED'];

function paramId(req: AuthedRequest): string {
  const value = req.params.id;
  return Array.isArray(value) ? value[0] : value;
}

function parseStatus(value: unknown): DailyWorkStatus {
  if (typeof value === 'string' && WORK_STATUSES.includes(value as DailyWorkStatus)) {
    return value as DailyWorkStatus;
  }
  return 'IN_PROGRESS';
}

function parseAttachments(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean).slice(0, 12);
  }
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 12);
  }
  return [];
}

function validateBlocked(status: DailyWorkStatus, body: Record<string, unknown>) {
  if (status !== 'BLOCKED') return null;
  if (!String(body.blocker || '').trim()) return 'Blocker / Issue is required when status is Blocked.';
  if (!String(body.dependency || '').trim()) return 'Dependency is required when status is Blocked.';
  if (!String(body.support_required || '').trim()) return 'Support required is required when status is Blocked.';
  return null;
}

router.get(
  '/assignments',
  requireAuth,
  requirePermission('view:daily-updates', 'submit:daily-update'),
  (req: AuthedRequest, res) => {
    const user = req.user!;
    const mine = String(req.query.mine || '') === '1' || !['TEAM_LEAD', 'PROJECT_MANAGER', 'BUSINESS_HEAD', 'ENG_DIRECTOR', 'CEO', 'CTO', 'SYSTEM_ADMIN'].includes(user.role_code);
    const assignments = mine ? listAssignmentsForUser(user) : listVisibleAssignments(user);
    return res.json({ assignments });
  }
);

router.get(
  '/summary',
  requireAuth,
  requirePermission('view:daily-updates', 'submit:daily-update', 'view:dashboard:ceo'),
  (req: AuthedRequest, res) => {
    return res.json(buildSummary(req.user!));
  }
);

router.get(
  '/',
  requireAuth,
  requirePermission('view:daily-updates', 'submit:daily-update', 'view:dashboard:ceo'),
  (req: AuthedRequest, res) => {
    const user = req.user!;
    const projectId = typeof req.query.project === 'string' ? req.query.project : '';
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const from = typeof req.query.from === 'string' ? req.query.from : '';
    const to = typeof req.query.to === 'string' ? req.query.to : '';
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const mine = String(req.query.mine || '') === '1';

    let updates = listVisibleUpdates(user);
    if (mine) updates = updates.filter((item) => item.user_id === user.id);
    if (projectId) updates = updates.filter((item) => item.project_id === projectId || item.lead_id === projectId);
    if (status) updates = updates.filter((item) => item.work_status === status || item.submission_status === status);
    if (from) updates = updates.filter((item) => (item.work_date || '') >= from);
    if (to) updates = updates.filter((item) => (item.work_date || '') <= to);
    if (q) {
      updates = updates.filter((item) =>
        [item.project_name, item.customer_name, item.task_title, item.work_completed, item.user_name, item.blocker]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q)
      );
    }
    return res.json({ updates, assignments: listVisibleAssignments(user) });
  }
);

router.get(
  '/:id',
  requireAuth,
  requirePermission('view:daily-updates', 'submit:daily-update', 'view:dashboard:ceo'),
  (req: AuthedRequest, res) => {
    const update = store.getDailyUpdates().find((item) => item.id === paramId(req));
    if (!update) return res.status(404).json({ message: 'Daily update not found.' });
    if (!canViewUpdate(req.user!, update)) {
      return res.status(403).json({ message: 'You do not have access to this update.' });
    }
    const activity = update.project_id ? buildProjectActivity(update.project_id) : [];
    return res.json({ update, activity, canEdit: update.user_id === req.user!.id && update.submission_status === 'DRAFT' });
  }
);

router.post(
  '/',
  requireAuth,
  requirePermission('submit:daily-update'),
  (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!canSubmitOwnUpdates(user)) {
      return res.status(403).json({ message: 'Only assigned team members can submit daily updates.' });
    }
    const body = (req.body || {}) as Record<string, unknown>;
    const assignmentId = String(body.assignment_id || '').trim();
    const assignment = findAssignment(user, assignmentId);
    if (!assignment) {
      return res.status(400).json({ message: 'You can only submit updates for work assigned to you.' });
    }
    if (
      assignment.acceptance_status === 'REQUESTED' &&
      assignment.assigned_to_id === user.id &&
      assignment.created_by_id !== user.id &&
      assignment.assigned_by_id !== user.id
    ) {
      return res.status(403).json({
        message: 'Accept this task before submitting a daily update. The same lead task is already linked here.',
      });
    }

    const workStatus = parseStatus(body.work_status);
    const submit = String(body.submission_status || body.action || '').toUpperCase() === 'SUBMITTED' || body.submit === true;
    if (submit) {
      const blockedError = validateBlocked(workStatus, body);
      if (blockedError) return res.status(400).json({ message: blockedError });
      if (!String(body.work_completed || '').trim()) {
        return res.status(400).json({ message: 'Work completed today is required to submit.' });
      }
      if (!String(body.next_plan || '').trim()) {
        return res.status(400).json({ message: 'Next action / ETA is required to submit.' });
      }
    }

    const now = new Date().toISOString();
    const task = resolveOrCreateTask(user, assignment);
    const progress = Math.max(0, Math.min(100, Number(body.progress_percent ?? assignment.progress_percent ?? 0) || 0));

    const rawPeriod = String(body.period || body.update_type || (new Date().getHours() >= 17 ? 'evening' : 'morning')).toLowerCase();
    const period: 'morning' | 'evening' = rawPeriod === 'evening' ? 'evening' : 'morning';
    const update_type: 'MORNING' | 'EVENING' = period === 'evening' ? 'EVENING' : 'MORNING';
    const work_date = String(body.work_date || todayDate()).slice(0, 10);

    const targetTaskId = task?.id;
    const updates = store.getDailyUpdates();
    const existingIndex = updates.findIndex(
      (item) =>
        item.user_id === user.id &&
        (item.task_id === targetTaskId || item.assignment_id === assignment.id) &&
        item.work_date === work_date &&
        (item.period === period || item.update_type === update_type)
    );

    const update: DailyUpdate = {
      id: existingIndex !== -1 ? updates[existingIndex].id : newId('upd'),
      user_id: user.id,
      user_name: user.name,
      user_role: user.role_name,
      team_id: user.team_id,
      team_name: user.team_name,
      assignment_id: assignment.id,
      assignment_source: assignment.source,
      task_id: task?.id,
      lead_id: assignment.lead_id,
      lead_number: assignment.lead_number,
      project_id: assignment.project_id,
      project_code: assignment.project_code,
      project_name: assignment.project_name,
      customer_name: assignment.customer_name,
      task_title: assignment.task_title,
      work_date,
      work_completed: String(body.work_completed || '').trim(),
      progress_percent: progress,
      hours_worked: Math.max(0, Number(body.hours_worked || 0) || 0),
      work_status: workStatus,
      blocker: String(body.blocker || '').trim() || undefined,
      dependency: String(body.dependency || '').trim() || undefined,
      support_required: String(body.support_required || '').trim() || undefined,
      next_plan: String(body.next_plan || '').trim(),
      attachments: parseAttachments(body.attachments),
      submission_status: submit ? 'SUBMITTED' : 'DRAFT',
      submitted_at: submit ? now : (existingIndex !== -1 ? updates[existingIndex].submitted_at : undefined),
      summary: String(body.work_completed || '').trim(),
      period,
      update_type,
      pm_comments: existingIndex !== -1 ? updates[existingIndex].pm_comments || [] : [],
      created_at: existingIndex !== -1 ? updates[existingIndex].created_at : now,
      updated_at: now,
    };

    if (existingIndex !== -1) {
      updates[existingIndex] = update;
    } else {
      updates.unshift(update);
    }
    store.saveDailyUpdates(updates);

    if (submit) {
      applyUpdateToTask(update);
      notifyForSubmittedUpdate(update);
      store.appendAudit({
        user_id: user.id,
        user_name: user.name,
        user_role: user.role_name,
        entity_type: 'DAILY_UPDATE',
        entity_id: update.id,
        entity_name: update.project_name,
        action: update.work_status === 'BLOCKED' ? 'DAILY_UPDATE_BLOCKED' : 'DAILY_UPDATE_SUBMITTED',
        description: `${user.name} submitted daily update for ${update.task_title} (${update.work_status.replace('_', ' ')}, ${update.progress_percent}%)`,
        new_value: update.work_status,
      });
      if (update.project_id) {
        store.appendAudit({
          user_id: user.id,
          user_name: user.name,
          user_role: user.role_name,
          entity_type: 'PROJECT',
          entity_id: update.project_id,
          entity_name: update.project_name,
          action: update.work_status === 'BLOCKED' ? 'TASK_BLOCKED' : update.work_status === 'COMPLETED' ? 'TASK_COMPLETED' : 'PROGRESS_UPDATED',
          description: `${user.name}: ${update.task_title} → ${update.work_status.replace('_', ' ')} (${update.progress_percent}%)`,
        });
      }
    }

    return res.status(201).json({ update });
  }
);

router.patch(
  '/:id',
  requireAuth,
  requirePermission('submit:daily-update'),
  (req: AuthedRequest, res) => {
    const user = req.user!;
    const updates = store.getDailyUpdates();
    const index = updates.findIndex((item) => item.id === paramId(req));
    if (index === -1) return res.status(404).json({ message: 'Daily update not found.' });
    const current = updates[index];
    if (current.user_id !== user.id) {
      return res.status(403).json({ message: 'You can only edit your own daily updates.' });
    }
    if (current.submission_status === 'SUBMITTED') {
      return res.status(403).json({ message: 'Submitted updates cannot be edited.' });
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const workStatus = parseStatus(body.work_status ?? current.work_status);
    const submit = String(body.submission_status || body.action || '').toUpperCase() === 'SUBMITTED' || body.submit === true;
    if (submit) {
      const blockedError = validateBlocked(workStatus, { ...current, ...body });
      if (blockedError) return res.status(400).json({ message: blockedError });
      if (!String((body.work_completed ?? current.work_completed) || '').trim()) {
        return res.status(400).json({ message: 'Work completed today is required to submit.' });
      }
      if (!String((body.next_plan ?? current.next_plan) || '').trim()) {
        return res.status(400).json({ message: 'Next action / ETA is required to submit.' });
      }
    }

    const now = new Date().toISOString();
    const next: DailyUpdate = {
      ...current,
      work_date: String(body.work_date || current.work_date).slice(0, 10),
      work_completed: String(body.work_completed ?? current.work_completed).trim(),
      progress_percent: Math.max(0, Math.min(100, Number(body.progress_percent ?? current.progress_percent) || 0)),
      hours_worked: Math.max(0, Number(body.hours_worked ?? current.hours_worked) || 0),
      work_status: workStatus,
      blocker: String(body.blocker ?? current.blocker ?? '').trim() || undefined,
      dependency: String(body.dependency ?? current.dependency ?? '').trim() || undefined,
      support_required: String(body.support_required ?? current.support_required ?? '').trim() || undefined,
      next_plan: String(body.next_plan ?? current.next_plan ?? '').trim(),
      attachments: body.attachments !== undefined ? parseAttachments(body.attachments) : current.attachments,
      summary: String(body.work_completed ?? current.work_completed).trim(),
      submission_status: submit ? 'SUBMITTED' : 'DRAFT',
      submitted_at: submit ? now : current.submitted_at,
      updated_at: now,
    };
    updates[index] = next;
    store.saveDailyUpdates(updates);

    if (submit) {
      applyUpdateToTask(next);
      notifyForSubmittedUpdate(next);
      store.appendAudit({
        user_id: user.id,
        user_name: user.name,
        user_role: user.role_name,
        entity_type: 'DAILY_UPDATE',
        entity_id: next.id,
        entity_name: next.project_name,
        action: next.work_status === 'BLOCKED' ? 'DAILY_UPDATE_BLOCKED' : 'DAILY_UPDATE_SUBMITTED',
        description: `${user.name} submitted daily update for ${next.task_title}`,
        new_value: next.work_status,
      });
    }

    return res.json({ update: next });
  }
);

router.post(
  '/:id/comment',
  requireAuth,
  requirePermission('view:daily-updates'),
  (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!canCommentOnUpdates(user)) {
      return res.status(403).json({ message: 'Only project managers and team leads can add comments.' });
    }
    const comment = String(req.body?.comment || '').trim();
    if (!comment) return res.status(400).json({ message: 'Comment is required.' });

    const updates = store.getDailyUpdates();
    const index = updates.findIndex((item) => item.id === paramId(req));
    if (index === -1) return res.status(404).json({ message: 'Daily update not found.' });
    const current = updates[index];
    if (!canViewUpdate(user, current)) {
      return res.status(403).json({ message: 'You do not have access to this update.' });
    }

    const entry = {
      id: newId('cmt'),
      user_id: user.id,
      user_name: user.name,
      comment,
      created_at: new Date().toISOString(),
    };
    updates[index] = {
      ...current,
      pm_comments: [...(current.pm_comments || []), entry],
      updated_at: entry.created_at,
    };
    store.saveDailyUpdates(updates);
    store.appendAudit({
      user_id: user.id,
      user_name: user.name,
      user_role: user.role_name,
      entity_type: 'DAILY_UPDATE',
      entity_id: current.id,
      entity_name: current.project_name,
      action: 'PM_COMMENT_ADDED',
      description: `${user.name} commented on ${current.task_title}: ${comment}`,
    });
    return res.json({ update: updates[index] });
  }
);

router.post(
  '/:id/escalate',
  requireAuth,
  requirePermission('escalate:issue', 'view:daily-updates'),
  (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!canEscalateUpdates(user)) {
      return res.status(403).json({ message: 'You cannot escalate this daily-update blocker.' });
    }
    const update = store.getDailyUpdates().find((item) => item.id === paramId(req));
    if (!update) return res.status(404).json({ message: 'Daily update not found.' });
    if (!canViewUpdate(user, update)) {
      return res.status(403).json({ message: 'You do not have access to this update.' });
    }
    const escalation = createEscalationFromUpdate(user, update, {
      impact: req.body?.impact,
      severity: req.body?.severity,
    });
    store.appendAudit({
      user_id: user.id,
      user_name: user.name,
      user_role: user.role_name,
      entity_type: 'ESCALATION',
      entity_id: escalation.id,
      entity_name: update.project_name,
      action: 'ESCALATION_CREATED',
      description: `${user.name} escalated blocked work on ${update.project_name}: ${update.blocker || update.task_title}`,
    });
    if (store.getUsers().find((item) => item.role_code === 'CEO')) {
      const ceo = store.getUsers().find((item) => item.role_code === 'CEO')!;
      store.appendNotification({
        recipient_id: ceo.id,
        type: 'CRITICAL_ESCALATION',
        title: `Escalation — ${update.project_name}`,
        message: escalation.summary,
        entity_type: 'ESCALATION',
        entity_id: escalation.id,
      });
    }
    return res.status(201).json({ escalation });
  }
);

export default router;
