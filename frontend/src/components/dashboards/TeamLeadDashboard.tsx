'use client';

import { Link } from '@/lib/navigation';
import React, { useEffect, useState } from 'react';
import { DailyUpdateSummary, FeasibilityTeamAssignment, Lead, Project, User } from '@/lib/types';
import { StorageService } from '@/lib/storage';
import { DailyUpdatesApi } from '@/lib/dailyUpdatesApi';
import { LeadApi } from '@/lib/leadApi';
import { ProjectsApi } from '@/lib/projectsApi';
import { canCreateWorkTask, userIsOnLeadTeam } from '@/lib/rbac';
import { Users, ArrowRight, Clock, Plus } from 'lucide-react';
import PendingActionsCard from '@/components/work/PendingActionsCard';
import LeadPipelinePanel from '@/components/dashboards/LeadPipelinePanel';
import LeadWorkflowTimeline from '@/components/dashboards/LeadWorkflowTimeline';
import TeamLeadExecutionPanel from '@/components/dashboards/TeamLeadExecutionPanel';
import CreateTaskForm from '@/components/work/CreateTaskForm';
import AdditionalTaskForm from '@/components/work/AdditionalTaskForm';
import AddSubtaskForm from '@/components/work/AddSubtaskForm';
import MySubtasksPanel from '@/components/work/MySubtasksPanel';
import MyDailyWorkPanel from '@/components/work/MyDailyWorkPanel';
import { DailyStatusApi } from '@/lib/dailyStatusApi';
import { DailyStatusPerson, DailyStatusRow, appTodayIso } from '@/lib/dailyStatus';

function assignedTeamIds(lead: Lead): string[] {
  return [...new Set([...(lead.assigned_team_ids || []), ...(lead.assigned_team_id ? [lead.assigned_team_id] : [])].filter(Boolean))];
}

function assignmentFromLead(lead: Lead, user: User): FeasibilityTeamAssignment {
  const teamIds = assignedTeamIds(lead);
  const teamId = (user.team_id && teamIds.includes(user.team_id) ? user.team_id : teamIds[0]) || user.team_id || '';
  const nameIndex = (lead.assigned_team_ids || []).indexOf(teamId);
  const teamName =
    (lead.assigned_team_names || [])[nameIndex] ||
    lead.assigned_team_name ||
    user.team_name ||
    'Assigned team';
  const status: FeasibilityTeamAssignment['status'] =
    lead.status === 'FEASIBILITY_SUBMITTED'
      ? 'SUBMITTED_TO_PM'
      : lead.status === 'FEASIBILITY_RETURNED'
        ? 'CHANGE_SUGGESTED'
        : 'PENDING_TEAM_LEAD_REVIEW';
  return {
    id: `fta-${lead.id}-${teamId || user.id}`,
    lead_id: lead.id,
    team_id: teamId,
    team_name: teamName,
    team_lead_id: user.id,
    team_lead_name: user.name,
    assignment_type: 'NORMAL',
    priority: lead.priority,
    due_date: lead.expected_decision_date || '',
    pm_instructions: lead.pm_review_notes || 'Prepare technical feasibility for this opportunity.',
    status,
    created_by: lead.pm_name || 'Project Manager',
    created_by_id: lead.pm_id || '',
    created_at: lead.updated_at,
    updated_at: lead.updated_at,
  };
}

