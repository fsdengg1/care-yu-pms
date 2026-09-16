import { store } from '../store/db.js';
import { GanttStatus, Project, Task } from '../types.js';
import { dateInAppTimezone } from './workCalendar.js';

function todayDate() {
  return dateInAppTimezone();
}

export function projectPlanTasks(projectId: string): Task[] {
  return store.getTasks().filter((task) => task.project_id === projectId);
}

export function ganttStatus(task: Task): GanttStatus {
  if (task.status === 'DONE' && task.review_status !== 'PENDING_TL_REVIEW' && task.review_status !== 'CORRECTION_REQUIRED') {
    return 'COMPLETED';
  }
  if (task.status === 'BLOCKED') return 'BLOCKED';
  const today = todayDate();
  if (task.due_date && task.due_date < today && task.status !== 'DONE') return 'DELAYED';
  if (task.status === 'IN_PROGRESS' || task.review_status === 'PENDING_TL_REVIEW' || (task.progress_percent || 0) > 0) {
    return 'IN_PROGRESS';
  }
  return 'NOT_STARTED';
}

function taskProgressValue(task: Task): number {
  if (task.status === 'DONE') return 100;
  return Math.max(0, Math.min(100, Math.round(task.progress_percent ?? 0)));
}

function leafTasks(tasks: Task[]): Task[] {
  const work = tasks.filter((task) => !task.is_milestone);
  const parentIds = new Set(
    work.map((task) => task.parent_task_id).filter((id): id is string => Boolean(id))
  );
  const leaves = work.filter((task) => !parentIds.has(task.id));
  return leaves.length ? leaves : work;
}

export function computeTaskBasedProgress(project: Project): number | undefined {
  const tasks = projectPlanTasks(project.id);
  const hasPlan =
    Boolean(project.plan_initialized) ||
    tasks.some((task) => Boolean(task.phase_id) || task.is_milestone) ||
    store.getProjectPhases().some((phase) => phase.project_id === project.id);
  const pool = leafTasks(tasks);
  if (!pool.length) return hasPlan ? 0 : undefined;

  const hasLiveWork = pool.some(
    (task) =>
      Boolean(task.phase_id) ||
      Boolean(task.last_update_at) ||
      (task.progress_percent || 0) > 0 ||
      task.status !== 'TODO' ||
      task.is_milestone
  );
  if (!hasPlan && !hasLiveWork) return undefined;

  const sum = pool.reduce((total, task) => total + taskProgressValue(task), 0);
  return Math.round(sum / pool.length);
}

export function withComputedProgress(project: Project): Project {
  const computed = computeTaskBasedProgress(project);
  if (computed === undefined) return project;
  return { ...project, progress: computed };
}

export function persistComputedProgress(projectId: string) {
  if (!projectId) return;
  const projects = store.getProjects();
  const index = projects.findIndex((item) => item.id === projectId);
  if (index === -1) return;
  const next = withComputedProgress(projects[index]);
  if (next.progress === projects[index].progress) return;
  projects[index] = { ...next, updated_at: new Date().toISOString() };
  store.saveProjects(projects);
}

export function phaseProgress(projectId: string, phaseId: string): number {
  const tasks = leafTasks(projectPlanTasks(projectId).filter((task) => task.phase_id === phaseId));
  if (!tasks.length) return 0;
  return Math.round(tasks.reduce((total, task) => total + taskProgressValue(task), 0) / tasks.length);
}
