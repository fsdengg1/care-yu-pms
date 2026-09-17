'use client';

import { useRouter } from '@/lib/navigation';
import React, { Suspense, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, FileText, GitCompare, ListPlus, Moon, Plus, RefreshCw, Save, Sun } from 'lucide-react';
import { StorageService } from '@/lib/storage';
import { DailyStatusApi } from '@/lib/dailyStatusApi';
import { TasksApi } from '@/lib/tasksApi';
import { UsersApi, directoryStatus } from '@/lib/usersApi';
import { canAddDailyWorkTask, canCreateWorkTask, canEditDailySheet } from '@/lib/rbac';
import {
  CompareItem,
  DailyStatusPerson,
  DailyStatusRow,
  DailyStatusSubtask,
  appTodayIso,
  formatSheetDate,
  previousWorkingDay,
  shiftWorkDate,
} from '@/lib/dailyStatus';
import { formatEmployeeDisplayName } from '@/lib/people';
import { User } from '@/lib/types';
import ConfirmDialog from '@/components/work/ConfirmDialog';
import CompareView from '@/components/work/CompareView';
import DailyStatusSheet from '@/components/work/DailyStatusSheet';
import AddSubtaskForm, { EditableSubtask, subtaskToEditable } from '@/components/work/AddSubtaskForm';
import CreateTaskForm from '@/components/work/CreateTaskForm';
import UserDropdown from '@/components/work/UserDropdown';

function canSaveEmailSnapshot(user: User | null | undefined) {
  if (!user) return false;
  return ['CEO', 'ENG_DIRECTOR', 'PROJECT_MANAGER', 'SYSTEM_ADMIN'].includes(user.role_code);
}

function friendlyError(error: unknown, fallback: string) {
  const text = error instanceof Error ? error.message : String(error || '');
  if (!text || /axios|sql|undefined|json/i.test(text)) return fallback;
  return text;
}

export default function DailyWorkUpdatesPage() {
  return (
    <Suspense fallback={<div className="text-xs text-slate-400">Loading daily work updates…</div>}>
      <DailyWorkUpdatesInner />
    </Suspense>
  );
}

function userToSheetPerson(user: User): DailyStatusPerson {
  return {
    id: user.id,
    name: user.name,
    displayName: formatEmployeeDisplayName(user),
    email: user.email,
    role_name: user.role_name,
  };
}

