'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StorageService } from '@/lib/storage';
import { Lead, LeadStatus, User } from '@/lib/types';
import { canCreateLead, isCeoViewOnly, userIsOnLeadTeam } from '@/lib/rbac';
import { LeadApi } from '@/lib/leadApi';
import { formatInrCompact, PIPELINE_STAGE_LABELS } from '@/lib/format';
import { leadPipelineDisplay } from '@/lib/leadPipelineDisplay';
import { leadDetailHref } from '@/lib/leadRoutes';
import { workflowActionLabel } from '@/lib/workflowActionLabel';
import { 
  Building2, 
  Plus, 
  Search, 
  Filter, 
  Eye, 
  Inbox, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowRight,
  FileText
} from 'lucide-react';

const STATUS_BADGES: Record<LeadStatus, { label: string; style: string }> = {
  DRAFT: { label: 'Draft', style: 'bg-slate-800 text-slate-300 border-slate-700' },
  SUBMITTED_TO_PM: { label: 'Submitted to PM for Review', style: 'bg-cyan-950 text-cyan-300 border-cyan-700' },
  UNDER_PM_REVIEW: { label: 'Submitted to PM for Review', style: 'bg-cyan-950 text-cyan-300 border-cyan-700' },
  RETURNED_TO_SALES: { label: 'Returned for Clarification', style: 'bg-amber-950 text-amber-300 border-amber-800' },
  ADDITIONAL_INFORMATION_REQUIRED: { label: 'Returned for Clarification', style: 'bg-amber-950 text-amber-300 border-amber-800' },
  RESUBMITTED_TO_PM: { label: 'Submitted to PM for Review', style: 'bg-cyan-950 text-cyan-300 border-cyan-700' },
  ACCEPTED_FOR_FEASIBILITY: { label: 'Submitted to Feasibility Team', style: 'bg-emerald-950 text-emerald-300 border-emerald-700' },
  FEASIBILITY_IN_PROGRESS: { label: 'Submitted to Feasibility Team', style: 'bg-indigo-950 text-indigo-300 border-indigo-800' },
  FEASIBILITY_SUBMITTED: { label: 'Submitted to PM for Review', style: 'bg-cyan-950 text-cyan-300 border-cyan-700' },
  FEASIBILITY_RETURNED: { label: 'Returned for Clarification', style: 'bg-amber-950 text-amber-300 border-amber-800' },
  FEASIBILITY_REJECTED: { label: 'Rejected', style: 'bg-rose-950 text-rose-300 border-rose-700' },
  COSTING_IN_PROGRESS: { label: 'Submitted to Procurement Review', style: 'bg-violet-950 text-violet-300 border-violet-800' },
  COSTING_SUBMITTED: { label: 'Submitted to PM for Review', style: 'bg-cyan-950 text-cyan-300 border-cyan-700' },
  COSTING_RETURNED: { label: 'Returned for Clarification', style: 'bg-amber-950 text-amber-300 border-amber-800' },
  COSTING_REJECTED: { label: 'Rejected', style: 'bg-rose-950 text-rose-300 border-rose-700' },
  QUOTATION: { label: 'Submitted to Business Head for Review', style: 'bg-cyan-950 text-cyan-300 border-cyan-800' },
  NEGOTIATION: { label: 'Submitted to Customer', style: 'bg-orange-950 text-orange-300 border-orange-800' },
  ORDER_CONVERTED: { label: 'Approved', style: 'bg-emerald-950 text-emerald-300 border-emerald-800' },
  WON: { label: 'Approved', style: 'bg-emerald-950 text-emerald-300 border-emerald-800' },
  LOST: { label: 'Lost', style: 'bg-rose-950 text-rose-300 border-rose-800' },
  ON_HOLD: { label: 'On Hold', style: 'bg-slate-800 text-slate-400 border-slate-700' },
  CANCELLED: { label: 'Rejected', style: 'bg-rose-950 text-rose-300 border-rose-700' }
};

