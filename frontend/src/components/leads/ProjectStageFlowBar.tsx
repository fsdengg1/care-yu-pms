'use client';

import React from 'react';
import { Lead } from '@/lib/types';
import { projectStageFlowNodes } from '@/lib/projectStageFlow';

export default function ProjectStageFlowBar({ lead }: { lead: Lead }) {
  const nodes = projectStageFlowNodes(lead);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/90 px-4 py-3">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Project stage</div>
      <div className="flex flex-wrap items-stretch gap-1.5">
        {nodes.map((node, index) => {
          const tone =
            node.state === 'completed'
              ? 'border-emerald-800 bg-emerald-950/50 text-emerald-200'
              : node.state === 'current'
                ? 'border-cyan-600 bg-cyan-950 text-cyan-200 ring-1 ring-cyan-500/40'
                : 'border-slate-800 bg-slate-950 text-slate-500';
          return (
            <React.Fragment key={node.key}>
              {index > 0 && <span className="hidden self-center text-slate-700 sm:inline">›</span>}
              <div className={`min-w-[7.5rem] flex-1 rounded-lg border px-2.5 py-2 ${tone}`}>
                <div className="text-[11px] font-semibold">{node.label}</div>
                <div className="mt-0.5 text-[10px] opacity-80">{node.caption}</div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
