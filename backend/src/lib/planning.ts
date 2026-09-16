import { store } from '../store/db.js';
import {
  DailyUpdate,
  GanttStatus,
  Project,
  ProjectPhase,
  Task,
  Team,
  User,
} from '../types.js';
import { dateInAppTimezone } from './workCalendar.js';
import { ensureProjectTeamTasks } from './dailyUpdates.js';
import { newId } from './leadWorkflow.js';
import {
  canAccessGanttModule,
  canEditProjectGantt,
  canViewProjectGantt,
  ganttAccessFor,
  hydrateProject,
  persistRefreshedProjects,
} from './projects.js';
import { ganttStatus, persistComputedProgress, phaseProgress } from './projectProgress.js';
import { emitWorkflowEvent } from './workflowEngine.js';
import { applyTaskLifecycle } from './workTasks.js';

const DEFAULT_PHASES = [
  'Kickoff & Planning',
  'Engineering & Design',
  'Procurement',
  'Installation & Integration',
  'Commissioning & Handover',
];

const EXECUTION_ROLES = new Set(['EMPLOYEE', 'TEAM_LEAD', 'PROCUREMENT', 'EXECUTION', 'PROJECT_ENGINEER']);

export type TaskPatch = {
  title?: string;
  description?: string;
  status?: Task['status'];
  priority?: Task['priority'];
  start_date?: string;
  due_date?: string;
  duration_days?: number;
  progress_percent?: number;
  assigned_to_id?: string;
  team_id?: string;
  phase_id?: string | null;
  parent_task_id?: string | null;
  depends_on_id?: string | null;
  is_milestone?: boolean;
  remarks?: string;
  blocked_reason?: string;
  review_action?: 'approve' | 'return' | 'resubmit';
  review_comments?: string;
};

