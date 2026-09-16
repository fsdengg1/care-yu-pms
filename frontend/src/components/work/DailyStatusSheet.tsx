'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, EyeOff, ListPlus, Pencil, Search, Trash2 } from 'lucide-react';
import {
  DailyStatusPerson,
  DailyStatusRow,
  DailyStatusSubtask,
  DELAY_REASON_OPTIONS,
  deadlineCellClass,
  deadlineCellStyle,
  deadlineTone,
  parseSheetDate,
  appTodayIso,
} from '@/lib/dailyStatus';
import UserDropdown from './UserDropdown';
import DependencyMultiSelect from './DependencyMultiSelect';
import StatusDropdown from './StatusDropdown';
import RowMoreMenu from './RowMoreMenu';
import TaskAccessBadges from './TaskAccessBadges';
import { LoggedHoursCell, ProgressBarCell } from './LoggedHoursProgressCell';

export type SheetChip = 'all' | 'mine' | 'overdue' | 'critical' | 'due-today' | 'completed' | 'hold' | 'additional' | 'lead' | 'hidden';

const CHIPS: Array<{ id: SheetChip; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'mine', label: 'My Tasks' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'critical', label: 'Critical' },
  { id: 'due-today', label: 'Due Today' },
  { id: 'completed', label: 'Completed' },
  { id: 'hold', label: 'Hold' },
  { id: 'additional', label: 'Additional Tasks' },
  { id: 'lead', label: 'Lead Tasks' },
  { id: 'hidden', label: 'Hidden' },
];

function todayIso() {
  return appTodayIso();
}

function isoToInput(value?: string) {
  return parseSheetDate(value) || '';
}

function resizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.max(38, el.scrollHeight)}px`;
}

function AutoResizeTextarea({
  className,
  defaultValue,
  onBlur,
  placeholder,
}: {
  className?: string;
  defaultValue?: string;
  placeholder?: string;
  onBlur?: React.FocusEventHandler<HTMLTextAreaElement>;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    resizeTextarea(ref.current);
  }, [defaultValue]);

  return (
    <textarea
      ref={ref}
      defaultValue={defaultValue}
      className={className}
      placeholder={placeholder}
      onInput={(event) => resizeTextarea(event.currentTarget)}
      onBlur={onBlur}
    />
  );
}

type PatchBody = Record<string, unknown>;

export default function DailyStatusSheet({
  rows,
  people,
  projects: _projects,
  userId,
  canEditAll,
  canDelete,
  saved,
  selectedIds,
  onSelectedIds,
  onPatch,
  onExport,
  onDelete,
  onAddSubtask,
  onEditSubtask,
  onDeleteSubtask,
  workDate,
  onWorkDateChange,
  onEditUpdate,
  onHideRow,
  onHideSelected,
  onRestoreRow,
  onDeleteRow,
  onAccept,
  readOnly = false,
  period,
  phase,
  attendance = [],
}: {
  rows: DailyStatusRow[];
  people: DailyStatusPerson[];
  projects: Array<{ id: string; name: string }>;
  userId: string;
  canEditAll: boolean;
  canDelete: boolean;
  saved: boolean;
  selectedIds: string[];
  onSelectedIds: (ids: string[]) => void;
  onPatch: (id: string, body: PatchBody) => Promise<void>;
  onExport: (visible: DailyStatusRow[]) => void;
  onDelete: () => void;
  onAddSubtask?: (parentId: string) => void;
  onEditSubtask?: (subtask: DailyStatusSubtask, parentId: string) => void;
  onDeleteSubtask?: (subtask: DailyStatusSubtask, parentId: string) => void;
  workDate: string;
  onWorkDateChange: (date: string) => void;
  onEditUpdate?: (row: DailyStatusRow) => void;
  onHideRow?: (row: DailyStatusRow) => void;
  onHideSelected?: (ids: string[]) => void | Promise<void>;
  onRestoreRow?: (row: DailyStatusRow) => void;
  onDeleteRow?: (row: DailyStatusRow) => void;
  onAccept?: (row: DailyStatusRow) => Promise<void>;
  readOnly?: boolean;
  period?: 'morning' | 'evening';
  phase?: {
    timezone?: string;
    companyLeave?: boolean;
    companyLeaveMessage?: string;
  };
  attendance?: Array<{
    personId: string;
    person: string;
    onLeave?: boolean;
    halfDay?: string;
    permission?: { fromTime?: string; toTime?: string; reason?: string };
  }>;
}) {
  const [query, setQuery] = useState('');
  const [chip, setChip] = useState<SheetChip>('all');
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const today = workDate || todayIso();
  const morningBaselineLocked = false;

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  useEffect(() => {
    setExpandedIds((prev) => {
      const withChildren = rows.filter((row) => (row.subtasks || []).length > 0 || row.hasSubtasks).map((row) => row.id);
      return [...new Set([...prev, ...withChildren])];
    });
  }, [rows]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows
      .filter((row) => {
        if (chip === 'hidden') {
          if (!row.sheetHidden) return false;
        } else if (row.sheetHidden) {
          return false;
        }
        if (needle) {
          const hay = `${row.person} ${row.project} ${row.taskDescription} ${row.leadNumber || ''} ${row.leadName || ''}`.toLowerCase();
          if (!hay.includes(needle)) return false;
        }
        if (chip === 'mine') return row.personId === userId;
        if (chip === 'overdue') return Boolean(row.overdue);
        if (chip === 'critical') return Boolean(row.overdue && (row.status === 'On Hold' || row.blocked));
        if (chip === 'due-today') return isoToInput(row.deadlineIso || row.deadline) === today;
        if (chip === 'completed') return row.status === 'Completed';
        if (chip === 'hold') return row.status === 'On Hold';
        if (chip === 'additional') return row.isAdditional;
        if (chip === 'lead') return Boolean(row.isLeadTask);
        return true;
      })
      .slice()
      .sort((a, b) => a.person.localeCompare(b.person) || a.project.localeCompare(b.project) || a.id.localeCompare(b.id));
  }, [rows, query, chip, userId, today]);

  const groups = useMemo(() => {
    const next: Array<{ personId: string; person: string; rows: DailyStatusRow[] }> = [];
    for (const row of visible) {
      const last = next[next.length - 1];
      if (last && last.personId === row.personId) last.rows.push(row);
      else next.push({ personId: row.personId, person: row.person, rows: [row] });
    }
    return next;
  }, [visible]);

  /** Keep everyone on the sheet (e.g. Aakash / Arun) selectable even if the API list is incomplete. */
  const pickerPeople = useMemo(() => {
    const byId = new Map(people.map((person) => [person.id, person]));
    for (const row of rows) {
      if (row.personId && !byId.has(row.personId)) {
        byId.set(row.personId, {
          id: row.personId,
          name: row.person,
          displayName: row.person,
          email: '',
          role_name: '',
        });
      }
      for (const depId of row.dependencyIds || []) {
        if (!depId || byId.has(depId)) continue;
        byId.set(depId, {
          id: depId,
          name: depId,
          displayName: depId,
          email: '',
          role_name: '',
        });
      }
    }
    return [...byId.values()].sort((a, b) =>
      (a.displayName || a.name).localeCompare(b.displayName || b.name)
    );
  }, [people, rows]);

  const allSelected = visible.length > 0 && visible.every((row) => selectedIds.includes(row.id));
  const selectedVisible = selectedIds.filter((id) => visible.some((row) => row.id === id)).length;

  const handleRowSelect = (rowId: string, rowIndex: number, checked: boolean, shiftKey: boolean) => {
    if (shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, rowIndex);
      const end = Math.max(lastSelectedIndex, rowIndex);
      const rangeIds = visible.slice(start, end + 1).map((row) => row.id);
      if (checked) {
        onSelectedIds([...new Set([...selectedIds, ...rangeIds])]);
      } else {
        const rangeSet = new Set(rangeIds);
        onSelectedIds(selectedIds.filter((id) => !rangeSet.has(id)));
      }
    } else if (checked) {
      onSelectedIds(selectedIds.includes(rowId) ? selectedIds : [...selectedIds, rowId]);
    } else {
      onSelectedIds(selectedIds.filter((id) => id !== rowId));
    }
    setLastSelectedIndex(rowIndex);
  };
  const canEditRow = (row: DailyStatusRow) => {
    if (readOnly) return false;
    if (row.rowKind === 'leave' || row.rowKind === 'permission') return false;
    if (row.canEdit !== undefined) return row.canEdit;
    return canEditAll || row.personId === userId;
  };
  const showSelect = !readOnly;
  const tableRef = useRef<HTMLTableElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      tableRef.current?.querySelectorAll('textarea.sheet-textarea').forEach((node) => {
        resizeTextarea(node as HTMLTextAreaElement);
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [visible]);

  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate = selectedVisible > 0 && !allSelected;
  }, [selectedVisible, allSelected]);

  return (
    <section className={`daily-status-workspace min-w-0 overflow-hidden rounded-xl ${readOnly ? 'daily-status-workspace-readonly' : ''}`}>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#e2e8f0] px-3 py-2">
        {phase?.companyLeave ? (
          <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
            Company leave — no Daily Work Updates
          </span>
        ) : (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-700">
            {period === 'evening' ? 'Evening update' : 'Morning update'}
          </span>
        )}
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-[#94a3b8]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search employee or project..."
            className="w-full rounded-md border border-[#cbd5e1] bg-white py-1.5 pl-8 pr-3 text-xs text-[#0f172a] placeholder-[#94a3b8]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {CHIPS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setChip(item.id)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                chip === item.id
                  ? 'border-[#0f172a] bg-[#0f172a] text-white'
                  : 'border-[#cbd5e1] bg-white text-[#475569] hover:border-[#94a3b8]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onExport(visible)}
            className="inline-flex items-center gap-1 rounded-md border border-[#cbd5e1] px-2 py-1.5 text-[11px] font-bold text-[#0f172a] hover:border-[#0f172a]"
          >
            <Download className="h-3.5 w-3.5" /> Excel
          </button>
          {!readOnly && selectedIds.length > 0 && (
            <span className="text-[11px] font-semibold text-[#0f172a]">{selectedIds.length} selected</span>
          )}
          {!readOnly && (onHideSelected || onHideRow) && (
            <button
              type="button"
              disabled={selectedIds.length === 0}
              onClick={() => {
                if (onHideSelected) {
                  void onHideSelected(selectedIds);
                  return;
                }
                for (const id of selectedIds) {
                  const row = rows.find((item) => item.id === id);
                  if (row) onHideRow?.(row);
                }
              }}
              className="inline-flex items-center gap-1 rounded-md border border-[#cbd5e1] px-2 py-1.5 text-[11px] font-bold text-[#0f172a] hover:border-[#0f172a] disabled:opacity-40"
              title={
                selectedIds.length === 0
                  ? 'Select one or more tasks to hide'
                  : `Hide ${selectedIds.length} selected task${selectedIds.length === 1 ? '' : 's'}`
              }
            >
              <EyeOff className="h-3.5 w-3.5" /> Hide
            </button>
          )}
          {!readOnly && (
            <button
              type="button"
              disabled={!canDelete || selectedIds.length === 0}
              onClick={onDelete}
              className="inline-flex items-center gap-1 rounded-md border border-[#cbd5e1] px-2 py-1.5 text-[11px] font-bold text-[#0f172a] hover:border-rose-500 disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3 px-3 py-1.5 text-[11px] text-[#64748b]">
        <span>
          {!readOnly && selectedVisible ? `${selectedVisible} selected · ` : ''}
          {visible.length} rows
        </span>
        {saved && <span className="font-semibold text-emerald-700">Saved</span>}
      </div>

      <div className="daily-status-table-wrap">
        <table ref={tableRef} className="daily-status-sheet">
          <colgroup>
            {showSelect && <col className="col-check" />}
            <col className="col-person" />
            <col className="col-project" />
            <col className="col-task-desc" />
            <col className="col-deps" />
            <col className="col-status" />
            <col className="col-date" />
            <col className="col-deadline" />
            <col className="col-progress" />
            <col className="col-hours" />
            <col className="col-delay" />
            {!readOnly && <col className="col-actions" />}
          </colgroup>
          <thead>
            <tr>
              {showSelect && (
                <th>
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allSelected}
                    onChange={(event) => {
                      onSelectedIds(event.target.checked ? visible.map((row) => row.id) : []);
                      setLastSelectedIndex(null);
                    }}
                    aria-label="Select all visible rows"
                  />
                </th>
              )}
              <th>Person</th>
              <th>Project</th>
              <th>Task Description</th>
              <th>Dependencies</th>
              <th>Status</th>
              <th>Start Date</th>
              <th>Task Deadline</th>
              <th>Progress</th>
              <th>Logged Hours</th>
              <th>Reason For Delay</th>
              {!readOnly && <th aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={(showSelect ? 11 : 10) + (readOnly ? 0 : 1)} className="py-10 text-center text-[#64748b]">
                  {phase?.companyLeave
                    ? 'Company leave day — Daily Work Updates are not shown (Sunday or 2nd/4th Saturday).'
                    : 'No tasks found.'}
                </td>
              </tr>
            )}
            {(() => {
              let flatIndex = 0;
              return groups.map((group) =>
                group.rows.map((row, index) => {
                  const rowIndex = flatIndex++;
                  const editable = canEditRow(row);
                  const baselineEditable = editable && !morningBaselineLocked;
                  const canEditTaskMeta = Boolean(row.canEditBaseline) && !morningBaselineLocked && !readOnly;
                  const canEditDescription = !readOnly && !morningBaselineLocked && (editable || Boolean(row.canEditBaseline));
                  const tone = deadlineTone(row.status, row.deadlineIso || row.deadline, today);
                  const personAttendance = attendance.find((item) => item.personId === group.personId);
                  return (
                    <tr key={row.id} className={row.isLeadTask ? 'lead-task' : undefined}>
                      {showSelect && (
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(row.id)}
                            onChange={(event) =>
                              handleRowSelect(row.id, rowIndex, event.target.checked, (event.nativeEvent as MouseEvent).shiftKey)
                            }
                            aria-label={`Select ${row.person} task`}
                          />
                        </td>
                      )}
                    {index === 0 && (
                      <td className="person-cell" rowSpan={group.rows.length}>
                        {canEditAll && !readOnly && !morningBaselineLocked ? (
                          <UserDropdown
                            variant="sheet"
                            people={pickerPeople}
                            value={group.personId}
                            fallbackLabel={group.person}
                            onChange={async (id) => {
                              const ids = group.rows.map((item) => item.id);
                              for (const taskId of ids) {
                                await onPatch(taskId, { assigned_to_id: id });
                              }
                            }}
                          />
                        ) : (
                          group.person
                        )}
                        {row.attendanceLabel || personAttendance?.onLeave ? (
                          <div className="mt-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                            {row.attendanceLabel || 'On Leave'}
                          </div>
                        ) : personAttendance?.halfDay ? (
                          <div className="mt-1 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-800">
                            Half day ({personAttendance.halfDay === 'SECOND_HALF' ? 'second' : 'first'})
                          </div>
                        ) : personAttendance?.permission ? (
                          <div className="mt-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                            Permission {personAttendance.permission.fromTime}–{personAttendance.permission.toTime}
                          </div>
                        ) : null}
                      </td>
                    )}
                    <td className="project-cell">
                    {row.isLeadTask ? (
                      <div className="space-y-1">
                        <TaskAccessBadges
                          leadTask
                          acceptanceStatus={row.acceptanceStatus}
                          createdByName={row.createdByName}
                          viewOnly={!editable && row.acceptanceStatus === 'REQUESTED'}
                        />
                        <span className="sheet-text">{row.project || '—'}</span>
                      </div>
                    ) : baselineEditable ? (
                      <AutoResizeTextarea
                        key={`${row.id}-${row.project}`}
                        defaultValue={row.project === '—' ? '' : row.project}
                        className="sheet-textarea sheet-project-field"
                        onBlur={(event) => {
                          const value = event.target.value.trim();
                          const current = row.project === '—' ? '' : row.project;
                          if (value !== current) void onPatch(row.id, { project_name: value });
                        }}
                      />
                    ) : (
                      <span className="sheet-text">{row.project || '—'}</span>
                    )}
                  </td>
                  <td className="task-desc-cell">
                    <div className="flex items-start gap-1.5">
                      {(row.hasSubtasks || (row.subtasks && row.subtasks.length > 0)) ? (
                        <button
                          type="button"
                          onClick={() => toggleExpand(row.id)}
                          className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[#cbd5e1] bg-white text-[11px] font-bold text-[#0f172a] hover:border-[#0f172a]"
                          title={expandedIds.includes(row.id) ? 'Collapse subtasks' : 'Expand subtasks'}
                          aria-label={expandedIds.includes(row.id) ? 'Collapse subtasks' : 'Expand subtasks'}
                        >
                          {expandedIds.includes(row.id) ? '−' : '+'}
                        </button>
                      ) : (
                        <span className="mt-0.5 inline-block h-5 w-5 shrink-0" aria-hidden />
                      )}
                      <div className="min-w-0 flex-1">
                        {row.isLeadTask && (
                          <div className="mb-1">
                            <TaskAccessBadges
                              leadTask
                              acceptanceStatus={row.acceptanceStatus}
                              createdByName={row.createdByName}
                              viewOnly={!editable && row.acceptanceStatus === 'REQUESTED'}
                            />
                            {row.leadNumber ? (
                              <span className="ml-1.5 text-[10px] font-bold" style={{ color: 'var(--lead-task-badge-fg)' }}>
                                {row.leadNumber}
                              </span>
                            ) : null}
                          </div>
                        )}
                        <div className="flex items-start gap-1">
                          <div className="min-w-0 flex-1">
                            {canEditDescription ? (
                              <AutoResizeTextarea
                                key={row.taskDescription}
                                defaultValue={row.taskDescription}
                                className="sheet-textarea sheet-task-field"
                                onBlur={(event) => {
                                  const value = event.target.value.trim();
                                  if (value && value !== row.taskDescription) {
                                    void onPatch(row.id, { description: value, title: value.slice(0, 120) });
                                  }
                                }}
                              />
                            ) : (
                              <span className="sheet-text sheet-task-field">{row.taskDescription}</span>
                            )}
                          </div>
                          {onAddSubtask && baselineEditable && (
                            <button
                              type="button"
                              onClick={() => onAddSubtask(row.id)}
                              className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[#94a3b8] bg-white text-[#0f766e] hover:border-[#0f766e] hover:bg-[#ecfdf5]"
                              title="Add subtask"
                              aria-label="Add subtask"
                            >
                              <ListPlus className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                        {row.rowKind !== 'leave' && (
                          <div className="mt-2 rounded-md border border-[#e2e8f0] bg-[#f8fafc] px-2 py-1.5">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748b]">
                              {period === 'evening' ? 'Evening work completed' : 'Morning work completed'}
                            </div>
                            {editable ? (
                              <AutoResizeTextarea
                                key={`${row.id}-${period}-work`}
                                defaultValue={row.currentUpdate || ''}
                                className="sheet-textarea mt-1"
                                placeholder={
                                  period === 'evening'
                                    ? 'What did you complete this evening?'
                                    : 'What did you complete this morning?'
                                }
                                onBlur={(event) => {
                                  const value = event.target.value.trim();
                                  if (value !== (row.currentUpdate || '').trim()) {
                                    void onPatch(row.id, { work_completed: value });
                                  }
                                }}
                              />
                            ) : (
                              <p className="mt-1 whitespace-pre-wrap text-[11px] text-[#334155]">
                                {(row.currentUpdate || '').trim() || '—'}
                              </p>
                            )}
                          </div>
                        )}
                        {expandedIds.includes(row.id) && (row.subtasks || []).length > 0 && (
                          <ul className="mt-1.5 space-y-1 border-l-2 border-[#cbd5e1] pl-2">
                            {(row.subtasks || []).map((sub) => {
                              const canManageSub =
                                !readOnly &&
                                (canEditAll || sub.assignedToId === userId || row.personId === userId);
                              return (
                                <li key={sub.id} className="flex items-start justify-between gap-2 text-[11px] text-[#334155]">
                                  <div className="min-w-0 flex-1">
                                    <span className="font-semibold text-[#0f172a]">└ {sub.title}</span>
                                    {sub.assignedTo ? (
                                      <span className="ml-1.5 text-[10px] text-[#64748b]">· {sub.assignedTo}</span>
                                    ) : null}
                                    <span className="ml-1.5 rounded border border-[#e2e8f0] bg-[#f8fafc] px-1.5 py-0.5 text-[10px] font-bold">
                                      {sub.status}
                                    </span>
                                    <span className="ml-1 text-[#64748b]">{sub.progressPercent}%</span>
                                  </div>
                                  {canManageSub && (onEditSubtask || onDeleteSubtask) && (
                                    <div className="flex shrink-0 items-center gap-1">
                                      {onEditSubtask && (
                                        <button
                                          type="button"
                                          onClick={() => onEditSubtask(sub, row.id)}
                                          className="inline-flex h-5 w-5 items-center justify-center rounded border border-[#cbd5e1] bg-white text-[#0f172a] hover:border-[#0f766e]"
                                          title="Edit subtask"
                                          aria-label="Edit subtask"
                                        >
                                          <Pencil className="h-3 w-3" />
                                        </button>
                                      )}
                                      {onDeleteSubtask && (
                                        <button
                                          type="button"
                                          onClick={() => onDeleteSubtask(sub, row.id)}
                                          className="inline-flex h-5 w-5 items-center justify-center rounded border border-[#fecaca] bg-white text-[#b91c1c] hover:border-[#b91c1c]"
                                          title="Delete subtask"
                                          aria-label="Delete subtask"
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="deps-cell">
                    {baselineEditable ? (
                      <DependencyMultiSelect
                        variant="sheet"
                        people={pickerPeople.filter((person) => person.id !== row.personId)}
                        value={row.dependencyIds}
                        onChange={(ids) => void onPatch(row.id, { depends_on_ids: ids })}
                      />
                    ) : (
                      row.dependencies
                    )}
                  </td>
                  <td className="status-cell">
                    {row.rowKind === 'leave' ? (
                      <span className="inline-flex rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                        On Leave
                      </span>
                    ) : (
                      <StatusDropdown
                        variant="sheet"
                        value={row.status}
                        disabled={!editable}
                        onChange={(status) => void onPatch(row.id, { status })}
                      />
                    )}
                  </td>
                  <td className="date-cell">
                    {canEditTaskMeta ? (
                      <input
                        type="date"
                        className="sheet-input sheet-date-input"
                        value={isoToInput(row.startDateIso || row.startDate)}
                        onChange={(event) => void onPatch(row.id, { start_date: event.target.value || '' })}
                      />
                    ) : (
                      row.startDate || '—'
                    )}
                  </td>
                  <td className={`date-cell tone-cell ${deadlineCellClass(tone)}`} style={deadlineCellStyle(tone)}>
                    {canEditTaskMeta ? (
                      <input
                        type="date"
                        className="sheet-input sheet-date-input"
                        style={{ color: 'inherit', fontWeight: 'inherit', background: 'transparent' }}
                        value={isoToInput(row.deadlineIso || row.deadline)}
                        onChange={(event) => void onPatch(row.id, { due_date: event.target.value || '' })}
                      />
                    ) : (
                      row.deadline
                    )}
                  </td>
                  <td className="hours-cell">
                    <ProgressBarCell
                      status={row.status}
                      progressPercent={row.progressPercent}
                      editable={editable}
                      onProgressCommit={(percent) =>
                        void onPatch(row.id, {
                          progress_percent: percent,
                          progress_manual_override: true,
                        })
                      }
                    />
                  </td>
                  <td className="hours-cell">
                    <LoggedHoursCell
                      hoursWorked={row.hoursWorked}
                      loggedHours={row.loggedHours}
                      editable={editable}
                      onHoursCommit={(hours) => void onPatch(row.id, { hours_worked: hours, work_date: workDate })}
                    />
                  </td>
                  <td className="delay-cell">
                    {row.rowKind === 'leave' ? (
                      <span className="sheet-text">—</span>
                    ) : editable ? (
                      <div className="space-y-1">
                        {row.delayReasonRequired ? (
                          <div className="text-[10px] font-bold text-rose-700">Reason for Delay *</div>
                        ) : null}
                        <select
                          className="sheet-input"
                          value={
                            DELAY_REASON_OPTIONS.includes(row.reasonForDelay as (typeof DELAY_REASON_OPTIONS)[number])
                              ? row.reasonForDelay
                              : row.reasonForDelay && row.reasonForDelay !== 'No delay' && row.reasonForDelay !== '—'
                                ? row.reasonForDelay.startsWith('Other')
                                  ? 'Other'
                                  : row.reasonForDelay
                                : ''
                          }
                          onChange={(event) => {
                            const value = event.target.value;
                            if (value === 'Other') return;
                            void onPatch(row.id, { delay_reason: value });
                          }}
                        >
                          <option value="">{row.delayReasonRequired ? 'Select reason' : 'No delay'}</option>
                          {DELAY_REASON_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                        {row.reasonForDelay?.startsWith('Other') || row.delayReasonRequired ? (
                          <AutoResizeTextarea
                            key={`${row.id}-delay-other`}
                            defaultValue={row.reasonForDelay?.startsWith('Other') ? row.reasonForDelay.replace(/^Other:\s*/i, '') : ''}
                            className="sheet-textarea"
                            placeholder="Enter reason"
                            onBlur={(event) => {
                              const value = event.target.value.trim();
                              if (!value) return;
                              void onPatch(row.id, { delay_reason: 'Other', delay_reason_other: value });
                            }}
                          />
                        ) : null}
                      </div>
                    ) : (
                      <span className="sheet-text">{row.reasonForDelay}</span>
                    )}
                    </td>
                    {!readOnly && (
                      <td className="actions-cell">
                        {row.canAccept && onAccept ? (
                          <button
                            type="button"
                            onClick={() => onAccept(row)}
                            className="rounded-md bg-emerald-700 px-2 py-1 text-[10px] font-bold text-white hover:bg-emerald-600"
                          >
                            Accept Task
                          </button>
                        ) : editable ? (
                          <RowMoreMenu
                            variant="sheet"
                            items={[
                              {
                                id: 'edit',
                                label: 'Edit Update',
                                onSelect: () => onEditUpdate?.(row),
                                disabled: !onEditUpdate,
                              },
                              row.sheetHidden
                                ? {
                                    id: 'restore',
                                    label: 'Restore Task',
                                    onSelect: () => onRestoreRow?.(row),
                                    disabled: !onRestoreRow,
                                  }
                                : {
                                    id: 'hide',
                                    label: 'Hide Task',
                                    onSelect: () => onHideRow?.(row),
                                    disabled: !onHideRow,
                                  },
                              {
                                id: 'delete',
                                label: 'Delete Task',
                                onSelect: () => onDeleteRow?.(row),
                                danger: true,
                                disabled: !onDeleteRow || !canDelete,
                              },
                            ]}
                          />
                        ) : null}
                      </td>
                    )}
                  </tr>
                );
              })
            );
            })()}
          </tbody>
        </table>
      </div>
    </section>
  );
}
