'use client';

import React, { useState } from 'react';
import { TasksApi } from '@/lib/tasksApi';
import { DailyStatusPerson } from '@/lib/dailyStatus';

export default function RequestDependencyForm({
  fromTaskId,
  fromTaskLabel,
  people,
  onCreated,
  onCancel,
}: {
  fromTaskId: string;
  fromTaskLabel: string;
  people: DailyStatusPerson[];
  onCreated: (message: string) => void;
  onCancel: () => void;
}) {
  const [assignedToId, setAssignedToId] = useState(people[0]?.id || '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!assignedToId || !title.trim()) {
      setError('Assignee and dependency title are required.');
      return;
    }
    setBusy(true);
    setError('');
    const result = await TasksApi.requestDependency({
      from_task_id: fromTaskId,
      assigned_to_id: assignedToId,
      title: title.trim(),
      description: description.trim() || undefined,
      due_date: dueDate || undefined,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message || 'Unable to request dependency.');
      return;
    }
    onCreated('Dependency request sent. It appears in the assignee’s My Work until accepted.');
  };

  return (
    <div className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
        <h2 className="text-sm font-bold text-slate-100">Request Dependency</h2>
        <p className="mt-1 text-xs text-slate-400">
          Creates a real task for the selected person, linked from: {fromTaskLabel}
        </p>
        <div className="mt-4 space-y-3 text-xs">
          <label className="block text-slate-300">
            Assign To
            <select
              value={assignedToId}
              onChange={(e) => setAssignedToId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            >
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.displayName || person.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-slate-300">
            Dependency Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              placeholder="Provide API credentials"
            />
          </label>
          <label className="block text-slate-300">
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            />
          </label>
          <label className="block text-slate-300">
            Deadline
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            />
          </label>
        </div>
        {error && <div className="mt-3 rounded-lg border border-rose-900 bg-rose-950/40 px-3 py-2 text-xs text-rose-300">{error}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-bold text-white hover:bg-cyan-500 disabled:opacity-60"
          >
            Send Request
          </button>
        </div>
      </div>
    </div>
  );
}