function todayDate() {
  return dateInAppTimezone();
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(start?: string, end?: string) {
  if (!start || !end) return 0;
  const ms = +new Date(`${end}T00:00:00`) - +new Date(`${start}T00:00:00`);
  return Math.max(0, Math.round(ms / 86400000));
}

function splitRange(start: string, end: string, parts: number) {
  const total = Math.max(parts, daysBetween(start, end) || parts * 14);
  const slice = Math.max(7, Math.round(total / parts));
  return Array.from({ length: parts }, (_, index) => {
    const from = addDays(start, index * slice);
    const to = index === parts - 1 ? end : addDays(from, slice - 1);
    return { start: from, due: to > end ? end : to };
  });
}

function phaseIndexForTeam(team?: Team) {
  const hay = `${team?.name || ''} ${team?.code || ''}`.toLowerCase();
  if (hay.includes('procure')) return 2;
  if (hay.includes('vision') || hay.includes('software') || hay.includes('robot') || hay.includes('engineer')) return 1;
  if (hay.includes('commission')) return 4;
  return 3;
}

function audit(user: User, action: string, description: string, entity: { id: string; name?: string; type?: 'TASK' | 'PROJECT' }, extra?: { old_value?: string; new_value?: string }) {
  store.appendAudit({
    user_id: user.id,
    user_name: user.name,
    user_role: user.role_name,
    entity_type: entity.type || 'TASK',
    entity_id: entity.id,
    entity_name: entity.name,
    action,
    description,
    old_value: extra?.old_value,
    new_value: extra?.new_value,
  });
}

function notifyAssignee(task: Task, actor: User) {
  if (!task.assigned_to_id || task.assigned_to_id === actor.id) return;
  const now = task.updated_at || new Date().toISOString();
  const project = task.project_id ? store.getProjects().find((item) => item.id === task.project_id) : undefined;
  emitWorkflowEvent({
    event: 'TASK_ASSIGNED',
    actor,
    entityType: 'TASK',
    entityId: task.id,
    entityName: task.title,
    recipientIds: [task.assigned_to_id],
    customer: project?.customer_name,
    status: 'Task Assigned',
    dueDate: task.due_date,
    assignedBy: actor.name,
    message: `New task assigned to you for ${project?.name || task.title}. Please review the requirements and begin execution.`,
    actionUrl: `/my-work?task=${encodeURIComponent(task.id)}`,
    eventKey: `TASK_ASSIGNED:${task.id}:${task.assigned_to_id}:${now}`,
  });
}

function latestUpdateForTask(taskId: string): DailyUpdate | undefined {
  return store
    .getDailyUpdates()
    .filter((item) => item.submission_status === 'SUBMITTED' && item.task_id === taskId)
    .sort((a, b) => +new Date(b.submitted_at || b.updated_at) - +new Date(a.submitted_at || a.updated_at))[0];
}

function projectTasks(projectId: string): Task[] {
  return store.getTasks().filter((task) => task.project_id === projectId);
}

function decorateTask(task: Task, phases: ProjectPhase[], allTasks: Task[]) {
  const latest = latestUpdateForTask(task.id);
  const depends = allTasks.find((item) => item.id === task.depends_on_id);
  const parent = allTasks.find((item) => item.id === task.parent_task_id);
  return {
    ...task,
    phase_name: phases.find((phase) => phase.id === task.phase_id)?.name,
    depends_on_title: depends?.title,
    parent_title: parent?.title,
    gantt_status: ganttStatus(task) as GanttStatus,
    latest_update_id: latest?.id,
    latest_update_at: latest?.submitted_at || task.last_update_at,
    latest_blocker: latest?.blocker || task.blocked_reason,
  };
}

function assigneesForProject(project: Project) {
  const teams = store.getTeams();
  const users = store.getUsers().filter((user) => user.status === 'ACTIVE');
  const teamIds = new Set(project.team_ids || []);
  return users
    .filter(
      (user) =>
        user.id === project.pm_id ||
        (user.team_id && teamIds.has(user.team_id) && EXECUTION_ROLES.has(user.role_code))
    )
    .map((user) => ({
      id: user.id,
      name: user.name,
      role_code: user.role_code,
      role_name: user.role_name,
      team_id: user.team_id,
      team_name: user.team_name || teams.find((team) => team.id === user.team_id)?.name,
    }));
}

function applyDates(task: Task, patch: TaskPatch): Task {
  let start = patch.start_date !== undefined ? patch.start_date || undefined : task.start_date;
  let due = patch.due_date !== undefined ? patch.due_date || undefined : task.due_date;
  let duration = patch.duration_days !== undefined ? Math.max(0, Math.round(patch.duration_days)) : task.duration_days;
  if (patch.is_milestone || (patch.is_milestone === undefined && task.is_milestone)) {
    duration = 0;
    if (start && !due) due = start;
    if (due && !start) start = due;
  } else if (start && patch.duration_days !== undefined) {
    due = addDays(start, duration || 0);
  } else if (start && due) {
    duration = daysBetween(start, due);
  } else if (due && patch.duration_days !== undefined) {
    start = addDays(due, -(duration || 0));
  }
  return { ...task, start_date: start, due_date: due, duration_days: duration };
}

function resolveAssignee(assignedToId?: string, teamId?: string) {
  const users = store.getUsers();
  const teams = store.getTeams();
  const user = assignedToId ? users.find((item) => item.id === assignedToId) : undefined;
  const team = (teamId || user?.team_id) ? teams.find((item) => item.id === (teamId || user?.team_id)) : undefined;
  const fallback = !user && team?.team_lead_id ? users.find((item) => item.id === team.team_lead_id) : undefined;
  const assignee = user || fallback;
  return {
    assigned_to: assignee?.name || (team ? `${team.name} team` : ''),
    assigned_to_id: assignee?.id || '',
    team_id: team?.id || assignee?.team_id,
    team_name: team?.name || assignee?.team_name,
  };
}

export function listPlanningProjects(user: User) {
  ensureProjectTeamTasks();
  if (!canAccessGanttModule(user)) return [];
  const projects = persistRefreshedProjects()
    .filter((project) => project.status === 'ACTIVE' && canViewProjectGantt(user, project));
  return projects.map((project) => {
    const access = ganttAccessFor(user, project);
    const tasks = projectTasks(project.id);
    return {
      id: project.id,
      code: project.code,
      name: project.name,
      customer_name: project.customer_name,
      pm_id: project.pm_id,
      pm_name: project.pm_name,
      team_lead_id: project.team_lead_id,
      team_lead_name: project.team_lead_name,
      progress: project.progress,
      health: project.health,
      status: project.status,
      plan_initialized: project.plan_initialized,
      start_date: project.start_date,
      target_completion: project.target_completion,
      canManage: access.canEditGantt,
      canViewGantt: access.canViewGantt,
      canEditGantt: access.canEditGantt,
      canManageGantt: access.canManageGantt,
      projectRole: access.projectRole,
      taskCount: tasks.filter((task) => !task.is_milestone).length,
      delayedCount: tasks.filter((task) => ganttStatus(task) === 'DELAYED').length,
      blockedCount: tasks.filter((task) => ganttStatus(task) === 'BLOCKED').length,
      milestoneCount: tasks.filter((task) => task.is_milestone).length,
    };
  });
}

export function getProjectPlan(user: User, projectId: string) {
  ensureProjectTeamTasks();
  const raw = store.getProjects().find((item) => item.id === projectId || item.code === projectId);
  if (!raw) return { error: 'not_found' as const };
  const project = hydrateProject(raw);
  if (!canViewProjectGantt(user, project)) return { error: 'forbidden' as const };
  const access = ganttAccessFor(user, project);
  const phases = store
    .getProjectPhases()
    .filter((phase) => phase.project_id === project.id)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((phase) => ({ ...phase, progress: phaseProgress(project.id, phase.id) }));
  const allTasks = projectTasks(project.id);
  const tasks = allTasks
    .map((task) => decorateTask(task, phases, allTasks))
    .sort((a, b) => {
      const phaseA = phases.find((phase) => phase.id === a.phase_id)?.sort_order ?? 99;
      const phaseB = phases.find((phase) => phase.id === b.phase_id)?.sort_order ?? 99;
      if (phaseA !== phaseB) return phaseA - phaseB;
      if (Boolean(a.parent_task_id) !== Boolean(b.parent_task_id)) return a.parent_task_id ? 1 : -1;
      return (a.start_date || a.due_date || '').localeCompare(b.start_date || b.due_date || '');
    });
  const teams = store
    .getTeams()
    .filter((team) => (project.team_ids || []).includes(team.id))
    .map((team) => ({
      id: team.id,
      name: team.name,
      team_lead_id: team.team_lead_id,
      team_lead_name: team.team_lead_name,
    }));
  return {
    project,
    canManage: access.canEditGantt,
    canViewGantt: access.canViewGantt,
    canEditGantt: access.canEditGantt,
    canManageGantt: access.canManageGantt,
    projectRole: access.projectRole,
    phases,
    tasks,
    teams,
    assignees: assigneesForProject(project),
    delayed: tasks.filter((task) => task.gantt_status === 'DELAYED'),
    blocked: tasks.filter((task) => task.gantt_status === 'BLOCKED'),
  };
}

function loadedPlan(user: User, projectId: string) {
  const plan = getProjectPlan(user, projectId);
  if ('error' in plan) return null;
  return plan;
}

export { loadedPlan as loadAuthorizedPlan };

export function createDefaultPlan(user: User, project: Project) {
  const existing = store.getProjectPhases().filter((phase) => phase.project_id === project.id);
  if (existing.length) return loadedPlan(user, project.id);

  ensureProjectTeamTasks();
  const start = project.start_date || todayDate();
  const end = project.target_completion || addDays(start, 90);
  const ranges = splitRange(start, end, DEFAULT_PHASES.length);
  const now = new Date().toISOString();
  const phases: ProjectPhase[] = DEFAULT_PHASES.map((name, index) => ({
    id: newId('phase'),
    project_id: project.id,
    name,
    sort_order: index,
    start_date: ranges[index].start,
    due_date: ranges[index].due,
    created_at: now,
    updated_at: now,
  }));
  store.saveProjectPhases([...store.getProjectPhases(), ...phases]);

  const teams = store.getTeams();
  const tasks = store.getTasks();
  for (let i = 0; i < tasks.length; i += 1) {
    const task = tasks[i];
    if (task.project_id !== project.id || task.phase_id) continue;
    const team = teams.find((item) => item.id === (task.team_id || store.findUserById(task.assigned_to_id)?.team_id));
    const phase = phases[phaseIndexForTeam(team)] || phases[3];
    const startDate = task.start_date || phase.start_date || start;
    const dueDate = task.due_date || phase.due_date || end;
    tasks[i] = {
      ...task,
      phase_id: phase.id,
      team_id: task.team_id || team?.id,
      team_name: task.team_name || team?.name,
      start_date: startDate,
      due_date: dueDate,
      duration_days: task.is_milestone ? 0 : daysBetween(startDate, dueDate),
      updated_at: now,
    };
  }
  store.saveTasks(tasks);

  const projects = store.getProjects();
  const index = projects.findIndex((item) => item.id === project.id);
  if (index !== -1) {
    projects[index] = {
      ...projects[index],
      plan_initialized: true,
      current_phase: phases[0].name,
      updated_at: now,
    };
    store.saveProjects(projects);
  }

  persistComputedProgress(project.id);
  audit(user, 'PLAN_CREATED', `${user.name} created the execution plan for ${project.code}.`, {
    id: project.id,
    name: project.code,
    type: 'PROJECT',
  });
  return loadedPlan(user, project.id);
}

export function addPhase(user: User, project: Project, body: { name?: string; start_date?: string; due_date?: string; remarks?: string }) {
  const name = body.name?.trim();
  if (!name) return { error: 'Phase name is required.' } as const;
  const existing = store.getProjectPhases().filter((phase) => phase.project_id === project.id);
  const now = new Date().toISOString();
  const phase: ProjectPhase = {
    id: newId('phase'),
    project_id: project.id,
    name,
    sort_order: existing.length,
    start_date: body.start_date || project.start_date || todayDate(),
    due_date: body.due_date || project.target_completion,
    remarks: body.remarks?.trim(),
    created_at: now,
    updated_at: now,
  };
  store.saveProjectPhases([...store.getProjectPhases(), phase]);
  const projects = store.getProjects();
  const index = projects.findIndex((item) => item.id === project.id);
  if (index !== -1) {
    projects[index] = { ...projects[index], plan_initialized: true, updated_at: now };
    store.saveProjects(projects);
  }
  audit(user, 'PHASE_ADDED', `${user.name} added phase "${name}" to ${project.code}.`, {
    id: project.id,
    name: project.code,
    type: 'PROJECT',
  });
  return { phase };
}

export function patchPhase(user: User, project: Project, phaseId: string, body: { name?: string; start_date?: string; due_date?: string; remarks?: string; sort_order?: number }) {
  const phases = store.getProjectPhases();
  const index = phases.findIndex((phase) => phase.id === phaseId && phase.project_id === project.id);
  if (index === -1) return null;
  const previous = phases[index];
  phases[index] = {
    ...previous,
    name: body.name?.trim() || previous.name,
    start_date: body.start_date || previous.start_date,
    due_date: body.due_date || previous.due_date,
    remarks: body.remarks !== undefined ? body.remarks : previous.remarks,
    sort_order: typeof body.sort_order === 'number' ? body.sort_order : previous.sort_order,
    updated_at: new Date().toISOString(),
  };
  store.saveProjectPhases(phases);
  audit(
    user,
    'PHASE_UPDATED',
    `${user.name} updated phase "${phases[index].name}" on ${project.code}.`,
    { id: project.id, name: project.code, type: 'PROJECT' },
    previous.due_date !== phases[index].due_date
      ? { old_value: previous.due_date, new_value: phases[index].due_date }
      : previous.start_date !== phases[index].start_date
        ? { old_value: previous.start_date, new_value: phases[index].start_date }
        : undefined
  );
  return phases[index];
}

export function addPlanTask(user: User, project: Project, body: TaskPatch & { title?: string }) {
  const title = body.title?.trim();
  if (!title) return { error: 'Task title is required.' } as const;
  const assignment = resolveAssignee(body.assigned_to_id, body.team_id);
  const now = new Date().toISOString();
  let task: Task = {
    id: newId('task'),
    lead_id: project.lead_id || '',
    project_id: project.id,
    title,
    description: body.description?.trim(),
    status: body.status || (body.is_milestone ? 'TODO' : 'TODO'),
    priority: body.priority || 'Medium',
    assigned_to: assignment.assigned_to,
    assigned_to_id: assignment.assigned_to_id,
    created_by: user.name,
    created_by_id: user.id,
    progress_percent: body.is_milestone ? 0 : Math.max(0, Math.min(100, body.progress_percent ?? 0)),
    phase_id: body.phase_id || undefined,
    parent_task_id: body.parent_task_id || undefined,
    team_id: assignment.team_id,
    team_name: assignment.team_name,
    depends_on_id: body.depends_on_id || undefined,
    is_milestone: Boolean(body.is_milestone),
    remarks: body.remarks?.trim(),
    blocked_reason: body.blocked_reason?.trim(),
    created_at: now,
    updated_at: now,
  };
  task = applyDates(task, body);
  if (task.is_milestone && !task.start_date) {
    task = { ...task, start_date: todayDate(), due_date: todayDate(), duration_days: 0 };
  }
  const tasks = store.getTasks();
  tasks.unshift(task);
  store.saveTasks(tasks);
  persistComputedProgress(project.id);
  audit(
    user,
    task.is_milestone ? 'MILESTONE_ADDED' : 'TASK_CREATED',
    `${user.name} added ${task.is_milestone ? 'milestone' : 'task'} "${task.title}" on ${project.code}.`,
    { id: task.id, name: task.title }
  );
  notifyAssignee(task, user);
  return { task };
}

export function patchPlanTask(user: User, project: Project, taskId: string, body: TaskPatch) {
  const tasks = store.getTasks();
  const index = tasks.findIndex((task) => task.id === taskId && task.project_id === project.id);
  if (index === -1) return null;
  const previous = tasks[index];
  const assignment =
    body.assigned_to_id !== undefined || body.team_id !== undefined
      ? resolveAssignee(body.assigned_to_id ?? previous.assigned_to_id, body.team_id ?? previous.team_id)
      : {
          assigned_to: previous.assigned_to,
          assigned_to_id: previous.assigned_to_id,
          team_id: previous.team_id,
          team_name: previous.team_name,
        };

  let next: Task = {
    ...previous,
    title: body.title?.trim() || previous.title,
    description: body.description !== undefined ? body.description : previous.description,
    status: body.status || previous.status,
    priority: body.priority || previous.priority,
    assigned_to: assignment.assigned_to,
    assigned_to_id: assignment.assigned_to_id,
    team_id: assignment.team_id,
    team_name: assignment.team_name,
    phase_id: body.phase_id === null ? undefined : body.phase_id ?? previous.phase_id,
    parent_task_id: body.parent_task_id === null ? undefined : body.parent_task_id ?? previous.parent_task_id,
    depends_on_id: body.depends_on_id === null ? undefined : body.depends_on_id ?? previous.depends_on_id,
    is_milestone: body.is_milestone ?? previous.is_milestone,
    remarks: body.remarks !== undefined ? body.remarks : previous.remarks,
    blocked_reason: body.blocked_reason !== undefined ? body.blocked_reason : previous.blocked_reason,
    updated_at: new Date().toISOString(),
  };

  if (typeof body.progress_percent === 'number' && Number.isFinite(body.progress_percent)) {
    next.progress_percent = Math.max(0, Math.min(100, Math.round(body.progress_percent)));
    next.last_update_at = new Date().toISOString();
    if (next.progress_percent >= 100) next.status = 'DONE';
    else if (next.status === 'TODO' && next.progress_percent > 0) next.status = 'IN_PROGRESS';
    else if (next.status === 'DONE' && next.progress_percent < 100) next.status = 'IN_PROGRESS';
  }

  if (body.status === 'DONE') {
    next.status = 'DONE';
    next.progress_percent = 100;
    next.blocked_reason = undefined;
  }
  if (body.status === 'BLOCKED') {
    next.status = 'BLOCKED';
    next.blocked_reason = body.blocked_reason?.trim() || body.remarks?.trim() || previous.blocked_reason || 'Blocked';
  }
  if (body.status === 'TODO' && previous.status !== 'TODO') {
    next.status = 'TODO';
    if ((next.progress_percent || 0) > 0 && body.progress_percent === undefined) next.progress_percent = 0;
  }

  next = applyDates(next, body);
  applyTaskLifecycle(user, previous, next, {
    reviewAction: body.review_action,
    comments: body.review_comments,
  });
  tasks[index] = next;
  store.saveTasks(tasks);
  persistComputedProgress(project.id);

  const changedAssign = previous.assigned_to_id !== next.assigned_to_id;
  const dateChanged = previous.due_date !== next.due_date || previous.start_date !== next.start_date;
  audit(
    user,
    next.is_milestone ? 'MILESTONE_UPDATED' : 'TASK_UPDATED',
    `${user.name} updated "${next.title}" on ${project.code}${changedAssign ? ` → ${next.assigned_to}` : ''}${
      dateChanged ? ` (${previous.due_date || previous.start_date || '—'} → ${next.due_date || next.start_date || '—'})` : ''
    }.`,
    { id: next.id, name: next.title },
    body.progress_percent !== undefined
      ? { old_value: String(previous.progress_percent ?? 0), new_value: String(next.progress_percent ?? 0) }
      : dateChanged
        ? { old_value: previous.due_date || previous.start_date, new_value: next.due_date || next.start_date }
        : undefined
  );
  if (changedAssign) notifyAssignee(next, user);

  if (next.status === 'BLOCKED' && previous.status !== 'BLOCKED') {
    const projects = store.getProjects();
    const pIndex = projects.findIndex((item) => item.id === project.id);
    if (pIndex !== -1) {
      projects[pIndex] = {
        ...projects[pIndex],
        health: projects[pIndex].health === 'CRITICAL' ? 'CRITICAL' : 'AT_RISK',
        issue: next.blocked_reason ? `BLOCKED — ${next.blocked_reason}` : projects[pIndex].issue,
        updated_at: new Date().toISOString(),
      };
      store.saveProjects(projects);
    }
  }

  return next;
}

export function requireAssignableProject(user: User, projectId: string) {
  const project = store.getProjects().find((item) => item.id === projectId || item.code === projectId);
  if (!project) return { error: 'not_found' as const };
  if (!canEditProjectGantt(user, project)) return { error: 'forbidden' as const, project };
  return { project };
}

export function requireViewableProject(user: User, projectId: string) {
  const project = store.getProjects().find((item) => item.id === projectId || item.code === projectId);
  if (!project) return { error: 'not_found' as const };
  if (!canViewProjectGantt(user, hydrateProject(project))) return { error: 'forbidden' as const, project };
  return { project };
}

export function updateProjectTimeline(user: User, project: Project, body: { start_date?: string; target_completion?: string }) {
  const start = String(body.start_date || '').trim().slice(0, 10);
  const due = String(body.target_completion || '').trim().slice(0, 10);
  if (!start && !due) return { error: 'Provide a project start date or target completion date.' } as const;
  const projects = store.getProjects();
  const index = projects.findIndex((item) => item.id === project.id);
  if (index === -1) return { error: 'not_found' as const };
  const previous = projects[index];
  const now = new Date().toISOString();
  const nextStart = start || previous.start_date;
  const nextDue = due || previous.target_completion;
  if (nextStart && nextDue && nextDue < nextStart) {
    return { error: 'Target completion cannot be earlier than the project start date.' } as const;
  }
  projects[index] = {
    ...previous,
    start_date: nextStart,
    target_completion: nextDue,
    updated_at: now,
  };
  store.saveProjects(projects);
  audit(
    user,
    'GANTT_TIMELINE_UPDATED',
    `${user.name} updated the Gantt timeline for ${project.code}.`,
    { id: project.id, name: project.code, type: 'PROJECT' },
    { old_value: `${previous.start_date || '—'} → ${previous.target_completion || '—'}`, new_value: `${nextStart || '—'} → ${nextDue || '—'}` }
  );
  return loadedPlan(user, project.id);
}

export function deletePhase(user: User, project: Project, phaseId: string) {
  const phases = store.getProjectPhases();
  const index = phases.findIndex((phase) => phase.id === phaseId && phase.project_id === project.id);
  if (index === -1) return null;
  const removed = phases[index];
  phases.splice(index, 1);
  store.saveProjectPhases(phases);
  const tasks = store.getTasks().map((task) =>
    task.project_id === project.id && task.phase_id === phaseId ? { ...task, phase_id: undefined, updated_at: new Date().toISOString() } : task
  );
  store.saveTasks(tasks);
  persistComputedProgress(project.id);
  audit(user, 'PHASE_DELETED', `${user.name} deleted phase "${removed.name}" from ${project.code}.`, {
    id: project.id,
    name: project.code,
    type: 'PROJECT',
  });
  return removed;
}

export function deletePlanTask(user: User, project: Project, taskId: string) {
  const tasks = store.getTasks();
  const index = tasks.findIndex((task) => task.id === taskId && task.project_id === project.id);
  if (index === -1) return null;
  const removed = tasks[index];
  const next = tasks
    .filter((task) => task.id !== taskId)
    .map((task) => {
      let updated = task;
      if (task.parent_task_id === taskId) updated = { ...updated, parent_task_id: undefined };
      if (task.depends_on_id === taskId) updated = { ...updated, depends_on_id: undefined };
      return updated;
    });
  store.saveTasks(next);
  persistComputedProgress(project.id);
  audit(
    user,
    removed.is_milestone ? 'MILESTONE_DELETED' : 'TASK_DELETED',
    `${user.name} deleted ${removed.is_milestone ? 'milestone' : 'task'} "${removed.title}" from ${project.code}.`,
    { id: removed.id, name: removed.title }
  );
  return removed;
}
