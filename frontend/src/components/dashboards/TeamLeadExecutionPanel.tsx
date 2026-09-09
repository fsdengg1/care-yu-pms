'use client';

import { Link } from '@/lib/navigation';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { DailyUpdate, Project, ProjectDetailPayload, Task, User } from '@/lib/types';
import { DailyUpdatesApi } from '@/lib/dailyUpdatesApi';
import { ProjectsApi } from '@/lib/projectsApi';
import { TasksApi } from '@/lib/tasksApi';
import {
  ESCALATION_LEVEL_LABELS,
  PROJECT_ACTION_SUCCESS,
  TASK_STATUS_LABELS,
  formatDateTime,
  formatLongDate,
} from '@/lib/format';
import ProjectWorkflowBanner from '@/components/projects/ProjectWorkflowBanner';
import ProjectGanttPanel from '@/components/planning/ProjectGanttPanel';

const REVIEW_FIELDS: Array<[string, string]> = [
  ['scope_summary', 'Project scope'],
  ['requirements_summary', 'Customer requirements'],
  ['technical_notes', 'Technical requirements'],
  ['commercial_notes', 'Commercial requirements'],
  ['timeline_notes', 'Timeline'],
  ['pm_instructions', 'PM instructions'],
  ['dependencies', 'Dependencies'],
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function dateLabel(value?: string) {
  if (!value) return '—';
  return formatLongDate(value);
}

function taskStatusLabel(task: Task) {
  if (task.status === 'BLOCKED') return 'Issue / Blocked';
  if (task.review_status === 'PENDING_TL_REVIEW') return 'Completed / Pending Team Lead Review';
  if (task.status === 'DONE') return 'Completed';
  if (task.status === 'IN_PROGRESS') return 'In Progress';
  return TASK_STATUS_LABELS[task.status] || 'Assigned';
}

function derivedHealth(tasks: Task[], project: Project) {
  if (tasks.some((task) => task.status === 'BLOCKED')) return 'Blocked';
  const open = tasks.filter((task) => task.status !== 'DONE' || task.review_status === 'PENDING_TL_REVIEW' || task.review_status === 'CORRECTION_REQUIRED');
  const due = today();
  if (open.some((task) => task.due_date && task.due_date < due)) return 'Delayed';
  if (project.target_completion && project.target_completion < due && project.status === 'ACTIVE') return 'Delayed';
  if (open.some((task) => task.due_date && task.due_date <= due && (task.progress_percent || 0) < 70)) return 'At Risk';
  return 'On Track';
}

function taskCounts(tasks: Task[]) {
  return {
    total: tasks.length,
    completed: tasks.filter((task) => task.status === 'DONE' && task.review_status !== 'PENDING_TL_REVIEW' && task.review_status !== 'CORRECTION_REQUIRED').length,
    inProgress: tasks.filter((task) => task.status === 'IN_PROGRESS' && task.review_status !== 'PENDING_TL_REVIEW').length,
    blocked: tasks.filter((task) => task.status === 'BLOCKED').length,
    pending: tasks.filter((task) => task.status === 'TODO').length,
    pendingReview: tasks.filter((task) => task.review_status === 'PENDING_TL_REVIEW').length,
  };
}

export default function TeamLeadExecutionPanel({ user }: { user: User }) {
  const [details, setDetails] = useState<ProjectDetailPayload[]>([]);
  const [updates, setUpdates] = useState<DailyUpdate[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    priority: 'Medium',
    start_date: '',
    due_date: '',
    depends_on_id: '',
    assigned_to_id: '',
  });
  const [concernFor, setConcernFor] = useState<string | null>(null);
  const [concern, setConcern] = useState('');
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const listed = await ProjectsApi.list('ALL');
    const mine = listed.projects.filter((project) => project.team_lead_id === user.id);
    const payloads = (await Promise.all(mine.map((project) => ProjectsApi.get(project.id)))).filter(
      (item): item is ProjectDetailPayload => Boolean(item),
    );
    setDetails(payloads);
    const listedUpdates = await DailyUpdatesApi.list();
    setUpdates((listedUpdates.updates || []).filter((item) => item.submission_status === 'SUBMITTED'));
  }, [user.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(key: string, work: () => Promise<void>, success: string) {
    setBusy(key);
    setError('');
    setMessage('');
    try {
      await work();
      setMessage(success);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setBusy('');
    }
  }

  async function requireOk(result: { ok: true } | { ok: false; message: string }) {
    if (!result.ok) throw new Error(result.message);
  }

  const allTasks = useMemo(() => details.flatMap((item) => (item.tasks || []).map((task) => ({ task, project: item.project, detail: item }))), [details]);
  const blockedTasks = allTasks.filter(({ task }) => task.status === 'BLOCKED');
  const openProject = details.find((item) => item.project.id === openId) || details[0];

  return (
    <div className="space-y-6 text-xs">
      {message ? <p className="rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">{message}</p> : null}
      {error ? <p className="rounded-lg border border-rose-800 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">{error}</p> : null}

      <section className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
        <h2 className="text-sm font-bold text-slate-100">Projects Assigned to Me</h2>
        {details.length === 0 ? (
          <p className="mt-3 text-slate-500">No execution projects are assigned to you yet.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {details.map((item) => {
              const project = item.project;
              const tasks = item.tasks || [];
              const counts = taskCounts(tasks);
              const health = derivedHealth(tasks, project);
              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => setOpenId(project.id)}
                  className={`block w-full rounded-lg border p-3 text-left ${openId === project.id || (!openId && openProject?.project.id === project.id) ? 'border-cyan-700 bg-cyan-950/20' : 'border-slate-800 bg-slate-950/50'}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <span className="font-mono font-bold text-cyan-400">{project.code}</span>
                      <span className="ml-2 font-bold text-slate-100">{project.name}</span>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${health === 'Blocked' ? 'bg-rose-500/15 text-rose-300' : health === 'Delayed' ? 'bg-amber-500/15 text-amber-300' : health === 'At Risk' ? 'bg-orange-500/15 text-orange-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
                      {health}
                    </span>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <div>PM: {project.pm_name}</div>
                    <div>Customer: {project.customer_name}</div>
                    <div>Start: {dateLabel(project.start_date)}</div>
                    <div>Target: {dateLabel(project.target_completion)}</div>
                    <div>Overall Progress: {project.progress}%</div>
                    <div>Tasks: {counts.total} · Completed: {counts.completed} · Pending: {counts.pending + counts.inProgress} · Blocked: {counts.blocked}</div>
                    <div>Current Stage: {item.workflow?.stage || '—'}</div>
                    <div>Current Status: {item.workflow?.status || '—'}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {openProject && (
        <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/90 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-100">
              {openProject.project.code} — {openProject.project.name}
            </h2>
            <Link href={`/projects/${openProject.project.id}`} className="text-cyan-400 hover:underline">Open project page</Link>
          </div>
          <ProjectWorkflowBanner workflow={openProject.workflow} />

          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Overall Project Progress" value={`${openProject.project.progress}%`} />
            <Stat label="Completed" value={taskCounts(openProject.tasks || []).completed} />
            <Stat label="In Progress" value={taskCounts(openProject.tasks || []).inProgress} />
            <Stat label="Blocked" value={taskCounts(openProject.tasks || []).blocked} />
            <Stat label="Not Started" value={taskCounts(openProject.tasks || []).pending} />
            <Stat label="Project Health" value={derivedHealth(openProject.tasks || [], openProject.project)} />
          </div>

          {openProject.actions?.canIntake && (
            <div className="space-y-3 rounded-lg border border-cyan-800/50 bg-cyan-950/20 p-3">
              <div className="font-bold text-cyan-200">Team Lead Review</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {REVIEW_FIELDS.map(([key, label]) => {
                  const value = String((openProject.project.intake_form || {})[key] || '').trim();
                  return (
                    <div key={key}>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
                      <div className="mt-0.5 text-slate-200">{value || '—'}</div>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  disabled={Boolean(busy)}
                  onClick={() =>
                    run(
                      'accept',
                      async () => {
                        await requireOk(await ProjectsApi.intake(openProject.project.id, 'accept'));
                      },
                      PROJECT_ACTION_SUCCESS.accepted,
                    )
                  }
                  className="rounded-lg bg-cyan-600 px-4 py-2 font-bold text-white disabled:opacity-50"
                >
                  Accept Project
                </button>
              </div>
              <textarea
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                placeholder="Return reason (required)"
                className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              />
              <button
                disabled={Boolean(busy) || !returnReason.trim()}
                onClick={() =>
                  run(
                    'return',
                    async () => {
                      await requireOk(await ProjectsApi.intake(openProject.project.id, 'return', returnReason.trim()));
                    },
                    PROJECT_ACTION_SUCCESS.returned,
                  )
                }
                className="rounded-lg border border-amber-700 px-4 py-2 font-bold text-amber-200 disabled:opacity-50"
              >
                Return to PM
              </button>
            </div>
          )}

          {openProject.actions?.canBreakdown && (
            <div className="space-y-2 rounded-lg border border-indigo-800/50 bg-indigo-950/20 p-3">
              <div className="font-bold text-indigo-200">Task Breakdown</div>
              <div className="grid gap-2 md:grid-cols-2">
                <input value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} placeholder="Task name" className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" />
                <select value={taskForm.assigned_to_id} onChange={(e) => setTaskForm({ ...taskForm, assigned_to_id: e.target.value })} className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100">
                  <option value="">Assigned team member</option>
                  {(openProject.assignableUsers || [])
                    .filter((item) => !user.team_id || item.team_id === user.team_id || item.id === user.id)
                    .map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                </select>
                <textarea value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} placeholder="Description" className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 md:col-span-2" />
                <select value={taskForm.priority} onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })} className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100">
                  <option>Low</option>
                  <option>Medium</option>
                  <option>High</option>
                  <option>Critical</option>
                </select>
                <input type="date" value={taskForm.start_date} onChange={(e) => setTaskForm({ ...taskForm, start_date: e.target.value })} className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" />
                <input type="date" value={taskForm.due_date} onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })} className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" />
                <select value={taskForm.depends_on_id} onChange={(e) => setTaskForm({ ...taskForm, depends_on_id: e.target.value })} className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100">
                  <option value="">No dependency</option>
                  {(openProject.tasks || []).map((task) => (
                    <option key={task.id} value={task.id}>{task.title}</option>
                  ))}
                </select>
              </div>
              <button
                disabled={Boolean(busy) || !taskForm.title.trim() || !taskForm.assigned_to_id}
                onClick={() =>
                  run(
                    'assign',
                    async () => {
                      await requireOk(
                        await TasksApi.create({
                          title: taskForm.title.trim(),
                          description: taskForm.description,
                          task_type: 'PROJECT_TASK',
                          project_id: openProject.project.id,
                          assigned_to_id: taskForm.assigned_to_id,
                          start_date: taskForm.start_date || undefined,
                          due_date: taskForm.due_date || undefined,
                          priority: taskForm.priority,
                          depends_on_id: taskForm.depends_on_id || undefined,
                        }),
                      );
                      setTaskForm({ title: '', description: '', priority: 'Medium', start_date: '', due_date: '', depends_on_id: '', assigned_to_id: '' });
                    },
                    PROJECT_ACTION_SUCCESS.taskAssigned,
                  )
                }
                className="rounded-lg bg-indigo-600 px-4 py-2 font-bold text-white disabled:opacity-50"
              >
                Assign Task
              </button>
            </div>
          )}

          {openProject.actions?.canTlReview && (
            <button
              disabled={Boolean(busy)}
              onClick={() =>
                run(
                  'final',
                  async () => {
                    await requireOk(await ProjectsApi.tlReview(openProject.project.id));
                  },
                  PROJECT_ACTION_SUCCESS.tlReview,
                )
              }
              className="rounded-lg bg-emerald-700 px-4 py-2 font-bold text-white disabled:opacity-50"
            >
              Team Lead Final Review
            </button>
          )}

          <ProjectGanttPanel user={user} projectId={openProject.project.id} lockLabel="Gantt — Read Only" />
        </section>
      )}

      <section className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
        <h2 className="text-sm font-bold text-slate-100">Team Member Monitoring</h2>
        {allTasks.length === 0 ? (
          <p className="mt-3 text-slate-500">No team tasks yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-2 py-2">Team Member</th>
                  <th className="px-2 py-2">Task</th>
                  <th className="px-2 py-2 text-right">Progress</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Due Date</th>
                  <th className="px-2 py-2">Issue</th>
                </tr>
              </thead>
              <tbody>
                {allTasks.map(({ task, project }) => (
                  <tr key={task.id} className="border-t border-slate-800">
                    <td className="px-2 py-2 text-slate-200">{task.assigned_to}</td>
                    <td className="px-2 py-2">
                      <button type="button" onClick={() => setOpenTaskId(openTaskId === task.id ? null : task.id)} className="font-semibold text-cyan-300 hover:underline">
                        {task.title}
                      </button>
                      <div className="text-slate-500">{project.code}</div>
                      {openTaskId === task.id ? (
                        <div className="mt-2 rounded border border-slate-800 bg-slate-950 p-2 text-slate-300">
                          <div>{task.description || 'No description'}</div>
                          <div className="mt-1">Assigned by: {task.assigned_by || '—'}</div>
                          {task.blocked_reason ? <div className="mt-1 text-rose-300">{task.blocked_reason}</div> : null}
                          <div className="mt-1">Updated: {formatDateTime(task.updated_at)}</div>
                        </div>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 text-right">{task.progress_percent || 0}%</td>
                    <td className="px-2 py-2">{taskStatusLabel(task)}</td>
                    <td className="px-2 py-2">{dateLabel(task.due_date)}</td>
                    <td className="px-2 py-2">{task.status === 'BLOCKED' ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
        <h2 className="text-sm font-bold text-slate-100">Daily Work Update Review</h2>
        {updates.length === 0 ? (
          <p className="mt-3 text-slate-500">No daily updates submitted yet.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {updates.map((update) => (
              <article key={update.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                <div className="font-bold text-slate-100">{update.user_name} · {update.task_title}</div>
                <div className="text-slate-500">{update.project_name} · {update.work_date}</div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <div>Work completed: {update.work_completed || '—'}</div>
                  <div>Progress: {update.progress_percent}%</div>
                  <div>Issues: {update.blocker || 'None'}</div>
                  <div>Dependencies: {update.dependency || '—'}</div>
                  <div>Next action: {update.next_plan || '—'}</div>
                  <div>ETA: {update.next_plan || '—'}</div>
                </div>
                {(update.pm_comments || []).length > 0 ? (
                  <div className="mt-2 space-y-1 text-slate-400">
                    {(update.pm_comments || []).map((comment) => (
                      <div key={comment.id}>{comment.user_name}: {comment.comment}</div>
                    ))}
                  </div>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    disabled={Boolean(busy)}
                    onClick={() =>
                      run(
                        `ack-${update.id}`,
                        async () => {
                          await requireOk(await DailyUpdatesApi.comment(update.id, 'Acknowledged'));
                        },
                        'Daily update acknowledged.',
                      )
                    }
                    className="rounded border border-slate-700 px-3 py-1.5 font-bold text-slate-100"
                  >
                    Acknowledge Update
                  </button>
                  {concernFor === update.id ? (
                    <div className="flex flex-wrap gap-2">
                      <input value={concern} onChange={(e) => setConcern(e.target.value)} placeholder="Concern (does not change the submitted update)" className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100" />
                      <button
                        disabled={!concern.trim() || Boolean(busy)}
                        onClick={() =>
                          run(
                            `concern-${update.id}`,
                            async () => {
                              await requireOk(await DailyUpdatesApi.comment(update.id, `Concern: ${concern.trim()}`));
                              setConcern('');
                              setConcernFor(null);
                            },
                            'Concern recorded against the update.',
                          )
                        }
                        className="rounded border border-amber-700 px-3 py-1.5 font-bold text-amber-200"
                      >
                        Raise Concern
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setConcernFor(update.id)} className="rounded border border-amber-800 px-3 py-1.5 font-bold text-amber-200">
                      Raise Concern
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-rose-900/50 bg-rose-950/10 p-5">
        <h2 className="text-sm font-bold text-rose-200">Open Issues / Blockers</h2>
        {blockedTasks.length === 0 ? (
          <p className="mt-3 text-slate-500">No open blockers.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {blockedTasks.map(({ task, project, detail }) => {
              const escalation = (detail.escalations || []).find((item) => item.status !== 'RESOLVED');
              return (
                <article key={task.id} className="rounded-lg border border-rose-900/40 bg-slate-950/70 p-3">
                  <div className="font-bold text-slate-100">{project.code} · {task.title}</div>
                  <div className="mt-1 grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
                    <div>Raised by: {task.assigned_to}</div>
                    <div>Issue: {task.blocked_reason || '—'}</div>
                    <div>Priority: {task.priority}</div>
                    <div>Date raised: {formatDateTime(task.updated_at)}</div>
                    <div>Current escalation: {escalation ? ESCALATION_LEVEL_LABELS[escalation.current_level] || escalation.current_level : 'Level 1 — Team Lead'}</div>
                    <div>Status: Issue / Blocked</div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      disabled={Boolean(busy)}
                      onClick={() =>
                        run(
                          `resolve-${task.id}`,
                          async () => {
                            await requireOk(await TasksApi.update(task.id, { status: 'IN_PROGRESS', blocked_reason: '' }));
                          },
                          PROJECT_ACTION_SUCCESS.resolved,
                        )
                      }
                      className="rounded bg-emerald-700 px-3 py-1.5 font-bold text-white disabled:opacity-50"
                    >
                      Resolve
                    </button>
                    <button
                      disabled={Boolean(busy)}
                      onClick={() =>
                        run(
                          `esc-${task.id}`,
                          async () => {
                            await requireOk(
                              await ProjectsApi.escalate(project.id, {
                                issue: task.blocked_reason || task.title,
                                impact: `Unable to resolve blocked task ${task.title}`,
                                severity: 'HIGH',
                              }),
                            );
                          },
                          PROJECT_ACTION_SUCCESS.escalated,
                        )
                      }
                      className="rounded border border-rose-700 px-3 py-1.5 font-bold text-rose-200 disabled:opacity-50"
                    >
                      Escalate
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-bold text-slate-100">{value}</div>
    </div>
  );
}