export default function LeadsListPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [verticalFilter, setVerticalFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [stageFilter, setStageFilter] = useState<string>('ALL');

  useEffect(() => {
    const user = StorageService.getCurrentUser();
    setCurrentUser(user);
    void (async () => {
      const apiLeads = await LeadApi.list();
      setLeads(apiLeads);
    })();
  }, []);

  if (!currentUser) return null;

  // Role visibility filtration
  const isCEO = isCeoViewOnly(currentUser);
  const isAdmin = currentUser.role_code === 'SYSTEM_ADMIN';
  const isPM = currentUser.role_code === 'PROJECT_MANAGER';
  const isBH = currentUser.role_code === 'BUSINESS_HEAD';
  const isED = currentUser.role_code === 'ENG_DIRECTOR';
  const isCTO = currentUser.role_code === 'CTO';
  const isTL = currentUser.role_code === 'TEAM_LEAD';
  const isProcurement = currentUser.role_code === 'PROCUREMENT';
  const isEmployee = currentUser.role_code === 'EMPLOYEE' || currentUser.role_code === 'PROJECT_ENGINEER' || currentUser.role_code === 'EXECUTION';

  const visibleLeads = leads.filter(lead => {
    if (isCEO || isAdmin || isPM || isCTO) {
      // Leadership / PM see the full pipeline
    } else if (isBH) {
      // Business Head owns commercial for every vertical.
    } else if (isED) {
      if (lead.business_vertical !== 'Engineering Director' && lead.created_by_id !== currentUser.id) return false;
    } else if (isTL) {
      if (!userIsOnLeadTeam(currentUser, lead) && lead.created_by_id !== currentUser.id && lead.sales_owner_id !== currentUser.id) {
        return false;
      }
    } else if (isProcurement) {
      if (!['COSTING_IN_PROGRESS', 'COSTING_SUBMITTED', 'COSTING_RETURNED', 'QUOTATION', 'NEGOTIATION'].includes(lead.status) && lead.pipeline_stage !== 'COSTING') {
        return false;
      }
    } else if (isEmployee) {
      if (!userIsOnLeadTeam(currentUser, lead) && lead.created_by_id !== currentUser.id && lead.sales_owner_id !== currentUser.id) {
        return false;
      }
    } else if (lead.created_by_id !== currentUser.id && lead.sales_owner_id !== currentUser.id) {
      return false;
    }

    // Search query
    const query = search.toLowerCase();
    const matchesSearch = 
      lead.lead_number.toLowerCase().includes(query) ||
      lead.title.toLowerCase().includes(query) ||
      lead.customer_name.toLowerCase().includes(query) ||
      lead.sales_owner.toLowerCase().includes(query);

    // Filters
    const submittedStatuses = ['SUBMITTED_TO_PM', 'UNDER_PM_REVIEW', 'RESUBMITTED_TO_PM', 'FEASIBILITY_SUBMITTED', 'COSTING_SUBMITTED'];
    const rejectedStatuses = ['CANCELLED', 'FEASIBILITY_REJECTED', 'COSTING_REJECTED'];
    const matchesStatus =
      statusFilter === 'ALL' ||
      lead.status === statusFilter ||
      (statusFilter === 'SUBMITTED_TO_PM' && submittedStatuses.includes(lead.status)) ||
      (statusFilter === 'CANCELLED' && rejectedStatuses.includes(lead.status));
    const matchesVertical = verticalFilter === 'ALL' || lead.business_vertical === verticalFilter;
    const matchesPriority = priorityFilter === 'ALL' || lead.priority === priorityFilter;
    const matchesStage = stageFilter === 'ALL' || lead.pipeline_stage === stageFilter;

    return matchesSearch && matchesStatus && matchesVertical && matchesPriority && matchesStage;
  });

  const ceoPipelineValue = visibleLeads
    .filter((lead) => lead.pipeline_stage !== 'CONVERTED' && lead.pipeline_stage !== 'REJECTED' && lead.status !== 'LOST')
    .reduce((sum, lead) => sum + (lead.expected_value ?? 0), 0);

  // PM Review Queue (Submitted or Under PM review)
  const pmReviewQueue = leads.filter(l =>
    (l.status === 'SUBMITTED_TO_PM' ||
    l.status === 'UNDER_PM_REVIEW' ||
    l.status === 'RESUBMITTED_TO_PM') &&
    (l.current_owner_id === currentUser.id || l.responsible_user_id === currentUser.id || l.pm_id === currentUser.id)
  );

  // Sales Action Required Queue (Returned to Sales)
  const salesReturnedQueue = leads.filter(l => 
    (l.status === 'RETURNED_TO_SALES' || l.status === 'ADDITIONAL_INFORMATION_REQUIRED') &&
    (l.created_by_id === currentUser.id || l.sales_owner_id === currentUser.id)
  );

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-cyan-400 font-semibold text-xs uppercase tracking-wider">
            <Building2 className="w-4 h-4" /> Pre-Sales Module
          </div>
          <h1 className="text-xl font-bold text-slate-100 mt-1">{isCEO ? 'Leads & Pipeline' : 'Leads & Pipeline Management'}</h1>
          <p className="text-xs text-slate-400 mt-1">
            {isCEO
              ? 'Management view of the pre-sales pipeline. Operational actions are handled by Business Head, Engineering Director, and Project Manager.'
              : 'Care Yu Automation Pre-Sales lead tracking, PM review workflow, and feasibility approvals.'}
          </p>
        </div>

        {canCreateLead(currentUser) && (
          <Link
            href="/pre-sales/leads/create"
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs rounded-lg shadow-md flex items-center gap-2 transition-all"
          >
            <Plus className="w-4 h-4" /> Create New Lead
          </Link>
        )}
      </div>

      {isCEO && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Active Opportunities</div>
            <div className="mt-1 text-2xl font-bold text-slate-100">{visibleLeads.filter((l) => l.pipeline_stage !== 'CONVERTED' && l.status !== 'LOST').length}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Pipeline Value</div>
            <div className="mt-1 text-2xl font-bold text-slate-100">{formatInrCompact(ceoPipelineValue)}</div>
          </div>
        </div>
      )}

      {/* Action Required Banner for PM */}
      {isPM && pmReviewQueue.length > 0 && (
        <div className="bg-blue-950/40 border border-blue-800/80 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-blue-300 font-bold text-xs">
              <Clock className="w-4 h-4 text-blue-400" />
              LEADS AWAITING PM REVIEW ({pmReviewQueue.length})
            </div>
            <span className="text-[10px] bg-blue-900/60 text-blue-300 px-2 py-0.5 rounded border border-blue-700">
              Project Manager Review Queue
            </span>
          </div>

          <div className="divide-y divide-blue-900/40">
            {pmReviewQueue.map(lead => (
              <div key={lead.id} className="py-2.5 flex items-center justify-between text-xs">
                <div>
                  <span className="font-mono text-cyan-400 font-bold mr-2">{lead.lead_number}</span>
                  <span className="font-semibold text-slate-100">{lead.title}</span>
                  <span className="text-slate-400 ml-2">({lead.customer_name})</span>
                  <span className="ml-3 text-[10px] px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800">
                    {lead.business_vertical}
                  </span>
                </div>
                <Link
                  href={leadDetailHref(lead.id)}
                  className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded text-[11px] flex items-center gap-1"
                >
                  Review Lead <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Required Banner for Sales */}
      {salesReturnedQueue.length > 0 && (
        <div className="bg-amber-950/40 border border-amber-800/80 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-300 font-bold text-xs">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              ACTION REQUIRED — RETURNED LEADS ({salesReturnedQueue.length})
            </div>
            <span className="text-[10px] bg-amber-900/60 text-amber-300 px-2 py-0.5 rounded border border-amber-700">
              Additional Information Required by PM
            </span>
          </div>

          <div className="divide-y divide-amber-900/40">
            {salesReturnedQueue.map(lead => (
              <div key={lead.id} className="py-2.5 flex items-center justify-between text-xs">
                <div>
                  <span className="font-mono text-amber-400 font-bold mr-2">{lead.lead_number}</span>
                  <span className="font-semibold text-slate-100">{lead.title}</span>
                  <div className="text-slate-400 text-[11px] mt-0.5 italic">
                    PM Reason: &quot;{lead.pm_return_reason || 'Please provide additional technical details'}&quot;
                  </div>
                </div>
                <Link
                  href={leadDetailHref(lead.id)}
                  className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded text-[11px] flex items-center gap-1"
                >
                  Update & Resubmit <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters Toolbar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-slate-900/90 p-3.5 rounded-lg border border-slate-800">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Lead ID, title, customer, owner..."
            className="w-full pl-9 pr-4 py-1.5 bg-slate-950 border border-slate-800 rounded-md text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <Filter className="w-3.5 h-3.5 text-slate-500" />

          {isCEO ? (
            <>
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-md text-xs text-slate-300 focus:outline-none"
              >
                <option value="ALL">Stage</option>
                {Object.entries(PIPELINE_STAGE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-md text-xs text-slate-300 focus:outline-none"
              >
                <option value="ALL">Date</option>
                <option value="DRAFT">Newest first (default)</option>
              </select>
            </>
          ) : (
            <>
          <select
            value={verticalFilter}
            onChange={(e) => setVerticalFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-md text-xs text-slate-300 focus:outline-none"
          >
            <option value="ALL">All Verticals</option>
            <option value="Business Head">Business Head</option>
            <option value="Engineering Director">Engineering Director</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-md text-xs text-slate-300 focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="SUBMITTED_TO_PM">Submitted to PM for Review</option>
            <option value="RETURNED_TO_SALES">Returned for Clarification</option>
            <option value="ACCEPTED_FOR_FEASIBILITY">Approved</option>
            <option value="CANCELLED">Rejected</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-md text-xs text-slate-300 focus:outline-none"
          >
            <option value="ALL">All Priorities</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
            <option value="Critical">Critical</option>
          </select>
            </>
          )}
        </div>
      </div>

      {/* Main Leads Table */}
      <div className="bg-slate-900/90 rounded-xl border border-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
              <tr>
                <th className="p-3">Lead ID</th>
                <th className="p-3">Customer</th>
                {isCEO ? <th className="p-3">Project</th> : <th className="p-3">Lead Title & Customer</th>}
                {isCEO ? <th className="p-3">Value</th> : <th className="p-3">Business Vertical</th>}
                {isCEO ? <th className="p-3">Stage</th> : <th className="p-3">Sales Owner</th>}
                {isCEO ? <th className="p-3">Owner</th> : <th className="p-3">Priority</th>}
                {!isCEO && <th className="p-3">Status</th>}
                {!isCEO && <th className="p-3">Lead Date</th>}
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {visibleLeads.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-slate-500 text-xs">
                    <Inbox className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                    <p>No leads found.</p>
                    {canCreateLead(currentUser) && (
                      <Link href="/pre-sales/leads/create" className="mt-3 inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-cyan-500">
                        <Plus className="h-3.5 w-3.5" /> Create New Lead
                      </Link>
                    )}
                  </td>
                </tr>
              ) : (
                visibleLeads.map(lead => {
                  const statusInfo = STATUS_BADGES[lead.status] || { label: lead.status, style: 'bg-slate-800 text-slate-300' };
                  const pipeline = leadPipelineDisplay(lead);
                  const statusLabel = workflowActionLabel(lead);

                  return (
                    <tr key={lead.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3 font-mono font-bold text-cyan-400">{lead.lead_number}</td>
                      {isCEO ? (
                        <>
                          <td className="p-3 text-slate-100">{lead.customer_name}</td>
                          <td className="p-3 font-semibold text-slate-200">{lead.title}</td>
                          <td className="p-3">{formatInrCompact(lead.expected_value ?? 0)}</td>
                          <td className="p-3 max-w-[12rem]">
                            <span title={workflowActionLabel(lead)} className="inline-block whitespace-normal break-words">
                              {workflowActionLabel(lead)}
                            </span>
                          </td>
                          <td className="p-3 text-slate-400">{lead.sales_owner}</td>
                        </>
                      ) : (
                        <>
                      <td className="p-3">
                        <div className="font-bold text-slate-100">{lead.title}</div>
                        <div className="text-[11px] text-slate-400">{lead.customer_name} • <span className="text-slate-500">{lead.customer_type}</span></div>
                        {pipeline.quotation && <div className="text-[11px] text-cyan-400">{pipeline.quotation} · {pipeline.stage}</div>}
                      </td>
                      <td className="p-3 text-slate-300 font-medium">{lead.business_vertical}</td>
                      <td className="p-3 text-slate-400">{lead.sales_owner}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                          lead.priority === 'Critical' ? 'bg-rose-950 text-rose-300 border-rose-800' :
                          lead.priority === 'High' ? 'bg-amber-950 text-amber-300 border-amber-800' :
                          'bg-slate-800 text-slate-300 border-slate-700'
                        }`}>
                          {lead.priority}
                        </span>
                      </td>
                      <td className="p-3 max-w-[12rem]">
                        <span title={statusLabel} className={`inline-block max-w-full whitespace-normal break-words px-2.5 py-0.5 rounded text-[10px] font-bold border ${statusInfo.style}`}>
                          {statusLabel}
                        </span>
                      </td>
                      <td className="p-3 text-slate-400 font-mono text-[11px]">
                        {new Date(lead.created_at).toLocaleDateString()}
                      </td>
                        </>
                      )}
                      <td className="p-3 text-right">
                        <Link
                          href={leadDetailHref(lead.id)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-[11px] font-medium inline-flex items-center gap-1 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" /> View
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
