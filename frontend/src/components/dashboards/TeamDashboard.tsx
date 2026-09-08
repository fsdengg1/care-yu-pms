'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, ChevronDown, ChevronRight } from 'lucide-react';
import { formatLongDate } from '@/lib/format';
import {
  TeamDashboardApi,
  TeamDashboardPayload,
  TeamDashboardProjectRow,
} from '@/lib/teamDashboardApi';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function currentPeriod() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function scheduleClass(status: string) {
  if (status === 'On Time') return 'border-emerald-800 bg-emerald-950 text-emerald-300';
  if (status === 'Delayed') return 'border-amber-800 bg-amber-950 text-amber-300';
  if (status === 'Overdue') return 'border-rose-800 bg-rose-950 text-rose-300';
  return 'border-slate-700 bg-slate-800 text-slate-300';
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
      <div className="text-xs font-medium text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-bold text-slate-100">{value}</div>
      {hint ? <div className="mt-1 text-[11px] text-slate-500">{hint}</div> : null}
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
      <div className="h-full rounded-full bg-cyan-500" style={{ width: `${width}%` }} />
    </div>
  );
}

function selectClass() {
  return 'rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyan-700';
}

export default function TeamDashboard() {
  const initial = currentPeriod();
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState('');
  const [teamId, setTeamId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [data, setData] = useState<TeamDashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const years = useMemo(() => {
    const current = currentPeriod().year;
    return [current - 1, current, current + 1];
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await TeamDashboardApi.load({
      year,
      month,
      from: from || undefined,
      to: to || undefined,
      userId: userId || undefined,
      role: role || undefined,
      teamId: teamId || undefined,
      projectId: projectId || undefined,
    });
    if (!result.ok || !result.data) {
      setData(null);
      setError(result.message || 'Unable to load Team Dashboard.');
    } else {
      setData(result.data);
      setError(null);
    }
    setLoading(false);
  }, [from, month, projectId, role, teamId, to, userId, year]);

  useEffect(() => {
    void load();
  }, [load]);

  const member = data?.member;
  const periodLabel = `${MONTHS[month - 1] || ''} ${year}`;

  function openMember(id: string) {
    setUserId(id);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-800 bg-gradient-to-r from-slate-900 via-cyan-950/20 to-slate-900 p-6">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
          <BarChart3 className="h-4 w-4" /> Team Dashboard
        </div>
        <h1 className="mt-1 text-2xl font-bold text-slate-100">Team performance</h1>
        <p className="mt-1 max-w-3xl text-xs text-slate-400">
          Evaluate individual contribution from live projects, tasks, subtasks, due dates, and daily work updates.
          Metrics are calculated for the selected period only.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-800 bg-slate-900/80 p-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Team member
          <select className={selectClass()} value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">All members (team overview)</option>
            {(data?.members || []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.rawName} — {item.roleName}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Month
          <select className={selectClass()} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((name, index) => (
              <option key={name} value={index + 1}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Year
          <select className={selectClass()} value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Department / role
          <select className={selectClass()} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">All roles</option>
            {(data?.filters.roles || []).map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Team
          <select className={selectClass()} value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="">All teams</option>
            {(data?.filters.teams || []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Project
          <select className={selectClass()} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">All projects</option>
            {(data?.filters.projects || []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.code} — {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Optional from
          <input type="date" className={selectClass()} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Optional to
          <input type="date" className={selectClass()} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-900 bg-rose-950/40 p-4 text-sm text-rose-200">{error}</div>
      ) : null}

      {loading && !data ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-400">Loading team metrics…</div>
      ) : null}

      {data ? (
        <>
          <section>
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Team summary · {periodLabel}
              {from && to ? ` · ${from} to ${to}` : ''}
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
              <StatCard label="Members" value={data.team.totalMembers} />
              <StatCard label="Active members" value={data.team.activeMembers} hint="Had assigned work or updates" />
              <StatCard label="Projects" value={data.team.projects} />
              <StatCard label="Tasks" value={data.team.tasks} />
              <StatCard label="Completed" value={data.team.completed} />
              <StatCard label="Pending" value={data.team.pending} />
              <StatCard label="Delayed" value={data.team.delayed} hint="Late + overdue" />
              <StatCard label="On-time %" value={`${data.team.onTimePercent}%`} />
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/90">
            <div className="border-b border-slate-800 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Team members
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Member</th>
                    <th className="px-3 py-2 font-medium">Projects</th>
                    <th className="px-3 py-2 font-medium">Tasks</th>
                    <th className="px-3 py-2 font-medium">Completed</th>
                    <th className="px-3 py-2 font-medium">Pending</th>
                    <th className="px-3 py-2 font-medium">Delayed</th>
                    <th className="px-3 py-2 font-medium">On-time %</th>
                    <th className="px-3 py-2 font-medium">Contribution</th>
                  </tr>
                </thead>
                <tbody>
                  {data.team.rows.map((row) => (
                    <tr
                      key={row.userId}
                      className={`cursor-pointer border-t border-slate-800/80 hover:bg-slate-800/40 ${
                        userId === row.userId ? 'bg-cyan-950/20' : ''
                      }`}
                      onClick={() => openMember(row.userId)}
                    >
                      <td className="px-4 py-2.5">
                        <div className="font-semibold text-slate-100">{row.rawName}</div>
                        <div className="text-[11px] text-slate-500">
                          {row.roleName}
                          {row.teamName ? ` · ${row.teamName}` : ''}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-200">{row.projects}</td>
                      <td className="px-3 py-2.5 text-slate-200">{row.tasks}</td>
                      <td className="px-3 py-2.5 text-emerald-300">{row.completed}</td>
                      <td className="px-3 py-2.5 text-slate-200">{row.pending}</td>
                      <td className="px-3 py-2.5 text-amber-300">{row.delayed + row.overdue}</td>
                      <td className="px-3 py-2.5 text-slate-200">{row.onTimePercent}%</td>
                      <td className="px-3 py-2.5">
                        <div className="mb-1 font-semibold text-cyan-300">{row.contribution}%</div>
                        <ProgressBar value={row.contribution} />
                      </td>
                    </tr>
                  ))}
                  {data.team.rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                        No team members match the current filters.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          {member ? (
            <>
              <section>
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Individual performance</div>
                    <h2 className="text-xl font-bold text-slate-100">
                      {member.rawName}
                      <span className="ml-2 text-sm font-medium text-slate-500">
                        {periodLabel}
                      </span>
                    </h2>
                  </div>
                  <button
                    type="button"
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-cyan-700 hover:text-cyan-300"
                    onClick={() => setUserId('')}
                  >
                    Back to team
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                  <StatCard label="Completion %" value={`${member.completionPercent}%`} />
                  <StatCard label="On-time %" value={`${member.onTimePercent}%`} />
                  <StatCard label="Projects" value={member.projects} />
                  <StatCard label="Tasks" value={member.tasks} hint={`${member.subtasks} subtasks`} />
                  <StatCard label="Delayed" value={member.delayed + member.overdue} />
                  <StatCard label="Logged hours" value={member.loggedHours ?? member.dailyWork.loggedHours ?? 0} />
                  <StatCard label="Leave days" value={member.leaveDays ?? member.dailyWork.leaveDays ?? 0} hint="Approved full/half day" />
                  <StatCard label="Permission days" value={member.permissionDays ?? member.dailyWork.permissionDays ?? 0} />
                </div>
              </section>

              <section>
                <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Assigned work</div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
                  <StatCard label="Projects assigned" value={member.assignedWork.projects} />
                  <StatCard label="Tasks assigned" value={member.assignedWork.tasks} />
                  <StatCard label="Subtasks assigned" value={member.assignedWork.subtasks} />
                  <StatCard label="Completed" value={member.assignedWork.completed} />
                  <StatCard label="In progress" value={member.assignedWork.inProgress} />
                  <StatCard label="Pending" value={member.assignedWork.pending} />
                  <StatCard label="Blocked" value={member.assignedWork.blocked} />
                </div>
              </section>

              <section>
                <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">On-time performance</div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                  <StatCard label="Completed on time" value={member.onTimePerformance.completedOnTime} />
                  <StatCard label="Completed late" value={member.onTimePerformance.completedLate} />
                  <StatCard label="Overdue" value={member.onTimePerformance.overdue} hint="Incomplete past due date" />
                  <StatCard label="On-time %" value={`${member.onTimePerformance.onTimePercent}%`} />
                  <StatCard label="Average delay" value={`${member.onTimePerformance.averageDelayDays}d`} />
                  <StatCard label="Maximum delay" value={`${member.onTimePerformance.maximumDelayDays}d`} />
                </div>
              </section>

              <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/90">
                <div className="border-b border-slate-800 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Project contributions
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-xs">
                    <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-2 font-medium">Project</th>
                        <th className="px-3 py-2 font-medium">Role</th>
                        <th className="px-3 py-2 font-medium">Tasks</th>
                        <th className="px-3 py-2 font-medium">Completed</th>
                        <th className="px-3 py-2 font-medium">Pending</th>
                        <th className="px-3 py-2 font-medium">Completion</th>
                        <th className="px-3 py-2 font-medium">Planned</th>
                        <th className="px-3 py-2 font-medium">Actual</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {member.projects.map((project) => (
                        <ProjectRow
                          key={project.projectId}
                          project={project}
                          open={Boolean(expanded[project.projectId])}
                          onToggle={() =>
                            setExpanded((current) => ({ ...current, [project.projectId]: !current[project.projectId] }))
                          }
                        />
                      ))}
                      {member.projects.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                            No project contribution in this period.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/90">
                <div className="border-b border-slate-800 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Daily work updates
                </div>
                <div className="grid grid-cols-2 gap-3 border-b border-slate-800 p-4 md:grid-cols-4 xl:grid-cols-7">
                  <StatCard label="Updates submitted" value={member.dailyWork.updatesSubmitted} />
                  <StatCard
                    label="Days with updates"
                    value={member.dailyWork.workingDaysWithUpdates}
                    hint={`${member.dailyWork.expectedWorkingDays} weekdays in period`}
                  />
                  <StatCard label="Completed work" value={member.dailyWork.completedWork} />
                  <StatCard label="Carried forward" value={member.dailyWork.carriedForward} />
                  <StatCard label="Blocked items" value={member.dailyWork.blockedItems} />
                  <StatCard label="Delayed items" value={member.dailyWork.delayedItems} />
                  <StatCard label="Leave days" value={member.dailyWork.leaveDays ?? 0} hint="Not counted as missing updates" />
                  <StatCard label="Logged hours" value={member.dailyWork.loggedHours ?? 0} />
                  <StatCard label="Accomplishments" value={member.dailyWork.accomplishments.length} />
                </div>
                {member.dailyWork.accomplishments.length > 0 ? (
                  <div className="border-b border-slate-800 px-4 py-3">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Major accomplishments</div>
                    <ul className="space-y-1.5 text-xs text-slate-300">
                      {member.dailyWork.accomplishments.map((item) => (
                        <li key={`${item.date}-${item.text.slice(0, 24)}`}>
                          <span className="text-slate-500">{formatLongDate(item.date)} · {item.projectName}:</span>{' '}
                          {item.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-xs">
                    <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-2 font-medium">Date</th>
                        <th className="px-3 py-2 font-medium">Project</th>
                        <th className="px-3 py-2 font-medium">Work completed</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 font-medium">Carry forward</th>
                      </tr>
                    </thead>
                    <tbody>
                      {member.dailyWork.rows.map((row) => (
                        <tr key={row.id} className="border-t border-slate-800/80">
                          <td className="whitespace-nowrap px-4 py-2 text-slate-300">{formatLongDate(row.date)}</td>
                          <td className="px-3 py-2 text-slate-200">{row.projectName}</td>
                          <td className="max-w-md px-3 py-2 text-slate-300">{row.workCompleted || '—'}</td>
                          <td className="px-3 py-2">
                            <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${scheduleClass(row.status === 'COMPLETED' ? 'On Time' : row.status === 'BLOCKED' ? 'Overdue' : 'In Progress')}`}>
                              {row.status.replaceAll('_', ' ')}
                            </span>
                          </td>
                          <td className="max-w-xs px-3 py-2 text-slate-400">{row.carryForward || '—'}</td>
                        </tr>
                      ))}
                      {member.dailyWork.rows.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                            No submitted daily updates in this period.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/90">
                <div className="border-b border-slate-800 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Delayed / overdue work
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-xs">
                    <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-2 font-medium">Task</th>
                        <th className="px-3 py-2 font-medium">Project</th>
                        <th className="px-3 py-2 font-medium">Due date</th>
                        <th className="px-3 py-2 font-medium">Actual / status</th>
                        <th className="px-3 py-2 font-medium">Delay days</th>
                        <th className="px-3 py-2 font-medium">Delay reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {member.delayedWork.map((item) => (
                        <tr key={item.taskId} className="border-t border-slate-800/80">
                          <td className="px-4 py-2.5 font-medium text-slate-100">{item.title}</td>
                          <td className="px-3 py-2.5 text-slate-300">{item.projectName}</td>
                          <td className="px-3 py-2.5 text-slate-300">{formatLongDate(item.dueDate)}</td>
                          <td className="px-3 py-2.5">
                            <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${scheduleClass(item.status)}`}>
                              {item.status}
                            </span>
                            <div className="mt-1 text-[11px] text-slate-500">
                              {item.actualDate ? formatLongDate(item.actualDate) : item.taskStatus.replaceAll('_', ' ')}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 font-semibold text-amber-300">{item.delayDays}d</td>
                          <td className="px-3 py-2.5 text-slate-400">{item.delayReason || '—'}</td>
                        </tr>
                      ))}
                      {member.delayedWork.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                            No delayed or overdue work in this period.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
                <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Project contribution score
                </div>
                <div className="mb-4 text-3xl font-bold text-cyan-300">{member.scores.contribution}%</div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                  {[
                    ['Assigned completion', member.scores.assignedCompletion, member.scores.weights.assignedCompletion],
                    ['Task progress', member.scores.taskProgress, member.scores.weights.taskProgress],
                    ['On-time delivery', member.scores.onTime, member.scores.weights.onTime],
                    ['Project participation', member.scores.projectParticipation, member.scores.weights.projectParticipation],
                    ['Daily update consistency', member.scores.dailyConsistency, member.scores.weights.dailyConsistency],
                  ].map(([label, value, weight]) => (
                    <div key={String(label)} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                      <div className="text-[11px] text-slate-500">{label}</div>
                      <div className="mt-1 text-lg font-semibold text-slate-100">{value}%</div>
                      <div className="mt-1 text-[10px] text-slate-500">Weight {weight}%</div>
                      <div className="mt-2">
                        <ProgressBar value={Number(value)} />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-[11px] leading-relaxed text-slate-500">{member.scores.formula}</p>
              </section>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/40 px-4 py-6 text-center text-xs text-slate-500">
              Select a team member above or click a row to open monthly performance.
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function ProjectRow({
  project,
  open,
  onToggle,
}: {
  project: TeamDashboardProjectRow;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="border-t border-slate-800/80 hover:bg-slate-800/30">
        <td className="px-4 py-2.5">
          <button type="button" className="flex items-start gap-2 text-left" onClick={onToggle}>
            {open ? <ChevronDown className="mt-0.5 h-3.5 w-3.5 text-slate-500" /> : <ChevronRight className="mt-0.5 h-3.5 w-3.5 text-slate-500" />}
            <span>
              <span className="block font-semibold text-slate-100">{project.projectName}</span>
              <span className="text-[11px] text-slate-500">{project.projectCode}</span>
            </span>
          </button>
        </td>
        <td className="px-3 py-2.5 text-slate-300">{project.role}</td>
        <td className="px-3 py-2.5 text-slate-200">{project.tasksAssigned}</td>
        <td className="px-3 py-2.5 text-emerald-300">{project.tasksCompleted}</td>
        <td className="px-3 py-2.5 text-slate-200">{project.tasksPending}</td>
        <td className="px-3 py-2.5">
          <div className="mb-1 text-slate-200">{project.completionPercent}%</div>
          <ProgressBar value={project.completionPercent} />
        </td>
        <td className="px-3 py-2.5 text-slate-300">{formatLongDate(project.plannedCompletion)}</td>
        <td className="px-3 py-2.5 text-slate-300">{formatLongDate(project.actualCompletion)}</td>
        <td className="px-3 py-2.5">
          <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${scheduleClass(project.schedule)}`}>
            {project.schedule}
          </span>
        </td>
      </tr>
      {open ? (
        <tr className="border-t border-slate-800/60 bg-slate-950/50">
          <td colSpan={9} className="px-8 py-3 text-[11px] text-slate-400">
            On-time tasks {project.onTimeCount} · Delay {project.delayDays}d · Blocked {project.tasksBlocked}
          </td>
        </tr>
      ) : null}
    </>
  );
}
