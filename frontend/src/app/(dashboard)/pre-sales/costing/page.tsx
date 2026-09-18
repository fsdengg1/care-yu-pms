'use client';

import { Link } from '@/lib/navigation';
import React, { useEffect, useState } from 'react';

import { Calculator } from 'lucide-react';
import { Lead } from '@/lib/types';
import { formatInrCompact } from '@/lib/format';
import { workflowActionLabel } from '@/lib/workflowActionLabel';
import { compareLeadNumber } from '@/lib/leadPipelineDisplay';
import { StorageService } from '@/lib/storage';
import { isCeoViewOnly } from '@/lib/rbac';
import { LeadApi } from '@/lib/leadApi';

export default function CostingPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [viewOnly, setViewOnly] = useState(false);

  useEffect(() => {
    setViewOnly(isCeoViewOnly(StorageService.getCurrentUser()));
    void (async () => {
      const all = await LeadApi.list();
      setLeads(
        all
          .filter(
            (lead) =>
              lead.status === 'COSTING_IN_PROGRESS' ||
              lead.status === 'COSTING_SUBMITTED' ||
              lead.status === 'COSTING_RETURNED' ||
              lead.status === 'QUOTATION' ||
              lead.status === 'NEGOTIATION' ||
              lead.pipeline_stage === 'COSTING' ||
              lead.pipeline_stage === 'QUOTATION' ||
              lead.pipeline_stage === 'NEGOTIATION' ||
              lead.quotation?.workflow_status === 'SUBMITTED_TO_CUSTOMER' ||
              lead.quotation?.workflow_status === 'CUSTOMER_REVIEW'
          )
          .sort((a, b) => compareLeadNumber(a.lead_number, b.lead_number))
      );
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
          <Calculator className="h-4 w-4" /> Pre-Sales Visibility
        </div>
        <h1 className="mt-1 text-xl font-bold text-slate-100">Solution & Costing</h1>
        <p className="mt-1 text-xs text-slate-400">
          {viewOnly
            ? 'Management view of costing and quotation-stage opportunities. No operational costing actions.'
            : 'Opportunities currently in costing, quotation, or submitted to the customer. Open a lead to record BOM, vendor quotations, and submit costing.'}
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/90">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-800 bg-slate-950/80 text-[10px] uppercase tracking-wider text-slate-400">
            <tr>
              <th className="p-3">Lead ID</th>
              <th className="p-3">Customer</th>
              <th className="p-3">Project</th>
              <th className="p-3">Value</th>
              <th className="p-3">Stage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-300">
            {leads.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-10 text-center text-slate-500">
                  No costing or quotation opportunities yet.
                </td>
              </tr>
            ) : (
              leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-slate-800/40">
                  <td className="p-3 font-mono font-bold text-cyan-400">
                    <Link href={`/pre-sales/leads/${lead.id}`}>{lead.lead_number}</Link>
                  </td>
                  <td className="p-3">{lead.customer_name}</td>
                  <td className="p-3 text-slate-100">{lead.title}</td>
                  <td className="p-3">{formatInrCompact(lead.expected_value ?? lead.costing?.total_estimated_cost ?? 0)}</td>
                  <td className="p-3">{workflowActionLabel(lead)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
