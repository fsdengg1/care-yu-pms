import { store } from '../store/db.js';
import { Task, TaskComment, User } from '../types.js';
import { hasPermission } from './rbac.js';
import { newId } from './leadWorkflow.js';
import { canViewProject } from './dailyUpdates.js';
import { notificationService } from './notificationService.js';
import { reminderScheduleFields, transferTaskResponsibility } from './responsibility.js';
import { emitWorkflowEvent, WorkflowEventKey } from './workflowEngine.js';
import { intakeStatusOf, markAcceptedInExecution, persistProject, stampProjectAction } from './projectWorkflow.js';
import { persistComputedProgress } from './projectProgress.js';
import { leadPipelineStageLabel } from './leadWorkflow.js';
import { delayReasonRequired, isOverdueOnDate, normalizeDelayReason, dateInAppTimezone } from './workCalendar.js';
import { leaveNonWorkingDays } from './leaveRequests.js';

export function canCreateWorkTask(user: User) {
  return hasPermission(user, 'create:task') || hasPermission(user, 'assign:task');
}

export function canCreateLeadPipelineTask(user: User) {
  return ['PROJECT_MANAGER', 'ENG_DIRECTOR', 'TEAM_LEAD', 'SYSTEM_ADMIN'].includes(user.role_code);
}

export function isLeadBasedTask(task: Pick<Task, 'task_type' | 'lead_id' | 'project_id'>) {
  if (task.task_type === 'LEAD_TASK') return true;
  return Boolean(task.lead_id) && !task.project_id && task.task_type !== 'PROJECT_TASK' && task.task_type !== 'NON_PROJECT_TASK';
}

function resolveProjectFromBody(body: Record<string, unknown>) {
  const requestedId = String(body.project_id || '').trim();
  const typedName = String(body.project_name || '').trim();
  const projects = store.getProjects();
  const byId = requestedId ? projects.find((item) => item.id === requestedId) : undefined;
  if (byId) return { project: byId, typedName: typedName || byId.name };
  const needle = (typedName || requestedId).trim().toLowerCase();
  if (!needle) return { project: undefined, typedName: '' };
  const byName = projects.find(
    (item) =>
      item.name.trim().toLowerCase() === needle ||
      String(item.code || '').trim().toLowerCase() === needle
  );
  return { project: byName, typedName: typedName || requestedId };
}

function taskStatusFromBody(value: unknown): Task['status'] {
  const raw = String(value || '').trim();
  if (!raw) return 'TODO';
  const upper = raw.toUpperCase().replace(/\s+/g, '_');
  if (raw === 'Completed' || upper === 'DONE' || upper === 'COMPLETED') return 'DONE';
  if (raw === 'In Progress' || upper === 'IN_PROGRESS' || upper === 'WORK_IN_PROGRESS') return 'IN_PROGRESS';
  if (raw === 'Hold' || raw === 'On Hold' || upper === 'HOLD' || upper === 'ON_HOLD') return 'HOLD';
  if (raw === 'Waiting' || upper === 'WAITING' || upper === 'BLOCKED') return 'WAITING';
  if (raw === 'Cancelled' || upper === 'CANCELLED' || upper === 'CANCELED') return 'CANCELLED';
  if (raw === 'Yet to Start' || raw === 'Not Started' || upper === 'TODO' || upper === 'YET_TO_START' || upper === 'NOT_STARTED') return 'TODO';
  return 'TODO';
}

export function reviewerForTask(task: Task): User | undefined {
  if (task.project_id) {
    const project = store.getProjects().find((item) => item.id === task.project_id);
    if (project?.team_lead_id) {
      const lead = store.findUserById(project.team_lead_id);
      if (lead?.status === 'ACTIVE') return lead;
    }
    if (project?.pm_id) {
      const pm = store.findUserById(project.pm_id);
      if (pm?.status === 'ACTIVE' && !task.assigned_to_id) return pm;
    }
  }
  const assignee = store.findUserById(task.assigned_to_id);
  if (assignee?.team_lead_id) {
    const lead = store.findUserById(assignee.team_lead_id);
    if (lead?.status === 'ACTIVE') return lead;
  }
  if (task.assigned_by_id && task.assigned_by_id !== task.assigned_to_id) {
    const creator = store.findUserById(task.assigned_by_id);
    if (creator && ['TEAM_LEAD', 'PROJECT_MANAGER'].includes(creator.role_code) && creator.status === 'ACTIVE') {
      return creator;
    }
  }
  return undefined;
}

export function isTaskFullyComplete(task: Task) {
  if (task.review_status === 'PENDING_TL_REVIEW' || task.review_status === 'CORRECTION_REQUIRED') return false;
  return task.status === 'DONE';
}

function notifyTaskHandover(task: Task, actor: User, recipientIds: Array<string | undefined>, input: {
  event: WorkflowEventKey;
  message: string;
  status: string;
  comments?: string;
}) {
  const project = task.project_id ? store.getProjects().find((item) => item.id === task.project_id) : undefined;
  emitWorkflowEvent({
    event: input.event,
    actor,
    entityType: 'TASK',
    entityId: task.id,
    entityName: task.title,
    recipientIds,
    customer: project?.customer_name,
    status: input.status,
    dueDate: task.due_date,
    comments: input.comments,
    assignedBy: actor.name,
    message: input.message,
    actionUrl: `/my-work?task=${encodeURIComponent(task.id)}`,
    eventKey: `${input.event}:${task.id}`,
  });
}

