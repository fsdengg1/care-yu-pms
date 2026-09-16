import { store } from '../store/db.js';
import {
  DailyUpdate,
  DailyWorkStatus,
  Escalation,
  Lead,
  Project,
  ProjectActivityItem,
  Task,
  User,
  WorkAssignment,
} from '../types.js';
import { canOwnLead } from './leadWorkflow.js';
import { formatEmployeeDisplayName } from './people.js';
import { persistComputedProgress } from './projectProgress.js';
import { buildEscalation, notifyEscalationOwner, persistProject, saveEscalation, stampProjectAction } from './projectWorkflow.js';
import { emitWorkflowEvent } from './workflowEngine.js';

export const STALE_HOURS = 48; // working-period window for "No Recent Update"

const EXECUTION_ROLES = new Set([
  'EMPLOYEE',
  'TEAM_LEAD',
  'PROCUREMENT',
  'EXECUTION',
  'PROJECT_ENGINEER',
]);

const MANAGER_VIEW_ROLES = new Set([
  'TEAM_LEAD',
  'PROJECT_MANAGER',
  'BUSINESS_HEAD',
  'ENG_DIRECTOR',
  'CEO',
  'CTO',
  'SYSTEM_ADMIN',
]);

export function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function taskStatusToWork(status: Task['status']): string {
  if (status === 'BLOCKED' || status === 'WAITING') return 'WAITING';
  if (status === 'HOLD') return 'HOLD';
  if (status === 'DONE') return 'COMPLETED';
  if (status === 'IN_PROGRESS') return 'IN_PROGRESS';
  return 'NOT_STARTED';
}

export function canSubmitOwnUpdates(user: User): boolean {
  return EXECUTION_ROLES.has(user.role_code) || user.role_code === 'SYSTEM_ADMIN';
}

export function canReviewUpdates(user: User): boolean {
  return MANAGER_VIEW_ROLES.has(user.role_code);
}

export function canCommentOnUpdates(user: User): boolean {
  return ['PROJECT_MANAGER', 'TEAM_LEAD', 'SYSTEM_ADMIN'].includes(user.role_code);
}

export function canEscalateUpdates(user: User): boolean {
  return ['PROJECT_MANAGER', 'TEAM_LEAD', 'EMPLOYEE', 'PROJECT_ENGINEER', 'EXECUTION', 'PROCUREMENT', 'SYSTEM_ADMIN'].includes(
    user.role_code
  );
}

export function ensureProjectTeamTasks(): Task[] {
  const projects = store.getProjects().filter((project) => project.status === 'ACTIVE');
  const users = store.getUsers().filter((user) => user.status === 'ACTIVE');
  const tasks = store.getTasks();
  let added = false;

  for (const project of projects) {
    if (project.plan_initialized) continue;
    const intake = project.intake_status || 'AWAITING_ASSIGNMENT';
    if (['AWAITING_ASSIGNMENT', 'PENDING_TL_REVIEW', 'RETURNED', 'ACCEPTED', 'DRAFT', 'SUBMITTED_TO_PM', 'RETURNED_TO_CREATOR'].includes(intake)) continue;
    if (project.assignment_path !== 'DIRECT_MEMBER' || !project.assigned_member_id) continue;
    const member = users.find((user) => user.id === project.assigned_member_id);
    if (!member) continue;
    const alreadyAssigned = tasks.some(
      (task) => task.project_id === project.id && task.assigned_to_id === member.id
    );
    if (alreadyAssigned) continue;
    const due = project.target_completion || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    tasks.unshift({
      id: `task-${project.id}-${member.id}`,
      lead_id: project.lead_id || '',
      project_id: project.id,
      title: `${project.name} — execution`,
      description: `Assigned execution work on ${project.customer_name} / ${project.name}.`,
      status: 'TODO',
      priority: project.health === 'CRITICAL' ? 'Critical' : project.health === 'AT_RISK' ? 'High' : 'Medium',
      due_date: due,
      assigned_to: member.name,
      assigned_to_id: member.id,
      created_by: project.pm_name,
      created_by_id: project.pm_id,
      progress_percent: 0,
      team_id: member.team_id,
      team_name: member.team_name,
      start_date: project.start_date || project.created_at.slice(0, 10),
      duration_days: 7,
      task_type: 'PROJECT_TASK',
      assigned_by: project.assigned_by_name || project.pm_name,
      assigned_by_id: project.assigned_by_id || project.pm_id,
      created_at: project.created_at,
      updated_at: project.updated_at,
    });
    added = true;
  }

  if (added) store.saveTasks(tasks);
  return store.getTasks();
}

