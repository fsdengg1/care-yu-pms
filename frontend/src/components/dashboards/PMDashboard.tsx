'use client';

import React, { useEffect, useState } from 'react';
import { User, DailyUpdate, DailyUpdateSummary, FeasibilitySuggestion, FeasibilityTeamAssignment, Project, WorkAssignment } from '@/lib/types';
import { StorageService } from '@/lib/storage';
import { DailyUpdatesApi } from '@/lib/dailyUpdatesApi';
import { LeadApi } from '@/lib/leadApi';
import { ProjectsApi } from '@/lib/projectsApi';
import { formatLongDate, LEAD_STATUS_LABELS, WORK_STATUS_LABELS } from '@/lib/format';
import { GanttChartSquare, Scan, ShieldAlert, MessageSquare, Inbox, ArrowRight, FileText, Clock } from 'lucide-react';
import Link from 'next/link';
import PendingActionsCard from '@/components/work/PendingActionsCard';
import LeadPipelinePanel from '@/components/dashboards/LeadPipelinePanel';
import LeadWorkflowTimeline from '@/components/dashboards/LeadWorkflowTimeline';
import ProjectGanttPanel from '@/components/planning/ProjectGanttPanel';
import ManagementDashboard from '@/components/dashboards/ManagementDashboard';

function statusClass(status: string) {
  if (status === 'BLOCKED') return 'border-rose-800 bg-rose-950 text-rose-300';
  if (status === 'COMPLETED' || status === 'DONE') return 'border-emerald-800 bg-emerald-950 text-emerald-300';
  if (status === 'IN_PROGRESS') return 'border-cyan-800 bg-cyan-950 text-cyan-300';
  return 'border-slate-700 bg-slate-800 text-slate-300';
}