export function applyTaskLifecycle(
  user: User,
  previous: Task,
  next: Task,
  opts?: { reviewAction?: string; comments?: string }
): Task {
  const now = new Date().toISOString();
  const reviewer = reviewerForTask(next);
  const isAssignee = user.id === previous.assigned_to_id;
  const isReviewer = Boolean(reviewer && reviewer.id === user.id);
  const reviewAction = (opts?.reviewAction || '').toLowerCase();
  const comments = (opts?.comments || '').trim();

  if (reviewAction === 'approve' && (isReviewer || hasPermission(user, 'create:task'))) {
    next.status = 'DONE';
    next.review_status = 'COMPLETED';
    next.progress_percent = 100;
    next.pending_action = false;
    next.last_action_at = now;
    next.next_reminder_at = undefined;
    notifyTaskHandover(next, user, [next.assigned_to_id], {
      event: 'TASK_COMPLETED',
      message: `${user.name} approved "${next.title}". The task is complete.`,
      status: 'Completed',
      comments,
    });
    return next;
  }

  if (reviewAction === 'return' && (isReviewer || hasPermission(user, 'create:task'))) {
    next.status = 'IN_PROGRESS';
    next.review_status = 'CORRECTION_REQUIRED';
    next.progress_percent = Math.min(next.progress_percent ?? 90, 90);
    next.pending_action = true;
    next.responsible_user_id = next.assigned_to_id;
    next.responsible_user_name = next.assigned_to;
    next.remarks = comments || next.remarks;
    notifyTaskHandover(next, user, [next.assigned_to_id], {
      event: 'TASK_SENT_BACK',
      message: `${user.name} sent "${next.title}" back for correction.${comments ? ` ${comments}` : ''}`,
      status: 'Correction Required',
      comments,
    });
    return next;
  }

  const requestedStart = next.status === 'IN_PROGRESS' && previous.status !== 'IN_PROGRESS' && previous.status !== 'DONE';
  if (requestedStart) {
    next.last_action_at = now;
    next.start_date = next.start_date || now.slice(0, 10);
    if (!(next.progress_percent || 0)) next.progress_percent = 10;
    notifyTaskHandover(next, user, [reviewer?.id, next.assigned_by_id], {
      event: 'TASK_STARTED',
      message: `${user.name} started "${next.title}".`,
      status: 'Task In Progress',
    });
  }

  const wantsComplete =
    (next.status === 'DONE' && previous.status !== 'DONE') ||
    reviewAction === 'resubmit' ||
    (previous.review_status === 'CORRECTION_REQUIRED' && isAssignee && next.status === 'DONE');

  if (wantsComplete && isAssignee && reviewer && reviewer.id !== user.id && !next.is_milestone) {
    next.status = 'IN_PROGRESS';
    next.review_status = 'PENDING_TL_REVIEW';
    next.progress_percent = Math.min(99, Math.max(next.progress_percent ?? 90, 1));
    next.pending_action = true;
    next.responsible_user_id = reviewer.id;
    next.responsible_user_name = reviewer.name;
    next.last_action_at = now;
    notifyTaskHandover(next, user, [reviewer.id], {
      event: 'TASK_COMPLETED',
      message: `${user.name} submitted "${next.title}" for Team Lead review.`,
      status: 'Task Completed – Pending Team Lead Review',
      comments,
    });
    return next;
  }

  if (next.status === 'DONE') {
    next.review_status = 'COMPLETED';
    next.progress_percent = 100;
    next.pending_action = false;
    next.last_action_at = now;
    next.next_reminder_at = undefined;
    next.completed_at = next.completed_at || now;
    if (previous.status !== 'DONE' || previous.review_status === 'PENDING_TL_REVIEW') {
      notifyTaskHandover(next, user, [reviewer?.id, next.assigned_by_id], {
        event: 'TASK_COMPLETED',
        message: `${user.name} completed "${next.title}".`,
        status: 'Completed',
      });
    }
  }

  return next;
}

export function canViewTask(user: User, task: Task) {
  if (task.assigned_to_id === user.id || task.created_by_id === user.id || task.assigned_by_id === user.id) return true;
  if (task.responsible_user_id === user.id) return true;
  // Daily Work Updates / hub leadership: shared global visibility (not project-private).
  if (['CEO', 'CTO', 'BUSINESS_HEAD', 'ENG_DIRECTOR', 'PROJECT_MANAGER', 'SYSTEM_ADMIN'].includes(user.role_code)) {
    return true;
  }
  if (isLeadBasedTask(task) && ['TEAM_LEAD', 'PROJECT_MANAGER', 'ENG_DIRECTOR', 'SYSTEM_ADMIN'].includes(user.role_code)) {
    return true;
  }
  if (task.project_id) {
    const project = store.getProjects().find((item) => item.id === task.project_id);
    return Boolean(project && canViewProject(user, project));
  }
  return false;
}

export function isPendingAcceptance(task: Pick<Task, 'acceptance_status'>) {
  return task.acceptance_status === 'REQUESTED';
}

export function isTaskCreator(user: User, task: Pick<Task, 'created_by_id' | 'assigned_by_id'>) {
  return task.created_by_id === user.id || task.assigned_by_id === user.id;
}

export function canAcceptAssignedTask(user: User, task: Pick<Task, 'assigned_to_id' | 'acceptance_status'>) {
  return task.assigned_to_id === user.id && isPendingAcceptance(task);
}

/** Same task record is shared across Lead / My Assigned Work / Daily Work Updates. Edit access is role-based. */
export function canMutateWorkTask(user: User, task: Task): boolean {
  const assignee = task.assigned_to_id === user.id;
  const creator = isTaskCreator(user, task);
  if (isPendingAcceptance(task) && assignee && !creator) return false;
  const canManage =
    creator ||
    hasPermission(user, 'create:task') ||
    ['PROJECT_MANAGER', 'ENG_DIRECTOR', 'SYSTEM_ADMIN'].includes(user.role_code) ||
    (isLeadBasedTask(task) && ['TEAM_LEAD', 'PROJECT_MANAGER', 'ENG_DIRECTOR', 'SYSTEM_ADMIN'].includes(user.role_code));
  const ownAdditional = Boolean(task.is_additional) && assignee;
  const project = task.project_id ? store.getProjects().find((item) => item.id === task.project_id) : undefined;
  const isProjectTeamLead = user.role_code === 'TEAM_LEAD' && Boolean(project && project.team_lead_id === user.id);
  return assignee || canManage || isProjectTeamLead || ownAdditional;
}