function latestUpdateFor(assignmentId: string, taskId?: string): DailyUpdate | undefined {
  return store
    .getDailyUpdates()
    .filter((item) => item.submission_status === 'SUBMITTED')
    .filter((item) => item.assignment_id === assignmentId || Boolean(taskId && item.task_id === taskId))
    .sort((a, b) => +new Date(b.submitted_at || b.updated_at) - +new Date(a.submitted_at || a.updated_at))[0];
}

function assignmentFromTask(task: Task, project?: Project, lead?: Lead): WorkAssignment {
  const latest = latestUpdateFor(task.id, task.id);
  const isLeadTask =
    task.task_type === 'LEAD_TASK' ||
    (Boolean(task.lead_id) && !task.project_id && task.task_type !== 'PROJECT_TASK' && task.task_type !== 'NON_PROJECT_TASK');
  const taskType = task.task_type || (isLeadTask ? 'LEAD_TASK' : task.project_id ? 'PROJECT_TASK' : 'NON_PROJECT_TASK');
  const isNonProject = !isLeadTask && (taskType === 'NON_PROJECT_TASK' || (!task.project_id && !task.project_name));
  const allTasks = store.getTasks();
  const dependsOn = task.depends_on_id ? allTasks.find((item) => item.id === task.depends_on_id) : undefined;
  const parentTask = task.parent_task_id ? allTasks.find((item) => item.id === task.parent_task_id) : undefined;
  const dependencyIds = [...new Set([...(Array.isArray(task.depends_on_ids) ? task.depends_on_ids : []), task.depends_on_id].filter(Boolean))] as string[];
  const dependencyNames = dependencyIds
    .map((id) => {
      const person = store.findUserById(id);
      if (person) return formatEmployeeDisplayName(person);
      return allTasks.find((item) => item.id === id)?.title;
    })
    .filter(Boolean)
    .join(', ');
  const leadName = task.lead_name || lead?.title;
  const leadNumber = lead?.lead_number;
  const leadLabel = [leadNumber, leadName].filter(Boolean).join(' – ');
  return {
    id: task.id,
    source: 'TASK',
    task_id: task.id,
    lead_id: task.lead_id || project?.lead_id || lead?.id,
    lead_number: leadNumber,
    lead_name: leadName,
    lead_stage_at_creation: task.lead_stage_at_creation,
    project_id: isNonProject || isLeadTask ? undefined : task.project_id || project?.id,
    project_code: isNonProject || isLeadTask ? undefined : project?.code,
    project_name: isLeadTask
      ? leadLabel || leadName || task.title
      : project?.name || task.project_name || (isNonProject ? '—' : lead?.title || task.title),
    customer_name: isNonProject ? '' : task.customer_name || project?.customer_name || lead?.customer_name || '',
    task_title: task.title,
    workflow_stage: isLeadTask
      ? task.lead_stage_at_creation || lead?.pipeline_stage || 'LEAD'
      : lead?.pipeline_stage || (project && !isNonProject ? 'EXECUTION' : 'ASSIGNED'),
    due_date: task.due_date,
    priority: task.priority,
    last_update_at: latest?.submitted_at || task.last_update_at || task.updated_at,
    assigned_to_id: task.assigned_to_id,
    assigned_to: task.assigned_to,
    progress_percent: latest?.progress_percent ?? task.progress_percent ?? 0,
    current_status:
      task.review_status === 'PENDING_TL_REVIEW'
        ? 'PENDING_TL_REVIEW'
        : task.review_status === 'CORRECTION_REQUIRED'
          ? 'CORRECTION_REQUIRED'
          : latest?.work_status || taskStatusToWork(task.status),
    blocked: task.status === 'BLOCKED',
    blocker: task.blocked_reason || latest?.blocker,
    task_type: taskType,
    start_date: task.start_date,
    review_status: task.review_status,
    description: task.description,
    assigned_by: task.assigned_by,
    assigned_by_id: task.assigned_by_id,
    created_by: task.created_by,
    created_by_id: task.created_by_id,
    team_lead_name: project?.team_lead_name,
    depends_on_title: dependsOn?.title || dependencyNames || undefined,
    remarks: task.remarks,
    next_plan: latest?.next_plan,
    dependency: latest?.dependency || dependencyNames || undefined,
    acceptance_status: task.acceptance_status,
    requested_by_id: task.requested_by_id,
    requested_by_name: task.requested_by_name,
    parent_task_id: task.parent_task_id,
    parent_task_title: parentTask?.title || parentTask?.description,
    requested_from_task_id: task.requested_from_task_id,
  };
}