export default function TeamLeadDashboard({ user }: { user: User }) {
  const [assignments, setAssignments] = useState<FeasibilityTeamAssignment[]>([]);
  const [leadsMap, setLeadsMap] = useState<Record<string, Lead>>({});
  const [summary, setSummary] = useState<DailyUpdateSummary | null>(null);
  const [pendingProjects, setPendingProjects] = useState<Project[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [additionalOpen, setAdditionalOpen] = useState(false);
  const [subtaskOpen, setSubtaskOpen] = useState(false);
  const [people, setPeople] = useState<DailyStatusPerson[]>([]);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [sheetRows, setSheetRows] = useState<DailyStatusRow[]>([]);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    void (async () => {
      const leads = await LeadApi.list();
      const map: Record<string, Lead> = {};
      leads.forEach((lead) => {
        map[lead.id] = lead;
      });
      setLeadsMap(map);
      const stored = StorageService.getFeasibilityTeamAssignmentsForTeamLead(user.id, user.team_id);
      const mine = [...stored];
      for (const lead of leads) {
        if (!userIsOnLeadTeam(user, lead)) continue;
        if (mine.some((item) => item.lead_id === lead.id && (!user.team_id || item.team_id === user.team_id))) continue;
        mine.push(assignmentFromLead(lead, user));
      }
      setAssignments(mine);
      setSummary(await DailyUpdatesApi.summary());
      const listed = await ProjectsApi.list('ACTIVE');
      setPendingProjects(
        listed.projects.filter(
          (project) =>
            project.team_lead_id === user.id &&
            (project.intake_status === 'PENDING_TL_REVIEW' ||
              project.intake_status === 'ACCEPTED' ||
              project.intake_status === 'IN_EXECUTION' ||
              !project.intake_status)
        )
      );
      const sheet = await DailyStatusApi.sheet(appTodayIso(), 'morning');
      if (sheet.ok) {
        setPeople(sheet.people);
        setProjects(sheet.projects);
        setSheetRows(sheet.rows);
      }
    })();
  }, [user.id, user.team_id]);

  const pendingReview = assignments.filter(a => a.status === 'PENDING_TEAM_LEAD_REVIEW');
  const inProgress = assignments.filter(a => a.status === 'IN_PROGRESS' || a.status === 'ALLOCATED_TO_TEAM_MEMBER');
  const suggestions = assignments.filter(a => a.status === 'CHANGE_SUGGESTED');
  const clarifications = assignments.filter(a => a.status === 'CLARIFICATION_REQUIRED');

  const awaitingReview = pendingProjects.filter((project) => project.intake_status === 'PENDING_TL_REVIEW' || !project.intake_status);
  const breakdown = pendingProjects.filter((project) => project.intake_status === 'ACCEPTED' || project.current_phase === 'TASK_BREAKDOWN');
  const monitoring = pendingProjects.filter((project) => project.intake_status === 'IN_EXECUTION');
  const issues = monitoring.filter((project) => project.monitor_status === 'ISSUE_IDENTIFIED' || Boolean(project.issue));

  return (
    <div className="space-y-6 text-xs">
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/30 to-slate-900 p-6 rounded-xl border border-slate-800">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-indigo-400 font-semibold uppercase tracking-wider text-xs"><Users className="w-4 h-4" /> Team Lead Dashboard</div>
            <h1 className="text-2xl font-bold text-slate-100 mt-1">{user.name}</h1>
            <p className="text-slate-400 text-xs mt-0.5">Project review, task assignment, daily updates, and issue management for your team.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-bold text-white hover:bg-cyan-500"
            >
              <Plus className="h-3.5 w-3.5" /> Create Task
            </button>
            <button
              type="button"
              onClick={() => setSubtaskOpen(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-4 py-2 text-xs font-bold text-slate-100 hover:border-cyan-600"
            >
              <Plus className="h-3.5 w-3.5" /> Add Subtask
            </button>
            <button
              type="button"
              onClick={() => setAdditionalOpen(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-4 py-2 text-xs font-bold text-slate-100 hover:border-cyan-600"
            >
              <Plus className="h-3.5 w-3.5" /> Additional Task
            </button>
            <Link href="/daily-updates" className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-bold text-slate-100 hover:border-cyan-600">
              Daily Work Updates
            </Link>
          </div>
        </div>
      </div>

      <TeamLeadExecutionPanel user={user} />

      <MyDailyWorkPanel user={user} />

      <MySubtasksPanel
        rows={sheetRows}
        people={people}
        currentUserId={user.id}
        canAssignOthers={canCreateWorkTask(user)}
        onChanged={async () => {
          const sheet = await DailyStatusApi.sheet(appTodayIso(), 'morning');
          if (sheet.ok) {
            setPeople(sheet.people);
            setProjects(sheet.projects);
            setSheetRows(sheet.rows);
          }
        }}
      />

      <PendingActionsCard />
      <LeadPipelinePanel />
      <LeadWorkflowTimeline />

      {awaitingReview.length > 0 && (
        <div className="bg-cyan-950/20 p-4 rounded-xl border border-cyan-800/60 space-y-3">
          <div className="font-bold text-cyan-300 text-xs">Step 2 — Projects waiting for Accept / Return ({awaitingReview.length})</div>
          {awaitingReview.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`} className="flex items-center justify-between py-2 border-t border-cyan-900/30 hover:text-cyan-200">
              <div>
                <span className="font-mono font-bold text-cyan-400 mr-2">{project.code}</span>
                <span className="font-bold text-slate-100">{project.customer_name} – {project.name}</span>
                <div className="text-slate-400 text-[11px] mt-0.5">PM: {project.pm_name} · Pending Review</div>
              </div>
              <ArrowRight className="h-4 w-4 text-cyan-400" />
            </Link>
          ))}
        </div>
      )}

      {breakdown.length > 0 && (
        <div className="bg-indigo-950/20 p-4 rounded-xl border border-indigo-800/60 space-y-3">
          <div className="font-bold text-indigo-300 text-xs">Step 3 — Task breakdown & assignment ({breakdown.length})</div>
          {breakdown.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`} className="flex items-center justify-between py-2 border-t border-indigo-900/30 hover:text-indigo-200">
              <div>
                <span className="font-mono font-bold text-cyan-400 mr-2">{project.code}</span>
                <span className="font-bold text-slate-100">{project.customer_name} – {project.name}</span>
                <div className="text-slate-400 text-[11px] mt-0.5">Accepted — break into tasks</div>
              </div>
              <ArrowRight className="h-4 w-4 text-indigo-300" />
            </Link>
          ))}
        </div>
      )}

      {monitoring.length > 0 && (
        <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 space-y-3">
          <div className="font-bold text-slate-100 text-xs">Steps 4–6 — Execution & monitor ({monitoring.length})</div>
          {monitoring.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`} className="flex items-center justify-between py-2 border-t border-slate-800 hover:text-cyan-200">
              <div>
                <span className="font-mono font-bold text-cyan-400 mr-2">{project.code}</span>
                <span className="font-bold text-slate-100">{project.customer_name} – {project.name}</span>
                <div className="text-slate-400 text-[11px] mt-0.5">
                  {project.monitor_status === 'ISSUE_IDENTIFIED' || project.issue ? 'Issue / Blocker Identified' : 'On Track'} · {project.progress}%
                </div>
              </div>
              <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${project.monitor_status === 'ISSUE_IDENTIFIED' || project.issue ? 'border-rose-800 text-rose-300' : 'border-emerald-800 text-emerald-300'}`}>
                {project.monitor_status === 'ISSUE_IDENTIFIED' || project.issue ? 'Issue' : 'On Track'}
              </span>
            </Link>
          ))}
        </div>
      )}

      {issues.length > 0 && (
        <div className="bg-rose-950/20 p-4 rounded-xl border border-rose-800/60 space-y-3">
          <div className="font-bold text-rose-300 text-xs">Issue / blocker identified ({issues.length})</div>
          {issues.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`} className="flex items-center justify-between py-2 border-t border-rose-900/30 hover:text-rose-200">
              <div>
                <span className="font-mono font-bold text-cyan-400 mr-2">{project.code}</span>
                <span className="font-bold text-slate-100">{project.customer_name} – {project.name}</span>
                <div className="text-slate-400 text-[11px] mt-0.5">{project.issue || 'Issue identified — escalate if unresolved'}</div>
              </div>
              <ArrowRight className="h-4 w-4 text-rose-300" />
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Pending Review', value: pendingReview.length + awaitingReview.length, color: 'text-amber-400' },
          { label: 'In Progress', value: inProgress.length, color: 'text-emerald-400' },
          { label: 'Suggestions Sent', value: suggestions.length, color: 'text-orange-400' },
          { label: 'Awaiting Clarification', value: clarifications.length, color: 'text-cyan-400' },
        ].map(m => (
          <div key={m.label} className="p-4 bg-slate-900/90 rounded-xl border border-slate-800">
            <div className="text-slate-400">{m.label}</div>
            <div className={`text-2xl font-bold mt-2 ${m.color}`}>{m.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Team updates today', value: summary?.submittedToday ?? 0 },
          { label: 'Pending today', value: summary?.pendingToday ?? 0 },
          { label: 'Blocked', value: summary?.blocked ?? 0 },
          { label: 'No recent update', value: summary?.staleAssignments ?? 0 },
        ].map((card) => (
          <Link key={card.label} href="/daily-updates" className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 hover:border-cyan-800">
            <div className="text-slate-400">{card.label}</div>
            <div className="mt-2 text-2xl font-bold text-slate-100">{card.value}</div>
          </Link>
        ))}
      </div>

      {pendingReview.length > 0 && (
        <div className="bg-amber-950/20 p-4 rounded-xl border border-amber-800/60 space-y-3">
          <div className="font-bold text-amber-300 flex items-center gap-2 text-xs">
            <Clock className="w-4 h-4" /> URGENT — Feasibility Assignments Pending Your Review ({pendingReview.length})
          </div>
          {pendingReview.map(a => (
            <div key={a.id} className="flex items-center justify-between py-2 border-t border-amber-900/30">
              <div>
                <span className="font-mono font-bold text-cyan-400 mr-2">{leadsMap[a.lead_id]?.lead_number || a.lead_id}</span>
                <span className="font-bold text-slate-100">{leadsMap[a.lead_id]?.title || a.team_name}</span>
                <div className="text-slate-400 text-[11px] mt-0.5">{a.team_name} · PM: &quot;{a.pm_instructions}&quot; — Due: <span className="font-mono">{a.due_date}</span></div>
              </div>
              <Link href={`/pre-sales/leads/${a.lead_id}`} className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded text-[11px] flex items-center gap-1 shrink-0">
                Open Lead <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          ))}
        </div>
      )}

      <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 space-y-2">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <h2 className="font-bold text-slate-100 text-sm">All My Team Assignments</h2>
          <Link href="/pre-sales/feasibility" className="text-cyan-400 hover:underline text-xs flex items-center gap-1">View All <ArrowRight className="w-3 h-3" /></Link>
        </div>
        {assignments.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No feasibility work assigned to your team yet.</div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {assignments.map(a => {
              const allocs = StorageService.getFeasibilityAllocationsByAssignmentId(a.id);
              return (
                <div key={a.id} className="py-2 flex items-center justify-between">
                  <div>
                    <span className="font-mono font-bold text-cyan-400 mr-2">{leadsMap[a.lead_id]?.lead_number || a.lead_id}</span>
                    <span className="font-semibold text-slate-100">{leadsMap[a.lead_id]?.title || a.team_name}</span>
                    <span className="text-slate-400 ml-2">({allocs.length} employee{allocs.length !== 1 ? 's' : ''} allocated)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">{a.status}</span>
                    <Link href={`/pre-sales/leads/${a.lead_id}`} className="text-slate-400 hover:text-slate-200"><ArrowRight className="w-3.5 h-3.5" /></Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {notice && (
        <div className="rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-emerald-200">{notice}</div>
      )}

      <CreateTaskForm
        open={createOpen}
        people={people}
        projects={projects}
        currentUserId={user.id}
        canAssignOthers={canCreateWorkTask(user)}
        onClose={() => setCreateOpen(false)}
        onCreated={(message) => {
          setNotice(message);
          void DailyStatusApi.sheet(appTodayIso(), 'morning').then((sheet) => {
            if (sheet.ok) {
              setPeople(sheet.people);
              setProjects(sheet.projects);
              setSheetRows(sheet.rows);
            }
          });
        }}
      />
      <AdditionalTaskForm
        open={additionalOpen}
        people={people}
        projects={projects}
        currentUserId={user.id}
        requirePerson={false}
        onClose={() => setAdditionalOpen(false)}
        onCreated={(message) => {
          setNotice(message);
          void DailyStatusApi.sheet(appTodayIso(), 'morning').then((sheet) => {
            if (sheet.ok) {
              setPeople(sheet.people);
              setProjects(sheet.projects);
              setSheetRows(sheet.rows);
            }
          });
        }}
      />
      {subtaskOpen && (
        <AddSubtaskForm
          parents={sheetRows}
          people={people}
          currentUserId={user.id}
          canAssignOthers={canCreateWorkTask(user)}
          onCancel={() => setSubtaskOpen(false)}
          onCreated={(message) => {
            setNotice(message);
            setSubtaskOpen(false);
            void DailyStatusApi.sheet(appTodayIso(), 'morning').then((sheet) => {
              if (sheet.ok) {
                setPeople(sheet.people);
                setProjects(sheet.projects);
                setSheetRows(sheet.rows);
              }
            });
          }}
        />
      )}
    </div>
  );
}
