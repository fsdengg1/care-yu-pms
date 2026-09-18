'use client';

import { Link } from '@/lib/navigation';
import React, { useEffect, useState } from 'react';

import { ArrowRight, Building2, FolderKanban, Inbox, Plus } from 'lucide-react';
import { Lead } from '@/lib/types';
import { LeadApi } from '@/lib/leadApi';
import { canCreateLead } from '@/lib/rbac';
import { compareLeadNumber, leadPipelineDisplay } from '@/lib/leadPipelineDisplay';
import { workflowActionLabel } from '@/lib/workflowActionLabel';
import { useAuth } from '@/components/auth/AuthProvider';

export default function LeadPipelinePanel({ title = 'Lead pipeline' }: { title?: string }) {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const showCreate = canCreateLead(user);

  useEffect(() => {
    void (async () => {
      setLeads(await LeadApi.list());
    })();
  }, []);

  const openLeads = leads
    .filter((lead) => lead.status !== 'ORDER_CONVERTED' && lead.status !== 'LOST' && lead.status !== 'CANCELLED')
    .sort((a, b) => compareLeadNumber(a.lead_number, b.lead_number));

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
      <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-100">
          <Building2 className="h-4 w-4 text-cyan-400" /> {title}
        </h2>
        <div className="flex items-center gap-3">
          {showCreate && (
            <>
              <Link href="/pre-sales/leads/create" className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-400 hover:underline">
                <Plus className="h-3.5 w-3.5" /> Create Lead
              </Link>
              <Link href="/projects/create" className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-400 hover:underline">
                <FolderKanban className="h-3.5 w-3.5" /> Create Project
              </Link>
            </>
          )}
          <Link href="/pre-sales/leads" className="text-xs text-cyan-400 hover:underline">View pipeline</Link>
        </div>
      </div>
      {openLeads.length === 0 ? (
        <div className="space-y-2 p-8 text-center">
          <Inbox className="mx-auto h-6 w-6 text-slate-600" />
          <p className="text-xs font-medium text-slate-300">No leads in the pipeline yet.</p>
          {showCreate ? (
            <div className="flex items-center justify-center gap-4">
              <Link href="/pre-sales/leads/create" className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-400 hover:underline">
                <Plus className="h-3.5 w-3.5" /> Create Lead
              </Link>
              <Link href="/projects/create" className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-400 hover:underline">
                <FolderKanban className="h-3.5 w-3.5" /> Create Project
              </Link>
            </div>
          ) : (
            <Link href="/pre-sales/leads" className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-400 hover:underline">
              Open lead pipeline <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>
      ) : (
        <div className="divide-y divide-slate-800/60">
          {openLeads.map((lead) => {
            const pipeline = leadPipelineDisplay(lead);
            return (
            <Link key={lead.id} href={`/pre-sales/leads/${lead.id}`} className="flex items-center justify-between py-3 hover:bg-slate-800/30">
              <div>
                <span className="mr-2 font-mono font-bold text-cyan-400">{lead.lead_number}</span>
                <span className="font-semibold text-slate-100">{lead.title}</span>
                <div className="text-[11px] text-slate-400">
                  {lead.customer_name}
                  {pipeline.quotation ? ` · ${pipeline.quotation}` : ''}
                  {` · ${workflowActionLabel(lead)}`}
                </div>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-slate-500" />
            </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