export function listAssignmentsForUser(user: User): WorkAssignment[] {
  const tasks = ensureProjectTeamTasks();
  const projects = store.getProjects();
  const leads = store.getLeads();
  const byProject = new Map(projects.map((project) => [project.id, project]));
  const byLead = new Map(leads.map((lead) => [lead.id, lead]));
  const items: WorkAssignment[] = [];
  const seen = new Set<string>();

  for (const task of tasks) {
    if (task.assigned_to_id !== user.id) continue;
    const item = assignmentFromTask(task, byProject.get(task.project_id || ''), byLead.get(task.lead_id));
    items.push(item);
    seen.add(item.id);
    if (task.employee_allocation_id) seen.add(task.employee_allocation_id);
    if (task.feasibility_team_assignment_id) seen.add(task.feasibility_team_assignment_id);
  }

  for (const task of tasks) {
    if (seen.has(task.id) || task.acceptance_status === 'REJECTED') continue;
    const ownsLeadTask =
      (task.task_type === 'LEAD_TASK' || Boolean(task.lead_id && !task.project_id)) &&
      (task.created_by_id === user.id || task.assigned_by_id === user.id);
    if (!ownsLeadTask) continue;
    const item = assignmentFromTask(task, byProject.get(task.project_id || ''), byLead.get(task.lead_id));
    items.push(item);
    seen.add(item.id);
  }

  if (user.role_code === 'TEAM_LEAD') {
    for (const task of tasks) {
      if (seen.has(task.id) || task.review_status !== 'PENDING_TL_REVIEW') continue;
      const project = byProject.get(task.project_id || '');
      const assignee = store.findUserById(task.assigned_to_id);
      const isReviewer =
        project?.team_lead_id === user.id || assignee?.team_lead_id === user.id || assignee?.team_id === user.team_id;
      if (!isReviewer) continue;
      const item = assignmentFromTask(task, project, byLead.get(task.lead_id));
      items.push(item);
      seen.add(item.id);
    }
  }

  for (const alloc of store.getFeasibilityEmployeeAllocations()) {
    if (alloc.employee_id !== user.id || seen.has(alloc.id)) continue;
    const lead = byLead.get(alloc.lead_id);
    const project = projects.find((item) => item.lead_id === alloc.lead_id);
    const assignment = store.getFeasibilityTeamAssignments().find((item) => item.id === alloc.feasibility_team_assignment_id);
    const latest = latestUpdateFor(alloc.id);
    items.push({
      id: alloc.id,
      source: 'FEASIBILITY_ALLOCATION',
      lead_id: alloc.lead_id,
      lead_number: lead?.lead_number,
      project_id: project?.id,
      project_code: project?.code,
      project_name: project?.name || lead?.title || 'Feasibility',
      customer_name: project?.customer_name || lead?.customer_name || '',
      task_title: alloc.responsibility || `${assignment?.team_name || 'Team'} feasibility`,
      workflow_stage: lead?.pipeline_stage || 'FEASIBILITY',
      due_date: assignment?.due_date,
      priority: assignment?.priority || lead?.priority || 'Medium',
      current_status: latest?.work_status || (alloc.completed_at ? 'COMPLETED' : alloc.started_at ? 'IN_PROGRESS' : 'NOT_STARTED'),
      last_update_at: latest?.submitted_at,
      assigned_to_id: alloc.employee_id,
      assigned_to: alloc.employee_name,
      progress_percent: latest?.progress_percent ?? 0,
      blocked: latest?.work_status === 'BLOCKED',
      blocker: latest?.blocker,
    });
    seen.add(alloc.id);
  }

  if (user.role_code === 'TEAM_LEAD') {
    for (const fta of store.getFeasibilityTeamAssignments()) {
      if (fta.team_lead_id !== user.id || fta.status === 'CANCELLED' || seen.has(fta.id)) continue;
      const lead = byLead.get(fta.lead_id);
      const project = projects.find((item) => item.lead_id === fta.lead_id);
      const latest = latestUpdateFor(fta.id);
      items.push({
        id: fta.id,
        source: 'FEASIBILITY_ASSIGNMENT',
        lead_id: fta.lead_id,
        lead_number: lead?.lead_number,
        project_id: project?.id,
        project_code: project?.code,
        project_name: project?.name || lead?.title || fta.team_name,
        customer_name: project?.customer_name || lead?.customer_name || '',
        task_title: `Feasibility — ${fta.team_name}`,
        workflow_stage: lead?.pipeline_stage || 'FEASIBILITY',
        due_date: fta.due_date,
        priority: fta.priority,
        current_status: latest?.work_status || fta.status,
        last_update_at: latest?.submitted_at,
        assigned_to_id: user.id,
        assigned_to: user.name,
        progress_percent: latest?.progress_percent ?? 0,
        blocked: latest?.work_status === 'BLOCKED',
        blocker: latest?.blocker,
      });
      seen.add(fta.id);
    }
  }

  return items.sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
}

