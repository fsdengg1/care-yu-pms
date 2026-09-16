'use client';

import React, { useMemo } from 'react';
import {
  DailyStatusRow,
  deadlineCellClass,
  deadlineCellStyle,
  deadlineTone,
  formatSheetDate,
  sheetStatusClass,
} from '@/lib/dailyStatus';
import LoggedHoursProgressCell from './LoggedHoursProgressCell';
import SheetDateFilter from './SheetDateFilter';

function StatusPill({ value }: { value?: string }) {
  const label = value && value !== '—' ? value : '—';
  if (label === '—') return <span className="text-[#64748b]">—</span>;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold leading-tight ${sheetStatusClass(label)}`}>
      {label}
    </span>
  );
}

function formatDependencies(value: string) {
  const parts = value
    .split(/[,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length || parts[0] === '—') return '—';
  return parts;
}

function formatDelayReason(value?: string) {
  const text = (value || '').trim();
  if (!text || text === '—') return 'No delay';
  return text;
}

export default function DailyStatusReportView({
  rows,
  workDate,
  reportLabel,
  intro,
  loading = false,
  onWorkDateChange,
  period = 'morning',
}: {
  rows: DailyStatusRow[];
  workDate: string;
  reportLabel: string;
  intro: string;
  loading?: boolean;
  onWorkDateChange: (date: string) => void;
  period?: 'morning' | 'evening';
}) {
  const visible = useMemo(
    () =>
      rows
        .filter((row) => !row.sheetHidden)
        .slice()
        .sort((a, b) => a.person.localeCompare(b.person) || a.project.localeCompare(b.project) || a.id.localeCompare(b.id)),
    [rows]
  );

  const groups = useMemo(() => {
    const next: Array<{ personId: string; person: string; rows: DailyStatusRow[] }> = [];
    for (const row of visible) {
      const last = next[next.length - 1];
      if (last && last.personId === row.personId) last.rows.push(row);
      else next.push({ personId: row.personId, person: row.person, rows: [row] });
    }
    return next;
  }, [visible]);

  const reportDate = formatSheetDate(workDate);

  return (
    <section className="daily-status-report min-w-0 overflow-hidden rounded-xl">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#e2e8f0] bg-white px-3 py-2">
        <SheetDateFilter value={workDate} onChange={onWorkDateChange} />
        <span className="text-[11px] font-semibold text-[#64748b]">{visible.length} tasks</span>
      </div>

      <div className="daily-status-report-body">
        <div className="daily-status-report-card">
          <header className="daily-status-report-header">
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#facc15]">CareYu Automation</div>
            <h2 className="mt-1 text-xl font-bold text-white">{reportLabel}</h2>
            <p className="mt-1 text-[13px] text-[#cbd5e1]">Report date: {reportDate}</p>
          </header>

          <div className="daily-status-report-intro">
            <p className="font-bold text-[#0f172a]">Dear Team,</p>
            <p className="mt-2 text-[14px] leading-relaxed text-[#0f172a]">{intro}</p>
          </div>

          <div className="daily-status-report-table-wrap">
            {loading ? (
              <div className="px-6 py-12 text-center text-sm text-[#64748b]">Loading report…</div>
            ) : (
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
                  {visible.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-[#64748b]">No tasks found.</td>
                    </tr>
                  )}
                  {groups.map((group) =>
                    group.rows.map((row, index) => {
                      const tone = deadlineTone(row.status, row.deadlineIso || row.deadline, workDate);
                      const deps = formatDependencies(row.dependencies);
                      return (
                        <tr key={row.id}>
                          {index === 0 && (
                            <td className="person-cell" rowSpan={group.rows.length}>
                              {group.person}
                            </td>
                          )}
                          <td className="project-cell">
                            <span className="sheet-text">{row.project || '—'}</span>
                          </td>
                          <td className="task-desc-cell">
                            <span className="sheet-text sheet-task-field">{row.taskDescription || '—'}</span>
                            {period === 'evening' && (row.eveningWorkCompleted || row.currentUpdate || '').trim() ? (
                              <div className="mt-2 border-t border-[#e2e8f0] pt-2">
                                <div className="text-[10px] font-bold uppercase tracking-wide text-[#64748b]">
                                  Evening Work Completed
                                </div>
                                <span className="sheet-text sheet-task-field">{row.eveningWorkCompleted || row.currentUpdate}</span>
                              </div>
                            ) : null}
                            {period === 'morning' && (row.morningWorkCompleted || row.currentUpdate || '').trim() ? (
                              <div className="mt-2 border-t border-[#e2e8f0] pt-2">
                                <div className="text-[10px] font-bold uppercase tracking-wide text-[#64748b]">
                                  Morning Work Completed
                                </div>
                                <span className="sheet-text sheet-task-field">{row.morningWorkCompleted || row.currentUpdate}</span>
                              </div>
                            ) : null}
                          </td>
                          <td className="deps-cell">
                            {Array.isArray(deps) ? (
                              <div className="space-y-0.5">
                                {deps.map((dep) => (
                                  <div key={dep} className="sheet-text">{dep}</div>
                                ))}
                              </div>
                            ) : (
                              <span className="sheet-text">—</span>
                            )}
                          </td>
                          <td className="status-cell">
                            <StatusPill value={row.status} />
                          </td>
                          <td className="date-cell">{row.startDate || '—'}</td>
                          <td className={`date-cell tone-cell ${deadlineCellClass(tone)}`} style={deadlineCellStyle(tone)}>
                            {row.deadline || '—'}
                          </td>
                          <td className="hours-cell">
                            <LoggedHoursProgressCell
                              status={row.status}
                              progressPercent={row.progressPercent}
                              hoursWorked={row.hoursWorked}
                              loggedHours={row.loggedHours}
                              editable={false}
                            />
                          </td>
                          <td className="delay-cell">
                            <span className="sheet-text">{formatDelayReason(row.reasonForDelay)}</span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>

          <footer className="daily-status-report-footer">
            <p>Regards,</p>
            <p className="mt-1 font-bold text-[#0f172a]">Automation Team</p>
          </footer>
        </div>
      </div>
    </section>
  );
}
