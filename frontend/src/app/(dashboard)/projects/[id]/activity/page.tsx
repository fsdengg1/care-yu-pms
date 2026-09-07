'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useSearchParams } from 'next/navigation';
import { resolveProjectIdFromLocation } from '@/lib/projectRoutes';
import { History } from 'lucide-react';
import { DailyUpdatesApi } from '@/lib/dailyUpdatesApi';
import { formatLongDate } from '@/lib/format';
import { Project, ProjectActivityItem } from '@/lib/types';

export default function ProjectActivityPage() {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const projectId = resolveProjectIdFromLocation(params.id, pathname, searchParams.get('id'));
  const [project, setProject] = useState<Project | null>(null);
  const [activity, setActivity] = useState<ProjectActivityItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      if (!projectId) {
        setError('Project activity is not available.');
        return;
      }
      const payload = await DailyUpdatesApi.projectActivity(projectId);
      if (!payload) {
        setError('Project activity is not available.');
        return;
      }
      setProject(payload.project);
      setActivity(payload.activity);
    })();
  }, [projectId]);

  return (
    <div className="space-y-6 text-xs">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
          <History className="h-4 w-4" /> Project activity
        </div>
        <h1 className="mt-1 text-xl font-bold text-slate-100">{project ? `${project.customer_name} – ${project.name}` : 'Project history'}</h1>
        <p className="mt-1 text-slate-400">
          Chronological history of daily updates, progress, blockers, assignments, approvals, and escalations. Also recorded in Audit Trail.
        </p>
        <Link href="/dashboard" className="mt-2 inline-block text-cyan-400 hover:underline">Back to Dashboard</Link>
      </div>

      {error && <div className="rounded-xl border border-rose-900 bg-rose-950/40 p-4 text-rose-300">{error}</div>}

      <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/90 p-5">
        {activity.length === 0 && !error && <p className="p-6 text-center text-slate-500">No activity recorded for this project yet.</p>}
        {activity.map((item) => (
          <div key={item.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">{item.kind.replace('_', ' ')}</span>
              <span className="font-mono text-[10px] text-slate-500">{formatLongDate(item.at)}</span>
            </div>
            <div className="mt-1 font-semibold text-slate-100">{item.title}</div>
            <div className="text-slate-400">{item.detail}</div>
            <div className="mt-1 text-slate-500">{item.actor}{item.status ? ` · ${item.status}` : ''}</div>
            {item.href && (
              <Link href={item.href} className="mt-1 inline-block text-cyan-400 hover:underline">Open</Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
