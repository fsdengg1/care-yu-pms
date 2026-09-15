'use client';

import { useRouter } from '@/lib/navigation';
import React, { Suspense, useEffect, useState } from 'react';
import { FileText, GitCompare, ListPlus, Lock, LockOpen, Moon, Plus, RefreshCw, Save, Sun, X } from 'lucide-react';
import { StorageService } from '@/lib/storage';
import { DailyStatusApi } from '@/lib/dailyStatusApi';
import { TasksApi } from '@/lib/tasksApi';
import { UsersApi, directoryStatus } from '@/lib/usersApi';
import { canAddDailyWorkTask, canCreateWorkTask, canEditDailySheet, canPerformPmOperations } from '@/lib/rbac';
import { CompareItem, DailyStatusPerson, DailyStatusRow, DailyStatusSubtask, appTodayIso, readStoredWorkDate, writeStoredWorkDate } from '@/lib/dailyStatus';
import { formatEmployeeDisplayName } from '@/lib/people';
import { User } from '@/lib/types';
import ConfirmDialog from '@/components/work/ConfirmDialog';
import CompareView from '@/components/work/CompareView';
import DailyStatusSheet from '@/components/work/DailyStatusSheet';
import AdditionalTaskForm from '@/components/work/AdditionalTaskForm';
import AddSubtaskForm, { EditableSubtask, subtaskToEditable } from '@/components/work/AddSubtaskForm';
import CreateTaskForm from '@/components/work/CreateTaskForm';
import UserDropdown from '@/components/work/UserDropdown';

/** Matches backend canSeeAllDailyStatusRows — who may persist the shared email snapshot. */
function canSaveEmailSnapshot(user: User | null | undefined) {
  if (!user) return false;
  return ['CEO', 'ENG_DIRECTOR', 'PROJECT_MANAGER', 'SYSTEM_ADMIN'].includes(user.role_code);
}

function friendlyError(error: unknown, fallback: string) {
  const text = error instanceof Error ? error.message : String(error || '');
  if (!text || /axios|sql|undefined|json/i.test(text)) return fallback;
  return text;
}

