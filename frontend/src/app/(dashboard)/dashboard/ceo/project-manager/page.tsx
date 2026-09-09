'use client';

import { Link } from '@/lib/navigation';
import React, { useEffect, useState } from 'react';

import { Users } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { CeoDashboardPayload } from '@/lib/types';
import { useAuth } from '@/components/auth/AuthProvider';
import ProjectGanttPanel from '@/components/planning/ProjectGanttPanel';

export default function CeoProjectManagerPage() {
  const { user } = useAuth();
  const [data, setData] = useState<CeoDashboardPayload['projectManager'] | null>(null);
  const [escalations, setEscalations] = useState(0);

  useEffect(() => {
    (async () => {
      const result = await apiRequest<CeoDashboardPayload>('/api/dashboard/ceo');
      if (result.ok) {
        setData(result.data.projectManager);
        setEscalations(result.data.escalations.length);
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
          <Users className="h-4 w-4" /> Project Management
        </div>
        <h1 className="mt-1 text-xl font-bold text-slate-100">{data?.name ?? 'Project Manager'}</h1>
        <p className="mt-1 text-xs text-slate-400">Accountable for execution. CEO view is read-only.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link href="/pre-sales/leads" className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Pending Reviews</div>
          <div className="mt-2 text-2xl font-bold text-amber-300">{data?.pendingReviews ?? 0}</div>
        </Link>
        <Link href="/dashboard/ceo/escalations" className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Escalations</div>
          <div className="mt-2 text-2xl font-bold text-rose-300">{escalations}</div>
        </Link>
      </div>

      {user && <ProjectGanttPanel user={user} />}
    </div>
  );
}
