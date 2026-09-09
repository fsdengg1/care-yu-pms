'use client';

import { Link } from '@/lib/navigation';
import React, { useEffect, useState } from 'react';

import { GanttChartSquare, Lock } from 'lucide-react';
import { PlanningApi } from '@/lib/planningApi';
import { canAccessGanttPlanning } from '@/lib/rbac';
import { PlanningPlanPayload, PlanningProjectSummary, User } from '@/lib/types';
import ProjectGanttChart from '@/components/planning/ProjectGanttChart';

export default function ProjectGanttPanel({
  user,
  projectId,
  lockLabel,
}: {
  user: User;
  projectId?: string;
  lockLabel?: string;
}) {
  const allowed = canAccessGanttPlanning(user);
  const [projects, setProjects] = useState<PlanningProjectSummary[]>([]);
  const [selectedId, setSelectedId] = useState(projectId || '');
  const [plan, setPlan] = useState<PlanningPlanPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!allowed) {
      setLoaded(true);
      return;
    }
    void (async () => {
      const listed = await PlanningApi.list();
      if (!listed.ok) {
        setError(listed.message);
        setLoaded(true);
        return;
      }
      setProjects(listed.projects);
      const preferred =
        (projectId && listed.projects.find((item) => item.id === projectId || item.code === projectId)?.id) ||
        listed.projects[0]?.id ||
        '';
      setSelectedId(preferred);
      setLoaded(true);
    })();
  }, [allowed, projectId]);

  useEffect(() => {
    if (!selectedId) {
      setPlan(null);
      return;
    }
    void (async () => {
      const result = await PlanningApi.get(selectedId);
      if (!result.ok || !result.plan) {
        setPlan(null);
        setError(result.message);
        return;
      }
      setError(null);
      setPlan(result.plan);
    })();
  }, [selectedId]);

  const canEdit = Boolean(plan?.canEditGantt ?? plan?.canManage);
  const selected = projects.find((item) => item.id === selectedId);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/90 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-100">
            <GanttChartSquare className="h-4 w-4 text-cyan-400" /> Project Gantt Chart
          </h2>
          <p className="mt-1 text-[11px] text-slate-500">
            Same live plan the Project Manager maintains. Task progress comes from the project workflow and daily updates.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!canEdit && (
            <span className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-300">
              <Lock className="h-3 w-3" /> {lockLabel || 'Read Only'}
            </span>
          )}
          {!projectId && projects.length > 1 && (
            <select
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
              className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1.5 text-slate-200"
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.customer_name} – {project.name}
                </option>
              ))}
            </select>
          )}
          {selectedId && (
            <Link href={`/projects/planning?project=${selectedId}`} className="text-cyan-400 hover:underline">
              {canEdit ? 'Manage Gantt' : 'Open Gantt'}
            </Link>
          )}
        </div>
      </div>

      {selected && (
        <div className="grid grid-cols-2 gap-px border-b border-slate-800 bg-slate-800/60 sm:grid-cols-4">
          {[
            { label: 'Overall progress', value: `${selected.progress}%` },
            { label: 'Tasks', value: selected.taskCount },
            { label: 'Delayed', value: selected.delayedCount },
            { label: 'Blocked', value: selected.blockedCount },
          ].map((card) => (
            <div key={card.label} className="bg-slate-900 px-4 py-3">
              <div className="text-slate-500">{card.label}</div>
              <div className="mt-1 font-bold text-slate-100">{card.value}</div>
            </div>
          ))}
        </div>
      )}

      {!loaded ? (
        <p className="p-6 text-slate-500">Loading Gantt chart…</p>
      ) : error && !plan ? (
        <p className="p-6 text-rose-300">{error}</p>
      ) : !selectedId ? (
        <p className="p-6 text-center text-slate-500">No authorized projects have a Gantt chart yet.</p>
      ) : plan ? (
        <ProjectGanttChart plan={plan} />
      ) : (
        <p className="p-6 text-center text-slate-500">Unable to load this project Gantt chart.</p>
      )}
    </section>
  );
}
