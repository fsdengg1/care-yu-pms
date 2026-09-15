import { store } from '../store/db.js';
import { DailyUpdate, Project, Task, User } from '../types.js';
import { isPendingSignupOnly, isSmokeTestAccount } from './authUser.js';
import { formatEmployeeDisplayName } from './people.js';
import { dateInAppTimezone, delayWorkingDays } from './workCalendar.js';
import { leaveAndPermissionStats, leaveNonWorkingDays } from './leaveRequests.js';

const MEMBER_ROLES = new Set([
  'EMPLOYEE',
  'TEAM_LEAD',
  'PROJECT_ENGINEER',
  'EXECUTION',
  'PROCUREMENT',
]);

const SCORE_WEIGHTS = {
  assignedCompletion: 0.25,
  taskProgress: 0.2,
  onTime: 0.25,
  projectParticipation: 0.15,
  dailyConsistency: 0.15,
};

export type TeamDashboardQuery = {
  year?: string;
  month?: string;
  from?: string;
  to?: string;
  userId?: string;
  role?: string;
  teamId?: string;
  projectId?: string;
};

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function todayYmd() {
  return dateInAppTimezone();
}

function toYmd(value?: string | null): string {
  if (!value) return '';
  return value.length >= 10 ? value.slice(0, 10) : value;
}

function lastDayOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function daysBetween(fromYmd: string, toYmd: string): number {
  const from = Date.parse(`${fromYmd}T00:00:00Z`);
  const to = Date.parse(`${toYmd}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.round((to - from) / 86400000);
}

function inRange(date: string | undefined, from: string, to: string) {
  const ymd = toYmd(date);
  if (!ymd) return false;
  return ymd >= from && ymd <= to;
}

function isWeekday(ymd: string) {
  const day = new Date(`${ymd}T00:00:00Z`).getUTCDay();
  if (day === 0) return false;
  if (day === 6) {
    // Align with CareYu working Saturdays: 1st / 3rd / 5th only.
    const nth = Math.floor((Number(ymd.slice(8, 10)) - 1) / 7) + 1;
    return nth !== 2 && nth !== 4;
  }
  return true;
}

function workingDaysInPeriod(from: string, to: string, capToday: boolean) {
  const today = todayYmd();
  const end = capToday && to > today ? today : to;
  if (end < from) return 0;
  let count = 0;
  const cursor = new Date(`${from}T00:00:00Z`);
  const last = Date.parse(`${end}T00:00:00Z`);
  while (cursor.getTime() <= last) {
    const ymd = cursor.toISOString().slice(0, 10);
    if (isWeekday(ymd)) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

export function resolvePeriod(query: TeamDashboardQuery) {
  const now = new Date();
  const year = Number(query.year) || now.getUTCFullYear();
  const month = Number(query.month) || now.getUTCMonth() + 1;
  const monthFrom = `${year}-${pad(month)}-01`;
  const monthTo = `${year}-${pad(month)}-${pad(lastDayOfMonth(year, month))}`;
  const from = toYmd(query.from) || monthFrom;
  const to = toYmd(query.to) || monthTo;
  return {
    year,
    month,
    from: from <= to ? from : to,
    to: from <= to ? to : from,
    monthFrom,
    monthTo,
  };
}

function isCountableTask(task: Task) {
  if (task.is_milestone) return false;
  if (task.acceptance_status === 'REJECTED') return false;
  return true;
}

function isSubtask(task: Task) {
  return Boolean(task.parent_task_id);
}

function isDone(task: Task) {
  return task.status === 'DONE';
}

function isPending(task: Task) {
  return task.status === 'TODO' || task.status === 'WAITING' || task.status === 'HOLD';
}

function completionDate(task: Task) {
  if (!isDone(task)) return '';
  return toYmd(task.completed_at) || toYmd(task.updated_at) || toYmd(task.last_update_at);
}

function taskOverlapsPeriod(task: Task, from: string, to: string) {
  const created = toYmd(task.created_at) || toYmd(task.start_date);
  const completed = completionDate(task);
  const start = toYmd(task.start_date) || created;
  const due = toYmd(task.due_date);
  const updated = toYmd(task.last_update_at) || toYmd(task.updated_at);
  if (inRange(start, from, to) || inRange(due, from, to) || inRange(completed, from, to) || inRange(updated, from, to)) {
    return true;
  }
  if (created && created <= to && (!completed || completed >= from)) return true;
  return false;
}

function timing(task: Task, today: string) {
  const planned = toYmd(task.due_date);
  const actual = completionDate(task);
  const leaveDays = task.assigned_to_id ? leaveNonWorkingDays(task.assigned_to_id, planned || today, actual || today) : new Set<string>();
  if (isDone(task) && planned && actual) {
    const delay = delayWorkingDays(planned, actual, leaveDays);
    return {
      kind: delay > 0 ? ('delayed' as const) : ('on_time' as const),
      planned,
      actual,
      delayDays: delay,
    };
  }
  if (!isDone(task) && planned && today > planned) {
    const delay = delayWorkingDays(planned, today, leaveDays);
    return {
      kind: delay > 0 ? ('overdue' as const) : ('open' as const),
      planned,
      actual: '',
      delayDays: delay,
    };
  }
  return { kind: 'open' as const, planned: planned || '', actual: actual || '', delayDays: 0 };
}

function contributionRole(user: User, project?: Project) {
  if (!project) return 'Contributor';
  if (project.assigned_member_id === user.id) return 'Assigned member';
  if (project.team_lead_id === user.id) return 'Team Lead';
  if (project.pm_id === user.id) return 'Project Manager';
  return user.role_name || 'Contributor';
}

function eligibleMembers(role?: string, teamId?: string): User[] {
  return store
    .getUsers()
    .filter((user) => {
      if (isPendingSignupOnly(user) || isSmokeTestAccount(user)) return false;
      if (user.status === 'INACTIVE' && user.account_status === 'DISABLED') return false;
      if (!MEMBER_ROLES.has(user.role_code)) return false;
      if (role && user.role_code !== role) return false;
      if (teamId && user.team_id !== teamId) return false;
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function pct(part: number, whole: number) {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}

function scoreParts(input: {
  assigned: number;
  completed: number;
  avgProgress: number;
  onTime: number;
  late: number;
  overdue: number;
  projects: number;
  projectsActive: number;
  updatesDays: number;
  expectedWorkDays: number;
}) {
  const assignedCompletion = pct(input.completed, input.assigned);
  const taskProgress = Math.max(0, Math.min(100, Math.round(input.avgProgress)));
  const dated = input.onTime + input.late + input.overdue;
  const onTime = pct(input.onTime, dated);
  const projectParticipation = pct(input.projectsActive, input.projects);
  const dailyConsistency = pct(input.updatesDays, input.expectedWorkDays);
  const contribution = Math.round(
    assignedCompletion * SCORE_WEIGHTS.assignedCompletion +
      taskProgress * SCORE_WEIGHTS.taskProgress +
      onTime * SCORE_WEIGHTS.onTime +
      projectParticipation * SCORE_WEIGHTS.projectParticipation +
      dailyConsistency * SCORE_WEIGHTS.dailyConsistency
  );
  return {
    assignedCompletion,
    taskProgress,
    onTime,
    projectParticipation,
    dailyConsistency,
    contribution,
    weights: {
      assignedCompletion: SCORE_WEIGHTS.assignedCompletion * 100,
      taskProgress: SCORE_WEIGHTS.taskProgress * 100,
      onTime: SCORE_WEIGHTS.onTime * 100,
      projectParticipation: SCORE_WEIGHTS.projectParticipation * 100,
      dailyConsistency: SCORE_WEIGHTS.dailyConsistency * 100,
    },
  };
}

function memberMetrics(
  user: User,
  period: { from: string; to: string },
  projectId: string | undefined,
  allTasks: Task[],
  projectsById: Map<string, Project>,
  updates: DailyUpdate[],
  detail: boolean
) {
  const today = todayYmd();
  const assigned = allTasks.filter((task) => {
    if (task.assigned_to_id !== user.id || !isCountableTask(task)) return false;
    if (projectId && task.project_id !== projectId) return false;
    return taskOverlapsPeriod(task, period.from, period.to);
  });
  const parentTasks = assigned.filter((task) => !isSubtask(task));
  const subtasks = assigned.filter(isSubtask);
  const completed = assigned.filter(isDone);
  const inProgress = assigned.filter((task) => task.status === 'IN_PROGRESS');
  const pending = assigned.filter(isPending);
  const blocked = assigned.filter((task) => task.status === 'BLOCKED');

  const timings = assigned.map((task) => ({ task, ...timing(task, today) }));
  const onTime = timings.filter((item) => item.kind === 'on_time');
  const late = timings.filter((item) => item.kind === 'delayed');
  const overdue = timings.filter((item) => item.kind === 'overdue');
  const delayValues = [...late, ...overdue].map((item) => item.delayDays).filter((days) => days > 0);
  const avgDelay = delayValues.length ? delayValues.reduce((sum, days) => sum + days, 0) / delayValues.length : 0;
  const maxDelay = delayValues.length ? Math.max(...delayValues) : 0;

  const projectIds = new Set(assigned.map((task) => task.project_id).filter((id): id is string => Boolean(id)));
  for (const project of projectsById.values()) {
    if (projectId && project.id !== projectId) continue;
    if (project.assigned_member_id === user.id || project.team_lead_id === user.id) {
      const start = toYmd(project.start_date) || toYmd(project.created_at);
      const end = toYmd(project.target_completion) || toYmd(project.updated_at);
      if (inRange(start, period.from, period.to) || inRange(end, period.from, period.to) || (start && start <= period.to && (!end || end >= period.from))) {
        projectIds.add(project.id);
      }
    }
  }

  const memberUpdates = updates.filter((item) => {
    if (item.user_id !== user.id) return false;
    if (item.submission_status !== 'SUBMITTED') return false;
    if (projectId && item.project_id !== projectId) return false;
    return inRange(item.work_date, period.from, period.to);
  });
  const updateDays = new Set(memberUpdates.map((item) => toYmd(item.work_date)).filter(Boolean));
  const leaveStats = leaveAndPermissionStats(user.id, period.from, period.to);
  for (const day of leaveStats.fullLeaveDates) updateDays.add(day);
  const expectedWorkDays = Math.max(0, workingDaysInPeriod(period.from, period.to, true) - leaveStats.fullLeaveDates.size);
  const loggedHours = memberUpdates.reduce((sum, item) => sum + Math.max(0, Number(item.hours_worked) || 0), 0);

  const projectRows = [...projectIds].map((id) => {
    const project = projectsById.get(id);
    const tasks = assigned.filter((task) => task.project_id === id && !isSubtask(task));
    const done = tasks.filter(isDone).length;
    const pendingCount = tasks.filter((task) => !isDone(task) && task.status !== 'BLOCKED').length;
    const blockedCount = tasks.filter((task) => task.status === 'BLOCKED').length;
    const times = tasks.map((task) => timing(task, today));
    const delayed = times.filter((item) => item.kind === 'delayed' || item.kind === 'overdue');
    const onTimeCount = times.filter((item) => item.kind === 'on_time').length;
    const maxProjectDelay = delayed.reduce((max, item) => Math.max(max, item.delayDays), 0);
    let schedule: 'On Time' | 'Delayed' | 'Overdue' | 'In Progress' = 'In Progress';
    if (times.some((item) => item.kind === 'overdue')) schedule = 'Overdue';
    else if (times.some((item) => item.kind === 'delayed')) schedule = 'Delayed';
    else if (tasks.length && done === tasks.length) schedule = 'On Time';
    const lastCompleted = tasks
      .filter(isDone)
      .map(completionDate)
      .filter(Boolean)
      .sort()
      .at(-1);
    const planned = toYmd(project?.target_completion) || tasks.map((task) => toYmd(task.due_date)).filter(Boolean).sort().at(-1) || '';
    return {
      projectId: id,
      projectCode: project?.code || id,
      projectName: project?.name || tasks[0]?.project_name || 'Unlinked work',
      role: contributionRole(user, project),
      tasksAssigned: tasks.length,
      tasksCompleted: done,
      tasksPending: pendingCount,
      tasksBlocked: blockedCount,
      completionPercent: pct(done, tasks.length),
      plannedCompletion: planned,
      actualCompletion: lastCompleted || '',
      schedule,
      onTimeCount,
      delayDays: maxProjectDelay,
    };
  });

  const avgProgress =
    assigned.length === 0
      ? 0
      : assigned.reduce((sum, task) => sum + (isDone(task) ? 100 : Math.max(0, Math.min(100, task.progress_percent || 0))), 0) /
        assigned.length;

  const projectsActive = projectRows.filter(
    (row) => row.tasksCompleted > 0 || assigned.some((task) => task.project_id === row.projectId && task.status === 'IN_PROGRESS')
  ).length;

  const scores = scoreParts({
    assigned: assigned.length,
    completed: completed.length,
    avgProgress,
    onTime: onTime.length,
    late: late.length,
    overdue: overdue.length,
    projects: projectRows.length,
    projectsActive,
    updatesDays: updateDays.size,
    expectedWorkDays,
  });

  const summary = {
    userId: user.id,
    name: formatEmployeeDisplayName(user),
    rawName: user.name,
    roleCode: user.role_code,
    roleName: user.role_name,
    teamId: user.team_id || '',
    teamName: user.team_name || '',
    status: user.status,
    projects: projectRows.length,
    tasks: parentTasks.length,
    subtasks: subtasks.length,
    assigned: assigned.length,
    completed: completed.length,
    inProgress: inProgress.length,
    pending: pending.length,
    blocked: blocked.length,
    delayed: late.length,
    overdue: overdue.length,
    onTime: onTime.length,
    onTimePercent: scores.onTime,
    completionPercent: scores.assignedCompletion,
    contribution: scores.contribution,
    leaveDays: leaveStats.leaveDays,
    permissionDays: leaveStats.permissionDays,
    loggedHours: round1(loggedHours),
  };

  if (!detail) return { summary, scores, projectRows, timings, memberUpdates, updateDays, expectedWorkDays };

  const delayedItems = timings
    .filter((item) => item.kind === 'delayed' || item.kind === 'overdue')
    .map((item) => ({
      taskId: item.task.id,
      title: item.task.title,
      projectId: item.task.project_id || '',
      projectName: projectsById.get(item.task.project_id || '')?.name || item.task.project_name || '—',
      dueDate: item.planned,
      actualDate: item.actual,
      status: item.kind === 'overdue' ? 'Overdue' : 'Delayed',
      taskStatus: item.task.status,
      delayDays: item.delayDays,
      delayReason: item.task.delay_reason || item.task.blocked_reason || item.task.remarks || '',
    }))
    .sort((a, b) => b.delayDays - a.delayDays);

  const dailyRows = memberUpdates
    .slice()
    .sort((a, b) => (a.work_date < b.work_date ? 1 : -1))
    .map((item) => ({
      id: item.id,
      date: item.work_date,
      projectName: item.project_name || '—',
      taskTitle: item.task_title || '—',
      workCompleted: item.work_completed || item.summary || '',
      status: item.work_status,
      carryForward: item.work_status === 'COMPLETED' ? '' : item.next_plan || '',
      blocker: item.blocker || '',
    }));

  const accomplishments = dailyRows
    .filter((row) => row.status === 'COMPLETED' && row.workCompleted.trim().length >= 12)
    .slice(0, 8)
    .map((row) => ({ date: row.date, projectName: row.projectName, text: row.workCompleted }));

  return {
    summary,
    scores,
    projectRows,
    timings,
    memberUpdates,
    updateDays,
    expectedWorkDays,
    detail: {
      assignedWork: {
        projects: projectRows.length,
        tasks: parentTasks.length,
        subtasks: subtasks.length,
        completed: completed.length,
        inProgress: inProgress.length,
        pending: pending.length,
        blocked: blocked.length,
      },
      onTimePerformance: {
        completedOnTime: onTime.length,
        completedLate: late.length,
        overdue: overdue.length,
        onTimePercent: scores.onTime,
        averageDelayDays: round1(avgDelay),
        maximumDelayDays: maxDelay,
        delayedTasks: late.length + overdue.length,
      },
      dailyWork: {
        updatesSubmitted: memberUpdates.length,
        workingDaysWithUpdates: updateDays.size,
        expectedWorkingDays: expectedWorkDays,
        leaveDays: leaveStats.leaveDays,
        permissionDays: leaveStats.permissionDays,
        loggedHours: round1(loggedHours),
        completedWork: memberUpdates.filter((item) => item.work_status === 'COMPLETED').length,
        carriedForward: memberUpdates.filter((item) => item.work_status !== 'COMPLETED' && Boolean(item.next_plan)).length,
        blockedItems: memberUpdates.filter((item) => item.work_status === 'BLOCKED' || Boolean(item.blocker)).length,
        delayedItems: overdue.length + late.length,
        accomplishments,
        rows: dailyRows,
      },
      projects: projectRows,
      delayedWork: delayedItems,
      score: {
        ...scores,
        formula:
          'Contribution = 25% assigned completion + 20% average task progress + 25% on-time rate + 15% project participation + 15% daily-update consistency. Assigned completion = completed items / assigned items in the selected period. On-time rate = tasks completed on or before the due date / (on-time + late + overdue). Daily consistency = weekdays with a submitted update or approved leave / expected working days (weekdays minus approved full-day leave, through today).',
      },
    },
  };
}

export function buildTeamDashboard(query: TeamDashboardQuery) {
  const period = resolvePeriod(query);
  const members = eligibleMembers(query.role, query.teamId);
  const tasks = store.getTasks();
  const projects = store.getProjects();
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const updates = store.getDailyUpdates();
  const projectId = query.projectId || undefined;

  const rows = members.map((user) =>
    memberMetrics(user, period, projectId, tasks, projectsById, updates, false).summary
  );

  const activeUpdateUsers = new Set(
    updates
      .filter((item) => item.submission_status === 'SUBMITTED' && inRange(item.work_date, period.from, period.to))
      .map((item) => item.user_id)
  );
  const activeMembers = rows.filter(
    (row) => row.assigned > 0 || row.projects > 0 || activeUpdateUsers.has(row.userId)
  ).length;

  const projectSet = new Set<string>();
  for (const task of tasks) {
    if (!isCountableTask(task) || !task.project_id) continue;
    if (projectId && task.project_id !== projectId) continue;
    if (!taskOverlapsPeriod(task, period.from, period.to)) continue;
    if (members.some((user) => user.id === task.assigned_to_id)) projectSet.add(task.project_id);
  }

  const teamTasks = rows.reduce((sum, row) => sum + row.tasks, 0);
  const teamCompleted = rows.reduce((sum, row) => sum + row.completed, 0);
  const teamPending = rows.reduce((sum, row) => sum + row.pending + row.inProgress, 0);
  const teamDelayed = rows.reduce((sum, row) => sum + row.delayed + row.overdue, 0);
  const teamOnTime = rows.reduce((sum, row) => sum + row.onTime, 0);
  const dated = teamOnTime + rows.reduce((sum, row) => sum + row.delayed, 0) + rows.reduce((sum, row) => sum + row.overdue, 0);

  const selected = query.userId ? members.find((user) => user.id === query.userId) : undefined;
  const member = selected
    ? memberMetrics(selected, period, projectId, tasks, projectsById, updates, true)
    : null;

  const roles = [...new Set(members.map((user) => user.role_code))]
    .map((code) => ({
      code,
      name: members.find((user) => user.role_code === code)?.role_name || code,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const teams = [...new Map(members.filter((user) => user.team_id).map((user) => [user.team_id!, user.team_name || user.team_id!])).entries()].map(
    ([id, name]) => ({ id, name })
  );

  const projectsFilter = [...projectSet]
    .map((id) => projectsById.get(id))
    .filter((project): project is Project => Boolean(project))
    .map((project) => ({ id: project.id, code: project.code, name: project.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    period,
    members: members.map((user) => ({
      id: user.id,
      name: formatEmployeeDisplayName(user),
      rawName: user.name,
      roleCode: user.role_code,
      roleName: user.role_name,
      teamId: user.team_id || '',
      teamName: user.team_name || '',
    })),
    filters: { roles, teams, projects: projectsFilter },
    team: {
      totalMembers: members.length,
      activeMembers,
      projects: projectSet.size,
      tasks: teamTasks,
      completed: teamCompleted,
      pending: teamPending,
      delayed: teamDelayed,
      onTimePercent: pct(teamOnTime, dated),
      rows,
    },
    member: member
      ? {
          ...member.summary,
          scores: member.detail?.score || member.scores,
          assignedWork: member.detail?.assignedWork,
          onTimePerformance: member.detail?.onTimePerformance,
          dailyWork: member.detail?.dailyWork,
          projects: member.detail?.projects || member.projectRows,
          delayedWork: member.detail?.delayedWork || [],
        }
      : null,
  };
}
