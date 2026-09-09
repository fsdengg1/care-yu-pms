'use client';

import { Link } from '@/lib/navigation';
import React, { useEffect, useState } from 'react';

import {
  ArrowRight,
  Cpu,
  DollarSign,
  Users,
} from 'lucide-react';
import { User, CeoDashboardPayload } from '@/lib/types';
import { apiRequest } from '@/lib/api';
import { formatClock, formatInrCompact, formatRelativeTime } from '@/lib/format';
import LeadWorkflowTimeline from '@/components/dashboards/LeadWorkflowTimeline';
import ProjectGanttPanel from '@/components/planning/ProjectGanttPanel';

interface DashboardProps {
  user: User;
}

const PIPELINE_BARS: Array<{ key: keyof CeoDashboardPayload['pipeline']['stages']; label: string }> = [
  { key: 'projectInput', label: 'Project Input' },
  { key: 'pmReview', label: 'PM Review' },
  { key: 'feasibility', label: 'Feasibility' },
  { key: 'costing', label: 'Costing' },
  { key: 'quotation', label: 'Quotation' },
  { key: 'negotiation', label: 'Negotiation' },
  { key: 'converted', label: 'Converted' },
];

export default function CEODashboard({ user }: DashboardProps) {
  const [data, setData] = useState<CeoDashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await apiRequest<CeoDashboardPayload>('/api/dashboard/ceo');
      if (cancelled) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setData(result.data);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const maxStage = Math.max(1, ...PIPELINE_BARS.map((bar) => data?.pipeline.stages[bar.key] ?? 0));
  const visibleIssues = data?.criticalIssues.slice(0, 3) ?? [];
  const remainingIssues = Math.max(0, (data?.criticalIssues.length ?? 0) - visibleIssues.length);
  const openEscalations = data?.escalations.filter((item) => item.status === 'OPEN').slice(0, 3) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950/40 p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
            <Cpu className="h-4 w-4" /> CEO Dashboard
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-100">Welcome back, {user.name}</h1>
          <p className="mt-1 max-w-xl text-xs text-slate-400">
            Executive visibility across Care Yu Automation. What is delayed, what is critical, and what needs your decision.
          </p>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">Attention queue</div>
          <div className="mt-0.5 text-sm font-semibold text-rose-300">
            {data ? `${data.criticalIssues.length} items require attention` : 'Loading…'}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-900 bg-rose-950/40 px-4 py-3 text-xs text-rose-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Link href="/pre-sales/leads" className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 shadow-sm transition hover:border-cyan-700">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Pre-Sales Pipeline</span>
            <div className="rounded-lg border border-cyan-800/40 bg-cyan-950 p-2 text-cyan-400">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-slate-100">{formatInrCompact(data?.pipeline.value ?? 0)}</div>
          <div className="mt-1 text-[11px] text-slate-400">{data?.pipeline.activeLeads ?? 0} Active Opportunities</div>
          <div className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Pipeline Status</div>
          <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-slate-400">
            <span>{data?.pipeline.inProgress ?? 0} In Progress</span>
            <span>{data?.pipeline.awaitingApproval ?? 0} Awaiting Approval</span>
            <span>{data?.pipeline.negotiation ?? 0} Negotiation</span>
          </div>
        </Link>

        <Link href="/teams" className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 shadow-sm transition hover:border-cyan-700">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Functional Teams</span>
            <div className="rounded-lg border border-indigo-800/40 bg-indigo-950 p-2 text-indigo-400">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-slate-100">{data?.teams.total ?? 0} Teams</div>
          <div className="mt-1 text-[11px] text-slate-400">
            {data?.teams.members ?? 0} Functional Members · excludes management
          </div>
          <div className="mt-3 space-y-1 text-[11px] text-slate-400">
            {(data?.teams.breakdown ?? []).slice(0, 5).map((team) => (
              <div key={team.id} className="flex items-center justify-between">
                <span className={team.hasBlocker ? 'text-amber-300' : ''}>{team.name}</span>
                <span className="font-medium text-slate-300">{team.members} Members</span>
              </div>
            ))}
          </div>
        </Link>

        <Link href="/dashboard/ceo/project-manager" className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 shadow-sm transition hover:border-cyan-700">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Project Management</span>
            <div className="rounded-lg border border-emerald-800/40 bg-emerald-950 p-2 text-emerald-400">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-xl font-bold text-slate-100">{data?.projectManager.name ?? '—'}</div>
          <div className="mt-3 space-y-1 text-[11px] text-slate-400">
            <div>{data?.projectManager.pendingReviews ?? 0} Pending Reviews</div>
            <div className="text-rose-300">{data?.projectManager.escalations ?? 0} Escalations</div>
          </div>
          <div className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-400">
            View PM Overview <ArrowRight className="h-3 w-3" />
          </div>
        </Link>
      </div>

      <ProjectGanttPanel user={user} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">Attention Required</h2>
            <Link href="/dashboard/ceo/escalations" className="text-[11px] font-semibold text-cyan-400 hover:underline">
              View All
            </Link>
          </div>
          {visibleIssues.length === 0 ? (
            <p className="text-xs text-slate-500">No items requiring management attention.</p>
          ) : (
            <div className="space-y-3">
              {visibleIssues.map((issue) => (
                <div key={issue.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className={`text-[11px] font-bold ${issue.kind === 'CRITICAL_ISSUE' ? 'text-rose-300' : 'text-amber-300'}`}>
                        {issue.kind === 'CRITICAL_ISSUE' ? '🔴 Critical Issue' : issue.kind === 'PROCUREMENT_DELAY' ? '⚠ Procurement delay' : '⚠ Project At Risk'}
                      </div>
                      <div className="mt-1 text-sm font-semibold text-slate-100">
                        {issue.customer} – {issue.project}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-400">{issue.summary}</p>
                      {issue.escalatedBy && (
                        <p className="mt-1 text-[11px] text-slate-500">
                          Escalated by: {issue.escalatedBy}
                          {issue.escalatedAt ? ` · ${formatRelativeTime(issue.escalatedAt)}` : ''}
                        </p>
                      )}
                    </div>
                    <Link
                      href={issue.href}
                      className="shrink-0 rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-700"
                    >
                      View
                    </Link>
                  </div>
                </div>
              ))}
              {remainingIssues > 0 && (
                <div className="flex items-center justify-between pt-1 text-xs text-slate-400">
                  <span>{remainingIssues} more issues</span>
                  <Link href="/dashboard/ceo/escalations" className="font-semibold text-cyan-400">
                    View All
                  </Link>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
        <h2 className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-200">Pre-Sales Pipeline</h2>
        <p className="mb-4 text-[11px] text-slate-500">
          Executive buckets group operational stages: In Progress (Project Input, Feasibility, Quotation), Awaiting Approval (PM Review, Costing), and Negotiation.
        </p>
        <div className="mb-4 flex flex-wrap gap-4 text-[11px] text-slate-400">
          {PIPELINE_BARS.map((bar, index) => (
            <span key={bar.key}>
              {bar.label} <span className="font-bold text-slate-200">{data?.pipeline.stages[bar.key] ?? 0}</span>
              {index < PIPELINE_BARS.length - 1 ? <span className="ml-4 text-slate-600">→</span> : null}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          {PIPELINE_BARS.map((bar) => {
            const count = data?.pipeline.stages[bar.key] ?? 0;
            return (
              <Link key={bar.key} href="/pre-sales/leads" className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                <div className="mb-2 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">{bar.label}</span>
                  <span className="font-bold text-slate-100">{count}</span>
                </div>
                <div className="h-2 overflow-hidden rounded bg-slate-800">
                  <div className="h-full bg-cyan-500" style={{ width: `${(count / maxStage) * 100}%` }} />
                </div>
              </Link>
            );
          })}
        </div>
        {(data?.pipeline.activeLeads ?? 0) === 0 && (
          <p className="mt-4 text-center text-xs text-slate-500">No leads in the pipeline yet.</p>
        )}
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">Daily work visibility</h2>
          <Link href="/daily-updates" className="inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-400 hover:underline">
            Open <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[
            { label: 'Projects with recent progress', value: data?.dailyWork?.projectsWithRecentProgress ?? 0 },
            { label: 'No recent update', value: data?.dailyWork?.projectsWithNoRecentUpdate ?? 0 },
            { label: 'Blocked tasks', value: data?.dailyWork?.blockedTasks ?? 0 },
            { label: 'Team activity', value: data?.dailyWork?.teamActivity ?? 0 },
            { label: 'Open escalations', value: data?.escalations.length ?? 0 },
          ].map((card) => (
            <div key={card.label} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">{card.label}</div>
              <div className="mt-1 text-xl font-bold text-slate-100">{card.value}</div>
            </div>
          ))}
        </div>
        {(data?.dailyWork?.majorBlockers ?? []).length > 0 && (
          <div className="mt-4 space-y-2">
            {(data?.dailyWork?.majorBlockers ?? []).map((item, index) => (
              <Link key={`${item.project}-${index}`} href={item.href} className="block rounded-lg border border-rose-900/40 bg-rose-950/20 p-3 hover:border-rose-700">
                <div className="text-[11px] font-bold text-rose-300">{item.summary}</div>
                <div className="text-xs text-slate-400">{item.customer} – {item.project}</div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <LeadWorkflowTimeline />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">Escalations</h2>
            <span className="rounded border border-rose-800 bg-rose-950 px-2 py-0.5 text-[10px] font-bold text-rose-300">
              {data?.escalations.length ?? 0} Open
            </span>
          </div>
          <div className="space-y-3">
            {openEscalations.length === 0 ? (
              <p className="text-xs text-slate-500">No open escalations.</p>
            ) : (
              openEscalations.map((item) => (
              <Link
                key={item.id}
                href={`/dashboard/ceo/escalations/${item.id}`}
                className="block rounded-lg border border-slate-800 bg-slate-950/60 p-3 hover:border-cyan-800"
              >
                <div className={`text-[11px] font-bold ${item.severity === 'CRITICAL' ? 'text-rose-300' : 'text-orange-300'}`}>
                  {item.severity === 'CRITICAL' ? '🔴 Critical' : '🟠 High'}
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-100">{item.issue}</div>
                <div className="mt-0.5 text-xs text-slate-400">{item.customer_name}</div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Escalated by {item.raised_by_role}</span>
                  <span>{formatRelativeTime(item.created_at)}</span>
                </div>
              </Link>
              ))
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">Recent Activity</h2>
            <Link href="/audit-logs" className="text-[11px] font-semibold text-cyan-400 hover:underline">
              Audit Trail
            </Link>
          </div>
          <div className="space-y-3">
            {(data?.recentActivity ?? []).map((log) => (
              <div key={log.id} className="flex gap-3 border-b border-slate-800/70 pb-3 last:border-0">
                <div className="w-20 shrink-0 text-[11px] font-mono text-slate-500">{formatClock(log.created_at)}</div>
                <div className="text-xs text-slate-300">{log.description}</div>
              </div>
            ))}
            {(data?.recentActivity.length ?? 0) === 0 && (
              <p className="text-xs text-slate-500">No audit activity yet.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