function DailyWorkUpdatesInner() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [rows, setRows] = useState<DailyStatusRow[]>([]);
  const [people, setPeople] = useState<DailyStatusPerson[]>([]);
  const [activePeople, setActivePeople] = useState<DailyStatusPerson[]>([]);
  const [personFilter, setPersonFilter] = useState('');
  const [sheetProjects, setSheetProjects] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareBusy, setCompareBusy] = useState(false);
  const [compareAgainst, setCompareAgainst] = useState('');
  const [compare, setCompare] = useState<{
    items: CompareItem[];
    available: boolean;
    date?: string;
    previousDate?: string;
    currentDate?: string;
    message?: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const pendingPatchesRef = React.useRef<Promise<unknown>[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [subtaskOpen, setSubtaskOpen] = useState(false);
  const [subtaskParentId, setSubtaskParentId] = useState<string | undefined>(undefined);
  const [editingSubtask, setEditingSubtask] = useState<EditableSubtask | null>(null);
  const [confirmSubtaskDelete, setConfirmSubtaskDelete] = useState<DailyStatusSubtask | null>(null);
  const [deleteRow, setDeleteRow] = useState<DailyStatusRow | null>(null);
  const [workDate, setWorkDate] = useState(appTodayIso);
  const [period, setPeriod] = useState<'morning' | 'evening'>('morning');
  const [phase, setPhase] = useState<{
    timezone?: string;
    companyLeave?: boolean;
    companyLeaveMessage?: string;
  } | null>(null);
  const [attendance, setAttendance] = useState<
    Array<{ personId: string; person: string; onLeave?: boolean; halfDay?: string; permission?: { fromTime?: string; toTime?: string; reason?: string } }>
  >([]);

  const canManageTasks = canCreateWorkTask(user);
  const canEditSheet = canEditDailySheet(user);
  const canAddTask = canAddDailyWorkTask(user);
  const companyLeave = Boolean(phase?.companyLeave);
  const pickerPeople = activePeople.length ? activePeople : people;
  const today = appTodayIso();

  const changeWorkDate = (date: string) => {
    setWorkDate(date || today);
  };

  const loadCompare = async (date = workDate, against?: string) => {
    setCompareBusy(true);
    setError(null);
    try {
      const result = await DailyStatusApi.compare(date, against);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setCompare(result.data);
      setCompareAgainst(result.data.previousDate || previousWorkingDay(date));
      setCompareOpen(true);
    } finally {
      setCompareBusy(false);
    }
  };

  const lastSheetLoadAt = React.useRef(0);

  const loadSheet = async (date = workDate, activePeriod = period, options?: { silent?: boolean }) => {
    const sheet = await DailyStatusApi.sheet(date, activePeriod);
    if (!sheet.ok) {
      if (!options?.silent) {
        setError(sheet.message || 'Unable to load daily work updates.');
      }
      return;
    }
    lastSheetLoadAt.current = Date.now();
    setError(null);
    setRows(sheet.rows);
    setPeople(sheet.people);
    setSheetProjects(sheet.projects);
    setPhase(sheet.phase || null);
    setAttendance(sheet.attendance || []);
  };

  useEffect(() => {
    const current = StorageService.getCurrentUser();
    if (!current) return;
    setUser(current);
    const initialDate = appTodayIso();
    setWorkDate(initialDate);
    void UsersApi.list().then((result) => {
      if (!result.ok) return;
      setActivePeople(
        result.users
          .filter((item) => {
            const account = directoryStatus(item);
            return item.status === 'ACTIVE' && !account.pending && account.key !== 'INACTIVE';
          })
          .map(userToSheetPerson)
      );
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    let focusTimer: number | undefined;
    const refresh = (silent = false) => {
      if (pendingPatchesRef.current.length) return;
      void loadSheet(workDate, period, { silent }).catch((err) => {
        if (!silent) setError(friendlyError(err, 'Unable to load daily work updates.'));
      });
    };
    refresh(false);
    const onFocus = () => {
      window.clearTimeout(focusTimer);
      focusTimer = window.setTimeout(() => {
        if (Date.now() - lastSheetLoadAt.current < 8000) return;
        refresh(true);
      }, 4000);
    };
    const onSaved = () => {
      if (Date.now() - lastSheetLoadAt.current < 2000) return;
      refresh(false);
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('careyu-daily-update-saved', onSaved);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('careyu-daily-update-saved', onSaved);
    };
  }, [user, workDate, period]);

  const refreshSheet = async () => {
    await loadSheet(workDate, period);
    setSelectedIds([]);
  };

  const flashSaved = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  };

  const notifyDailyUpdateSaved = () => {
    window.dispatchEvent(new CustomEvent('careyu-daily-update-saved', { detail: { workDate, period } }));
  };

  const saveUpdates = async () => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
      await new Promise((resolve) => window.setTimeout(resolve, 50));
      const pending = pendingPatchesRef.current.splice(0, pendingPatchesRef.current.length);
      if (pending.length) await Promise.all(pending);

      if (canSaveEmailSnapshot(user)) {
        const result = await DailyStatusApi.snapshot(period, workDate);
        if (!result.ok) {
          setError(result.message || 'Unable to save daily work updates.');
          return;
        }
        await loadSheet(workDate, period);
        setNotice(`${period === 'morning' ? 'Morning' : 'Evening'} updates saved.`);
      } else {
        await loadSheet(workDate, period);
        setNotice('Updates saved.');
      }
      flashSaved();
      notifyDailyUpdateSaved();
    } catch (err) {
      setError(friendlyError(err, 'Unable to save daily work updates. Existing data was kept.'));
    } finally {
      setBusy(false);
    }
  };

  const openAddSubtask = (parentId?: string) => {
    setEditingSubtask(null);
    setSubtaskParentId(parentId);
    setSubtaskOpen(true);
  };

  const openEditSubtask = (sub: DailyStatusSubtask, parentId: string) => {
    setEditingSubtask(subtaskToEditable(sub, parentId));
    setSubtaskParentId(parentId);
    setSubtaskOpen(true);
  };

  const closeSubtaskForm = () => {
    setSubtaskOpen(false);
    setSubtaskParentId(undefined);
    setEditingSubtask(null);
  };

  const addTask = () => {
    setError(null);
    setCreateOpen(true);
  };

  const handleSelectedIds = (ids: string[]) => {
    setSelectedIds(ids);
    const personIds = [...new Set(ids.map((id) => rows.find((row) => row.id === id)?.personId).filter(Boolean))] as string[];
    if (personIds.length === 1) setPersonFilter(personIds[0]);
  };

  const exportCsv = (visibleRows: DailyStatusRow[]) => {
    const header = [
      'PERSON',
      'PROJECT',
      'TASK DESCRIPTION',
      'DEPENDENCIES',
      'STATUS',
      'START DATE',
      'TASK DEADLINE',
      'PROGRESS',
      'LOGGED HOURS',
      'REASON FOR DELAY',
    ];
    const lines = [
      header.join(','),
      ...visibleRows.map((row) =>
        [
          row.person,
          row.project,
          row.taskDescription,
          row.dependencies,
          row.status,
          row.startDate || '—',
          row.deadline,
          `${row.progressPercent ?? 0}%`,
          row.loggedHours || '0.0 hrs',
          row.reasonForDelay,
        ]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `daily-status-${workDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!user) return null;

  const subtaskParents = canEditSheet ? rows : rows.filter((row) => row.personId === user.id);
  const assignedToId = canEditSheet ? personFilter || undefined : user.id;

  return (
    <div className="flex min-h-0 min-w-0 flex-col overflow-x-hidden text-xs">
      <div className="mb-3 shrink-0 rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-cyan-400">
          <FileText className="h-3.5 w-3.5" /> Daily Work Updates
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Date</div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => changeWorkDate(shiftWorkDate(workDate, -1))}
                className="rounded-md border border-slate-700 p-1.5 text-slate-200 hover:border-cyan-600 disabled:opacity-50"
                title="Previous day"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <input
                type="date"
                value={workDate}
                onChange={(event) => changeWorkDate(event.target.value || today)}
                className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs font-semibold text-slate-100"
                aria-label="Work date"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => changeWorkDate(shiftWorkDate(workDate, 1))}
                className="rounded-md border border-slate-700 p-1.5 text-slate-200 hover:border-cyan-600 disabled:opacity-50"
                title="Next day"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => changeWorkDate(today)}
                className={`rounded-md px-2.5 py-1.5 font-bold ${
                  workDate === today ? 'bg-cyan-600 text-white' : 'border border-slate-700 text-slate-100 hover:border-cyan-600'
                }`}
              >
                Today
              </button>
            </div>
          </div>

          {canEditSheet && (
            <div className="min-w-[200px]">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Person</div>
              <UserDropdown
                people={pickerPeople}
                value={personFilter}
                onChange={(id) => {
                  setPersonFilter(id);
                  setError(null);
                }}
                placeholder="All employees"
                allowEmpty
              />
            </div>
          )}

          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Period</div>
            <div className="inline-flex rounded-md border border-slate-700 p-0.5">
              <button
                type="button"
                disabled={busy || companyLeave}
                onClick={() => setPeriod('morning')}
                className={`inline-flex items-center gap-1 rounded px-3 py-1.5 font-bold ${
                  period === 'morning' ? 'bg-amber-500 text-slate-950' : 'text-slate-200 hover:text-white'
                }`}
              >
                <Sun className="h-3.5 w-3.5" /> Morning
              </button>
              <button
                type="button"
                disabled={busy || companyLeave}
                onClick={() => setPeriod('evening')}
                className={`inline-flex items-center gap-1 rounded px-3 py-1.5 font-bold ${
                  period === 'evening' ? 'bg-indigo-600 text-white' : 'text-slate-200 hover:text-white'
                }`}
              >
                <Moon className="h-3.5 w-3.5" /> Evening
              </button>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap gap-1.5">
            {canAddTask && !companyLeave && (
              <button
                type="button"
                disabled={busy}
                onClick={() => addTask()}
                className="inline-flex items-center gap-1 rounded-md bg-cyan-600 px-2.5 py-2 font-bold text-white hover:bg-cyan-500 disabled:opacity-60"
              >
                <Plus className="h-3.5 w-3.5" /> Add Task
              </button>
            )}
            {canAddTask && !companyLeave && (
              <button
                type="button"
                disabled={busy || subtaskParents.length === 0}
                onClick={() => openAddSubtask()}
                className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2.5 py-1.5 font-bold text-slate-100 hover:border-cyan-600 disabled:opacity-60"
                title={subtaskParents.length === 0 ? 'Create a parent task first' : 'Add a subtask'}
              >
                <ListPlus className="h-3.5 w-3.5" /> Add Subtask
              </button>
            )}
            <button
              type="button"
              disabled={compareBusy || companyLeave}
              onClick={() => void loadCompare(workDate)}
              className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2.5 py-1.5 font-bold text-slate-100 hover:border-cyan-600 disabled:opacity-50"
            >
              <GitCompare className="h-3.5 w-3.5" /> Compare
            </button>
            {!companyLeave && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveUpdates()}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 font-bold text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                <Save className="h-3.5 w-3.5" /> Save
              </button>
            )}
            <button type="button" onClick={() => void refreshSheet()} className="rounded-md border border-slate-700 p-1.5 text-slate-300 hover:border-cyan-600" title="Refresh">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          {formatSheetDate(workDate)} · {period === 'morning' ? 'Morning' : 'Evening'} update. Morning and Evening are stored separately for the same task.
        </p>
      </div>

      {error && <div className="mb-3 shrink-0 rounded-lg border border-rose-900 bg-rose-950/40 px-3 py-2 text-rose-300">{error}</div>}
      {notice && <div className="mb-3 shrink-0 rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-emerald-200">{notice}</div>}
      {companyLeave && (
        <div className="mb-3 shrink-0 rounded-lg border border-amber-700 bg-amber-950/40 px-3 py-2 text-amber-100">
          {phase?.companyLeaveMessage ||
            'Company leave day (Sunday or 2nd/4th Saturday). Daily Work Updates are hidden and email reports are not sent.'}
        </div>
      )}

      <DailyStatusSheet
        rows={personFilter ? rows.filter((row) => row.personId === personFilter) : rows}
        people={people}
        projects={sheetProjects}
        userId={user.id}
        canEditAll={canEditSheet}
        canDelete={(canEditSheet || canManageTasks) && !companyLeave}
        saved={saved}
        selectedIds={selectedIds}
        onSelectedIds={handleSelectedIds}
        workDate={workDate}
        period={period}
        phase={phase || undefined}
        attendance={attendance}
        onWorkDateChange={changeWorkDate}
        readOnly={companyLeave}
        onAddSubtask={canAddTask && !companyLeave ? openAddSubtask : undefined}
        onEditSubtask={canAddTask && !companyLeave ? openEditSubtask : undefined}
        onDeleteSubtask={
          canAddTask && !companyLeave
            ? (sub) => {
                setConfirmSubtaskDelete(sub);
              }
            : undefined
        }
        onEditUpdate={(row) => router.push(`/daily-updates/new?assignment=${encodeURIComponent(row.id)}`)}
        onHideRow={async (row) => {
          setError(null);
          const id = row.id;
          setRows((prev) => prev.map((item) => (item.id === id ? { ...item, sheetHidden: true } : item)));
          setSelectedIds((prev) => prev.filter((item) => item !== id));
          const result = await DailyStatusApi.updateRow(id, { sheet_hidden: true, work_date: workDate, period });
          if (!result.ok) {
            setError(result.message || 'Unable to hide this task.');
            await loadSheet(workDate, period);
            return;
          }
          setRows(result.data.rows.map((item) => (item.id === id ? { ...item, sheetHidden: true } : item)));
          setNotice('Only that task was hidden. Open Hidden to restore it.');
        }}
        onHideSelected={async (ids) => {
          if (!ids.length) return;
          setError(null);
          const idSet = new Set(ids);
          setRows((prev) => prev.map((item) => (idSet.has(item.id) ? { ...item, sheetHidden: true } : item)));
          setSelectedIds([]);
          for (const id of ids) {
            const result = await DailyStatusApi.updateRow(id, { sheet_hidden: true, work_date: workDate, period });
            if (!result.ok) {
              setError(result.message || 'Unable to hide selected tasks.');
              await loadSheet(workDate, period);
              return;
            }
          }
          setNotice(
            ids.length === 1
              ? 'Only that task was hidden. Open Hidden to restore it.'
              : `${ids.length} tasks hidden. Open Hidden to restore them.`
          );
          await refreshSheet();
        }}
        onRestoreRow={async (row) => {
          setError(null);
          const id = row.id;
          setRows((prev) => prev.map((item) => (item.id === id ? { ...item, sheetHidden: false } : item)));
          const result = await DailyStatusApi.updateRow(id, { sheet_hidden: false, work_date: workDate, period });
          if (!result.ok) {
            setError(result.message || 'Unable to restore this task.');
            await loadSheet(workDate, period);
            return;
          }
          setRows(result.data.rows.map((item) => (item.id === id ? { ...item, sheetHidden: false } : item)));
          setNotice('Task restored to Daily Work Updates.');
        }}
        onDeleteRow={(row) => setDeleteRow(row)}
        onAccept={async (row) => {
          setError(null);
          const result = await TasksApi.accept(row.id);
          if (!result.ok) {
            setError(result.message || 'Unable to accept this task.');
            return;
          }
          setNotice('Task accepted. You can now edit this lead task here and in My Assigned Work.');
          await refreshSheet();
        }}
        onPatch={async (id, body) => {
          setError(null);
          const previous = rows;
          const work = (async () => {
            const result = await DailyStatusApi.updateRow(id, { ...body, work_date: workDate, period });
            if (!result.ok) {
              setError(result.message || 'Unable to save this change.');
              setRows(previous);
              return;
            }
            setRows(result.data.rows);
            flashSaved();
            notifyDailyUpdateSaved();
          })();
          pendingPatchesRef.current.push(work);
          try {
            await work;
          } finally {
            pendingPatchesRef.current = pendingPatchesRef.current.filter((item) => item !== work);
          }
        }}
        onExport={exportCsv}
        onDelete={() => setConfirmDelete(true)}
      />

      {compareOpen && compare && (
        <div className="modal-scrim fixed inset-0 z-[85] flex justify-end overflow-x-hidden" onClick={() => setCompareOpen(false)}>
          <div
            className="flex h-full w-full max-w-none flex-col overflow-hidden border-l border-[#cbd5e1] bg-[#f8fafc] shadow-2xl sm:max-w-[min(100vw,1400px)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-[#e2e8f0] bg-white px-4 py-3">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-[#0f172a]">Compare days</h2>
                <p className="text-[11px] text-[#64748b]">
                  Previous working day Morning + Evening vs the selected current day.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <label className="flex items-center gap-1 text-[11px] font-semibold text-[#475569]">
                  Previous
                  <input
                    type="date"
                    value={compareAgainst || compare.previousDate || previousWorkingDay(workDate)}
                    onChange={(event) => {
                      const next = event.target.value;
                      setCompareAgainst(next);
                      void loadCompare(workDate, next);
                    }}
                    className="rounded border border-[#cbd5e1] px-2 py-1 text-[11px] text-[#0f172a]"
                  />
                </label>
                <span className="text-[11px] text-[#94a3b8]">vs</span>
                <span className="rounded border border-[#cbd5e1] bg-[#f8fafc] px-2 py-1 text-[11px] font-semibold text-[#0f172a]">
                  {formatSheetDate(compare.currentDate || compare.date || workDate)}
                </span>
                <button type="button" onClick={() => setCompareOpen(false)} className="rounded-md px-2 py-1 text-[#64748b] hover:text-[#0f172a]">
                  Close
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3">
              {compareBusy ? (
                <div className="rounded-xl border border-[#e2e8f0] bg-white p-8 text-center text-sm text-[#64748b]">Loading comparison…</div>
              ) : !compare.available ? (
                <div className="rounded-xl border border-[#e2e8f0] bg-white p-8 text-center text-sm text-[#64748b]">
                  {compare.message || 'No tasks found to compare for these dates.'}
                </div>
              ) : (
                <CompareView
                  items={compare.items}
                  available={compare.available}
                  date={compare.date}
                  previousDate={compare.previousDate}
                  currentDate={compare.currentDate}
                />
              )}
            </div>
          </div>
        </div>
      )}

      <CreateTaskForm
        open={createOpen}
        people={pickerPeople}
        projects={sheetProjects}
        currentUserId={user.id}
        assignedToId={assignedToId}
        period={period}
        workDate={workDate}
        canAssignOthers={canEditSheet || canManageTasks}
        onClose={() => setCreateOpen(false)}
        onCreated={async (message) => {
          setNotice(message);
          setSelectedIds([]);
          await refreshSheet();
        }}
      />

      {subtaskOpen && (
        <AddSubtaskForm
          parents={subtaskParents}
          people={people}
          defaultParentId={subtaskParentId}
          currentUserId={user.id}
          canAssignOthers={canManageTasks || canEditSheet}
          editing={editingSubtask}
          period={period}
          workDate={workDate}
          onCancel={closeSubtaskForm}
          onCreated={async (message) => {
            setNotice(message);
            closeSubtaskForm();
            await refreshSheet();
          }}
        />
      )}

      {confirmSubtaskDelete && (
        <ConfirmDialog
          title="Delete this subtask?"
          body={`"${confirmSubtaskDelete.title}" will be permanently deleted.`}
          busy={busy}
          onCancel={() => setConfirmSubtaskDelete(null)}
          onConfirm={async () => {
            const id = confirmSubtaskDelete.id;
            setBusy(true);
            const result = await TasksApi.bulkDelete([id]);
            setBusy(false);
            setConfirmSubtaskDelete(null);
            if (!result.ok) {
              setError(result.message);
              return;
            }
            setNotice(result.data.message || 'Subtask deleted.');
            await refreshSheet();
          }}
        />
      )}

      {deleteRow && (
        <ConfirmDialog
          title="Delete this daily work update?"
          body="Are you sure you want to permanently delete this daily work update?"
          busy={busy}
          onCancel={() => setDeleteRow(null)}
          onConfirm={async () => {
            const id = deleteRow.id;
            setBusy(true);
            const result = await TasksApi.bulkDelete([id]);
            setBusy(false);
            setDeleteRow(null);
            if (!result.ok) {
              setError(result.message);
              return;
            }
            setNotice(result.data.message || 'Daily work update deleted.');
            await refreshSheet();
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${selectedIds.length} selected tasks?`}
          body="This will delete the selected tasks."
          busy={busy}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            const ids = [...selectedIds];
            setBusy(true);
            const result = await TasksApi.bulkDelete(ids);
            setBusy(false);
            setConfirmDelete(false);
            if (!result.ok) {
              setError(result.message);
              return;
            }
            setNotice(result.data.message);
            await refreshSheet();
          }}
        />
      )}
    </div>
  );
}