export function canViewAssignment(user: User, item: WorkAssignment): boolean {
  if (user.role_code === 'SYSTEM_ADMIN' || user.role_code === 'CEO' || user.role_code === 'CTO') return true;
  // Daily Work Updates are a shared company sheet for PM + Engineering Director.
  if (user.role_code === 'PROJECT_MANAGER' || user.role_code === 'ENG_DIRECTOR') return true;
  if (item.assigned_to_id === user.id) return true;
  if (user.role_code === 'TEAM_LEAD') {
    const assignee = store.findUserById(item.assigned_to_id);
    return Boolean(assignee?.team_id && assignee.team_id === user.team_id);
  }
  if (user.role_code === 'BUSINESS_HEAD') {
    const lead = item.lead_id ? store.getLeads().find((entry) => entry.id === item.lead_id) : undefined;
    if (lead) return canOwnLead(user, lead);
    const project = item.project_id ? store.getProjects().find((entry) => entry.id === item.project_id) : undefined;
    if (project?.lead_id) {
      const linked = store.getLeads().find((entry) => entry.id === project.lead_id);
      return linked ? canOwnLead(user, linked) : false;
    }
    return false;
  }
  return false;
}

export function listVisibleAssignments(user: User): WorkAssignment[] {
  ensureProjectTeamTasks();
  if (canSubmitOwnUpdates(user) && !['TEAM_LEAD', 'SYSTEM_ADMIN'].includes(user.role_code)) {
    return listAssignmentsForUser(user);
  }

  const members = store.getUsers().filter((member) => member.status === 'ACTIVE' && (EXECUTION_ROLES.has(member.role_code) || member.role_code === 'TEAM_LEAD'));
  const seen = new Set<string>();
  const items: WorkAssignment[] = [];
  for (const member of members) {
    for (const item of listAssignmentsForUser(member)) {
      if (seen.has(item.id) || !canViewAssignment(user, item)) continue;
      seen.add(item.id);
      items.push(item);
    }
  }
  return items.sort((a, b) => (a.project_name || '').localeCompare(b.project_name || ''));
}

export function canViewProject(user: User, project: Project): boolean {
  if (['CEO', 'CTO', 'BUSINESS_HEAD', 'ENG_DIRECTOR', 'SYSTEM_ADMIN'].includes(user.role_code)) return true;
  if (project.intake_status === 'DRAFT') return project.created_by_id === user.id;
  if (user.role_code === 'PROJECT_MANAGER') return project.pm_id === user.id;
  if (user.role_code === 'TEAM_LEAD' && project.team_lead_id === user.id) return true;
  if (project.assigned_member_id === user.id) return true;
  if (user.team_id && (project.team_ids || []).includes(user.team_id)) return true;
  if (project.lead_id) {
    const lead = store.getLeads().find((item) => item.id === project.lead_id);
    if (lead && canOwnLead(user, lead)) return true;
  }
  return store.getTasks().some((task) => task.project_id === project.id && task.assigned_to_id === user.id);
}

export function canViewUpdate(user: User, update: DailyUpdate): boolean {
  if (update.user_id === user.id) return true;
  return canViewAssignment(user, {
    id: update.assignment_id,
    source: update.assignment_source,
    task_id: update.task_id,
    lead_id: update.lead_id,
    project_id: update.project_id,
    project_name: update.project_name,
    customer_name: update.customer_name,
    task_title: update.task_title,
    workflow_stage: '',
    priority: 'Medium',
    current_status: update.work_status,
    assigned_to_id: update.user_id,
    assigned_to: update.user_name,
    progress_percent: update.progress_percent,
    blocked: update.work_status === 'BLOCKED',
  });
}