/** Previous calendar date in Asia/Kolkata as YYYY-MM-DD. */
function appYesterdayIso() {
  const today = appTodayIso();
  const [y, m, d] = today.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() - 1);
  return utc.toISOString().slice(0, 10);
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
  const [addTaskPersonId, setAddTaskPersonId] = useState('');
  const [sheetProjects, setSheetProjects] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareBusy, setCompareBusy] = useState(false);
  const [compare, setCompare] = useState<{
    items: CompareItem[];
    available: boolean;
    date?: string;
    message?: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const pendingPatchesRef = React.useRef<Promise<unknown>[]>([]);
  const [additionalOpen, setAdditionalOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [subtaskOpen, setSubtaskOpen] = useState(false);
  const [subtaskParentId, setSubtaskParentId] = useState<string | undefined>(undefined);
  const [editingSubtask, setEditingSubtask] = useState<EditableSubtask | null>(null);
  const [confirmSubtaskDelete, setConfirmSubtaskDelete] = useState<DailyStatusSubtask | null>(null);
  const [deleteRow, setDeleteRow] = useState<DailyStatusRow | null>(null);
  const [workDate, setWorkDate] = useState(appTodayIso);
  const [period, setPeriod] = useState<'morning' | 'evening'>('morning');
  const [phase, setPhase] = useState<{
    morningLocked?: boolean;
    eveningOpen?: boolean;
    timezone?: string;
    companyLeave?: boolean;
    companyLeaveMessage?: string;
    lockSource?: 'manual' | 'schedule' | null;
    lockedAt?: string;
    lockedByName?: string;
    manuallyUnlocked?: boolean;
  } | null>(null);
  const [attendance, setAttendance] = useState<
    Array<{ personId: string; person: string; onLeave?: boolean; halfDay?: string; permission?: { fromTime?: string; toTime?: string; reason?: string } }>
  >([]);

  const canManageTasks = canCreateWorkTask(user);
  const canEditSheet = canEditDailySheet(user);
  const canAddTask = canAddDailyWorkTask(user);
  const canManageMorningLock = canPerformPmOperations(user);
  const companyLeave = Boolean(phase?.companyLeave);
  const morningLocked = Boolean(phase?.morningLocked);
  const morningAddBlocked = companyLeave || (period === 'morning' && morningLocked);
  const pickerPeople = activePeople.length ? activePeople : people;

  const selectedEmployeeIds = () =>
    [...new Set(selectedIds.map((id) => rows.find((row) => row.id === id)?.personId).filter(Boolean))] as string[];

  const changeWorkDate = (date: string) => {
    const next = date || appTodayIso();
    setWorkDate(next);
    writeStoredWorkDate(next);
  };

  const loadCompare = async (date?: string) => {
    setCompareBusy(true);
    setError(null);
    try {
      const result = await DailyStatusApi.compare(date);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setCompare(result.data);
      setCompareOpen(true);
    } finally {
      setCompareBusy(false);
    }
  };

  const loadSheet = async (date = workDate, activePeriod = period) => {
    const sheet = await DailyStatusApi.sheet(date, activePeriod);
    if (!sheet.ok) {
      setError(sheet.message || 'Unable to load daily work updates.');
      return;
    }
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
    const initialDate = readStoredWorkDate();
    setWorkDate(initialDate);
    void loadSheet(initialDate, period).catch((err) => setError(friendlyError(err, 'Unable to load daily work updates.')));
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
    const refresh = () => {
      void loadSheet(workDate, period).catch(() => undefined);
    };
    refresh();
    window.addEventListener('focus', refresh);
    const timer = window.setInterval(refresh, 12000);
    return () => {
      window.removeEventListener('focus', refresh);
      window.clearInterval(timer);
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

  /** Flush focused cell edits, persist snapshot for email/compare, refresh Email Reports. */
  const saveForEmailReports = async () => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
      // Let onBlur enqueue PATCHes, then wait for them to finish.
      await new Promise((resolve) => window.setTimeout(resolve, 50));
      const pending = pendingPatchesRef.current.splice(0, pendingPatchesRef.current.length);
      if (pending.length) await Promise.all(pending);

      if (canSaveEmailSnapshot(user)) {
        const result = await DailyStatusApi.snapshot(period, workDate);
        if (!result.ok) {
          setError(result.message || 'Unable to save for Email Reports.');
          return;
        }
        setRows(result.data.rows);
        setNotice(
          result.data.message ||
            `${period === 'morning' ? 'Morning' : 'Evening'} updates saved. Email Reports will show this sheet.`
        );
      } else {
        await loadSheet(workDate, period);
        setNotice('Updates saved. Email Reports will show your latest daily work updates.');
      }
      flashSaved();
      notifyDailyUpdateSaved();
    } catch (err) {
      setError(friendlyError(err, 'Unable to save for Email Reports.'));
    } finally {
      setBusy(false);
    }
  };

  const toggleMorningLock = async (action: 'lock' | 'unlock') => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await DailyStatusApi.morningLock(action, workDate);
      if (!result.ok) {
        setError(result.message || 'Unable to update Morning Status lock.');
        return;
      }
      setPhase(result.data.phase || null);
      setRows(result.data.rows);
      setNotice(result.data.message || (action === 'unlock' ? 'Morning Status unlocked.' : 'Morning Status locked.'));
      if (action === 'lock' && period === 'morning') {
        setPeriod('evening');
        await loadSheet(workDate, 'evening');
      } else if (action === 'unlock') {
        setPeriod('morning');
        await loadSheet(workDate, 'morning');
      }
    } catch (err) {
      setError(friendlyError(err, 'Unable to update Morning Status lock.'));
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
    const fromRows = selectedEmployeeIds();
    const personId = addTaskPersonId || (fromRows.length === 1 ? fromRows[0] : '');
    if (!personId) {
      setError('Select a person first.');
      return;
    }
    if (fromRows.length > 1 && !addTaskPersonId) {
      setError('Select only one employee for Add Task.');
      return;
    }
    setError(null);
    setAddTaskPersonId(personId);
    setCreateOpen(true);
  };

  const handleSelectedIds = (ids: string[]) => {
    setSelectedIds(ids);
    const personIds = [
      ...new Set(ids.map((id) => rows.find((row) => row.id === id)?.personId).filter(Boolean)),
    ] as string[];
    if (personIds.length === 1) setAddTaskPersonId(personIds[0]);
  };

  const exportCsv = (visibleRows: DailyStatusRow[]) => {
    const header = ['PERSON', 'PROJECT', 'TASK DESCRIPTION', 'DEPENDENCIES', 'STATUS', 'START DATE', 'TASK DEADLINE', 'LOGGED HOURS', 'REASON FOR DELAY'];
    const lines = [
      header.join(','),
      ...visibleRows.map((row) =>
        [row.person, row.project, row.taskDescription, row.dependencies, row.status, row.startDate || '—', row.deadline, `${row.progressPercent ?? 0}% / ${row.loggedHours || '0h 00m'}`, row.reasonForDelay]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `daily-status-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!user) return null;

  const subtaskParents = canEditSheet ? rows : rows.filter((row) => row.personId === user.id);

  return (
    <div className="flex min-h-0 min-w-0 flex-col overflow-x-hidden text-xs">
      <div className="mb-3 shrink-0 rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-cyan-400">
              <FileText className="h-3.5 w-3.5" /> Daily Work Updates
            </div>
            <h1 className="mt-0.5 text-lg font-bold text-slate-100">Project team updates</h1>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Manage daily task updates and status. Click Save so Email Reports shows the latest sheet.
              Sundays and 2nd/4th Saturdays are company leave — no sheet data and no email.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {canAddTask && !morningAddBlocked && (
              <>
                <div className="min-w-[180px]">
                  <UserDropdown
                    people={pickerPeople}
                    value={addTaskPersonId}
                    onChange={(id) => {
                      setAddTaskPersonId(id);
                      setError(null);
                    }}
                    placeholder="Select person"
                  />
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => addTask()}
                  className="inline-flex items-center gap-1 rounded-md bg-cyan-600 px-2.5 py-2 font-bold text-white hover:bg-cyan-500 disabled:opacity-60"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Task
                </button>
              </>
            )}
            {canAddTask && !morningAddBlocked && (
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
            {!morningAddBlocked && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setAdditionalOpen(true)}
                className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2.5 py-1.5 font-bold text-slate-100 hover:border-cyan-600 disabled:opacity-60"
              >
                <Plus className="h-3.5 w-3.5" /> Additional Task
              </button>
            )}
            {canManageMorningLock && !companyLeave && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void toggleMorningLock(phase?.morningLocked ? 'unlock' : 'lock')}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 font-bold transition-colors ${
                  phase?.morningLocked
                    ? 'border border-amber-400 bg-amber-950/40 text-amber-200 hover:border-amber-300'
                    : 'border border-emerald-700 bg-emerald-950/30 text-emerald-200 hover:border-emerald-500'
                }`}
                title={
                  phase?.morningLocked
                    ? 'Unlock morning task details for editing'
                    : 'Lock morning task details and open evening updates'
                }
              >
                {phase?.morningLocked ? <LockOpen className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                {phase?.morningLocked ? 'Unlock Morning Status' : 'Lock Morning Status'}
              </button>
            )}
            {!companyLeave && (
              <>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setPeriod('morning');
                await loadSheet(workDate, 'morning');
              }}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 font-bold transition-colors ${
                period === 'morning'
                  ? 'bg-amber-500 text-slate-950 font-extrabold shadow-sm'
                  : 'border border-slate-700 text-slate-100 hover:border-amber-400'
              }`}
            >
              {morningLocked ? <Lock className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
              {morningLocked ? 'Morning Locked • 11:00 AM' : 'Morning'}
            </button>
            <button
              type="button"
              disabled={busy || !phase?.morningLocked}
              title={!phase?.morningLocked ? 'Evening updates open after Morning Status is locked' : undefined}
              onClick={async () => {
                setPeriod('evening');
                await loadSheet(workDate, 'evening');
              }}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 font-bold transition-colors ${
                period === 'evening'
                  ? 'bg-indigo-600 text-white font-extrabold shadow-sm'
                  : 'border border-slate-700 text-slate-100 hover:border-indigo-400'
              }`}
            >
              <Moon className="h-3.5 w-3.5" /> Evening
            </button>
              </>
            )}
            <button
              type="button"
              disabled={compareBusy || companyLeave}
              onClick={() => void loadCompare(workDate)}
              className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2.5 py-1.5 font-bold text-slate-100 hover:border-cyan-600 disabled:opacity-50"
            >
              <GitCompare className="h-3.5 w-3.5" /> Compare
            </button>
            {!morningAddBlocked && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveForEmailReports()}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 font-bold text-white hover:bg-emerald-500 disabled:opacity-60"
                title="Save updates so Email Reports shows the latest sheet"
              >
                <Save className="h-3.5 w-3.5" /> Save
              </button>
            )}
            <button type="button" onClick={() => void refreshSheet()} className="rounded-md border border-slate-700 p-1.5 text-slate-300 hover:border-cyan-600" title="Refresh">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
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
          rows={rows}
          people={people}
          projects={sheetProjects}
          userId={user.id}
          canEditAll={canEditSheet}
          canDelete={(canEditSheet || canManageTasks) && !morningAddBlocked}
          saved={saved}
          saveBusy={busy}
          onSave={!morningAddBlocked ? () => void saveForEmailReports() : undefined}
          selectedIds={selectedIds}
          onSelectedIds={handleSelectedIds}
          workDate={workDate}
          period={period}
          phase={phase || undefined}
          attendance={attendance}
          onWorkDateChange={changeWorkDate}
          readOnly={morningAddBlocked}
          onAddSubtask={canAddTask && !morningAddBlocked ? openAddSubtask : undefined}
          onEditSubtask={canAddTask && !morningAddBlocked ? openEditSubtask : undefined}
          onDeleteSubtask={
            canAddTask && !morningAddBlocked
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
            const result = await DailyStatusApi.updateRow(id, { sheet_hidden: true, work_date: workDate });
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
              const result = await DailyStatusApi.updateRow(id, { sheet_hidden: true, work_date: workDate });
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
            const result = await DailyStatusApi.updateRow(id, { sheet_hidden: false, work_date: workDate });
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
            const work = (async () => {
              const result = await DailyStatusApi.updateRow(id, { ...body, work_date: workDate, period });
              if (!result.ok) {
                setError(result.message || 'Unable to save this change.');
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
                <h2 className="text-sm font-bold text-[#0f172a]">Compare — Morning vs Evening</h2>
                <p className="text-[11px] text-[#64748b]">Same task record morning vs evening. Task description is never rewritten by the system.</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <div className="inline-flex rounded-md border border-[#e2e8f0] bg-[#f8fafc] p-0.5 text-[11px] font-semibold">
                  <button
                    type="button"
                    disabled={compareBusy}
                    onClick={() => void loadCompare(appTodayIso())}
                    className={`rounded px-2.5 py-1 disabled:opacity-50 ${
                      compare.date === appTodayIso() ? 'bg-white text-[#0f172a] shadow-sm' : 'text-[#64748b] hover:text-[#0f172a]'
                    }`}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    disabled={compareBusy}
                    onClick={() => void loadCompare(appYesterdayIso())}
                    className={`rounded px-2.5 py-1 disabled:opacity-50 ${
                      compare.date === appYesterdayIso() ? 'bg-white text-[#0f172a] shadow-sm' : 'text-[#64748b] hover:text-[#0f172a]'
                    }`}
                  >
                    Previous day
                  </button>
                </div>
                <button type="button" onClick={() => setCompareOpen(false)} className="rounded-md p-1 text-[#64748b] hover:text-[#0f172a]">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3">
              {compareBusy ? (
                <div className="rounded-xl border border-[#e2e8f0] bg-white p-8 text-center text-sm text-[#64748b]">Loading comparison…</div>
              ) : !compare.available ? (
                <div className="rounded-xl border border-[#e2e8f0] bg-white p-8 text-center text-sm text-[#64748b]">
                  {compare.message || 'Morning and evening updates are not yet available.'}
                </div>
              ) : (
                <CompareView items={compare.items} available={compare.available} date={compare.date} />
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
        assignedToId={addTaskPersonId}
        period={period}
        workDate={workDate}
        isAdditional={morningLocked}
        onClose={() => setCreateOpen(false)}
        onCreated={async (message) => {
          setNotice(message);
          setAddTaskPersonId('');
          setSelectedIds([]);
          await refreshSheet();
        }}
      />

      <AdditionalTaskForm
        open={additionalOpen}
        people={people}
        projects={sheetProjects}
        currentUserId={user.id}
        requirePerson={canEditSheet}
        period={period}
        workDate={workDate}
        onClose={() => setAdditionalOpen(false)}
        onCreated={async (message) => {
          setNotice(message);
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
