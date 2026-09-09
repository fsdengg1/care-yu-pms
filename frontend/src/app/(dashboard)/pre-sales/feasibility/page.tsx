'use client';

import { Link } from '@/lib/navigation';
import React, { useState, useEffect } from 'react';

import { StorageService } from '@/lib/storage';
import { FeasibilityTeamAssignment, Lead, Project, User } from '@/lib/types';
import { apiRequest } from '@/lib/api';
import { LeadApi } from '@/lib/leadApi';
import { PIPELINE_STAGE_LABELS } from '@/lib/format';
import { Scan, ArrowRight, ShieldAlert, Inbox, Clock } from 'lucide-react';

export default function FeasibilityStudiesPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [assignments, setAssignments] = useState<FeasibilityTeamAssignment[]>([]);
  const [leadsMap, setLeadsMap] = useState<Record<string, Lead>>({});
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    const u = StorageService.getCurrentUser();
    setCurrentUser(u);
    void (async () => {
      const apiLeads = await LeadApi.list();
      const storedAssignments = StorageService.getFeasibilityTeamAssignments();
      const fromLeads: FeasibilityTeamAssignment[] = [];
      for (const lead of apiLeads) {
        if (!['ACCEPTED_FOR_FEASIBILITY', 'FEASIBILITY_IN_PROGRESS', 'FEASIBILITY_SUBMITTED', 'FEASIBILITY_RETURNED'].includes(lead.status)) continue;
        const teamIds = [...new Set([...(lead.assigned_team_ids || []), ...(lead.assigned_team_id ? [lead.assigned_team_id] : [])].filter(Boolean))];
        teamIds.forEach((teamId, index) => {
          if (storedAssignments.some((item) => item.lead_id === lead.id && item.team_id === teamId)) return;
          fromLeads.push({
            id: `fta-${lead.id}-${teamId}`,
            lead_id: lead.id,
            team_id: teamId,
            team_name: (lead.assigned_team_names || [])[index] || lead.assigned_team_name || 'Assigned team',
            team_lead_id: teamId === lead.assigned_team_id ? lead.assigned_team_lead_id : undefined,
            team_lead_name: teamId === lead.assigned_team_id ? lead.assigned_team_lead_name : undefined,
            assignment_type: 'NORMAL',
            priority: lead.priority,
            due_date: lead.expected_decision_date || '',
            pm_instructions: lead.pm_review_notes || 'Feasibility assignment',
            status: lead.status === 'FEASIBILITY_SUBMITTED' ? 'SUBMITTED_TO_PM' : lead.status === 'FEASIBILITY_RETURNED' ? 'CHANGE_SUGGESTED' : 'PENDING_TEAM_LEAD_REVIEW',
            created_by: lead.pm_name || 'Project Manager',
            created_by_id: lead.pm_id || '',
            created_at: lead.updated_at,
            updated_at: lead.updated_at,
          });
        });
      }
      setAssignments([...storedAssignments, ...fromLeads]);
      const map: Record<string, Lead> = {};
      apiLeads.forEach((l) => { map[l.id] = l; });
      setLeadsMap(map);
      if (u?.role_code === 'CEO') {
        const projectsResult = await apiRequest<{ projects: Project[] }>('/api/projects');
        if (projectsResult.ok) setProjects(projectsResult.data.projects);
      }
    })();
  }, []);

  if (!currentUser) return null;

  const isPM = currentUser.role_code === 'PROJECT_MANAGER' || currentUser.role_code === 'SYSTEM_ADMIN';
  const isViewer = ['CEO', 'CTO', 'BUSINESS_HEAD', 'ENG_DIRECTOR', 'SALES', 'PROCUREMENT'].includes(currentUser.role_code) || isPM;
  const isTL = currentUser.role_code === 'TEAM_LEAD';

  const visible = assignments.filter(a => {
    if (isViewer) return true;
    if (isTL) return a.team_lead_id === currentUser.id || a.team_id === currentUser.team_id;
    if (a.team_id && a.team_id === currentUser.team_id) return true;
    return StorageService.getFeasibilityAllocationsByAssignmentId(a.id).some(
      (allocation) => allocation.employee_id === currentUser.id
    );
  });
  const tlPending = visible.filter((a) => a.status === 'PENDING_TEAM_LEAD_REVIEW');
  const isCEO = currentUser.role_code === 'CEO';

  const ceoStudies = Object.values(leadsMap)
    .filter(
      (lead) =>
        lead.pipeline_stage === 'FEASIBILITY' ||
        lead.status === 'ACCEPTED_FOR_FEASIBILITY' ||
        lead.status === 'FEASIBILITY_IN_PROGRESS'
    )
    .map((lead) => {
      const project = projects.find((item) => item.lead_id === lead.id);
      const teams = lead.assigned_team_name
        ? [lead.assigned_team_name]
        : (project?.team_ids ?? []).map((id) => StorageService.getTeams().find((team) => team.id === id)?.name).filter(Boolean) as string[];
      return {
        lead,
        teams: teams.length ? teams.join(', ') : 'Unassigned',
        owner: project?.pm_name || lead.sales_owner || '—',
      };
    });

  const showCeoStudies = isCEO && visible.length === 0;
  const tableCount = showCeoStudies ? ceoStudies.length : visible.length;

  const statusColor = (s: string) => {
    if (s === 'PENDING_TEAM_LEAD_REVIEW') return 'text-amber-300 bg-amber-950 border-amber-800';
    if (s === 'ALLOCATED_TO_TEAM_MEMBER' || s === 'READY_TO_START') return 'text-emerald-300 bg-emerald-950 border-emerald-800';
    if (s === 'IN_PROGRESS') return 'text-cyan-300 bg-cyan-950 border-cyan-800';
    if (s === 'COMPLETED') return 'text-slate-300 bg-slate-800 border-slate-700';
    if (s === 'CRITICAL_DIRECT_ASSIGNED') return 'text-rose-300 bg-rose-950 border-rose-800';
    if (s === 'CHANGE_SUGGESTED' || s === 'CLARIFICATION_REQUIRED') return 'text-orange-300 bg-orange-950 border-orange-800';
    return 'text-slate-300 bg-slate-800 border-slate-700';
  };

  return (
    <div className="space-y-6 text-xs">
      <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-cyan-400 font-semibold uppercase tracking-wider text-xs">
            <Scan className="w-4 h-4" /> Phase 3A Pre-Sales
          </div>
          <h1 className="text-xl font-bold text-slate-100 mt-1">Feasibility Studies</h1>
          <p className="text-slate-400 text-xs mt-0.5">
            All feasibility team assignments across Leads. Assignments are always started from the Lead.
          </p>
        </div>
      </div>

      {/* TL Pending Queue */}
      {isTL && tlPending.length > 0 && (
        <div className="bg-cyan-950/40 border border-cyan-800/80 rounded-xl p-4 space-y-3">
          <div className="font-bold text-cyan-300 flex items-center gap-2 text-xs">
            <Clock className="w-4 h-4 text-cyan-400" />
            ASSIGNMENTS AWAITING YOUR REVIEW — {tlPending.length} pending
          </div>
          {tlPending.map(a => (
            <div key={a.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 py-2 border-t border-cyan-900/40">
              <div>
                <span className="font-mono text-cyan-400 font-bold mr-2">{leadsMap[a.lead_id]?.lead_number || a.lead_id}</span>
                <span className="font-bold text-slate-100">{leadsMap[a.lead_id]?.title || '—'}</span>
                <div className="text-slate-400 mt-0.5">PM Instructions: &quot;{a.pm_instructions}&quot;</div>
              </div>
              <Link href={`/pre-sales/leads/${a.lead_id}?tab=feasibility`} className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded text-[11px] flex items-center gap-1 shrink-0">
                Open Lead <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Main Table */}
      <div className="bg-slate-900/90 rounded-xl border border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="font-bold text-slate-200 text-xs">
            {isCEO ? `Feasibility Studies (${tableCount})` : `All Team Assignments (${tableCount})`}
          </h2>
          <p className="text-[11px] text-slate-400">
            {currentUser.role_code === 'CEO'
              ? 'Read-only visibility of feasibility work. Assignments are created by Project Manager.'
              : 'Assignments are created from Lead → Feasibility Teams tab.'}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
              <tr>
                <th className="p-3">{isCEO ? 'Opportunity' : 'Lead'}</th>
                <th className="p-3">{isCEO ? 'Functional Team' : 'Team'}</th>
                {isCEO ? <th className="p-3">Owner</th> : <th className="p-3">Type</th>}
                {isCEO ? <th className="p-3">Stage</th> : <th className="p-3">Team Lead</th>}
                {isCEO ? null : <th className="p-3">Priority / Due</th>}
                {isCEO ? null : <th className="p-3">Employees</th>}
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {showCeoStudies ? (
                ceoStudies.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-slate-500">
                      <Inbox className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                      No feasibility studies in the pipeline yet.
                    </td>
                  </tr>
                ) : (
                  ceoStudies.map(({ lead, teams, owner }) => (
                    <tr key={lead.id} className="hover:bg-slate-800/30">
                      <td className="p-3">
                        <div className="font-mono font-bold text-cyan-400">{lead.lead_number}</div>
                        <div className="text-[11px] text-slate-200">{lead.title}</div>
                        <div className="text-[11px] text-slate-500">{lead.customer_name}</div>
                      </td>
                      <td className="p-3 font-semibold text-slate-100">{teams}</td>
                      <td className="p-3 text-slate-200">{owner}</td>
                      <td className="p-3 text-slate-300">
                        {PIPELINE_STAGE_LABELS[lead.pipeline_stage || ''] || lead.pipeline_stage || '—'}
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold border text-cyan-300 bg-cyan-950 border-cyan-800">
                          {lead.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <Link href={`/pre-sales/leads/${lead.id}`} className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-[11px] font-medium inline-flex items-center gap-1">
                          View <ArrowRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  ))
                )
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-slate-500">
                    <Inbox className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                    {isCEO
                      ? 'No feasibility studies in the pipeline yet.'
                      : 'No feasibility assignments yet. Open a Lead and use + ADD TEAM.'}
                  </td>
                </tr>
              ) : (
                visible.map(a => {
                  const allocs = StorageService.getFeasibilityAllocationsByAssignmentId(a.id);
                  const isCritical = a.assignment_type === 'CRITICAL_DIRECT';
                  return (
                    <tr key={a.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-3">
                        <div className="font-mono font-bold text-cyan-400">{leadsMap[a.lead_id]?.lead_number || a.lead_id}</div>
                        <div className="text-[11px] text-slate-400 truncate max-w-[120px]">{leadsMap[a.lead_id]?.title || '—'}</div>
                      </td>
                      <td className="p-3 font-bold text-slate-100">{a.team_name}</td>
                      <td className="p-3">
                        {isCritical ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-800 flex items-center gap-1 w-fit">
                            <ShieldAlert className="w-3 h-3" /> CRITICAL
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-950 text-cyan-300 border border-cyan-800 w-fit">NORMAL</span>
                        )}
                      </td>
                      <td className="p-3 text-slate-200">{a.team_lead_name || '—'}</td>
                      <td className="p-3">
                        <div className="font-semibold text-slate-200">{a.priority}</div>
                        <div className="text-[11px] font-mono text-slate-400">{a.due_date}</div>
                      </td>
                      <td className="p-3 text-center font-bold text-slate-100">{allocs.length}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${statusColor(a.status)}`}>{a.status}</span>
                      </td>
                      <td className="p-3 text-right">
                        <Link href={`/pre-sales/leads/${a.lead_id}`} className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-[11px] font-medium inline-flex items-center gap-1">
                          Open Lead <ArrowRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