export function findAssignment(user: User, assignmentId: string): WorkAssignment | undefined {
  return listAssignmentsForUser(user).find((item) => item.id === assignmentId || item.task_id === assignmentId);
}

export function isStale(lastUpdateAt?: string): boolean {
  if (!lastUpdateAt) return true;
  return Date.now() - +new Date(lastUpdateAt) > STALE_HOURS * 3600000;
}

export function resolveOrCreateTask(user: User, assignment: WorkAssignment): Task | undefined {
  const tasks = store.getTasks();
  if (assignment.task_id) {
    return tasks.find((task) => task.id === assignment.task_id);
  }

  const existing = tasks.find(
    (task) =>
      task.assigned_to_id === user.id &&
      ((assignment.project_id && task.project_id === assignment.project_id) ||
        (assignment.lead_id && task.lead_id === assignment.lead_id && task.title === assignment.task_title))
  );
  if (existing) return existing;

  const now = new Date().toISOString();
  const project = assignment.project_id ? store.getProjects().find((item) => item.id === assignment.project_id) : undefined;
  const task: Task = {
    id: `task-${assignment.id}`,
    lead_id: assignment.lead_id || '',
    project_id: assignment.project_id,
    feasibility_team_assignment_id: assignment.source === 'FEASIBILITY_ASSIGNMENT' ? assignment.id : undefined,
    employee_allocation_id: assignment.source === 'FEASIBILITY_ALLOCATION' ? assignment.id : undefined,
    title: assignment.task_title,
    description: `${assignment.project_name} / ${assignment.customer_name}`,
    status: 'TODO',
    priority: assignment.priority,
    due_date: assignment.due_date,
    assigned_to: user.name,
    assigned_to_id: user.id,
    created_by: project?.pm_name || user.name,
    created_by_id: project?.pm_id || user.id,
    progress_percent: assignment.progress_percent,
    created_at: now,
    updated_at: now,
  };
  tasks.unshift(task);
  store.saveTasks(tasks);
  return task;
}

export function applyUpdateToTask(update: DailyUpdate) {
  if (!update.task_id) return;
  const tasks = store.getTasks();
  const index = tasks.findIndex((task) => task.id === update.task_id);
  if (index === -1) return;
  const previous = tasks[index];
  if (previous.status === 'BLOCKED' && update.work_status !== 'BLOCKED') {
    tasks[index] = {
      ...previous,
      last_update_at: update.submitted_at || update.updated_at,
      updated_at: new Date().toISOString(),
    };
    store.saveTasks(tasks);
    return;
  }
  let nextStatus: Task['status'] = previous.status;
  if (update.work_status === 'BLOCKED') nextStatus = 'BLOCKED';
  else if (update.work_status === 'IN_PROGRESS' && previous.status === 'TODO') nextStatus = 'IN_PROGRESS';
  else if (update.work_status === 'COMPLETED' && previous.status === 'TODO') nextStatus = 'IN_PROGRESS';
  tasks[index] = {
    ...previous,
    status: nextStatus,
    progress_percent: update.progress_percent,
    last_update_at: update.submitted_at || update.updated_at,
    blocked_reason: update.work_status === 'BLOCKED' ? update.blocker : previous.blocked_reason,
    start_date: previous.start_date || (nextStatus === 'IN_PROGRESS' ? todayDate() : previous.start_date),
    updated_at: new Date().toISOString(),
  };
  store.saveTasks(tasks);
  if (update.project_id) persistComputedProgress(update.project_id);

  if (update.work_status === 'BLOCKED' && update.project_id) {
    const projects = store.getProjects();
    const pIndex = projects.findIndex((project) => project.id === update.project_id);
    if (pIndex !== -1) {
      const current = projects[pIndex];
      const blockerLabel = update.blocker ? `BLOCKED — ${update.blocker}` : current.issue;
      projects[pIndex] = {
        ...current,
        health: current.health === 'CRITICAL' ? 'CRITICAL' : 'AT_RISK',
        issue: blockerLabel,
        updated_at: new Date().toISOString(),
      };
      store.saveProjects(projects);
    }
  }
}

