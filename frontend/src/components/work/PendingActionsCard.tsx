'use client';

import { Link } from '@/lib/navigation';
import React, { useEffect, useState } from 'react';

import { LeadApi } from '@/lib/leadApi';
import { MyWorkItem } from '@/lib/types';
import { LEAD_STATUS_LABELS } from '@/lib/format';
import { ArrowRight, Clock, AlertTriangle } from 'lucide-react';

export default function PendingActionsCard() {
  const [items, setItems] = useState<MyWorkItem[]>([]);

  useEffect(() => {
    void LeadApi.myWork().then((result) => {
      setItems((result.items || []).filter((item) => item.lead_id !== 'new').slice(0, 8));
    });
  }, []);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
      <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-100">
          <Clock className="h-4 w-4 text-cyan-400" /> My Pending Actions
        </h2>
        <Link href="/my-work" className="text-xs text-cyan-400 hover:underline">View all</Link>
      </div>
      {items.length === 0 ? (
        <p className="py-4 text-center text-xs text-slate-500">No pending actions assigned to you.</p>
      ) : (
        <div className="divide-y divide-slate-800/70">
          {items.map((item) => {
            const overdue = Boolean(item.due_date && item.due_date < today);
            return (
              <div key={`${item.lead_id}-${item.category}`} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <div className="font-semibold text-slate-100">{item.title}</div>
                  <div className={`text-[11px] ${overdue ? 'text-rose-300' : 'text-slate-400'}`}>
                    {overdue && <AlertTriangle className="mr-1 inline h-3 w-3" />}
                    {item.lead_number} · {LEAD_STATUS_LABELS[item.status] || item.status} · {item.summary}
                  </div>
                </div>
                <Link href={item.href} className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-cyan-500">
                  Open <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