export default function PMDashboard({ user }: { user: User }) {
  const [assignments, setAssignments] = useState<FeasibilityTeamAssignment[]>([]);
  const [suggestions, setSuggestions] = useState<FeasibilitySuggestion[]>([]);
  const [summary, setSummary] = useState<DailyUpdateSummary | null>(null);
  const [updates, setUpdates] = useState<DailyUpdate[]>([]);
  const [workAssignments, setWorkAssignments] = useState<WorkAssignment[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pmCounts, setPmCounts] = useState({
    pendingPmReview: 0,
    feasibilityPending: 0,
    procurementPending: 0,
    returnedToSales: 0,
  });
  const [pendingReviews, setPendingReviews] = useState<Array<{
    id: string;
    lead_number: string;
    customer_name: string;
    title: string;
    business_vertical: string;
    sales_owner: string;
    priority: string;
    submitted_at?: string;
    status: string;
    href: string;
  }>>([]);
  const [awaitingProjects, setAwaitingProjects] = useState<Project[]>([]);
  const [pmReviewQueue, setPmReviewQueue] = useState<Project[]>([]);

  useEffect(() => {
    void (async () => {
      await LeadApi.list();
      const dashboard = await LeadApi.pmDashboard();
      if (dashboard) {
        setPmCounts({
          pendingPmReview: dashboard.pendingPmReview,
          feasibilityPending: dashboard.feasibilityPending,
          procurementPending: dashboard.procurementPending,
          returnedToSales: dashboard.returnedToSales,
        });
        setPendingReviews(dashboard.pendingReviews || []);
      }
      setAssignments(StorageService.getFeasibilityTeamAssignments());
      setSuggestions(StorageService.getFeasibilitySuggestions());
      const [nextSummary, list] = await Promise.all([DailyUpdatesApi.summary(), DailyUpdatesApi.list()]);
      setSummary(nextSummary);
      setUpdates(list.updates.filter((item) => item.submission_status === 'SUBMITTED'));
      setWorkAssignments(list.assignments);
      setLoadError(nextSummary ? null : 'Unable to load daily work updates for your projects. Confirm the backend is running.');
      const listed = await ProjectsApi.list('ACTIVE');
      const submitted = listed.projects.filter(
        (project) => project.pm_id === user.id && project.intake_status === 'SUBMITTED_TO_PM'
      );
      const awaiting = listed.projects.filter(
        (project) =>
          project.pm_id === user.id &&
          (project.intake_status === 'AWAITING_ASSIGNMENT' || project.intake_status === 'RETURNED' || project.status === 'HANDOVER')
      );
      setPmReviewQueue(submitted);
      setAwaitingProjects(awaiting);
    })();
  }, []);

  const pendingTL = assignments.filter((a) => a.status === 'PENDING_TEAM_LEAD_REVIEW');
  const inProgress = assignments.filter((a) => a.status === 'IN_PROGRESS' || a.status === 'ALLOCATED_TO_TEAM_MEMBER');
  const critical = assignments.filter((a) => a.assignment_type === 'CRITICAL_DIRECT');
  const pendingSugg = suggestions.filter((s) => s.status === 'PENDING');

  const submitted = updates;
  const updatesToday = summary?.updatesToday?.length ? summary.updatesToday : submitted.filter((item) => item.work_date === new Date().toISOString().slice(0, 10));
  const blocked = summary?.blockedUpdates?.length ? summary.blockedUpdates : submitted.filter((item) => item.work_status === 'BLOCKED');
  const pendingItems = summary?.pendingItems?.length ? summary.pendingItems : workAssignments.filter((item) => item.current_status !== 'COMPLETED' && !item.last_update_at);
  const staleItems = summary?.staleItems?.length ? summary.staleItems : workAssignments.filter((item) => item.current_status !== 'COMPLETED');

  return (
    <div className="space-y-6 text-xs">
      <div className="flex flex-col items-start justify-between gap-4 rounded-xl border border-slate-800 bg-gradient-to-r from-slate-900 via-cyan-950/30 to-slate-900 p-6 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
            <GanttChartSquare className="h-4 w-4" /> PM Dashboard
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-100">{user.name}</h1>
          <p className="mt-0.5 text-xs text-slate-400">
            Review daily work on assigned projects, then plan and un-block execution.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/daily-updates" className="flex shrink-0 items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-bold text-white hover:bg-cyan-500">
            <FileText className="h-4 w-4" /> Daily Work Updates
          </Link>
          <Link href="/projects/planning" className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-xs font-bold text-slate-100 hover:border-cyan-700">
            <GanttChartSquare className="h-4 w-4" /> Gantt & Planning
          </Link>
          <Link href="/pre-sales/leads" className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-xs font-bold text-slate-100 hover:border-cyan-700">
            <Scan className="h-4 w-4" /> Open Leads
          </Link>
        </div>
      </div>

      <PendingActionsCard />
      <LeadPipelinePanel />
      <LeadWorkflowTimeline />
      <ManagementDashboard user={user} />
      <ProjectGanttPanel user={user} />

      {pmReviewQueue.length > 0 && (
        <div className="space-y-3 rounded-xl border border-cyan-800/60 bg-cyan-950/20 p-4">
          <div className="text-xs font-bold text-cyan-300">PM Review queue ({pmReviewQueue.length})</div>
          {pmReviewQueue.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`} className="flex items-center justify-between border-t border-cyan-900/30 py-2 hover:text-cyan-200">
              <div>
                <span className="mr-2 font-mono font-bold text-cyan-400">{project.code}</span>
                <span className="font-bold text-slate-100">{project.customer_name} – {project.name}</span>
                <div className="mt-0.5 text-[11px] text-slate-400">
                  Current Stage: PM Review · Status: Submitted to PM
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-cyan-400" />
            </Link>
          ))}
        </div>
      )}
      {awaitingProjects.length > 0 && (
        <div className="space-y-3 rounded-xl border border-cyan-800/60 bg-cyan-950/20 p-4">
          <div className="text-xs font-bold text-cyan-300">Projects needing PM action ({awaitingProjects.length})</div>
          {awaitingProjects.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`} className="flex items-center justify-between border-t border-cyan-900/30 py-2 hover:text-cyan-200">
              <div>
                <span className="mr-2 font-mono font-bold text-cyan-400">{project.code}</span>
                <span className="font-bold text-slate-100">{project.customer_name} – {project.name}</span>
                <div className="mt-0.5 text-[11px] text-slate-400">
                  {project.status === 'HANDOVER'
                    ? 'Step 8 — Approve completion / handover'
                    : project.intake_status === 'RETURNED'
                      ? 'Returned by Team Lead — reassign'
                      : 'Step 1 — Assign to Team Lead or Team Member'}
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-cyan-400" />
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Pending PM Review', value: pmCounts.pendingPmReview, href: '/my-work', color: 'text-cyan-300' },
          { label: 'Feasibility Pending', value: pmCounts.feasibilityPending, href: '/pre-sales/feasibility', color: 'text-amber-300' },
          { label: 'Procurement Pending', value: pmCounts.procurementPending, href: '/pre-sales/costing', color: 'text-violet-300' },
          { label: 'Returned to Sales', value: pmCounts.returnedToSales, href: '/pre-sales/leads', color: 'text-orange-300' },
        ].map((card) => (
          <Link key={card.label} href={card.href} className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 hover:border-cyan-800">
            <div className="font-medium text-slate-400">{card.label}</div>
            <div className={`mt-2 text-2xl font-bold ${card.color}`}>{card.value}</div>
          </Link>
        ))}
      </div>

      <section className="space-y-3 rounded-xl border border-blue-800/70 bg-blue-950/20 p-5">
        <div className="flex items-center justify-between border-b border-blue-900/60 pb-2">
          <h2 className="flex items-center gap-2 text-sm font-bold text-blue-200">
            <Clock className="h-4 w-4 text-cyan-400" /> Pending PM Reviews
          </h2>
          <Link href="/my-work" className="text-xs text-cyan-400 hover:underline">My Assigned Work</Link>
        </div>
        {pendingReviews.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-500">No leads currently assigned to you for PM review.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Lead ID</th>
                  <th className="py-2 pr-3">Customer</th>
                  <th className="py-2 pr-3">Lead Title</th>
                  <th className="py-2 pr-3">Sales Owner</th>
                  <th className="py-2 pr-3">Priority</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {pendingReviews.map((lead) => (
                  <tr key={lead.id} className="text-slate-300">
                    <td className="py-2.5 pr-3 font-mono font-bold text-cyan-400">{lead.lead_number}</td>
                    <td className="py-2.5 pr-3">{lead.customer_name}</td>
                    <td className="py-2.5 pr-3 font-semibold text-slate-100">{lead.title}</td>
                    <td className="py-2.5 pr-3">{lead.sales_owner}</td>
                    <td className="py-2.5 pr-3 text-amber-300">{lead.priority}</td>
                    <td className="py-2.5 pr-3">{LEAD_STATUS_LABELS[lead.status] || lead.status}</td>
                    <td className="py-2.5 text-right">
                      <Link href={lead.href} className="inline-flex items-center gap-1 rounded bg-cyan-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-cyan-500">
                        View <ArrowRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Updates today', value: summary?.submittedToday ?? updatesToday.length, href: '/daily-updates', color: 'text-slate-100' },
          { label: 'Pending today', value: summary?.pendingToday ?? pendingItems.length, href: '/daily-updates', color: 'text-amber-300' },
          { label: 'Blocked', value: summary?.blocked ?? blocked.length, href: '/daily-updates?status=BLOCKED', color: 'text-rose-300' },
          { label: 'No recent update', value: summary?.staleAssignments ?? staleItems.length, href: '/daily-updates', color: 'text-orange-300' },
        ].map((card) => (
          <Link key={card.label} href={card.href} className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 hover:border-cyan-800">
            <div className="font-medium text-slate-400">{card.label}</div>
            <div className={`mt-2 text-2xl font-bold ${card.color}`}>{card.value}</div>
          </Link>
        ))}
      </div>

      {loadError && (
        <div className="rounded-xl border border-rose-900 bg-rose-950/40 px-4 py-3 text-rose-300">{loadError}</div>
      )}

      <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/90 p-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-100">
            <FileText className="h-4 w-4 text-cyan-400" /> Daily Work Updates
          </h2>
          <Link href="/daily-updates" className="text-cyan-400 hover:underline">
            Open module
          </Link>
        </div>
        <p className="text-slate-500">
          Employee and team-lead updates on your assigned projects. Submitted work cannot be edited here — review, comment, or escalate from the update.
        </p>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-rose-900/40 bg-rose-950/20 p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-bold text-rose-200">
                <ShieldAlert className="h-4 w-4" /> Blocked work
              </h3>
              <Link href="/daily-updates?status=BLOCKED" className="text-cyan-400 hover:underline">View</Link>
            </div>
            {blocked.length === 0 ? (
              <p className="text-slate-500">No blocked updates on your projects.</p>
            ) : (
              blocked.slice(0, 5).map((item) => (
                <Link key={item.id} href={`/daily-updates/${item.id}`} className="mb-2 block rounded border border-rose-900/30 p-2 last:mb-0 hover:border-rose-600">
                  <div className="font-semibold text-rose-200">BLOCKED — {item.blocker || item.task_title}</div>
                  <div className="text-slate-400">
                    {item.user_name} · {item.customer_name} – {item.project_name}
                  </div>
                  {item.support_required && <div className="mt-0.5 text-slate-300">Support: {item.support_required}</div>}
                </Link>
              ))
            )}
          </div>

          <div className="rounded-lg border border-amber-900/40 bg-amber-950/20 p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-bold text-amber-200">
                <Clock className="h-4 w-4" /> Pending / no recent update
              </h3>
              <Link href="/daily-updates" className="text-cyan-400 hover:underline">View</Link>
            </div>
            {(pendingItems.length ? pendingItems : staleItems).slice(0, 5).length === 0 ? (
              <p className="text-slate-500">All assigned work has a recent update.</p>
            ) : (
              (pendingItems.length ? pendingItems : staleItems).slice(0, 5).map((item) => (
                <div key={item.id} className="mb-2 rounded border border-amber-900/30 p-2 last:mb-0">
                  <div className="font-semibold text-amber-100">{item.customer_name} – {item.project_name}</div>
                  <div className="text-slate-400">
                    {item.assigned_to} · {item.task_title}
                    {item.last_update_at ? ` · last ${formatLongDate(item.last_update_at)}` : ' · no update yet'}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <h3 className="mb-2 font-bold text-slate-200">Today&apos;s submitted updates</h3>
          {updatesToday.length === 0 ? (
            <p className="text-slate-500">No daily updates submitted on your projects today.</p>
          ) : (
            <div className="divide-y divide-slate-800/60 overflow-hidden rounded-lg border border-slate-800">
              {updatesToday.slice(0, 6).map((item) => (
                <UpdateRow key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-bold text-slate-200">Recent employee updates</h3>
            <Link href="/daily-updates" className="text-cyan-400 hover:underline">View all</Link>
          </div>
          {submitted.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <Inbox className="mx-auto mb-2 h-6 w-6 text-slate-600" />
              No submitted daily updates on your projects yet. Updates appear here when employees log work against assigned Gantt tasks.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/60 overflow-hidden rounded-lg border border-slate-800">
              {submitted.slice(0, 10).map((item) => (
                <UpdateRow key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Pending TL Review', value: pendingTL.length, color: 'text-amber-400' },
          { label: 'Feasibility In Progress', value: inProgress.length, color: 'text-emerald-400' },
          { label: 'Critical Direct', value: critical.length, color: 'text-rose-400' },
          { label: 'Pending Suggestions', value: pendingSugg.length, color: 'text-orange-400' },
        ].map((m) => (
          <div key={m.label} className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
            <div className="font-medium text-slate-400">{m.label}</div>
            <div className={`mt-2 text-2xl font-bold ${m.color}`}>{m.value}</div>
          </div>
        ))}
      </div>

      {pendingSugg.length > 0 && (
        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/90 p-5">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2 text-sm font-bold text-slate-100">
            <MessageSquare className="h-4 w-4 text-amber-400" /> Team Lead Suggestions — Pending ({pendingSugg.length})
          </div>
          {pendingSugg.map((s) => (
            <div key={s.id} className="flex items-center justify-between border-b border-slate-800/60 py-2 last:border-0">
              <div>
                <span className="font-bold text-slate-200">{s.created_by}</span>
                <span className="ml-2 text-amber-400">{s.suggestion_type}</span>
                <div className="mt-0.5 text-[11px] italic text-slate-400">&quot;{s.comment}&quot;</div>
              </div>
              <Link href={`/pre-sales/leads/${s.lead_id}`} className="rounded bg-cyan-600 px-3 py-1 text-[11px] font-medium text-white hover:bg-cyan-500">
                Resolve
              </Link>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/90 p-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <h2 className="text-sm font-bold text-slate-100">All Feasibility Team Assignments</h2>
          <Link href="/pre-sales/feasibility" className="text-xs text-cyan-400 hover:underline">
            View All
          </Link>
        </div>
        {assignments.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            <Inbox className="mx-auto mb-2 h-6 w-6 text-slate-600" />
            No assignments yet. Open a Lead and use + ADD TEAM.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {assignments.slice(0, 8).map((a) => (
              <div key={a.id} className="flex items-center justify-between py-2">
                <div>
                  <span className="mr-2 font-mono font-bold text-cyan-400">{a.lead_id}</span>
                  <span className="font-semibold text-slate-100">{a.team_name}</span>
                  {a.assignment_type === 'CRITICAL_DIRECT' && (
                    <span className="ml-2 rounded bg-rose-950 px-1.5 py-0.5 text-[10px] font-bold text-rose-300">CRITICAL</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-300">{a.status}</span>
                  <Link href={`/pre-sales/leads/${a.lead_id}`} className="text-slate-400 hover:text-slate-200">
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function UpdateRow({ item }: { item: DailyUpdate }) {
  return (
    <Link href={`/daily-updates/${item.id}`} className="flex items-start justify-between gap-3 px-3 py-2.5 hover:bg-slate-800/40">
      <div className="min-w-0">
        <div className="font-semibold text-slate-100">
          {item.user_name}
          <span className="ml-2 font-normal text-slate-400">
            {item.customer_name} – {item.project_name}
          </span>
        </div>
        <div className="truncate text-slate-400">
          {item.task_title}
          {item.work_completed ? ` · ${item.work_completed}` : ''}
        </div>
        <div className="mt-0.5 text-slate-500">{formatLongDate(item.submitted_at || item.work_date)}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${statusClass(item.work_status)}`}>
          {WORK_STATUS_LABELS[item.work_status] || item.work_status}
        </span>
        <span className="text-slate-200">{item.progress_percent}%</span>
        <span className="text-cyan-400">Review</span>
      </div>
    </Link>
  );
}