/**
 * Task Description (and related sheet baseline fields) can be edited by a PM/admin
 * or by the assigned employee on Daily Work Updates.
 */
export function canEditTaskBaselineFields(user: User, task: Task): boolean {
  if (['SYSTEM_ADMIN', 'ENG_DIRECTOR', 'CEO', 'PROJECT_MANAGER'].includes(user.role_code)) return true;
  if (task.assigned_to_id === user.id) return true;
  const managerRoles = ['PROJECT_MANAGER', 'TEAM_LEAD', 'ENG_DIRECTOR', 'SYSTEM_ADMIN'];
  if (isTaskCreator(user, task) && managerRoles.includes(user.role_code)) return true;
  if (task.project_id) {
    const project = store.getProjects().find((item) => item.id === task.project_id);
    if (project?.pm_id === user.id) return true;
    if (user.role_code === 'TEAM_LEAD' && project?.team_lead_id === user.id) return true;
  }
  if (task.lead_id) {
    const lead = store.getLeads().find((item) => item.id === task.lead_id);
    if (lead?.pm_id === user.id) return true;
    if (user.role_code === 'TEAM_LEAD' && lead?.assigned_team_lead_id === user.id) return true;
  }
  return false;
}

function requestedBaselineFieldChange(body: Record<string, unknown>, current: Task): boolean {
  if (body.description !== undefined && String(body.description) !== String(current.description || '')) return true;
  if (body.title !== undefined && String(body.title || '').trim() && String(body.title).trim() !== current.title) return true;
  const nextDue = body.due_date !== undefined ? String(body.due_date || '') || undefined : undefined;
  if (body.due_date !== undefined && nextDue !== (current.due_date || undefined)) return true;
  const nextStart = body.start_date !== undefined ? String(body.start_date || '') || undefined : undefined;
  if (body.start_date !== undefined && nextStart !== (current.start_date || undefined)) return true;
  return false;
}

type CreateWorkTaskResult = { error: string; status?: number } | { task: Task; tasks: Task[] };

