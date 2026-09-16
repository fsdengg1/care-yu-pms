'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, GitCompare, Moon, Save, Sun } from 'lucide-react';
import { DailyStatusApi } from '@/lib/dailyStatusApi';
import {
  CompareItem,
  DailyStatusPerson,
  DailyStatusRow,
  appTodayIso,
  formatSheetDate,
  previousWorkingDay,
  shiftWorkDate,
} from '@/lib/dailyStatus';
import { User } from '@/lib/types';
import CompareView from '@/components/work/CompareView';
import DailyStatusSheet from '@/components/work/DailyStatusSheet';

function friendlyError(error: unknown, fallback: string) {
  const text = error instanceof Error ? error.message : String(error || '');
  if (!text || /axios|sql|undefined|json/i.test(text)) return fallback;
  return text;
}

export default function MyDailyWorkPanel({
  user,
  onRowsChange,
}: {
  user: User;
  onRowsChange?: (rows: DailyStatusRow[], people: DailyStatusPerson[]) => void;
}) {
  const today = appTodayIso();
  const [workDate, setWorkDate] = useState(today);
  const [period, setPeriod] = useState<'morning' | 'evening'>('morning');
  const [rows, setRows] = useState<DailyStatusRow[]>([]);
  const [people, setPeople] = useState<DailyStatusPerson[]>([]);
  const [projects, setProjects] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareBusy, setCompareBusy] = useState(false);
  const [compare, setCompare] = useState<{
    items: CompareItem[];
    available: boolean;
    date?: string;
    previousDate?: string;
    currentDate?: string;
    message?: string;
  } | null>(null);
  const pendingPatchesRef = React.useRef<Promise<unknown>[]>([]);
  const onRowsChangeRef = React.useRef(onRowsChange);
  onRowsChangeRef.current = onRowsChange;

  const applyRows = useCallback(
    (nextRows: DailyStatusRow[], nextPeople: DailyStatusPerson[]) => {
      const mine = nextRows.filter((row) => row.personId === user.id);
      setRows(mine);
      setPeople(nextPeople);
      onRowsChangeRef.current?.(mine, nextPeople);
    },
    [user.id]
  );

  const loadSheet = useCallback(
    async (date = workDate, activePeriod = period) => {
      const sheet = await DailyStatusApi.sheet(date, activePeriod);
      if (!sheet.ok) {
        setError(sheet.message || 'Unable to load daily work updates.');
        return;
      }
      setProjects(sheet.projects);
      applyRows(sheet.rows, sheet.people);
    },
    [applyRows, period, workDate]
  );

  useEffect(() => {
    void loadSheet(workDate, period).catch((err) => setError(friendlyError(err, 'Unable to load daily work updates.')));
  }, [loadSheet, period, workDate]);

  const flashSaved = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
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
      await loadSheet(workDate, period);
      setNotice('Updates saved.');
      flashSaved();
      window.dispatchEvent(new CustomEvent('careyu-daily-update-saved', { detail: { workDate, period } }));
    } catch (err) {
      setError(friendlyError(err, 'Unable to save daily work updates. Existing data was kept.'));
    } finally {
      setBusy(false);
    }
  };

  const loadCompare = async () => {
    setCompareBusy(true);
    setError(null);
    try {
      const result = await DailyStatusApi.compare(workDate);
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

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-100">My Daily Work</h2>
            <p className="text-[11px] text-slate-500">
              {formatSheetDate(workDate)} · {period === 'morning' ? 'Morning' : 'Evening'} update for tasks assigned to you.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Date</div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setWorkDate(shiftWorkDate(workDate, -1))}
                  className="rounded-md border border-slate-700 p-1.5 text-slate-200 hover:border-cyan-600 disabled:opacity-50"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <input
                  type="date"
                  value={workDate}
                  onChange={(event) => setWorkDate(event.target.value || today)}
                  className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs font-semibold text-slate-100"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setWorkDate(shiftWorkDate(workDate, 1))}
                  className="rounded-md border border-slate-700 p-1.5 text-slate-200 hover:border-cyan-600 disabled:opacity-50"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setWorkDate(today)}
                  className={`rounded-md px-2.5 py-1.5 font-bold ${
                    workDate === today ? 'bg-cyan-600 text-white' : 'border border-slate-700 text-slate-100 hover:border-cyan-600'
                  }`}
                >
                  Today
                </button>
              </div>
            </div>
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Period</div>
              <div className="inline-flex rounded-md border border-slate-700 p-0.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPeriod('morning')}
                  className={`inline-flex items-center gap-1 rounded px-3 py-1.5 font-bold ${
                    period === 'morning' ? 'bg-amber-500 text-slate-950' : 'text-slate-200 hover:text-white'
                  }`}
                >
                  <Sun className="h-3.5 w-3.5" /> Morning
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPeriod('evening')}
                  className={`inline-flex items-center gap-1 rounded px-3 py-1.5 font-bold ${
                    period === 'evening' ? 'bg-indigo-600 text-white' : 'text-slate-200 hover:text-white'
                  }`}
                >
                  <Moon className="h-3.5 w-3.5" /> Evening
                </button>
              </div>
            </div>
            <button
              type="button"
              disabled={compareBusy}
              onClick={() => void loadCompare()}
              className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2.5 py-1.5 font-bold text-slate-100 hover:border-cyan-600 disabled:opacity-50"
            >
              <GitCompare className="h-3.5 w-3.5" /> Compare
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveUpdates()}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 font-bold text-white hover:bg-emerald-500 disabled:opacity-60"
            >
              <Save className="h-3.5 w-3.5" /> Save
            </button>
          </div>
        </div>
      </div>

      {error && <div className="rounded-lg border border-rose-900 bg-rose-950/40 px-3 py-2 text-xs text-rose-300">{error}</div>}
      {notice && <div className="rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-200">{notice}</div>}

      <DailyStatusSheet
        rows={rows}
        people={people}
        projects={projects}
        userId={user.id}
        canEditAll={false}
        canDelete={false}
        saved={saved}
        selectedIds={selectedIds}
        onSelectedIds={setSelectedIds}
        workDate={workDate}
        period={period}
        onWorkDateChange={setWorkDate}
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
            applyRows(result.data.rows, people);
            flashSaved();
            window.dispatchEvent(new CustomEvent('careyu-daily-update-saved', { detail: { workDate, period } }));
          })();
          pendingPatchesRef.current.push(work);
          try {
            await work;
          } finally {
            pendingPatchesRef.current = pendingPatchesRef.current.filter((item) => item !== work);
          }
        }}
        onExport={() => undefined}
        onDelete={() => undefined}
      />

      {compareOpen && compare && (
        <div className="modal-scrim fixed inset-0 z-[85] flex justify-end overflow-x-hidden" onClick={() => setCompareOpen(false)}>
          <div
            className="flex h-full w-full max-w-none flex-col overflow-hidden border-l border-[#cbd5e1] bg-[#f8fafc] shadow-2xl sm:max-w-[min(100vw,1400px)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-[#e2e8f0] bg-white px-4 py-3">
              <div>
                <h2 className="text-sm font-bold text-[#0f172a]">Compare days</h2>
                <p className="text-[11px] text-[#64748b]">
                  {formatSheetDate(compare.previousDate || previousWorkingDay(workDate))} vs{' '}
                  {formatSheetDate(compare.currentDate || workDate)}
                </p>
              </div>
              <button type="button" onClick={() => setCompareOpen(false)} className="rounded-md px-2 py-1 text-[#64748b] hover:text-[#0f172a]">
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {compareBusy ? (
                <div className="rounded-xl border border-[#e2e8f0] bg-white p-8 text-center text-sm text-[#64748b]">Loading comparison…</div>
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
    </div>
  );
}