export function notifyForSubmittedUpdate(update: DailyUpdate) {
  const project = update.project_id ? store.getProjects().find((item) => item.id === update.project_id) : undefined;
  const assignee = store.findUserById(update.user_id);
  const isBlocked = update.work_status === 'BLOCKED';
  emitWorkflowEvent({
    event: isBlocked ? 'ISSUE_RAISED' : 'DAILY_UPDATE_SUBMITTED',
    actor: assignee || ({ name: update.user_name } as User),
    entityType: 'DAILY_UPDATE',
    entityId: update.id,
    entityName: update.task_title || update.project_name,
    recipientIds: [project?.pm_id, assignee?.team_lead_id, assignee?.reporting_manager_id],
    customer: update.customer_name || project?.customer_name,
    status: isBlocked ? 'Issue / Blocker Identified' : 'Daily Update Submitted',
    dueDate: update.work_date,
    comments: [update.blocker, update.next_plan, update.work_completed].filter(Boolean).join(' | '),
    message: isBlocked
      ? `${update.user_name}: BLOCKED — ${update.blocker || update.task_title}`
      : `${update.user_name} submitted ${update.progress_percent}% on ${update.task_title}.`,
    actionUrl: `/daily-updates/${update.id}`,
    eventKey: `${isBlocked ? 'ISSUE_RAISED' : 'DAILY_UPDATE'}:${update.id}`,
  });
  if (project) {
    persistProject({
      ...project,
      monitor_status: isBlocked ? 'ISSUE_IDENTIFIED' : project.monitor_status,
      issue: isBlocked ? update.blocker || project.issue : project.issue,
      ...stampProjectAction(assignee || ({ id: update.user_id, name: update.user_name } as User), isBlocked ? 'ISSUE_IDENTIFIED' : 'DAILY_UPDATE_SUBMITTED'),
    });
  }
}

export function listVisibleUpdates(user: User): DailyUpdate[] {
  return store
    .getDailyUpdates()
    .filter((item) => item.assignment_id && canViewUpdate(user, item))
    .sort((a, b) => +new Date(b.work_date || b.created_at) - +new Date(a.work_date || a.created_at));
}

export function buildSummary(user: User) {
  const updates = listVisibleUpdates(user).filter((item) => item.submission_status === 'SUBMITTED');
  const assignments = listVisibleAssignments(user);
  const today = todayDate();
  const submittedToday = updates.filter((item) => item.work_date === today || item.submitted_at?.startsWith(today));
  const blocked = updates.filter((item) => item.work_status === 'BLOCKED');
  const completed = updates.filter((item) => item.work_status === 'COMPLETED');
  const stale = assignments.filter((item) => isStale(item.last_update_at) && item.current_status !== 'COMPLETED');
  const needingAttention = new Set(
    [...blocked.map((item) => item.project_id), ...stale.map((item) => item.project_id)].filter(Boolean)
  );

  const pendingToday = assignments.filter((item) => {
    if (item.current_status === 'COMPLETED') return false;
    return !submittedToday.some((update) => update.assignment_id === item.id || update.task_id === item.task_id);
  });

  const executive = buildExecutiveDailyWork();

  return {
    submittedToday: submittedToday.length,
    pendingToday: pendingToday.length,
    blocked: blocked.length,
    completed: completed.length,
    projectsNeedingAttention: needingAttention.size,
    staleAssignments: stale.length,
    updatesToday: submittedToday,
    blockedUpdates: blocked,
    staleItems: stale,
    pendingItems: pendingToday,
    ...executive,
  };
}

export function buildExecutiveDailyWork() {
  const ceo = store.getUsers().find((user) => user.role_code === 'CEO');
  const viewer = ceo || ({ id: 'u-ceo', role_code: 'CEO' } as User);
  const assignments = listVisibleAssignments(viewer);
  const updates = store.getDailyUpdates().filter((item) => item.submission_status === 'SUBMITTED');
  const recentCutoff = Date.now() - 24 * 3600000;
  const projectsRecent = new Set(
    updates.filter((item) => +new Date(item.submitted_at || item.created_at) >= recentCutoff).map((item) => item.project_id)
  );
  const activeProjects = store.getProjects().filter((project) => project.status === 'ACTIVE');
  const staleProjects = activeProjects.filter((project) => {
    const related = assignments.filter((item) => item.project_id === project.id);
    if (!related.length) return isStale(project.updated_at);
    return related.every((item) => isStale(item.last_update_at));
  });
  const blocked = assignments.filter((item) => item.blocked);
  const majorBlockers = blocked.slice(0, 6).map((item) => ({
    project: item.project_name,
    customer: item.customer_name,
    summary: item.blocker ? `BLOCKED — ${item.blocker}` : 'Blocked task',
    href: `/daily-updates?project=${item.project_id || ''}`,
  }));

  return {
    projectsWithRecentProgress: [...projectsRecent].filter(Boolean).length,
    projectsWithNoRecentUpdate: staleProjects.length,
    blockedTasks: blocked.length,
    majorBlockers,
    teamActivity: updates.filter((item) => +new Date(item.submitted_at || item.created_at) >= recentCutoff).length,
  };
}