export function createWorkTask(user: User, body: Record<string, unknown>): CreateWorkTaskResult {
  const wantsAdditional = Boolean(body.is_additional);
  const requestedAssignee = String(body.assigned_to_id || '').trim() || user.id;
  const selfCreate = requestedAssignee === user.id;
  if (!canCreateWorkTask(user) && !selfCreate) {
    return { error: 'You do not have permission to create a task.', status: 403 as const };
  }
  if (!canCreateWorkTask(user)) {
    body = { ...body, assigned_to_id: user.id, is_additional: wantsAdditional };
  }
  const extraIds = Array.isArray(body.assigned_to_ids)
    ? (body.assigned_to_ids as unknown[]).map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  const primary = String(body.assigned_to_id || '').trim();
  const assigneeIds = [...new Set([...extraIds, ...(primary ? [primary] : [])])];
  if (assigneeIds.length > 1) {
    const created: Task[] = [];
    for (const id of assigneeIds) {
      const result = createWorkTask(user, { ...body, assigned_to_id: id, assigned_to_ids: undefined });
      if ('error' in result) return created.length ? { task: created[0], tasks: created } : result;
      created.push(result.task);
    }
    return { task: created[0], tasks: created };
  }

  const title = String(body.title || '').trim() || 'Untitled task';
  const requestedLeadId = String(body.lead_id || '').trim();
  const requestedType = String(body.task_type || '').toUpperCase();
  const lead =
    requestedLeadId || requestedType === 'LEAD_TASK'
      ? store.getLeads().find((item) => item.id === requestedLeadId)
      : undefined;
  if ((requestedLeadId || requestedType === 'LEAD_TASK') && !lead) {
    return { error: 'Lead was not found.' };
  }
  if (lead && !canCreateLeadPipelineTask(user)) {
    return { error: 'You do not have permission to create a task against a Lead.', status: 403 as const };
  }
  if (lead && !String(body.assigned_to_id || '').trim()) {
    return { error: 'Select a team member to assign this lead task.' };
  }

  const resolved = lead ? { project: undefined, typedName: '' } : resolveProjectFromBody(body);
  let project = resolved.project;
  const typedProjectName = resolved.typedName;
  if (project) {
    const intakeBlocked = ['AWAITING_ASSIGNMENT', 'PENDING_TL_REVIEW', 'RETURNED', 'DRAFT', 'SUBMITTED_TO_PM', 'RETURNED_TO_CREATOR'].includes(
      intakeStatusOf(project)
    );
    const notAllowed =
      intakeBlocked ||
      (user.role_code === 'PROJECT_MANAGER' && project.pm_id !== user.id) ||
      (user.role_code === 'TEAM_LEAD' &&
        project.team_lead_id !== user.id &&
        !(project.team_ids || []).includes(user.team_id || '')) ||
      (!canCreateWorkTask(user) && !canViewProject(user, project));
    if (notAllowed) project = undefined;
  }

  const assigneeId = String(body.assigned_to_id || user.id);
  const assignee = store.findUserById(assigneeId);
  if (!assignee || assignee.status !== 'ACTIVE') return { error: 'Assigned employee was not found.' };
  if (user.role_code === 'TEAM_LEAD' && assignee.id !== user.id && assignee.team_id !== user.team_id) {
    return { error: 'Team Leads can only assign tasks to members of their own team.' };
  }

  let parentTaskId = body.parent_task_id ? String(body.parent_task_id).trim() : '';
  if (parentTaskId) {
    const parent = store.getTasks().find((item) => item.id === parentTaskId);
    if (!parent) return { error: 'Parent task was not found.' };
    if (parent.parent_task_id) return { error: 'Subtasks cannot be nested more than one level.' };
    if (!canViewTask(user, parent) && parent.assigned_to_id !== user.id) {
      return { error: 'You do not have permission to add a subtask to this parent.', status: 403 as const };
    }
    if (!project && parent.project_id && !lead) {
      project = store.getProjects().find((item) => item.id === parent.project_id);
    }
  } else {
    parentTaskId = '';
  }

  const isLeadTask = Boolean(lead);
  const taskType: Task['task_type'] = isLeadTask
    ? 'LEAD_TASK'
    : project || typedProjectName
      ? 'PROJECT_TASK'
      : 'NON_PROJECT_TASK';

  const now = new Date().toISOString();
  const initialStatus = taskStatusFromBody(body.status);
  const initialProgress =
    Number(body.progress_percent || 0) ||
    (initialStatus === 'DONE' ? 100 : initialStatus === 'IN_PROGRESS' ? 10 : 0);

  const acceptanceRaw = String(body.acceptance_status || '').toUpperCase();
  const acceptanceStatus: Task['acceptance_status'] =
    isLeadTask && assignee.id !== user.id
      ? 'REQUESTED'
      : acceptanceRaw === 'REQUESTED' || acceptanceRaw === 'ACCEPTED' || acceptanceRaw === 'REJECTED'
        ? (acceptanceRaw as Task['acceptance_status'])
        : isLeadTask
          ? 'ACCEPTED'
          : undefined;

  const task: Task = {
    id: newId('task'),
    lead_id: lead?.id || project?.lead_id || '',
    lead_name: lead?.title,
    lead_stage_at_creation: lead ? leadPipelineStageLabel(lead) : undefined,
    customer_name: lead?.customer_name || project?.customer_name,
    project_id: isLeadTask ? undefined : project?.id,
    project_name: isLeadTask ? lead?.title : project?.name || typedProjectName || undefined,
    title,
    description: String(body.description || '').trim() || undefined,
    status: initialStatus,
    priority: (body.priority as Task['priority']) || 'Medium',
    due_date: body.due_date ? String(body.due_date) : undefined,
    start_date: body.start_date ? String(body.start_date) : now.slice(0, 10),
    assigned_to: assignee.name,
    assigned_to_id: assignee.id,
    assigned_by: user.name,
    assigned_by_id: user.id,
    created_by: user.name,
    created_by_id: user.id,
    responsible_user_id: assignee.id,
    responsible_user_name: assignee.name,
    ...reminderScheduleFields(true),
    progress_percent: initialProgress,
    team_id: assignee.team_id,
    team_name: assignee.team_name,
    remarks: body.remarks ? String(body.remarks) : undefined,
    task_type: taskType,
    is_additional: Boolean(body.is_additional),
    parent_task_id: parentTaskId || undefined,
    depends_on_id: body.depends_on_id ? String(body.depends_on_id) : undefined,
    depends_on_ids: Array.isArray(body.depends_on_ids)
      ? [...new Set((body.depends_on_ids as unknown[]).map((id) => String(id || '').trim()).filter(Boolean))]
      : body.depends_on_id
        ? [String(body.depends_on_id)]
        : undefined,
    acceptance_status: acceptanceStatus,
    requested_by_id: body.requested_by_id ? String(body.requested_by_id) : acceptanceStatus === 'REQUESTED' ? user.id : undefined,
    requested_by_name:
      body.requested_by_name
        ? String(body.requested_by_name)
        : acceptanceStatus === 'REQUESTED'
          ? user.name
          : undefined,
    requested_from_task_id: body.requested_from_task_id ? String(body.requested_from_task_id) : undefined,
    review_status: 'NONE',
    comments: [],
    created_at: now,
    updated_at: now,
  };
  const tasks = store.getTasks();
  tasks.unshift(task);
  store.saveTasks(tasks);
  store.appendAudit({
    user_id: user.id,
    user_name: user.name,
    user_role: user.role_name,
    entity_type: 'TASK',
    entity_id: task.id,
    entity_name: task.title,
    action: 'TASK_ASSIGNED',
    assigned_to: assignee.name,
    assigned_to_id: assignee.id,
    assigned_to_name: assignee.name,
    description: `${user.name} assigned "${task.title}" to ${assignee.name}.`,
  });
  if (assignee.id !== user.id) {
    emitWorkflowEvent({
      event: 'TASK_ASSIGNED',
      actor: user,
      entityType: 'TASK',
      entityId: task.id,
      entityName: task.title,
      recipientIds: [assignee.id],
      customer: lead?.customer_name || project?.customer_name,
      status: isLeadTask ? 'Pending Acceptance' : 'Task Assigned',
      dueDate: task.due_date,
      assignedBy: user.name,
      message: isLeadTask
        ? `New lead task assigned to you for ${lead?.lead_number || ''} ${lead?.title || ''}. It is already visible in My Assigned Work and Daily Work Updates. Accept it to start editing.`
        : `New task assigned to you for ${project?.name || task.title}. Please review the requirements and begin execution.`,
      actionUrl: `/my-work?task=${encodeURIComponent(task.id)}`,
      eventKey: `TASK_ASSIGNED:${task.id}:${assignee.id}:${now}`,
    });
  }
  if (project) {
    const current = store.getProjects().find((item) => item.id === project.id);
    if (current) {
      const afterAccept = markAcceptedInExecution(current, user);
      persistProject({
        ...afterAccept,
        current_phase: 'EXECUTION',
        ...stampProjectAction(user, 'TASK_ASSIGNED'),
      });
      persistComputedProgress(project.id);
    }
  }
  return { task, tasks: [task] };
}

