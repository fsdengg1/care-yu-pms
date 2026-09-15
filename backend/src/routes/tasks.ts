import { Router } from 'express';
import { AuthedRequest, requireAuth } from '../middleware/auth.js';
import { flushStore, store } from '../store/db.js';
import {
  acceptWorkTask,
  addTaskComment,
  canViewTask,
  createDependencyRequest,
  createWorkTask,
  deleteWorkTasks,
  rejectWorkTask,
  updateWorkTask,
} from '../lib/workTasks.js';
import { listAssignmentsForUser } from '../lib/dailyUpdates.js';
import {
  dateInAppTimezone,
  isMorningStatusLocked,
  isTaskInLockedMorningSnapshot,
  MORNING_LOCKED_MESSAGE,
} from '../lib/dailyStatus.js';

const router = Router();

function paramId(req: AuthedRequest) {
  const value = req.params.id;
  return Array.isArray(value) ? value[0] : value;
}

router.get('/', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const mine = String(req.query.mine || '') === '1';
  if (mine) {
    return res.json({ assignments: listAssignmentsForUser(user) });
  }
  const tasks = store.getTasks().filter((task) => canViewTask(user, task));
  return res.json({ tasks });
});

router.post('/', requireAuth, async (req: AuthedRequest, res) => {
  const body = { ...(req.body || {}) } as Record<string, unknown>;
  const period = String(body.period || '').toLowerCase();
  const workDate = String(body.work_date || dateInAppTimezone()).slice(0, 10);
  if (period === 'morning' && isMorningStatusLocked(workDate)) {
    return res.status(400).json({ message: MORNING_LOCKED_MESSAGE });
  }
  if (isMorningStatusLocked(workDate) && (period === 'evening' || body.is_additional === true)) {
    body.is_additional = true;
  }
  const result = createWorkTask(req.user!, body);
  if ('error' in result) return res.status(result.status || 400).json({ message: result.error });
  await flushStore();
  return res.status(201).json({ task: result.task, tasks: result.tasks || [result.task] });
});

router.post('/dependency-request', requireAuth, (req: AuthedRequest, res) => {
  const body = req.body || {};
  const result = createDependencyRequest(req.user!, {
    from_task_id: String(body.from_task_id || ''),
    assigned_to_id: String(body.assigned_to_id || ''),
    title: String(body.title || ''),
    description: body.description ? String(body.description) : undefined,
    due_date: body.due_date ? String(body.due_date) : undefined,
  });
  if ('error' in result) return res.status(result.status || 400).json({ message: result.error });
  return res.status(201).json({ task: result.task });
});

router.post('/bulk-delete', requireAuth, (req: AuthedRequest, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((id: unknown) => String(id)) : [];
  const date = dateInAppTimezone();
  if (ids.some((id: string) => isTaskInLockedMorningSnapshot(id, date))) {
    return res.status(400).json({ message: MORNING_LOCKED_MESSAGE });
  }
  const result = deleteWorkTasks(req.user!, ids);
  if ('error' in result) return res.status(result.status || 400).json({ message: result.error });
  return res.json({ message: `${result.deleted} selected task${result.deleted === 1 ? '' : 's'} deleted.`, ...result });
});

router.get('/:id', requireAuth, (req: AuthedRequest, res) => {
  const task = store.getTasks().find((item) => item.id === paramId(req));
  if (!task) return res.status(404).json({ message: 'Task not found.' });
  if (!canViewTask(req.user!, task)) {
    return res.status(403).json({ message: 'You do not have permission to view this project.' });
  }
  return res.json({ task });
});

router.patch('/:id', requireAuth, (req: AuthedRequest, res) => {
  const result = updateWorkTask(req.user!, paramId(req), req.body || {});
  if ('error' in result && result.error === 'not_found') return res.status(404).json({ message: 'Task not found.' });
  if ('error' in result) {
    return res
      .status(result.status || 403)
      .json({ message: result.error === 'forbidden' ? 'You do not have permission to update this task.' : result.error });
  }
  return res.json({ task: result.task });
});

router.post('/:id/accept', requireAuth, (req: AuthedRequest, res) => {
  const result = acceptWorkTask(req.user!, paramId(req));
  if ('error' in result && result.error === 'not_found') return res.status(404).json({ message: 'Task not found.' });
  if ('error' in result) return res.status(result.status || 400).json({ message: result.error });
  return res.json({ task: result.task, message: 'Task accepted.' });
});

router.post('/:id/reject', requireAuth, (req: AuthedRequest, res) => {
  const result = rejectWorkTask(req.user!, paramId(req), String(req.body?.reason || ''));
  if ('error' in result && result.error === 'not_found') return res.status(404).json({ message: 'Task not found.' });
  if ('error' in result) return res.status(result.status || 400).json({ message: result.error });
  return res.json({ task: result.task, message: 'Task rejected.' });
});

router.post('/:id/comments', requireAuth, (req: AuthedRequest, res) => {
  const result = addTaskComment(req.user!, paramId(req), String(req.body?.comment || ''));
  if ('error' in result && result.error === 'not_found') return res.status(404).json({ message: 'Task not found.' });
  if ('error' in result && result.error === 'forbidden') {
    return res.status(403).json({ message: 'You do not have permission to view this project.' });
  }
  if ('error' in result) return res.status(400).json({ message: result.error });
  return res.status(201).json({ task: result.task, comment: result.comment });
});

export default router;
