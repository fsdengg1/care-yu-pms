'use client';

import { Link } from '@/lib/navigation';
import React, { useEffect, useMemo, useState } from 'react';

import { ArrowRight } from 'lucide-react';
import { User } from '@/lib/types';
import { DailyUpdatesApi } from '@/lib/dailyUpdatesApi';
import { DailyStatusApi } from '@/lib/dailyStatusApi';
import { DailyStatusRow, appTodayIso, deadlineCellClass, deadlineTone } from '@/lib/dailyStatus';
import { formatEmployeeDisplayName } from '@/lib/people';
import { formatDateTime, formatRelativeTime } from '@/lib/format';
import KPIStatCard from '@/components/work/KPIStatCard';
import EmployeePerformanceCard from '@/components/work/EmployeePerformanceCard';
import TaskDetailDrawer from '@/components/work/TaskDetailDrawer';
import StatusBadge from '@/components/work/StatusBadge';

type AttentionKey = 'critical' | 'action' | 'hold' | 'upcoming' | 'completed' | null;

export default function ManagementDashboard({ user }: { user: User }) {
  const [rows, setRows] = useState<DailyStatusRow[]>([]);
  const [attention, setAttention] = useState<AttentionKey>(null);
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [drawer, setDrawer] = useState<DailyStatusRow | null>(null);
  const [error, setError] = useState('');
  const [updatesToday, setUpdatesToday] = useState(0);

  useEffect(() => {
    void (async () => {
      const [sheet, summary] = await Promise.all([DailyStatusApi.sheet(appTodayIso(), 'morning'), DailyUpdatesApi.summary()]);
      if (!sheet.ok) {
        setError(sheet.message || 'Unable to load dashboard data.');
        return;
      }
      setRows(sheet.rows);
      setUpdatesToday(summary?.submittedToday ?? sheet.kpis?.updatesToday ?? 0);
    })();
  }, [user.id]);

  const totals = useMemo(() => {
    const completed = rows.filter((row) => row.status === 'Completed').length;
    const inProgress = rows.filter((row) => row.status === 'In Progress').length;
    const hold = rows.filter((row) => row.status === 'On Hold').length;
    const overdue = rows.filter((row) => row.overdue).length;
    const critical = rows.filter((row) => row.overdue && (row.status === 'On Hold' || row.blocked)).length;
    return {
      overall: rows.length ? Math.round((completed / rows.length) * 100) : 0,
      tasks: rows.length,
      completed,
      inProgress,
      hold,
      overdue,
      critical,
      updatesToday,
    };
  }, [rows, updatesToday]);

  const attentionRows = useMemo(() => {
    if (attention === 'critical') return rows.filter((row) => row.overdue);
    if (attention === 'action') return rows.filter((row) => row.status === 'On Hold' || row.status === 'Not Started');
    if (attention === 'hold') return rows.filter((row) => row.status === 'On Hold');
    if (attention === 'upcoming') return rows.filter((row) => !row.overdue && row.status !== 'Completed').slice(0, 12);
    if (attention === 'completed') return rows.filter((row) => row.status === 'Completed');
    return [];
  }, [attention, rows]);

  const byEmployee = useMemo(() => {
    const map = new Map<string, { name: string; rows: DailyStatusRow[] }>();
    for (const row of rows) {
      const current = map.get(row.personId) || { name: row.person, rows: [] };
      current.rows.push(row);
      map.set(row.personId, current);
    }
    return [...map.entries()].map(([id, value]) => {
      const completed = value.rows.filter((row) => row.status === 'Completed').length;
      return {
        id,
        name: value.name,
        total: value.rows.length,
        completed,
        inProgress: value.rows.filter((row) => row.status === 'In Progress').length,
        hold: value.rows.filter((row) => row.status === 'On Hold').length,
        overdue: value.rows.filter((row) => row.overdue).length,
        progress: value.rows.length ? Math.round((completed / value.rows.length) * 100) : 0,
      };
    });
  }, [rows]);

  const recent = useMemo(
    () =>
      [...rows]
        .filter((row) => row.latestUpdateAt)
        .sort((a, b) => String(b.latestUpdateAt).localeCompare(String(a.latestUpdateAt)))
        .slice(0, 6),
    [rows]
  );

  const filteredRows = employeeFilter ? rows.filter((row) => row.personId === employeeFilter) : [];

  return (
    <div className="min-w-0 space-y-6 overflow-x-hidden">
      {error && <div className="rounded-xl border border-rose-900 bg-rose-950/40 px-4 py-3 text-xs text-rose-300">{error}</div>}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KPIStatCard label="Overall Performance" value={`${totals.overall}%`} hint="Completed vs total tasks" />
        <KPIStatCard label="Total Tasks" value={totals.tasks} />
        <KPIStatCard label="Completed" value={totals.completed} tone="success" />
        <KPIStatCard label="In Progress" value={totals.inProgress} />
        <KPIStatCard label="On Hold" value={totals.hold} tone="warning" />
        <KPIStatCard label="Overdue" value={totals.overdue} tone="danger" />
        <KPIStatCard
          label="Critical Delays"
          value={totals.critical}
          hint="Tasks requiring attention"
          tone="danger"
          active={attention === 'critical'}
          onClick={() => setAttention(attention === 'critical' ? null : 'critical')}
        />
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="text-sm font-bold text-slate-100">Today&apos;s Attention</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { key: 'critical' as const, label: 'Critical Delays', value: totals.overdue },
            { key: 'action' as const, label: 'Tasks Need Action', value: rows.filter((row) => row.status === 'On Hold' || row.status === 'Not Started').length },
            { key: 'hold' as const, label: 'Tasks On Hold', value: totals.hold },
            { key: 'upcoming' as const, label: 'Upcoming Deadlines', value: rows.filter((row) => !row.overdue && row.status !== 'Completed').length },
            { key: 'completed' as const, label: 'Completed Today', value: totals.updatesToday },
          ].map((card) => (
            <button
              key={card.key}
              type="button"
              onClick={() => setAttention(attention === card.key ? null : card.key)}
              className={`rounded-xl border p-4 text-left hover:border-cyan-600 ${attention === card.key ? 'border-cyan-500' : 'border-slate-800 bg-slate-950/40'}`}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{card.label}</div>
              <div className="mt-2 text-xl font-bold text-slate-100">{card.value}</div>
              <div className="mt-2 text-[11px] font-bold text-cyan-400">View All →</div>
            </button>
          ))}
        </div>
        {attention && (
          <div className="mt-4 space-y-2">
            {attentionRows.length === 0 && <p className="text-xs text-slate-500">No tasks found.</p>}
            {attentionRows.slice(0, 12).map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setDrawer(row)}
                className="flex w-full flex-wrap items-start justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-left hover:border-cyan-700"
              >
                <div>
                  <div className="text-xs font-semibold text-slate-100">{row.person} · {row.project}</div>
                  <div className="wrap-break-word text-xs text-slate-400">{row.taskDescription}</div>
                </div>
                <div className="text-right text-[11px] text-slate-500">
                  <StatusBadge status={row.status} />
                  <div className={`mt-1 rounded px-1.5 py-0.5 ${deadlineCellClass(deadlineTone(row.status, row.deadlineIso || row.deadline))}`}>
                    Deadline {row.deadline}
                  </div>
                  <div>{row.reasonForDelay}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-bold text-slate-100">Team Performance</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {byEmployee.map((person) => (
            <EmployeePerformanceCard
              key={person.id}
              name={person.name}
              total={person.total}
              completed={person.completed}
              inProgress={person.inProgress}
              hold={person.hold}
              overdue={person.overdue}
              progress={person.progress}
              onClick={() => setEmployeeFilter(employeeFilter === person.id ? '' : person.id)}
            />
          ))}
        </div>
        {filteredRows.length > 0 && (
          <div className="mt-4 space-y-2">
            {filteredRows.map((row) => (
              <button key={row.id} type="button" onClick={() => setDrawer(row)} className="w-full rounded-xl border border-slate-800 p-3 text-left hover:border-cyan-700">
                <div className="text-xs font-semibold text-slate-100">{row.project} · {row.taskDescription}</div>
                <div className="mt-1"><StatusBadge status={row.status} /></div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="text-sm font-bold text-slate-100">Recent Activity</h2>
        <div className="mt-3 space-y-3">
          {recent.map((row) => (
            <button key={row.id} type="button" onClick={() => setDrawer(row)} className="w-full rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-left hover:border-cyan-700">
              <div className="text-xs font-bold text-slate-100">{formatEmployeeDisplayName(row.person)}</div>
              <div className="text-xs text-slate-400">Submitted update</div>
              <div className="mt-1 wrap-break-word text-xs text-slate-300">{row.taskDescription}</div>
              <div className="mt-1 text-[11px] text-slate-500">
                {row.latestUpdateAt ? `${formatRelativeTime(row.latestUpdateAt)} · ${formatDateTime(row.latestUpdateAt)}` : row.currentDate}
              </div>
            </button>
          ))}
          {recent.length === 0 && <p className="text-xs text-slate-500">No project activity available.</p>}
        </div>
        <Link href="/daily-updates" className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-cyan-400 hover:underline">
          Open History <ArrowRight className="h-3 w-3" />
        </Link>
      </section>

      <TaskDetailDrawer row={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}
