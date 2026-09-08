import { apiRequest } from './api';

export interface TeamDashboardMemberOption {
  id: string;
  name: string;
  rawName: string;
  roleCode: string;
  roleName: string;
  teamId: string;
  teamName: string;
}

export interface TeamDashboardRow {
  userId: string;
  name: string;
  rawName: string;
  roleCode: string;
  roleName: string;
  teamId: string;
  teamName: string;
  status: string;
  projects: number;
  tasks: number;
  subtasks: number;
  assigned: number;
  completed: number;
  inProgress: number;
  pending: number;
  blocked: number;
  delayed: number;
  overdue: number;
  onTime: number;
  onTimePercent: number;
  completionPercent: number;
  contribution: number;
  leaveDays?: number;
  permissionDays?: number;
  loggedHours?: number;
}

export interface TeamDashboardProjectRow {
  projectId: string;
  projectCode: string;
  projectName: string;
  role: string;
  tasksAssigned: number;
  tasksCompleted: number;
  tasksPending: number;
  tasksBlocked: number;
  completionPercent: number;
  plannedCompletion: string;
  actualCompletion: string;
  schedule: 'On Time' | 'Delayed' | 'Overdue' | 'In Progress';
  onTimeCount: number;
  delayDays: number;
}

export interface TeamDashboardPayload {
  period: { year: number; month: number; from: string; to: string };
  members: TeamDashboardMemberOption[];
  filters: {
    roles: { code: string; name: string }[];
    teams: { id: string; name: string }[];
    projects: { id: string; code: string; name: string }[];
  };
  team: {
    totalMembers: number;
    activeMembers: number;
    projects: number;
    tasks: number;
    completed: number;
    pending: number;
    delayed: number;
    onTimePercent: number;
    rows: TeamDashboardRow[];
  };
  member: (TeamDashboardRow & {
    scores: {
      assignedCompletion: number;
      taskProgress: number;
      onTime: number;
      projectParticipation: number;
      dailyConsistency: number;
      contribution: number;
      weights: Record<string, number>;
      formula?: string;
    };
    assignedWork: {
      projects: number;
      tasks: number;
      subtasks: number;
      completed: number;
      inProgress: number;
      pending: number;
      blocked: number;
    };
    onTimePerformance: {
      completedOnTime: number;
      completedLate: number;
      overdue: number;
      onTimePercent: number;
      averageDelayDays: number;
      maximumDelayDays: number;
      delayedTasks: number;
    };
    dailyWork: {
      updatesSubmitted: number;
      workingDaysWithUpdates: number;
      expectedWorkingDays: number;
      leaveDays?: number;
      permissionDays?: number;
      loggedHours?: number;
      completedWork: number;
      carriedForward: number;
      blockedItems: number;
      delayedItems: number;
      accomplishments: { date: string; projectName: string; text: string }[];
      rows: {
        id: string;
        date: string;
        projectName: string;
        taskTitle: string;
        workCompleted: string;
        status: string;
        carryForward: string;
        blocker: string;
      }[];
    };
    projects: TeamDashboardProjectRow[];
    delayedWork: {
      taskId: string;
      title: string;
      projectId: string;
      projectName: string;
      dueDate: string;
      actualDate: string;
      status: string;
      taskStatus: string;
      delayDays: number;
      delayReason?: string;
    }[];
  }) | null;
}

export type TeamDashboardQuery = {
  year: number;
  month: number;
  from?: string;
  to?: string;
  userId?: string;
  role?: string;
  teamId?: string;
  projectId?: string;
};

export const TeamDashboardApi = {
  async load(query: TeamDashboardQuery) {
    const params = new URLSearchParams();
    params.set('year', String(query.year));
    params.set('month', String(query.month));
    if (query.from) params.set('from', query.from);
    if (query.to) params.set('to', query.to);
    if (query.userId) params.set('userId', query.userId);
    if (query.role) params.set('role', query.role);
    if (query.teamId) params.set('teamId', query.teamId);
    if (query.projectId) params.set('projectId', query.projectId);
    const result = await apiRequest<TeamDashboardPayload>(`/api/team-dashboard?${params.toString()}`);
    if (!result.ok) {
      return { ok: false as const, status: result.status, message: result.message, data: null };
    }
    return { ok: true as const, status: 200, message: '', data: result.data };
  },
};
