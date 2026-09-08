'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Diamond, GanttChartSquare, Lock, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import { PlanningApi, PlanTaskPayload } from '@/lib/planningApi';
import { formatLongDate } from '@/lib/format';
import {
  GanttStatus,
  GanttTask,
  PlanningAssignee,
  PlanningPlanPayload,
  PlanningProjectSummary,
  PriorityLevel,
  Task,
  User,
} from '@/lib/types';

const STATUS_LABEL: Record<GanttStatus, string> = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  BLOCKED: 'Blocked',
  COMPLETED: 'Completed',
  DELAYED: 'Delayed',
};

const STATUS_CLASS: Record<GanttStatus, string> = {
  NOT_STARTED: 'border-slate-700 bg-slate-800 text-slate-300',
  IN_PROGRESS: 'border-cyan-800 bg-cyan-950 text-cyan-300',
  BLOCKED: 'border-rose-800 bg-rose-950 text-rose-300',
  COMPLETED: 'border-emerald-800 bg-emerald-950 text-emerald-300',
  DELAYED: 'border-amber-800 bg-amber-950 text-amber-300',
};

const BAR_CLASS: Record<GanttStatus, string> = {
  NOT_STARTED: 'bg-slate-600',
  IN_PROGRESS: 'bg-cyan-500',
  BLOCKED: 'bg-rose-500',
  COMPLETED: 'bg-emerald-500',
  DELAYED: 'bg-amber-400',
};

