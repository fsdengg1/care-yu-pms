'use client';

import { Link } from '@/lib/navigation';
import React, { useMemo, useState } from 'react';

import { formatEmployeeDisplayName } from '@/lib/people';
import { formatLongDate } from '@/lib/format';
import { Project } from '@/lib/types';
import { StorageService } from '@/lib/storage';

export type ProjectContributor = {
  id: string;
  name: string;
  total: number;
  completed: number;
  inProgress: number;
  progress: number;
};

export default function ProjectCard({
  project,
  taskCounts,
  contributors,
  selectedPersonId,
  onPersonClick,
}: {
  project: Project;
  taskCounts?: { total: number; completed: number; inProgress: number; overdue: number; members: number };
  contributors?: ProjectContributor[];
  selectedPersonId?: string;
  onPersonClick?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const overall =
    taskCounts && taskCounts.total > 0 ? Math.round((taskCounts.completed / taskCounts.total) * 100) : project.progress;
  const health =
    project.health === 'CRITICAL'
      ? 'text-rose-400'
      : project.health === 'AT_RISK'
        ? 'text-amber-400'
        : 'text-emerald-400';
  const teamNames = useMemo(() => {
    const teams = StorageService.getTeams();
    return (project.team_ids || [])
      .map((id) => teams.find((team) => team.id === id)?.name)
      .filter(Boolean)
      .join(', ');
  }, [project.team_ids]);
  const latestUpdate = project.last_update_at
    ? new Date(project.last_update_at).toLocaleString()
    : project.updated_at
      ? new Date(project.updated_at).toLocaleString()
      : '—';

  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-sm transition hover:border-cyan-600 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-100">{project.name}</h3>
          <div className="mt-1 text-[11px] text-slate-500">Project No: {project.code}</div>
          {project.lead_number && (
            <div className="mt-0.5 text-[11px] font-semibold text-cyan-400">Source Lead: {project.lead_number}</div>
          )}
        </div>
        <span className={`text-[11px] font-bold ${health}`}>{project.status.replace('_', ' ')}</span>
      </div>
      <div className="mt-4">
        <div className="flex items-end justify-between text-xs">
          <span className="font-bold text-slate-100">Overall {overall}%</span>
          <span className="text-slate-500">{taskCounts?.members ?? (project.team_ids || []).length} contributors</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full bg-cyan-500" style={{ width: `${Math.max(0, Math.min(100, overall))}%` }} />
        </div>
      </div>
      <div className="mt-4 space-y-1 text-xs text-slate-400">
        <div>Customer · {project.customer_name || '—'}</div>
        <div>PM · {formatEmployeeDisplayName(project.pm_name)}</div>
        <div>Teams · {teamNames || '—'}</div>
        <div>Latest update · {latestUpdate}</div>
        {taskCounts && (
          <div>
            {taskCounts.total} tasks · {taskCounts.completed} completed · {taskCounts.inProgress} in progress · {taskCounts.overdue} overdue
          </div>
        )}
        <div>
          {formatLongDate(project.start_date)} → {formatLongDate(project.target_completion)}
        </div>
      </div>
      {contributors && contributors.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="text-[11px] font-bold text-cyan-400 hover:underline"
          >
            {open ? 'Hide individual progress' : 'Individual progress'}
          </button>
          {open && (
            <div className="mt-2 space-y-1">
              {contributors.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => onPersonClick?.(person.id)}
                  className={`flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-left text-[11px] ${
                    selectedPersonId === person.id ? 'border-cyan-500 bg-cyan-950/40' : 'border-slate-800 hover:border-cyan-700'
                  }`}
                >
                  <span className="font-semibold text-slate-100">{person.name}</span>
                  <span className="text-slate-400">
                    {person.total} tasks · {person.completed} completed · {person.inProgress} in progress · {person.progress}%
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <Link href={`/projects/${project.id}`} className="mt-auto pt-4 text-xs font-bold text-cyan-400 hover:underline">
        View Project →
      </Link>
    </div>
  );
}
