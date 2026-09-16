'use client';

import React, { useMemo } from 'react';
import {
  CompareItem,
  deadlineCellClass,
  deadlineCellStyle,
  deadlineTone,
  formatSheetDate,
  progressForSheetStatus,
  sheetStatusClass,
} from '@/lib/dailyStatus';

function StatusPill({ value }: { value?: string }) {
  const label = value && value.trim() && value !== '—' ? value : 'Not Started';
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold leading-tight ${sheetStatusClass(label)}`}>
      {label}
    </span>
  );
}

function formatDependencies(value?: string) {
  const parts = String(value || '')
    .split(/[,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length || parts[0] === '—') return [] as string[];
  return parts;
}

function formatDelay(value?: string) {
  const text = (value || '').trim();
  if (!text || text === '—') return 'No delay';
  return text;
}

function HoursBlock({
  label,
  status,
  progress,
  hours,
}: {
  label: string;
  status?: string;
  progress?: number;
  hours?: string;
}) {
  const pct = progressForSheetStatus(status, progress);
  const barColor = pct >= 100 ? '#16a34a' : pct > 0 ? '#2563eb' : '#94a3b8';
  return (
    <div className="sheet-progress-hours text-left">
      <div className="sheet-progress-label">{label}</div>
      <div className="sheet-progress-track" aria-hidden>
        <div className="sheet-progress-fill" style={{ width: `${pct}%`, background: barColor }} />
      </div>
      <div className="sheet-progress-pct-label">{pct}%</div>
      <div className="sheet-hours-value">{hours || '0.0 hrs'}</div>
    </div>
  );
}

function WorkCompletedBlock({ title, text }: { title: string; text?: string }) {
  const value = (text || '').trim();
  if (!value) return null;
  return (
    <div className="mt-2 border-t border-[#e2e8f0] pt-2">
      <div className="text-[10px] font-bold uppercase tracking-wide text-[#64748b]">{title}</div>
      <p className="mt-1 whitespace-pre-wrap text-[12px] leading-5 text-[#0f172a]">{value}</p>
    </div>
  );
}

type DaySlice = {
  status?: string;
  morningStatus?: string;
  eveningStatus?: string;
  morningProgress?: number;
  eveningProgress?: number;
  morningHours?: string;
  eveningHours?: string;
  morningRemarks?: string;
  eveningRemarks?: string;
  morningWork?: string;
  eveningWork?: string;
};

function daySlice(item: CompareItem, which: 'previous' | 'current'): DaySlice {
  if (which === 'previous') {
    return {
      status: item.previousEveningStatus || item.previousMorningStatus || item.morningStatus,
      morningStatus: item.previousMorningStatus,
      eveningStatus: item.previousEveningStatus,
      morningProgress: item.previousMorningProgressPercent,
      eveningProgress: item.previousEveningProgressPercent,
      morningHours: item.previousMorningHours,
      eveningHours: item.previousEveningHours,
      morningRemarks: item.previousMorningRemarks,
      eveningRemarks: item.previousEveningRemarks,
      morningWork: item.previousMorningWorkCompleted || item.morningUpdate,
      eveningWork: item.previousEveningWorkCompleted || item.eveningUpdate,
    };
  }
  return {
    status: item.currentEveningStatus || item.currentMorningStatus || item.status,
    morningStatus: item.currentMorningStatus,
    eveningStatus: item.currentEveningStatus,
    morningProgress: item.currentMorningProgressPercent,
    eveningProgress: item.currentEveningProgressPercent,
    morningHours: item.currentMorningHours,
    eveningHours: item.currentEveningHours,
    morningRemarks: item.currentMorningRemarks,
    eveningRemarks: item.currentEveningRemarks,
    morningWork: item.currentMorningWorkCompleted,
    eveningWork: item.currentEveningWorkCompleted,
  };
}

function CompareReportTable({
  title,
  dateLabel,
  workDate,
  items,
  which,
}: {
  title: string;
  dateLabel: string;
  workDate?: string;
  items: CompareItem[];
  which: 'previous' | 'current';
}) {
  const groups = useMemo(() => {
    const next: Array<{ person: string; rows: CompareItem[] }> = [];
    for (const row of items) {
      const last = next[next.length - 1];
      if (last && last.person === row.person) last.rows.push(row);
      else next.push({ person: row.person, rows: [row] });
    }
    return next;
  }, [items]);

  return (
    <div className="daily-status-report-card overflow-hidden">
      <header className="daily-status-report-header">
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#facc15]">CareYu Automation</div>
        <h2 className="mt-1 text-xl font-bold text-white">{title}</h2>
        <p className="mt-1 text-[13px] text-[#cbd5e1]">Report date: {dateLabel}</p>
      </header>
      <div className="daily-status-report-table-wrap">
        <table className="daily-status-sheet daily-status-report-table">
          <colgroup>
            <col className="col-person" />
            <col className="col-project" />
            <col className="col-task-desc" />
            <col className="col-deps" />
            <col className="col-status" />
            <col className="col-date" />
            <col className="col-deadline" />
            <col className="col-hours" />
            <col className="col-delay" />
          </colgroup>
          <thead>
            <tr>
              <th>Person</th>
              <th>Project</th>
              <th>Task Description</th>
              <th>Dependencies</th>
              <th>Status</th>
              <th>Start Date</th>
              <th>Task Deadline</th>
              <th>Logged Hours</th>
              <th>Reason For Delay</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) =>
              group.rows.map((item, index) => {
                const slice = daySlice(item, which);
                const latestStatus = slice.eveningStatus || slice.morningStatus || slice.status;
                const latestRemarks = slice.eveningRemarks || slice.morningRemarks;
                const tone = deadlineTone(latestStatus || '', item.taskDeadline, workDate);
                const deps = formatDependencies(item.dependencies);
                return (
                  <tr key={`${which}-${item.id}`}>
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
                      <WorkCompletedBlock title="Morning Work Completed" text={slice.morningWork} />
                      <WorkCompletedBlock title="Evening Work Completed" text={slice.eveningWork} />
                    </td>
                    <td className="deps-cell">
                      {deps.length ? (
                        <div className="space-y-0.5">
                          {deps.map((dep) => (
                            <div key={dep} className="sheet-text">
                              {dep}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="sheet-text">—</span>
                      )}
                    </td>
                    <td className="status-cell">
                      <div className="space-y-1">
                        <div>
                          <div className="text-[9px] font-bold uppercase tracking-wide text-[#64748b]">Morning</div>
                          <StatusPill value={slice.morningStatus} />
                        </div>
                        <div>
                          <div className="text-[9px] font-bold uppercase tracking-wide text-[#64748b]">Evening</div>
                          <StatusPill value={slice.eveningStatus} />
                        </div>
                      </div>
                    </td>
                    <td className="date-cell">{item.startDate || '—'}</td>
                    <td className={`date-cell tone-cell ${deadlineCellClass(tone)}`} style={deadlineCellStyle(tone)}>
                      {item.taskDeadline || '—'}
                    </td>
                    <td className="hours-cell">
                      <div className="space-y-2">
                        <HoursBlock
                          label="Morning"
                          status={slice.morningStatus}
                          progress={slice.morningProgress}
                          hours={slice.morningHours}
                        />
                        <HoursBlock
                          label="Evening"
                          status={slice.eveningStatus}
                          progress={slice.eveningProgress}
                          hours={slice.eveningHours}
                        />
                      </div>
                    </td>
                    <td className="delay-cell">
                      <span className="sheet-text">{formatDelay(latestRemarks)}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
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
  const sorted = useMemo(
    () =>
      items
        .slice()
        .sort((a, b) => a.person.localeCompare(b.person) || a.project.localeCompare(b.project) || a.id.localeCompare(b.id)),
    [items]
  );

  if (!available || !items.length) {
    return (
      <div className="rounded-xl border border-[#e2e8f0] bg-white p-8 text-center text-sm text-[#64748b]">
        No tasks found to compare for these dates.
      </div>
    );
  }

  return (
    <div className="daily-status-report-body space-y-6 p-0">
      <CompareReportTable
        title={`Previous Day Status Report - ${prevLabel}`}
        dateLabel={prevLabel}
        workDate={previousDate}
        items={sorted}
        which="previous"
      />
      <CompareReportTable
        title={`Current Day Status Report - ${currLabel}`}
        dateLabel={currLabel}
        workDate={currentDate || date}
        items={sorted}
        which="current"
      />
    </div>
  );
}