export function setTaskSheetHidden(
  user: User,
  id: string,
  hidden: boolean
): { error: string; status?: number } | { task: Task } {
  const tasks = store.getTasks();
  const index = tasks.findIndex((item) => item.id === id);
  if (index === -1) return { error: 'not_found' as const };
  const current = tasks[index];
  if (!canViewTask(user, current)) return { error: 'forbidden' as const };
  const canToggle =
    current.assigned_to_id === user.id ||
    current.created_by_id === user.id ||
    current.assigned_by_id === user.id ||
    hasPermission(user, 'create:task') ||
    ['CEO', 'ENG_DIRECTOR', 'PROJECT_MANAGER', 'SYSTEM_ADMIN'].includes(user.role_code);
  if (!canToggle) return { error: 'forbidden' as const, status: 403 };
  const next: Task = {
    ...current,
    sheet_hidden: hidden === true,
    updated_at: new Date().toISOString(),
  };
  const copy = tasks.slice();
  copy[index] = next;
  store.saveTasks(copy);
  return { task: next };
}

export function updateWorkTask(user: User, id: string, body: Record<string, unknown>) {
  const tasks = store.getTasks();
  const index = tasks.findIndex((item) => item.id === id);
  if (index === -1) return { error: 'not_found' as const };
  const current = tasks[index];
  if (!canViewTask(user, current)) return { error: 'forbidden' as const };
  if (isPendingAcceptance(current) && canAcceptAssignedTask(user, current) && !isTaskCreator(user, current)) {
    return {
      error: 'Accept this task before editing details. You can view it in My Assigned Work and Daily Work Updates.',
      status: 403 as const,
    };
  }
  const canManage =
    isTaskCreator(user, current) ||
    hasPermission(user, 'create:task') ||
    ['PROJECT_MANAGER', 'ENG_DIRECTOR', 'SYSTEM_ADMIN'].includes(user.role_code);
  const ownAdditional = Boolean(current.is_additional) && current.assigned_to_id === user.id;
  const project = current.project_id ? store.getProjects().find((item) => item.id === current.project_id) : undefined;
  const isProjectTeamLead = user.role_code === 'TEAM_LEAD' && Boolean(project && project.team_lead_id === user.id);
  const canExecute = canMutateWorkTask(user, current);
  const canToggleHidden =
    canExecute || ['CEO', 'ENG_DIRECTOR', 'PROJECT_MANAGER', 'SYSTEM_ADMIN'].includes(user.role_code);
  if (!canExecute) {
    if (!canToggleHidden || body.sheet_hidden === undefined) return { error: 'forbidden' as const };
    return setTaskSheetHidden(user, id, body.sheet_hidden === true);
  }
  if (
    current.review_status === 'PENDING_TL_REVIEW' &&
    current.assigned_to_id === user.id &&
    !canManage &&
    !isProjectTeamLead
  ) {
    return { error: 'This task is awaiting Team Lead review and can no longer be edited.', status: 403 as const };
  }
  if (
    current.status === 'BLOCKED' &&
    !['TEAM_LEAD', 'PROJECT_MANAGER', 'ENG_DIRECTOR', 'SYSTEM_ADMIN'].includes(user.role_code)
  ) {
    const resumeAttempt =
      (body.status && String(body.status) !== 'BLOCKED') ||
      body.progress_percent !== undefined ||
      body.review_action;
    if (resumeAttempt) {
      return { error: 'This task is blocked until the Team Lead resolves the issue.', status: 403 as const };
    }
  }

  const next: Task = { ...current, updated_at: new Date().toISOString() };
  const canEditSheetFields = canExecute || canManage || ownAdditional || current.assigned_to_id === user.id;
  const canEditBaseline = canEditTaskBaselineFields(user, current);
  if (requestedBaselineFieldChange(body, current) && !canEditBaseline) {
    return { error: 'forbidden' as const, status: 403 };
  }
  if (canEditBaseline) {
    if (body.title) next.title = String(body.title).trim();
    if (body.description !== undefined) next.description = String(body.description);
    if (body.due_date !== undefined) next.due_date = String(body.due_date || '') || undefined;
    if (body.start_date !== undefined) next.start_date = String(body.start_date || '') || undefined;
  }
  if (canEditSheetFields) {
    if (body.sheet_hidden !== undefined) next.sheet_hidden = body.sheet_hidden === true;
    if (body.project_name !== undefined || body.project_id !== undefined) {
      if (isLeadBasedTask(current)) {
        // Lead relationship is immutable; do not convert a lead task into a project task.
      } else {
      const resolved = resolveProjectFromBody(body);
      if (resolved.project) {
        next.project_id = resolved.project.id;
        next.project_name = resolved.project.name;
        next.lead_id = resolved.project.lead_id || next.lead_id;
        next.task_type = 'PROJECT_TASK';
      } else if (resolved.typedName) {
        next.project_id = undefined;
        next.project_name = resolved.typedName;
        next.task_type = 'PROJECT_TASK';
      } else {
        next.project_id = undefined;
        next.project_name = undefined;
        next.task_type = 'NON_PROJECT_TASK';
      }
      }
    }
  }
  if (canManage || canExecute) {
    if (body.priority) next.priority = body.priority as Task['priority'];
    if (body.assigned_to_id) {
      const assignee = store.findUserById(String(body.assigned_to_id));
      if (assignee && assignee.id !== current.assigned_to_id) {
        const transferred = transferTaskResponsibility(next, assignee, user, 'Task reassigned');
        Object.assign(next, transferred.task);
        if (isLeadBasedTask(current) && assignee.id !== user.id) {
          next.acceptance_status = 'REQUESTED';
          next.requested_by_id = user.id;
          next.requested_by_name = user.name;
        }
        void notificationService.notifyForward({
          entityType: 'TASK',
          entityId: next.id,
          entityName: next.title,
          recipientUserId: assignee.id,
          assignedByUserId: user.id,
          previousUserId: transferred.previous?.id,
          reason: 'Task reassigned',
          eventKey: `TASK_FORWARDED:${next.id}:${assignee.id}:${next.updated_at}`,
        });
      } else if (assignee) {
        next.assigned_to_id = assignee.id;
        next.assigned_to = assignee.name;
        next.responsible_user_id = assignee.id;
        next.responsible_user_name = assignee.name;
      }
    }
  }
  if (body.status !== undefined && String(body.status).trim()) {
    next.status = taskStatusFromBody(body.status);
  }
  if (
    current.status === 'BLOCKED' &&
    next.status === 'IN_PROGRESS' &&
    user.role_code !== 'TEAM_LEAD' &&
    !['PROJECT_MANAGER', 'ENG_DIRECTOR', 'SYSTEM_ADMIN'].includes(user.role_code)
  ) {
    return { error: 'Only the Team Lead can clear a blocked task.', status: 403 as const };
  }
  if (body.progress_percent !== undefined) {
    next.progress_percent = Math.max(0, Math.min(100, Number(body.progress_percent) || 0));
    next.last_update_at = new Date().toISOString();
    next.progress_manual_override = true;
    if (next.progress_percent >= 100) next.status = 'DONE';
    else if (next.status === 'TODO' && next.progress_percent > 0) next.status = 'IN_PROGRESS';
    else if (next.status === 'DONE' && next.progress_percent < 100) next.status = 'IN_PROGRESS';
  }
  if (canEditSheetFields && body.depends_on_ids !== undefined) {
    const ids = Array.isArray(body.depends_on_ids)
      ? [...new Set((body.depends_on_ids as unknown[]).map((id) => String(id || '').trim()).filter(Boolean))]
      : [];
    next.depends_on_ids = ids;
    next.depends_on_id = ids[0];
  }
  if ((canManage || ownAdditional || current.assigned_to_id === user.id) && body.parent_task_id !== undefined) {
    const parentId = String(body.parent_task_id || '').trim();
    if (!parentId) {
      next.parent_task_id = undefined;
    } else if (parentId === current.id) {
      return { error: 'A task cannot be its own parent.', status: 400 as const };
    } else {
      const parent = tasks.find((item) => item.id === parentId);
      if (!parent) return { error: 'Parent task was not found.', status: 400 as const };
      if (parent.parent_task_id) return { error: 'Subtasks cannot be nested more than one level.', status: 400 as const };
      next.parent_task_id = parentId;
    }
  }
  if (body.progress_manual_override !== undefined) {
    next.progress_manual_override = Boolean(body.progress_manual_override);
  }
  if (body.blocked_reason !== undefined) next.blocked_reason = String(body.blocked_reason);
  if (body.delay_reason !== undefined || body.reason_for_delay !== undefined) {
    next.delay_reason = normalizeDelayReason(
      String(body.delay_reason || body.reason_for_delay || ''),
      String(body.delay_reason_other || '')
    );
  }
  if (canExecute && body.remarks !== undefined) next.remarks = String(body.remarks);
  if (next.status === 'IN_PROGRESS' && current.status === 'BLOCKED') {
    next.blocked_reason = undefined;
  }
  if (next.status === 'DONE' && current.assigned_to_id !== user.id && !canManage) {
    return { error: 'You can only complete tasks assigned to you.', status: 403 as const };
  }
  if (next.status === 'BLOCKED' && !String(next.blocked_reason || '').trim()) {
    return { error: 'Describe the issue or doubt against this task.', status: 400 as const };
  }
  applyTaskLifecycle(user, current, next, {
    reviewAction: String(body.review_action || ''),
    comments: String(body.review_comments || body.comments || ''),
  });

  if (next.status === 'DONE') {
    next.progress_percent = 100;
  } else if (next.status === 'TODO' && body.progress_percent === undefined) {
    next.progress_percent = 0;
  } else if (next.status === 'IN_PROGRESS' && !(next.progress_percent || 0) && current.status !== 'IN_PROGRESS') {
    next.progress_percent = 10;
  }
  if (next.status !== 'DONE' && (next.progress_percent || 0) >= 100) {
    next.progress_percent = 99;
  }

  const asOf = String(body.work_date || '').slice(0, 10);
  const today = /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? asOf : dateInAppTimezone();
  const leaveDays = next.assigned_to_id ? leaveNonWorkingDays(next.assigned_to_id, next.due_date || today, today) : new Set<string>();
  const overdue = isOverdueOnDate(next.due_date, next.status, today, leaveDays);
  if (delayReasonRequired(next.delay_reason, overdue, next.status === 'DONE')) {
    return { error: 'Reason for Delay is required because this task is overdue.', status: 400 as const };
  }

  if (next.status === 'BLOCKED' && current.status !== 'BLOCKED') {
    const project = next.project_id ? store.getProjects().find((item) => item.id === next.project_id) : undefined;
    notifyTaskHandover(next, user, [reviewerForTask(next)?.id, project?.team_lead_id], {
      event: 'ISSUE_RAISED',
      message: `${user.name} raised an issue on "${next.title}": ${next.blocked_reason}`,
      status: 'Issue / Doubt',
      comments: next.blocked_reason,
    });
    if (project) {
      persistProject({
        ...project,
        issue: next.blocked_reason,
        monitor_status: 'ISSUE_IDENTIFIED',
        ...stampProjectAction(user, 'ISSUE_IDENTIFIED'),
      });
    }
  }
  if (current.status === 'BLOCKED' && next.status === 'IN_PROGRESS' && next.project_id) {
    const project = store.getProjects().find((item) => item.id === next.project_id);
    if (project) {
      const stillBlocked = store
        .getTasks()
        .some((task) => task.project_id === next.project_id && task.id !== next.id && task.status === 'BLOCKED');
      persistProject({
        ...project,
        issue: stillBlocked ? project.issue : undefined,
        monitor_status: stillBlocked ? project.monitor_status : undefined,
        current_phase: 'EXECUTION',
        ...stampProjectAction(user, 'ISSUE_RESOLVED'),
      });
    }
  } else if (next.status === 'IN_PROGRESS' && current.status !== 'IN_PROGRESS' && next.project_id) {
    const project = store.getProjects().find((item) => item.id === next.project_id);
    if (project) persistProject({ ...project, current_phase: 'EXECUTION', ...stampProjectAction(user, 'TASK_STARTED') });
  } else if (
    next.project_id &&
    body.progress_percent !== undefined &&
    next.status !== 'DONE' &&
    next.review_status !== 'PENDING_TL_REVIEW'
  ) {
    const project = store.getProjects().find((item) => item.id === next.project_id);
    if (project) persistProject({ ...project, ...stampProjectAction(user, 'TASK_PROGRESS_UPDATED') });
  }
  if (
    next.project_id &&
    (next.status === 'DONE' && current.status !== 'DONE' ||
      (next.review_status === 'PENDING_TL_REVIEW' && current.review_status !== 'PENDING_TL_REVIEW'))
  ) {
    const project = store.getProjects().find((item) => item.id === next.project_id);
    if (project) persistProject({ ...project, ...stampProjectAction(user, 'TASK_COMPLETED') });
  }

  tasks[index] = next;
  store.saveTasks(tasks);
  if (next.project_id) persistComputedProgress(next.project_id);
  if (!isTaskFullyComplete(current) && isTaskFullyComplete(next)) {
    store.appendAudit({
      user_id: user.id,
      user_name: user.name,
      user_role: user.role_name,
      entity_type: 'TASK',
      entity_id: next.id,
      entity_name: next.title,
      action: 'TASK_COMPLETED',
      description: `${user.name} completed "${next.title}".`,
    });
    void import('./smartNotifications.js').then((mod) => {
      mod.markNotificationsCompleted('TASK', next.id);
    });
  } else if (
    current.status !== next.status ||
    current.progress_percent !== next.progress_percent ||
    (next.blocked_reason && current.blocked_reason !== next.blocked_reason)
  ) {
    const isBlocked = next.status === 'BLOCKED';
    store.appendAudit({
      user_id: user.id,
      user_name: user.name,
      user_role: user.role_name,
      entity_type: 'TASK',
      entity_id: next.id,
      entity_name: next.title,
      action: isBlocked ? 'TASK_BLOCKED' : 'TASK_UPDATED',
      description: isBlocked
        ? `${user.name} reported issue/blocker on "${next.title}": ${next.blocked_reason || 'Issue raised'}`
        : `${user.name} updated "${next.title}" (${current.status.replace('_', ' ')}, ${next.progress_percent}%).`,
    });
  }
  return { task: next };
}

