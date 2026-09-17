'use client';

import { Link } from '@/lib/navigation';
import React, { useEffect, useState } from 'react';
import { User } from '@/lib/types';
import { LeadApi, BusinessHeadDashboard } from '@/lib/leadApi';
import { DailyUpdatesApi } from '@/lib/dailyUpdatesApi';
import { formatInrCompact } from '@/lib/format';
import { workflowActionLabel } from '@/lib/workflowActionLabel';
import { canCreateLead } from '@/lib/rbac';
import { compareLeadNumber } from '@/lib/leadPipelineDisplay';
import { Building2, Plus, Inbox, ArrowRight } from 'lucide-react';
import { DailyUpdateSummary } from '@/lib/types';
import PendingActionsCard from '@/components/work/PendingActionsCard';
import LeadWorkflowTimeline from '@/components/dashboards/LeadWorkflowTimeline';
import ProjectGanttPanel from '@/components/planning/ProjectGanttPanel';

export default function SalesDashboard({ user }: { user: User }) {
  const isBH = user.role_code === 'BUSINESS_HEAD';
  const canCreate = canCreateLead(user);
  const verticalName = isBH ? 'Business Head' : 'Sales';
  const [data, setData] = useState<BusinessHeadDashboard | null>(null);
  const [work, setWork] = useState<DailyUpdateSummary | null>(null);

  useEffect(() => {
    void (async () => {
      const result = await LeadApi.businessHeadDashboard();
      setData(result);
      setWork(await DailyUpdatesApi.summary());
    })();
  }, []);

  const pipelineValue = data?.pipelineValue ?? 0;
  const technicalReview = data?.technicalReview ?? 0;
  const commercial = data?.commercialProposals ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-gradient-to-r from-slate-900 via-blue-950/30 to-slate-900 p-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-400">
            <Building2 className="h-4 w-4" /> {isBH ? 'Business Head Dashboard' : 'Sales Dashboard'}
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-100">Welcome back, {user.name}</h1>
          <p className="mt-1 text-xs text-slate-400">
            Track customer opportunities under <span className="font-semibold text-cyan-300">{verticalName}</span> vertical.
          </p>
        </div>
        {canCreate && (
          <Link href="/pre-sales/leads/create" className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-bold text-white hover:bg-cyan-500">
            <Plus className="h-4 w-4" /> Create New Lead
          </Link>
        )}
      </div>

      <PendingActionsCard />
      <LeadWorkflowTimeline />
      <ProjectGanttPanel user={user} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
          <div className="text-xs font-medium text-slate-400">Pipeline Value</div>
          <div className="mt-2 text-2xl font-bold text-slate-100">{formatInrCompact(pipelineValue)}</div>
          <div className="mt-1 text-[11px] text-slate-500">
            {data?.activeOpportunities || 0} active opportunities
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
          <div className="text-xs font-medium text-slate-400">Leads in Technical Review</div>
          <div className="mt-2 text-2xl font-bold text-slate-100">{technicalReview}</div>
          <div className="mt-1 text-[11px] text-slate-500">Feasibility / PM feasibility approval</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
          <div className="text-xs font-medium text-slate-400">Commercial Proposals</div>
          <div className="mt-2 text-2xl font-bold text-slate-100">{commercial}</div>
          <div className="mt-1 text-[11px] text-slate-500">Quotation / Negotiation</div>
        </div>
      </div>

      {isBH && work && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Updates Today', value: work.submittedToday },
            { label: 'Pending', value: work.pendingToday },
            { label: 'Blocked', value: work.blocked },
            { label: 'Projects requiring attention', value: work.projectsNeedingAttention },
          ].map((card) => (
            <Link key={card.label} href="/daily-updates" className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 hover:border-cyan-800">
              <div className="text-xs text-slate-400">{card.label}</div>
              <div className="mt-2 text-2xl font-bold text-slate-100">{card.value}</div>
            </Link>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
        <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-2">
          <h2 className="text-sm font-bold text-slate-100">Pipeline activity</h2>
          <Link href="/my-work" className="text-xs text-cyan-400 hover:underline">My Assigned Work</Link>
        </div>
        {!data?.leads?.length ? (
          <div className="space-y-2 p-8 text-center">
            <Inbox className="mx-auto h-6 w-6 text-slate-600" />
            <p className="text-xs font-medium text-slate-300">No leads found.</p>
            {canCreate ? (
              <Link href="/pre-sales/leads/create" className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-400 hover:underline">
                <Plus className="h-3.5 w-3.5" /> Create New Lead
              </Link>
            ) : (
              <Link href="/pre-sales/leads" className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-400 hover:underline">
                View lead pipeline <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {data.leads
              .slice()
              .sort((a, b) => compareLeadNumber(a.lead_number, b.lead_number))
              .map((lead) => (
              <Link key={lead.id} href={`/pre-sales/leads/${lead.id}`} className="flex items-center justify-between py-3 hover:bg-slate-800/30">
                <div>
                  <span className="mr-2 font-mono font-bold text-cyan-400">{lead.lead_number}</span>
                  <span className="font-semibold text-slate-100">{lead.title}</span>
                  <div className="text-[11px] text-slate-400">{lead.customer_name} · {workflowActionLabel(lead)}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-slate-300">{formatInrCompact(lead.expected_value ?? 0)}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-500" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
