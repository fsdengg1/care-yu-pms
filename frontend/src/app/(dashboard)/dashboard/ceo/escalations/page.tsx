'use client';

import { Link } from '@/lib/navigation';
import React, { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { Escalation } from '@/lib/types';
import { formatRelativeTime } from '@/lib/format';

export default function CeoEscalationsPage() {
  const [escalations, setEscalations] = useState<Escalation[]>([]);

  useEffect(() => {
    (async () => {
      const result = await apiRequest<{ escalations: Escalation[] }>('/api/escalations');
      if (result.ok) setEscalations(result.data.escalations);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
          <ShieldAlert className="h-4 w-4" /> Escalations
        </div>
        <h1 className="mt-1 text-xl font-bold text-slate-100">Escalations</h1>
        <p className="mt-1 text-xs text-slate-400">Level 1 Team Lead → Level 2 PM → Level 3 BH/ED → Level 4 CEO. Resolve at your level or promote.</p>
      </div>

      <div className="space-y-3">
        {escalations.map((item) => (
          <Link
            key={item.id}
            href={`/dashboard/ceo/escalations/${item.id}`}
            className="block rounded-xl border border-slate-800 bg-slate-900/90 p-4 hover:border-cyan-800"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-cyan-400">{item.code}</span>
              <span className={`text-[10px] font-bold ${item.severity === 'CRITICAL' ? 'text-rose-300' : 'text-orange-300'}`}>
                {item.severity} · {item.status}
              </span>
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-100">{item.issue}</div>
            <div className="mt-1 text-xs text-slate-400">
              {item.customer_name} · {item.current_level.replace(/_/g, ' ')} · Escalated by {item.raised_by_role} · {formatRelativeTime(item.created_at)}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