export function addTaskComment(user: User, id: string, text: string) {
  const comment = text.trim();
  if (!comment) return { error: 'Comment is required.' };
  const tasks = store.getTasks();
  const index = tasks.findIndex((item) => item.id === id);
  if (index === -1) return { error: 'not_found' as const };
  const task = tasks[index];
  if (!canViewTask(user, task)) return { error: 'forbidden' as const };
  const entry: TaskComment = {
    id: newId('tcomm'),
    user_id: user.id,
    user_name: user.name,
    comment,
    created_at: new Date().toISOString(),
  };
  task.comments = [entry, ...(task.comments || [])];
  task.updated_at = entry.created_at;
  tasks[index] = task;
  store.saveTasks(tasks);
  return { task, comment: entry };
}

export function deleteWorkTasks(user: User, ids: string[]) {
  const uniqueIds = [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))];
  if (!uniqueIds.length) return { error: 'No tasks selected.', status: 400 as const };
  const canManage = hasPermission(user, 'create:task') || ['PROJECT_MANAGER', 'SYSTEM_ADMIN', 'TEAM_LEAD'].includes(user.role_code);
  const tasks = store.getTasks();
  const selected = tasks.filter((task) => {
    if (!uniqueIds.includes(task.id) || !canViewTask(user, task)) return false;
    if (canManage) return true;
    if (isTaskCreator(user, task) || canMutateWorkTask(user, task)) return true;
    if (isLeadBasedTask(task) && canCreateLeadPipelineTask(user)) return true;
    // Any user can delete their own subtasks (assignee or creator).
    const ownSubtask =
      Boolean(task.parent_task_id) &&
      (task.assigned_to_id === user.id || task.created_by_id === user.id);
    return ownSubtask;
  });
  if (!selected.length) {
    return {
      error: canManage
        ? 'No matching tasks were found.'
        : 'You can only delete subtasks assigned to you or created by you.',
      status: canManage ? (404 as const) : (403 as const),
    };
  }
  const removedIds = new Set(selected.map((task) => task.id));
  for (const task of tasks) {
    if (task.parent_task_id && removedIds.has(task.parent_task_id)) removedIds.add(task.id);
  }
  const removedTasks = tasks.filter((task) => removedIds.has(task.id));
  const next = tasks
    .filter((task) => !removedIds.has(task.id))
    .map((task) => {
      let updated = task;
      if (task.depends_on_id && removedIds.has(task.depends_on_id)) updated = { ...updated, depends_on_id: undefined };
      if (task.depends_on_ids?.some((id) => removedIds.has(id))) {
        updated = { ...updated, depends_on_ids: task.depends_on_ids.filter((id) => !removedIds.has(id)) };
      }
      return updated;
    });
  store.saveTasks(next);
  const projectIds = [...new Set(removedTasks.map((task) => task.project_id).filter(Boolean))] as string[];
  for (const projectId of projectIds) persistComputedProgress(projectId);
  for (const removed of removedTasks) {
    store.appendAudit({
      user_id: user.id,
      user_name: user.name,
      user_role: user.role_name,
      entity_type: 'TASK',
      entity_id: removed.id,
      entity_name: removed.title,
      action: 'TASK_DELETED',
      description: `${user.name} deleted task "${removed.title}".`,
    });
  }
  return { deleted: removedTasks.length, ids: [...removedIds] };
}