export function buildProjectActivity(projectId: string): ProjectActivityItem[] {
  const project = store.getProjects().find((item) => item.id === projectId);
  if (!project) return [];
  const items: ProjectActivityItem[] = [];

  for (const update of store.getDailyUpdates().filter((item) => item.project_id === projectId && item.submission_status === 'SUBMITTED')) {
    items.push({
      id: update.id,
      at: update.submitted_at || update.created_at,
      kind: 'DAILY_UPDATE',
      title: `${update.task_title} — ${update.work_status.replace('_', ' ')}`,
      detail: update.work_completed || update.next_plan,
      actor: update.user_name,
      status: update.work_status,
      href: `/daily-updates/${update.id}`,
    });
    for (const comment of update.pm_comments || []) {
      items.push({
        id: comment.id,
        at: comment.created_at,
        kind: 'PM_COMMENT',
        title: 'PM comment',
        detail: comment.comment,
        actor: comment.user_name,
        href: `/daily-updates/${update.id}`,
      });
    }
    if (update.work_status === 'BLOCKED' && update.blocker) {
      items.push({
        id: `${update.id}-blocker`,
        at: update.submitted_at || update.created_at,
        kind: 'DAILY_UPDATE',
        title: `BLOCKED — ${update.blocker}`,
        detail: update.support_required || update.dependency || update.blocker,
        actor: update.user_name,
        status: 'BLOCKED',
        href: `/daily-updates/${update.id}`,
      });
    }
  }

  for (const audit of store.getAudits().filter((item) => item.entity_id === projectId || item.entity_id === project.lead_id || item.entity_type === 'DAILY_UPDATE')) {
    if (audit.entity_id !== projectId && audit.entity_id !== project.lead_id && audit.entity_type !== 'DAILY_UPDATE') continue;
    if (audit.entity_type === 'DAILY_UPDATE') {
      const related = store.getDailyUpdates().find((item) => item.id === audit.entity_id);
      if (related && related.project_id !== projectId) continue;
    }
    items.push({
      id: audit.id,
      at: audit.created_at,
      kind: audit.action.includes('ASSIGN') ? 'ASSIGNMENT' : 'AUDIT',
      title: audit.action.replace(/_/g, ' '),
      detail: audit.description,
      actor: audit.user_name,
    });
  }

  for (const escalation of store.getEscalations().filter((item) => item.project_id === projectId)) {
    items.push({
      id: escalation.id,
      at: escalation.created_at,
      kind: 'ESCALATION',
      title: `${escalation.severity} escalation`,
      detail: escalation.summary || escalation.issue,
      actor: escalation.raised_by_name,
      status: escalation.status,
      href: `/dashboard/ceo/escalations/${escalation.id}`,
    });
  }

  return items.sort((a, b) => +new Date(b.at) - +new Date(a.at));
}

export function createEscalationFromUpdate(user: User, update: DailyUpdate, body: { impact?: string; severity?: Escalation['severity'] }): Escalation {
  const project = update.project_id ? store.getProjects().find((item) => item.id === update.project_id) : undefined;
  const escalation = buildEscalation(user, project, {
    issue: update.blocker || update.task_title,
    impact: body.impact || update.support_required || 'Delivery risk from blocked daily work',
    severity: body.severity || 'HIGH',
    previous_actions: 'Daily work update flagged blocked',
    team_id: update.team_id,
    team_name: update.team_name,
    project_name: update.project_name,
    customer_name: update.customer_name,
  });
  saveEscalation(escalation);
  notifyEscalationOwner(escalation, user.name);
  return escalation;
}