function daysBetween(start?: string, end?: string) {
  if (!start || !end) return 0;
  return Math.max(0, Math.round((+new Date(`${end}T00:00:00`) - +new Date(`${start}T00:00:00`)) / 86400000));
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function timelineRange(plan: PlanningPlanPayload) {
  const dates = [
    plan.project.start_date,
    plan.project.target_completion,
    ...plan.tasks.flatMap((task) => [task.start_date, task.due_date]),
    ...plan.phases.flatMap((phase) => [phase.start_date, phase.due_date]),
  ].filter((value): value is string => Boolean(value));
  const sorted = [...dates].sort();
  const min = sorted[0] || new Date().toISOString().slice(0, 10);
  const maxCandidate = sorted[sorted.length - 1] || addDays(min, 42);
  const max = maxCandidate <= min ? addDays(min, 21) : maxCandidate;
  return { min, max, span: Math.max(1, daysBetween(min, max)) };
}

function offsetPct(date: string | undefined, min: string, span: number) {
  if (!date) return 0;
  return Math.max(0, Math.min(100, (daysBetween(min, date) / span) * 100));
}

function healthClass(health: string) {
  if (health === 'CRITICAL') return 'border-rose-800 bg-rose-950 text-rose-300';
  if (health === 'AT_RISK') return 'border-amber-800 bg-amber-950 text-amber-300';
  return 'border-emerald-800 bg-emerald-950 text-emerald-300';
}

type ModalMode = 'phase' | 'task' | 'milestone' | null;

type TaskFormState = {
  title: string;
  phase_id: string;
  parent_task_id: string;
  assigned_to_id: string;
  team_id: string;
  start_date: string;
  due_date: string;
  duration_days: number;
  priority: PriorityLevel;
  status: Task['status'];
  progress_percent: number;
  depends_on_id: string;
  remarks: string;
  blocked_reason: string;
  is_milestone: boolean;
};

const emptyTaskForm: TaskFormState = {
  title: '',
  phase_id: '',
  parent_task_id: '',
  assigned_to_id: '',
  team_id: '',
  start_date: '',
  due_date: '',
  duration_days: 7,
  priority: 'Medium',
  status: 'TODO',
  progress_percent: 0,
  depends_on_id: '',
  remarks: '',
  blocked_reason: '',
  is_milestone: false,
};

export default function GanttPlanner({ user }: { user: User }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedId = searchParams.get('project') || '';
  const [projects, setProjects] = useState<PlanningProjectSummary[]>([]);
  const [projectId, setProjectId] = useState(requestedId);
  const [plan, setPlan] = useState<PlanningPlanPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<ModalMode>(null);
  const [editing, setEditing] = useState<GanttTask | null>(null);
  const [phaseName, setPhaseName] = useState('');
  const [phaseStart, setPhaseStart] = useState('');
  const [phaseDue, setPhaseDue] = useState('');
  const [form, setForm] = useState(emptyTaskForm);
  const [zoom, setZoom] = useState<'day' | 'week' | 'month'>('week');
  const [forbidden, setForbidden] = useState(false);
  const [projectStart, setProjectStart] = useState('');
  const [projectDue, setProjectDue] = useState('');

  const canManage = Boolean(plan?.canEditGantt ?? plan?.canManage);

  const loadList = async () => {
    const result = await PlanningApi.list();
    if (!result.ok) {
      setError(result.message);
      if (/permission/i.test(result.message || '')) setForbidden(true);
      return;
    }
    setForbidden(false);
    setProjects(result.projects);
    setProjectId((current) => {
      const preferred = requestedId || current;
      if (preferred && result.projects.some((project) => project.id === preferred || project.code === preferred)) {
        return result.projects.find((project) => project.id === preferred || project.code === preferred)?.id || preferred;
      }
      return result.projects[0]?.id || '';
    });
  };

  const loadPlan = async (id: string) => {
    if (!id) {
      setPlan(null);
      return;
    }
    const result = await PlanningApi.get(id);
    if (!result.ok || !result.plan) {
      setError(result.message);
      setPlan(null);
      if (/permission/i.test(result.message || '')) setForbidden(true);
      return;
    }
    setForbidden(false);
    setError(null);
    setPlan(result.plan);
    setProjectStart(result.plan.project.start_date || '');
    setProjectDue(result.plan.project.target_completion || '');
  };

  useEffect(() => {
    void loadList();
  }, []);

  useEffect(() => {
    if (projectId) void loadPlan(projectId);
  }, [projectId]);

  const timeline = useMemo(() => (plan ? timelineRange(plan) : null), [plan]);
  const ticks = useMemo(() => {
    if (!timeline) return [];
    const step = zoom === 'month' ? 14 : zoom === 'week' ? 7 : 1;
    const items: string[] = [];
    for (let i = 0; i <= timeline.span; i += step) items.push(addDays(timeline.min, i));
    if (items[items.length - 1] !== timeline.max) items.push(timeline.max);
    return items;
  }, [timeline, zoom]);

  const grouped = useMemo(() => {
    if (!plan) return [];
    const byPhase = plan.phases.map((phase) => ({
      phase,
      tasks: plan.tasks.filter((task) => task.phase_id === phase.id && !task.parent_task_id),
    }));
    const unphased = plan.tasks.filter((task) => !task.phase_id && !task.parent_task_id);
    if (unphased.length) {
      byPhase.push({
        phase: {
          id: 'unphased',
          project_id: plan.project.id,
          name: plan.project.plan_initialized ? 'Unphased work' : 'Assigned work (no plan yet)',
          sort_order: 99,
          created_at: '',
          updated_at: '',
        },
        tasks: unphased,
      });
    }
    return byPhase;
  }, [plan]);

  const childrenOf = (taskId: string) => plan?.tasks.filter((task) => task.parent_task_id === taskId) || [];

  const openTaskModal = (mode: 'task' | 'milestone', task?: GanttTask, parentId?: string) => {
    const parent = parentId ? plan?.tasks.find((item) => item.id === parentId) : undefined;
    setEditing(task || null);
    setForm({
      ...emptyTaskForm,
      title: task?.title || '',
      phase_id: task?.phase_id || parent?.phase_id || plan?.phases[0]?.id || '',
      parent_task_id: task?.parent_task_id || parentId || '',
      assigned_to_id: task?.assigned_to_id || '',
      team_id: task?.team_id || '',
      start_date: task?.start_date || plan?.project.start_date || '',
      due_date: task?.due_date || '',
      duration_days: task?.duration_days ?? 7,
      priority: task?.priority || 'Medium',
      status: task?.status || 'TODO',
      progress_percent: task?.progress_percent ?? 0,
      depends_on_id: task?.depends_on_id || '',
      remarks: task?.remarks || '',
      blocked_reason: task?.blocked_reason || '',
      is_milestone: mode === 'milestone' || Boolean(task?.is_milestone),
    });
    setModal(mode === 'milestone' ? 'milestone' : 'task');
  };

  const applyPlan = (next: PlanningPlanPayload | null | undefined) => {
    if (next) setPlan(next);
    void loadList();
  };

  const run = async (
    fn: () => Promise<{ ok: boolean; message?: string; data?: { plan?: PlanningPlanPayload } | PlanningPlanPayload }>
  ) => {
    setBusy(true);
    setError(null);
    const result = await fn();
    setBusy(false);
    if (!result.ok) {
      setError(result.message || 'Unable to save the plan.');
      return;
    }
    const data = result.data as { plan?: PlanningPlanPayload } | PlanningPlanPayload | undefined;
    applyPlan(data && 'plan' in data && data.plan ? data.plan : (data as PlanningPlanPayload));
    setModal(null);
    setEditing(null);
  };

  const saveTask = () =>
    run(async () => {
      const payload: PlanTaskPayload = {
        title: form.title.trim(),
        phase_id: form.phase_id || null,
        parent_task_id: form.parent_task_id || null,
        assigned_to_id: form.assigned_to_id || undefined,
        team_id: form.team_id || undefined,
        start_date: form.start_date || undefined,
        due_date: form.due_date || undefined,
        duration_days: Number(form.duration_days) || 0,
        priority: form.priority,
        status: form.status,
        progress_percent: Number(form.progress_percent) || 0,
        depends_on_id: form.depends_on_id || null,
        remarks: form.remarks.trim() || undefined,
        blocked_reason: form.status === 'BLOCKED' ? form.blocked_reason.trim() : undefined,
        is_milestone: form.is_milestone,
      };
      if (editing) return PlanningApi.patchTask(projectId, editing.id, payload);
      return PlanningApi.addTask(projectId, payload);
    });

  const patchQuick = (task: GanttTask, body: PlanTaskPayload) =>
    run(async () => PlanningApi.patchTask(projectId, task.id, body));

  const selected = projects.find((item) => item.id === projectId);

  return (
    <div className="space-y-6 text-xs">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
              <GanttChartSquare className="h-4 w-4" /> {canManage ? 'PM Planning' : 'Project Gantt Chart'}
              {!canManage && (
                <span className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-0.5 text-[10px] font-bold normal-case tracking-wider text-slate-300">
                  <Lock className="h-3 w-3" /> Read Only
                </span>
              )}
            </div>
            <h1 className="mt-1 text-xl font-bold text-slate-100">Project Gantt Chart</h1>
            <p className="mt-1 text-xs text-slate-400">
              {canManage
                ? 'Create and maintain the project timeline. Task progress is shared with Daily Work Updates.'
                : 'Read-only view of the Project Manager’s Gantt chart. Update your work through Daily Work Updates — not this timeline.'}
            </p>
            {plan && (
              <p className="mt-2 text-[11px] text-slate-400">
                Project Manager: <span className="font-semibold text-slate-200">{plan.project.pm_name}</span>
                {plan.project.team_lead_name ? (
                  <>
                    {' · '}Team Lead: <span className="font-semibold text-slate-200">{plan.project.team_lead_name}</span>
                  </>
                ) : null}
              </p>
            )}
          </div>
          {plan && (
            <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${healthClass(plan.project.health)}`}>
              {plan.project.health.replace('_', ' ')} · {plan.project.progress}%
            </span>
          )}
        </div>
        <p className="mt-3 text-[11px] text-slate-500">
          {canManage
            ? 'Only you can add tasks, change dates, dependencies, and assignments. Other roles see this same chart as read-only.'
            : 'Read-only. You cannot edit dates, drag bars, add tasks, change assignments, or change the project timeline.'}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/90 p-3">
        <select
          value={projectId}
          onChange={(event) => {
            setProjectId(event.target.value);
            router.replace(`/projects/planning?project=${event.target.value}`);
          }}
          className="min-w-64 rounded-md border border-slate-800 bg-slate-950 px-2 py-1.5 text-slate-200"
        >
          {projects.length === 0 && <option value="">{['TEAM_LEAD', 'EMPLOYEE', 'PROJECT_ENGINEER', 'EXECUTION'].includes(user.role_code) ? 'No assigned projects' : 'No active projects'}</option>}
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.customer_name} – {project.name} ({project.progress}%)
            </option>
          ))}
        </select>
        <div className="flex rounded-lg border border-slate-800 bg-slate-950 p-0.5">
          {(['day', 'week', 'month'] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setZoom(item)}
              className={`rounded-md px-2 py-1 capitalize ${zoom === item ? 'bg-slate-800 text-cyan-300' : 'text-slate-400'}`}
            >
              {item}
            </button>
          ))}
        </div>
        {canManage && plan && (
          <>
            {!plan.project.plan_initialized && (
              <button
                type="button"
                disabled={busy}
                onClick={() => run(async () => PlanningApi.createPlan(projectId))}
                className="rounded-lg bg-cyan-600 px-3 py-1.5 font-bold text-white hover:bg-cyan-500 disabled:opacity-50"
              >
                Create Plan
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setPhaseName('');
                setPhaseStart(plan.project.start_date || '');
                setPhaseDue(plan.project.target_completion || '');
                setModal('phase');
              }}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-200 hover:border-cyan-700"
            >
              <Plus className="mr-1 inline h-3 w-3" /> Add Phase
            </button>
            <button type="button" onClick={() => openTaskModal('task')} className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-200 hover:border-cyan-700">
              <Plus className="mr-1 inline h-3 w-3" /> Add Task
            </button>
            <button type="button" onClick={() => openTaskModal('milestone')} className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-200 hover:border-cyan-700">
              <Diamond className="mr-1 inline h-3 w-3" /> Add Milestone
            </button>
            <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1.5">
              <label className="text-[10px] uppercase tracking-wider text-slate-500">
                Start
                <input
                  type="date"
                  value={projectStart}
                  onChange={(event) => setProjectStart(event.target.value)}
                  className="ml-1 rounded border border-slate-800 bg-slate-900 px-1.5 py-0.5 text-slate-200"
                />
              </label>
              <label className="text-[10px] uppercase tracking-wider text-slate-500">
                Target
                <input
                  type="date"
                  value={projectDue}
                  onChange={(event) => setProjectDue(event.target.value)}
                  className="ml-1 rounded border border-slate-800 bg-slate-900 px-1.5 py-0.5 text-slate-200"
                />
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(async () =>
                    PlanningApi.updateTimeline(projectId, { start_date: projectStart, target_completion: projectDue })
                  )
                }
                className="rounded-md bg-cyan-600 px-2 py-1 font-bold text-white hover:bg-cyan-500 disabled:opacity-50"
              >
                Save timeline
              </button>
            </div>
          </>
        )}
        {plan && (
          <Link href={`/projects/${plan.project.id}`} className="ml-auto text-cyan-400 hover:underline">
            Open project
          </Link>
        )}
      </div>

      {selected && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[
            { label: 'Project progress', value: `${selected.progress}%` },
            { label: 'Tasks', value: selected.taskCount },
            { label: 'Delayed', value: selected.delayedCount },
            { label: 'Blocked', value: selected.blockedCount },
            { label: 'Milestones', value: selected.milestoneCount },
          ].map((card) => (
            <div key={card.label} className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
              <div className="text-slate-400">{card.label}</div>
              <div className="mt-1 text-lg font-bold text-slate-100">{card.value}</div>
            </div>
          ))}
        </div>
      )}

      {forbidden && (
        <div className="rounded-xl border border-rose-900 bg-rose-950/40 px-4 py-6 text-center text-rose-300">
          You do not have permission to view this project's Gantt plan.
        </div>
      )}

      {!forbidden && projects.length === 0 && !error && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-8 text-center">
          <h2 className="text-sm font-bold text-slate-100">No Gantt Plans Available</h2>
          <p className="mt-2 text-slate-400">
            {['TEAM_LEAD', 'EMPLOYEE', 'PROJECT_ENGINEER', 'EXECUTION'].includes(user.role_code)
              ? "You currently don't have any projects assigned to you for Gantt monitoring."
              : 'There are no active projects available for Gantt planning.'}
          </p>
        </div>
      )}

      {error && !forbidden && <div className="rounded-xl border border-rose-900 bg-rose-950/40 px-4 py-3 text-rose-300">{error}</div>}

      {plan && timeline && (
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/90">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left">
              <thead className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/95 text-[10px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="sticky left-0 z-10 bg-slate-950 p-3">Phase / Task</th>
                  <th className="p-3">Assigned To</th>
                  <th className="p-3">Start Date</th>
                  <th className="p-3">Due Date</th>
                  <th className="p-3">Duration</th>
                  <th className="p-3">Progress</th>
                  <th className="p-3">Status</th>
                  <th className="p-3" style={{ minWidth: 320 }}>
                    <div className="mb-1">Timeline</div>
                    <div className="relative h-6">
                      {ticks.map((tick) => (
                        <span
                          key={tick}
                          className="absolute top-0 -translate-x-1/2 text-[9px] font-normal normal-case tracking-normal text-slate-500"
                          style={{ left: `${offsetPct(tick, timeline.min, timeline.span)}%` }}
                        >
                          {formatLongDate(tick)}
                        </span>
                      ))}
                      <span
                        className="absolute top-4 h-2 w-px bg-cyan-400"
                        title="Today"
                        style={{ left: `${offsetPct(new Date().toISOString().slice(0, 10), timeline.min, timeline.span)}%` }}
                      />
                    </div>
                  </th>
                  {canManage && <th className="p-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {grouped.map((group) => (
                  <React.Fragment key={group.phase.id}>
                    <tr className="bg-slate-950/50">
                      <td className="sticky left-0 z-10 bg-slate-950/95 p-3 font-bold text-slate-100" colSpan={7}>
                        {plan.project.customer_name} – {plan.project.name}
                        <span className="ml-2 font-medium text-cyan-300">{group.phase.name}</span>
                        {typeof group.phase.progress === 'number' && (
                          <span className="ml-2 text-slate-500">{group.phase.progress}%</span>
                        )}
                      </td>
                      <td className="p-3">
                        <TimelineBar
                          start={group.phase.start_date}
                          end={group.phase.due_date}
                          min={timeline.min}
                          span={timeline.span}
                          status="IN_PROGRESS"
                          progress={group.phase.progress ?? 0}
                          muted
                          today
                        />
                      </td>
                      {canManage && (
                      <td className="p-3">
                        {group.phase.id !== 'unphased' && (
                          <button
                            type="button"
                            onClick={() => run(async () => PlanningApi.deletePhase(projectId, group.phase.id))}
                            className="rounded border border-rose-900 px-2 py-0.5 text-rose-300"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                      )}
                    </tr>
                    {group.tasks.map((task) => (
                      <React.Fragment key={task.id}>
                        <TaskRow
                          task={task}
                          timeline={timeline}
                          canManage={canManage}
                          onEdit={() => openTaskModal(task.is_milestone ? 'milestone' : 'task', task)}
                          onComplete={() => patchQuick(task, { status: 'DONE', progress_percent: 100 })}
                          onBlocked={() => openTaskModal(task.is_milestone ? 'milestone' : 'task', { ...task, status: 'BLOCKED' })}
                          onSubtask={() => openTaskModal('task', undefined, task.id)}
                          onDelete={() => run(async () => PlanningApi.deleteTask(projectId, task.id))}
                        />
                        {childrenOf(task.id).map((child) => (
                          <TaskRow
                            key={child.id}
                            task={child}
                            timeline={timeline}
                            canManage={canManage}
                            nested
                            onEdit={() => openTaskModal('task', child)}
                            onComplete={() => patchQuick(child, { status: 'DONE', progress_percent: 100 })}
                            onBlocked={() => openTaskModal('task', { ...child, status: 'BLOCKED' })}
                            onDelete={() => run(async () => PlanningApi.deleteTask(projectId, child.id))}
                          />
                        ))}
                      </React.Fragment>
                    ))}
                  </React.Fragment>
                ))}
                {plan.tasks.length === 0 && (
                  <tr>
                    <td colSpan={canManage ? 9 : 8} className="p-8 text-center text-slate-500">
                      {canManage
                        ? 'Create a plan or add a task to start scheduling this active project.'
                        : 'The Project Manager has not created an execution plan yet.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {plan && (plan.delayed.length > 0 || plan.blocked.length > 0) && (
        <div className="grid gap-3 lg:grid-cols-2">
          <IssueList title="Delayed tasks" icon={<AlertTriangle className="h-4 w-4" />} items={plan.delayed} tone="amber" />
          <IssueList title="Blocked tasks" icon={<ShieldAlert className="h-4 w-4" />} items={plan.blocked} tone="rose" />
        </div>
      )}

      {modal === 'phase' && (
        <Modal title="Add Phase" onClose={() => setModal(null)}>
          <label className="block">
            <span className="mb-1 block text-slate-400">Phase name</span>
            <input value={phaseName} onChange={(e) => setPhaseName(e.target.value)} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-slate-400">Start</span>
              <input type="date" value={phaseStart} onChange={(e) => setPhaseStart(e.target.value)} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
            </label>
            <label className="block">
              <span className="mb-1 block text-slate-400">Due</span>
              <input type="date" value={phaseDue} onChange={(e) => setPhaseDue(e.target.value)} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
            </label>
          </div>
          <button
            type="button"
            disabled={busy || !phaseName.trim()}
            onClick={() => run(async () => PlanningApi.addPhase(projectId, { name: phaseName.trim(), start_date: phaseStart, due_date: phaseDue }))}
            className="rounded-lg bg-cyan-600 px-4 py-2 font-bold text-white hover:bg-cyan-500 disabled:opacity-50"
          >
            Save phase
          </button>
        </Modal>
      )}

      {(modal === 'task' || modal === 'milestone') && plan && (
        <Modal
          title={editing ? (form.is_milestone ? 'Edit Milestone' : 'Edit Task') : form.is_milestone ? 'Add Milestone' : 'Add Task'}
          onClose={() => setModal(null)}
        >
          <TaskForm form={form} setForm={setForm} plan={plan} />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || !form.title.trim()} onClick={() => void saveTask()} className="rounded-lg bg-cyan-600 px-4 py-2 font-bold text-white hover:bg-cyan-500 disabled:opacity-50">
              Save
            </button>
            {editing && !form.is_milestone && (
              <>
                <button type="button" disabled={busy} onClick={() => patchQuick(editing, { status: 'DONE', progress_percent: 100 })} className="rounded-lg border border-emerald-800 px-3 py-2 text-emerald-300">
                  Mark Complete
                </button>
                <button type="button" disabled={busy} onClick={() => setForm((current) => ({ ...current, status: 'BLOCKED' }))} className="rounded-lg border border-rose-800 px-3 py-2 text-rose-300">
                  Mark Blocked
                </button>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

function TaskRow({
  task,
  timeline,
  canManage,
  nested,
  onEdit,
  onComplete,
  onBlocked,
  onSubtask,
  onDelete,
}: {
  task: GanttTask;
  timeline: { min: string; span: number };
  canManage: boolean;
  nested?: boolean;
  onEdit: () => void;
  onComplete: () => void;
  onBlocked: () => void;
  onSubtask?: () => void;
  onDelete?: () => void;
}) {
  return (
    <tr className="hover:bg-slate-800/30">
      <td className={`sticky left-0 z-10 bg-slate-900 p-3 ${nested ? 'pl-8' : ''}`}>
        <div className="font-semibold text-slate-100">
          {task.is_milestone && <Diamond className="mr-1 inline h-3 w-3 text-cyan-400" />}
          {nested ? '↳ ' : ''}
          {task.title}
        </div>
        <div className="text-[11px] text-slate-500">
          {task.depends_on_title ? `Depends on ${task.depends_on_title}` : task.phase_name || '—'}
          {task.latest_update_at ? ` · Updated ${formatLongDate(task.latest_update_at)}` : ''}
        </div>
        {task.latest_blocker && <div className="text-[11px] text-rose-300">BLOCKED — {task.latest_blocker}</div>}
      </td>
      <td className="p-3 text-slate-300">
        <div>{task.assigned_to || 'Unassigned'}</div>
        <div className="text-slate-500">{task.team_name || '—'}</div>
      </td>
      <td className="p-3 text-slate-300">{formatLongDate(task.start_date)}</td>
      <td className="p-3 text-slate-300">{formatLongDate(task.due_date)}</td>
      <td className="p-3 text-slate-300">{task.is_milestone ? '—' : `${task.duration_days ?? daysBetween(task.start_date, task.due_date)}d`}</td>
      <td className="p-3 text-slate-100">{task.status === 'DONE' ? 100 : task.progress_percent ?? 0}%</td>
      <td className="p-3">
        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${STATUS_CLASS[task.gantt_status]}`}>
          {STATUS_LABEL[task.gantt_status]}
        </span>
      </td>
      <td className="p-3">
        <TimelineBar
          start={task.start_date}
          end={task.due_date}
          min={timeline.min}
          span={timeline.span}
          status={task.gantt_status}
          progress={task.status === 'DONE' ? 100 : task.progress_percent ?? 0}
          milestone={task.is_milestone}
          today
        />
      </td>
      {canManage && (
      <td className="p-3">
          <div className="flex flex-wrap gap-1">
            <button type="button" onClick={onEdit} className="rounded border border-slate-700 px-2 py-0.5 text-slate-200">Edit</button>
            <button type="button" onClick={onComplete} className="rounded border border-emerald-900 px-2 py-0.5 text-emerald-300">Done</button>
            <button type="button" onClick={onBlocked} className="rounded border border-rose-900 px-2 py-0.5 text-rose-300">Block</button>
            {onSubtask && !task.is_milestone && (
              <button type="button" onClick={onSubtask} className="rounded border border-slate-700 px-2 py-0.5 text-slate-200">Subtask</button>
            )}
            {onDelete && (
              <button type="button" onClick={onDelete} className="inline-flex items-center gap-1 rounded border border-rose-900 px-2 py-0.5 text-rose-300">
                <Trash2 className="h-3 w-3" /> Delete
              </button>
            )}
            {task.latest_update_id && (
              <Link href={`/daily-updates/${task.latest_update_id}`} className="rounded border border-cyan-900 px-2 py-0.5 text-cyan-300">Review</Link>
            )}
          </div>
      </td>
      )}
    </tr>
  );
}

function TimelineBar({
  start,
  end,
  min,
  span,
  status,
  progress,
  milestone,
  muted,
  today,
}: {
  start?: string;
  end?: string;
  min: string;
  span: number;
  status: GanttStatus;
  progress: number;
  milestone?: boolean;
  muted?: boolean;
  today?: boolean;
}) {
  const left = offsetPct(start || end, min, span);
  const right = offsetPct(end || start, min, span);
  const width = Math.max(1.5, right - left);
  const todayLeft = offsetPct(new Date().toISOString().slice(0, 10), min, span);
  return (
    <div className="pointer-events-none relative h-6 select-none overflow-hidden rounded bg-slate-950">
      {today && <span className="absolute inset-y-0 w-px bg-cyan-400/70" style={{ left: `${todayLeft}%` }} />}
      {milestone ? (
        <span className="absolute top-1 h-3.5 w-3.5 rotate-45 border border-cyan-400 bg-cyan-300" style={{ left: `calc(${left}% - 7px)` }} />
      ) : (
        <div
          className={`absolute top-1.5 h-3 rounded ${muted ? 'bg-slate-700' : BAR_CLASS[status]}`}
          style={{ left: `${left}%`, width: `${width}%`, opacity: muted ? 0.55 : 1 }}
        >
          <div className="h-full rounded bg-white/20" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      )}
    </div>
  );
}

function IssueList({
  title,
  icon,
  items,
  tone,
}: {
  title: string;
  icon: React.ReactNode;
  items: GanttTask[];
  tone: 'amber' | 'rose';
}) {
  const box = tone === 'rose' ? 'border-rose-900/50 bg-rose-950/20' : 'border-amber-900/50 bg-amber-950/20';
  const heading = tone === 'rose' ? 'text-rose-200' : 'text-amber-200';
  return (
    <section className={`rounded-xl border p-5 ${box}`}>
      <h2 className={`mb-2 flex items-center gap-2 text-sm font-bold ${heading}`}>
        {icon} {title}
      </h2>
      {items.length === 0 && <p className="text-slate-500">None.</p>}
      {items.map((item) => (
        <div key={item.id} className="mb-2 text-slate-300">
          <div className="font-semibold">{item.title}</div>
          <div className="text-slate-500">
            {item.assigned_to || 'Unassigned'} · {formatLongDate(item.due_date)}
            {item.latest_update_id && (
              <Link href={`/daily-updates/${item.latest_update_id}`} className="ml-2 text-cyan-400 hover:underline">Review</Link>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-100">{title}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-200">Close</button>
        </div>
        <div className="space-y-3">{children}</div>
      </div>
    </div>
  );
}

function TaskForm({
  form,
  setForm,
  plan,
}: {
  form: TaskFormState;
  setForm: React.Dispatch<React.SetStateAction<TaskFormState>>;
  plan: PlanningPlanPayload;
}) {
  const set = (patch: Partial<TaskFormState>) => setForm((current) => ({ ...current, ...patch }));
  const onAssignee = (id: string) => {
    const person = plan.assignees.find((item) => item.id === id);
    set({ assigned_to_id: id, team_id: person?.team_id || form.team_id });
  };
  return (
    <>
      <label className="block">
        <span className="mb-1 block text-slate-400">{form.is_milestone ? 'Milestone' : 'Task'} title</span>
        <input value={form.title} onChange={(e) => set({ title: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-slate-400">Phase</span>
          <select value={form.phase_id} onChange={(e) => set({ phase_id: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100">
            <option value="">Unphased</option>
            {plan.phases.map((phase) => (
              <option key={phase.id} value={phase.id}>{phase.name}</option>
            ))}
          </select>
        </label>
        {!form.is_milestone && (
          <label className="block">
            <span className="mb-1 block text-slate-400">Subtask of</span>
            <select value={form.parent_task_id} onChange={(e) => set({ parent_task_id: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100">
              <option value="">None</option>
              {plan.tasks.filter((task) => !task.is_milestone && !task.parent_task_id).map((task) => (
                <option key={task.id} value={task.id}>{task.title}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-slate-400">Assign person</span>
          <select value={form.assigned_to_id} onChange={(e) => onAssignee(e.target.value)} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100">
            <option value="">Unassigned</option>
            {plan.assignees.map((person: PlanningAssignee) => (
              <option key={person.id} value={person.id}>{person.name} · {person.role_name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-slate-400">Assign team</span>
          <select value={form.team_id} onChange={(e) => set({ team_id: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100">
            <option value="">No team</option>
            {plan.teams.map((team) => (
              <option key={team.id} value={team.id}>{team.name}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="block">
          <span className="mb-1 block text-slate-400">Start</span>
          <input type="date" value={form.start_date} onChange={(e) => set({ start_date: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
        </label>
        <label className="block">
          <span className="mb-1 block text-slate-400">Due</span>
          <input type="date" value={form.due_date} onChange={(e) => set({ due_date: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
        </label>
        <label className="block">
          <span className="mb-1 block text-slate-400">Duration (days)</span>
          <input type="number" min={0} value={form.duration_days} onChange={(e) => set({ duration_days: Number(e.target.value) })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
        </label>
      </div>
      {!form.is_milestone && (
        <div className="grid grid-cols-3 gap-2">
          <label className="block">
            <span className="mb-1 block text-slate-400">Priority</span>
            <select value={form.priority} onChange={(e) => set({ priority: e.target.value as PriorityLevel })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100">
              {['Low', 'Medium', 'High', 'Critical'].map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-slate-400">Status</span>
            <select value={form.status} onChange={(e) => set({ status: e.target.value as Task['status'] })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100">
              <option value="TODO">Not Started</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="BLOCKED">Blocked</option>
              <option value="DONE">Completed</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-slate-400">Progress %</span>
            <input type="number" min={0} max={100} value={form.progress_percent} onChange={(e) => set({ progress_percent: Number(e.target.value) })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
          </label>
        </div>
      )}
      <label className="block">
        <span className="mb-1 block text-slate-400">Depends on</span>
        <select value={form.depends_on_id} onChange={(e) => set({ depends_on_id: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100">
          <option value="">No dependency</option>
          {plan.tasks.map((task) => (
            <option key={task.id} value={task.id}>{task.title}</option>
          ))}
        </select>
      </label>
      {form.status === 'BLOCKED' && (
        <label className="block">
          <span className="mb-1 block text-slate-400">Blocker</span>
          <input value={form.blocked_reason} onChange={(e) => set({ blocked_reason: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
        </label>
      )}
      <label className="block">
        <span className="mb-1 block text-slate-400">Remarks</span>
        <textarea rows={2} value={form.remarks} onChange={(e) => set({ remarks: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
      </label>
    </>
  );
}