export function createDependencyRequest(
  user: User,
  body: {
    from_task_id: string;
    assigned_to_id: string;
    title: string;
    description?: string;
    due_date?: string;
  }
): CreateWorkTaskResult {
  const fromTask = store.getTasks().find((item) => item.id === body.from_task_id);
  if (!fromTask) return { error: 'Source task was not found.' };
  if (!canViewTask(user, fromTask) && fromTask.assigned_to_id !== user.id) {
    return { error: 'You do not have permission to request a dependency on this task.', status: 403 as const };
  }
  const title = String(body.title || '').trim();
  if (!title) return { error: 'Dependency title is required.' };
  return createWorkTask(user, {
    title,
    description: body.description || `Dependency requested from "${fromTask.title}"`,
    assigned_to_id: body.assigned_to_id,
    project_id: fromTask.project_id,
    project_name: fromTask.project_name,
    due_date: body.due_date || fromTask.due_date,
    status: 'TODO',
    acceptance_status: 'REQUESTED',
    requested_from_task_id: fromTask.id,
    depends_on_ids: [fromTask.id],
  });
}

export function acceptWorkTask(user: User, id: string) {
  const tasks = store.getTasks();
  const index = tasks.findIndex((item) => item.id === id);
  if (index === -1) return { error: 'not_found' as const };
  const current = tasks[index];
  if (current.assigned_to_id !== user.id) {
    return { error: 'Only the assigned employee can accept this task.', status: 403 as const };
  }
  if (current.acceptance_status && current.acceptance_status !== 'REQUESTED') {
    return { error: 'This task is not awaiting acceptance.', status: 400 as const };
  }
  const next: Task = {
    ...current,
    acceptance_status: 'ACCEPTED',
    status: current.status === 'TODO' ? 'IN_PROGRESS' : current.status,
    progress_percent: current.progress_percent || 10,
    updated_at: new Date().toISOString(),
  };
  tasks[index] = next;
  store.saveTasks(tasks);
  if (next.project_id) persistComputedProgress(next.project_id);
  store.appendAudit({
    user_id: user.id,
    user_name: user.name,
    user_role: user.role_name,
    entity_type: 'TASK',
    entity_id: next.id,
    entity_name: next.title,
    action: 'TASK_ACCEPTED',
    description: `${user.name} accepted task "${next.title}".`,
  });
  const notifyIds = [...new Set([current.requested_by_id, current.assigned_by_id].filter(Boolean))] as string[];
  if (notifyIds.length) {
    const leadTask = isLeadBasedTask(current);
    emitWorkflowEvent({
      event: 'TASK_ASSIGNED',
      actor: user,
      entityType: 'TASK',
      entityId: next.id,
      entityName: next.title,
      recipientIds: notifyIds,
      status: leadTask ? 'Lead Task Accepted' : 'Dependency Accepted',
      message: leadTask
        ? `${user.name} accepted lead task "${next.title}".`
        : `${user.name} accepted dependency "${next.title}".`,
      actionUrl: `/my-work?task=${encodeURIComponent(next.id)}`,
      eventKey: `TASK_ACCEPTED:${next.id}:${user.id}:${next.updated_at}`,
    });
  }
  return { task: next };
}

