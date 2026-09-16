'use client';

import React, { useMemo } from 'react';
import { CompareItem, formatSheetDate, progressForSheetStatus, sheetStatusClass } from '@/lib/dailyStatus';

function StatusPill({ value }: { value?: string }) {
  const label = value && value !== '—' ? value : '—';
  if (label === '—') return <span className="text-[#64748b]">—</span>;
  return (
    <span className={`inline-flex max-w-full items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold leading-tight ${sheetStatusClass(label)}`}>
      {label}
    </span>
  );
}

function PeriodBlock({
  status,
  progress,
  hours,
  remarks,
}: {
  status?: string;
  progress?: number;
  hours?: string;
  remarks?: string;
}) {
  const pct = progressForSheetStatus(status, progress);
  return (
    <div className="space-y-1 text-[11px]">
      <StatusPill value={status} />
      <div className="font-semibold text-[#0f172a]">{Number.isFinite(pct) ? `${pct}%` : '—'}</div>
      <div className="text-[#475569]">{hours || '0.0 hrs'}</div>
      {remarks && remarks !== 'No delay' && remarks !== '—' ? <div className="text-[10px] text-[#64748b]">{remarks}</div> : null}
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
    <div className="daily-status-workspace daily-status-compare-wrap min-w-0 overflow-hidden rounded-xl">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#e2e8f0] px-3 py-2 text-[11px] text-[#64748b]">
        <span>
          Previous day <span className="font-semibold text-[#0f172a]">{prevLabel}</span> vs current day{' '}
          <span className="font-semibold text-[#0f172a]">{currLabel}</span>
        </span>
        <span className="font-semibold text-[#0f172a]">{items.length} tasks</span>
      </div>

      <div className="daily-status-table-wrap daily-status-compare-scroll">
        <table className="daily-status-sheet daily-status-compare">
          <thead>
            <tr>
              <th rowSpan={2}>Person</th>
              <th rowSpan={2}>Project</th>
              <th rowSpan={2}>Task</th>
              <th colSpan={2} className="text-center">
                Previous day · {prevLabel}
              </th>
              <th colSpan={2} className="text-center">
                Current day · {currLabel}
              </th>
            </tr>
            <tr>
              <th>Morning</th>
              <th>Evening</th>
              <th>Morning</th>
              <th>Evening</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) =>
              group.rows.map((item, index) => (
                <tr key={item.id}>
                  {index === 0 && (
                    <td className="person-cell" rowSpan={group.rows.length}>
                      {group.person}
                    </td>
                  )}
                  <td className="project-cell">
                    <span className="sheet-text">{item.project || '—'}</span>
                  </td>
                  <td className="task-desc-cell">
                    <span className="sheet-text sheet-task-field">{item.taskDescription || '—'}</span>
                  </td>
                  <td>
                    <PeriodBlock
                      status={item.previousMorningStatus}
                      progress={item.previousMorningProgressPercent}
                      hours={item.previousMorningHours}
                      remarks={item.previousMorningRemarks}
                    />
                  </td>
                  <td>
                    <PeriodBlock
                      status={item.previousEveningStatus}
                      progress={item.previousEveningProgressPercent}
                      hours={item.previousEveningHours}
                      remarks={item.previousEveningRemarks}
                    />
                  </td>
                  <td>
                    <PeriodBlock
                      status={item.currentMorningStatus}
                      progress={item.currentMorningProgressPercent}
                      hours={item.currentMorningHours}
                      remarks={item.currentMorningRemarks}
                    />
                  </td>
                  <td>
                    <PeriodBlock
                      status={item.currentEveningStatus}
                      progress={item.currentEveningProgressPercent}
                      hours={item.currentEveningHours}
                      remarks={item.currentEveningRemarks}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
