'use client';

import React, { useMemo } from 'react';
import { CompareItem, formatSheetDate, progressForSheetStatus, sheetStatusClass } from '@/lib/dailyStatus';

function StatusPill({ value }: { value?: string }) {
  const label = value && value !== '—' ? value : 'Not Started';
  return (
    <span className={`inline-flex max-w-full items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold leading-tight ${sheetStatusClass(label)}`}>
      {label}
    </span>
  );
}

function PeriodCard({
  title,
  status,
  progress,
  hours,
  remarks,
  workCompleted,
}: {
  title: string;
  status?: string;
  progress?: number;
  hours?: string;
  remarks?: string;
  workCompleted?: string;
}) {
  const pct = progressForSheetStatus(status, progress);
  const delay = remarks && remarks !== 'No delay' && remarks !== '—' ? remarks : 'No delay';
  const work = (workCompleted || '').trim();
  return (
    <div className="rounded-lg border border-[#e2e8f0] bg-white p-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748b]">{title}</div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <StatusPill value={status} />
        <span className="text-sm font-bold text-[#0f172a]">{Number.isFinite(pct) ? `${pct}%` : '0%'}</span>
        <span className="text-[11px] font-semibold text-[#475569]">{hours || '0.0 hrs'}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e2e8f0]">
        <div
          className="h-full rounded-full bg-[#2563eb]"
          style={{ width: `${Number.isFinite(pct) ? pct : 0}%` }}
        />
      </div>
      <div className="mt-2 text-[11px] text-[#64748b]">Delay: {delay}</div>
      <div className="mt-2 border-t border-[#e2e8f0] pt-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748b]">{title} work completed</div>
        <p className="mt-1 whitespace-pre-wrap text-[12px] leading-5 text-[#0f172a]">{work || '—'}</p>
      </div>
    </div>
  );
}

export default function CompareView({
  items,
  available,
  date,
  previousDate,
  currentDate,
}: {
  items: CompareItem[];
  available: boolean;
  date?: string;
  previousDate?: string;
  currentDate?: string;
}) {
  const prevLabel = formatSheetDate(previousDate || '');
  const currLabel = formatSheetDate(currentDate || date || '');
  const groups = useMemo(() => {
    const sorted = items
      .slice()
      .sort((a, b) => a.person.localeCompare(b.person) || a.project.localeCompare(b.project) || a.id.localeCompare(b.id));
    const next: Array<{ person: string; rows: CompareItem[] }> = [];
    for (const row of sorted) {
      const last = next[next.length - 1];
      if (last && last.person === row.person) last.rows.push(row);
      else next.push({ person: row.person, rows: [row] });
    }
    return next;
  }, [items]);

  if (!available) {
    return (
      <div className="rounded-xl border border-[#e2e8f0] bg-white p-8 text-center text-sm text-[#64748b]">
        No tasks found to compare for these dates.
      </div>
    );
  }
  if (!items.length) {
    return (
      <div className="rounded-xl border border-[#e2e8f0] bg-white p-8 text-center text-sm text-[#64748b]">
        No tasks found.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#e2e8f0] bg-white px-4 py-3 text-[12px] text-[#64748b]">
        Previous working day <span className="font-semibold text-[#0f172a]">{prevLabel}</span>
        {' · Morning + Evening'} vs current day{' '}
        <span className="font-semibold text-[#0f172a]">{currLabel}</span>
        {' · '}
        <span className="font-semibold text-[#0f172a]">{items.length} tasks</span>
      </div>

      {groups.map((group) => (
        <section key={group.person} className="overflow-hidden rounded-xl border border-[#e2e8f0] bg-[#f8fafc]">
          <div className="border-b border-[#e2e8f0] bg-[#facc15] px-4 py-2 text-sm font-bold text-[#0f172a]">{group.person}</div>
          <div className="space-y-4 p-3">
            {group.rows.map((item) => (
              <article key={item.id} className="rounded-xl border border-[#e2e8f0] bg-white p-4">
                <div className="grid gap-2 text-[12px] sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748b]">Project</div>
                    <div className="font-semibold text-[#0f172a]">{item.project || '—'}</div>
                  </div>
                  <div className="sm:col-span-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748b]">Task</div>
                    <div className="font-semibold text-[#0f172a]">{item.taskDescription || '—'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748b]">Dependencies</div>
                    <div className="text-[#334155]">{item.dependencies || '—'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748b]">Start date</div>
                    <div className="text-[#334155]">{item.startDate || '—'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748b]">Task deadline</div>
                    <div className="text-[#334155]">{item.taskDeadline || '—'}</div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-xl border border-[#cbd5e1] bg-[#f8fafc] p-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#0f172a]">
                      Previous day · {prevLabel}
                    </h3>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <PeriodCard
                        title="Morning"
                        status={item.previousMorningStatus}
                        progress={item.previousMorningProgressPercent}
                        hours={item.previousMorningHours}
                        remarks={item.previousMorningRemarks}
                        workCompleted={item.previousMorningWorkCompleted || item.morningUpdate}
                      />
                      <PeriodCard
                        title="Evening"
                        status={item.previousEveningStatus}
                        progress={item.previousEveningProgressPercent}
                        hours={item.previousEveningHours}
                        remarks={item.previousEveningRemarks}
                        workCompleted={item.previousEveningWorkCompleted || item.eveningUpdate}
                      />
                    </div>
                  </div>
                  <div className="rounded-xl border border-cyan-200 bg-cyan-50/40 p-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#0f172a]">
                      Current day · {currLabel}
                    </h3>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <PeriodCard
                        title="Morning"
                        status={item.currentMorningStatus}
                        progress={item.currentMorningProgressPercent}
                        hours={item.currentMorningHours}
                        remarks={item.currentMorningRemarks}
                        workCompleted={item.currentMorningWorkCompleted}
                      />
                      <PeriodCard
                        title="Evening"
                        status={item.currentEveningStatus}
                        progress={item.currentEveningProgressPercent}
                        hours={item.currentEveningHours}
                        remarks={item.currentEveningRemarks}
                        workCompleted={item.currentEveningWorkCompleted}
                      />
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