export function rejectWorkTask(user: User, id: string, reason?: string) {
  const tasks = store.getTasks();
  const index = tasks.findIndex((item) => item.id === id);
  if (index === -1) return { error: 'not_found' as const };
  const current = tasks[index];
  if (current.assigned_to_id !== user.id) {
    return { error: 'Only the assigned employee can reject this task.', status: 403 as const };
  }
  if (current.acceptance_status !== 'REQUESTED') {
    return { error: 'This task is not awaiting acceptance.', status: 400 as const };
  }
  const next: Task = {
    ...current,
    acceptance_status: 'REJECTED',
    remarks: reason?.trim() || current.remarks,
    updated_at: new Date().toISOString(),
  };
  tasks[index] = next;
  store.saveTasks(tasks);
  store.appendAudit({
    user_id: user.id,
    user_name: user.name,
    user_role: user.role_name,
    entity_type: 'TASK',
    entity_id: next.id,
    entity_name: next.title,
    action: 'TASK_REJECTED',
    description: `${user.name} rejected task "${next.title}".${next.remarks ? ` Reason: ${next.remarks}` : ''}`,
  });
  if (current.requested_by_id) {
    emitWorkflowEvent({
      event: 'TASK_ASSIGNED',
      actor: user,
      entityType: 'TASK',
      entityId: next.id,
      entityName: next.title,
      recipientIds: [current.requested_by_id],
      status: 'Dependency Rejected',
      message: `${user.name} rejected dependency "${next.title}".`,
      actionUrl: `/my-work?task=${encodeURIComponent(next.id)}`,
      eventKey: `TASK_REJECTED:${next.id}:${user.id}:${next.updated_at}`,
    });
  }
  return { task: next };
}
