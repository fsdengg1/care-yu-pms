'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import StatusBadge from './StatusBadge';
import { DailyStatusRow } from '@/lib/dailyStatus';

export default function TaskDetailDrawer({
  row,
  onClose,
}: {
  row: DailyStatusRow | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!row) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [row, onClose]);

  if (!row) return null;

  const fields: Array<[string, React.ReactNode]> = [
    ['Person', row.person],
    ['Project', row.project],
    ['Task description', row.taskDescription],
    ['Dependencies', row.dependencies],
    ['Status', <StatusBadge key="status" status={row.status} />],
    ['Current date', row.currentDate],
    ['Deadline', row.deadline],
    ['Reason for delay', row.reasonForDelay],
    ['Morning snapshot', row.morningStatus || '—'],
    ['Evening snapshot', row.eveningStatus || '—'],
  ];

  return (
    <div className="modal-scrim fixed inset-0 z-[80] flex justify-end" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-slate-800 bg-slate-900 p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">Task detail</div>
            <h3 className="mt-1 text-sm font-bold text-slate-100">{row.taskDescription}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 p-1 text-slate-400 hover:text-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <dl className="space-y-3 text-xs">
          {fields.map(([label, value]) => (
            <div key={label} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <dt className="text-[10px] uppercase tracking-wider text-slate-500">{label}</dt>
              <dd className="mt-1 wrap-break-word text-slate-200">{value}</dd>
            </div>
          ))}
        </dl>
      </aside>
    </div>
  );
}
