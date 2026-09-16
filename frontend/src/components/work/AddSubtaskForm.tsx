'use client';

import React, { useEffect, useState } from 'react';
import { TasksApi } from '@/lib/tasksApi';
import { DailyStatusApi } from '@/lib/dailyStatusApi';
import { DailyStatusPerson, DailyStatusRow, DailyStatusSubtask, parseSheetDate, toSheetStatus } from '@/lib/dailyStatus';
import { Task } from '@/lib/types';

export type EditableSubtask = {
  id: string;
  parentId: string;
  title: string;
  description?: string;
  assignedToId: string;
  dueDate?: string;
  status: Task['status'];
  progressPercent?: number;
};

function statusToApi(status: string): Task['status'] {
  const sheet = toSheetStatus(status);
  if (sheet === 'Completed') return 'DONE';
  if (sheet === 'In Progress') return 'IN_PROGRESS';
  if (sheet === 'On Hold') return 'HOLD';
  if (sheet === 'Cancelled') return 'CANCELLED';
  return 'TODO';
}

function clampProgress(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function subtaskToEditable(sub: DailyStatusSubtask, fallbackParentId?: string): EditableSubtask {
  return {
    id: sub.id,
    parentId: sub.parentTaskId || fallbackParentId || '',
    title: sub.title,
    description: sub.description || sub.title,
    assignedToId: sub.assignedToId || '',
    dueDate: sub.deadlineIso || parseSheetDate(sub.deadline) || '',
    status: statusToApi(sub.status),
    progressPercent: clampProgress(sub.progressPercent),
  };
}

export default function AddSubtaskForm({
  parents,
  people,
  defaultParentId,
  currentUserId,
  canAssignOthers = false,
  editing,
  period,
  workDate,
  onCreated,
  onCancel,
}: {
  parents: DailyStatusRow[];
  people: DailyStatusPerson[];
  defaultParentId?: string;
  currentUserId: string;
  canAssignOthers?: boolean;
  editing?: EditableSubtask | null;
  period?: 'morning' | 'evening';
  workDate?: string;
  onCreated: (message: string) => void;
  onCancel: () => void;
}) {
  const isEdit = Boolean(editing?.id);
  const [parentId, setParentId] = useState(editing?.parentId || defaultParentId || parents[0]?.id || '');
  const [title, setTitle] = useState(editing?.title || '');
  const [description, setDescription] = useState(editing?.description || '');
  const [assignedToId, setAssignedToId] = useState(editing?.assignedToId || currentUserId);
  const [dueDate, setDueDate] = useState(editing?.dueDate || '');
  const [startDate, setStartDate] = useState('');
  const [hours, setHours] = useState('');
  const [status, setStatus] = useState<Task['status']>(editing?.status || 'TODO');
  const [progress, setProgress] = useState(clampProgress(editing?.progressPercent));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (editing) {
      setParentId(editing.parentId || defaultParentId || parents[0]?.id || '');
      setTitle(editing.title || '');
      setDescription(editing.description || '');
      setAssignedToId(editing.assignedToId || currentUserId);
      setDueDate(editing.dueDate || '');
      setStatus(editing.status || 'TODO');
      setProgress(clampProgress(editing.progressPercent));
      return;
    }
    if (defaultParentId) setParentId(defaultParentId);
    setProgress(0);
  }, [editing, defaultParentId, parents, currentUserId]);

  useEffect(() => {
    if (!canAssignOthers && !isEdit) setAssignedToId(currentUserId);
  }, [canAssignOthers, currentUserId, isEdit]);

  const parent = parents.find((row) => row.id === parentId);

  const submit = async () => {
    if (!parentId || !title.trim()) {
      setError('Parent task and subtask title are required.');
      return;
    }
    setBusy(true);
    setError('');
    const assignee = canAssignOthers ? assignedToId || currentUserId : assignedToId || currentUserId;
    const progressPercent = clampProgress(progress);
    let nextStatus = status;
    if (progressPercent >= 100) nextStatus = 'DONE';
    else if (progressPercent > 0 && status === 'TODO') nextStatus = 'IN_PROGRESS';
    if (isEdit && editing) {
      const result = await TasksApi.update(editing.id, {
        title: title.trim(),
        description: description.trim() || title.trim(),
        due_date: dueDate || undefined,
        start_date: startDate || undefined,
        status: nextStatus,
        progress_percent: progressPercent,
        assigned_to_id: canAssignOthers ? assignee : undefined,
        parent_task_id: parentId,
      });
      setBusy(false);
      if (!result.ok) {
        setError(result.message || 'Unable to update subtask.');
        return;
      }
      onCreated('Subtask updated.');
      return;
    }

    const result = await TasksApi.create({
      title: title.trim(),
      description: description.trim() || title.trim(),
      task_type: parent?.projectId ? 'PROJECT_TASK' : 'NON_PROJECT_TASK',
      project_id: parent?.projectId,
      project_name: parent?.project === '—' ? undefined : parent?.project,
      assigned_to_id: assignee,
      due_date: dueDate || undefined,
      start_date: startDate || undefined,
      status: nextStatus,
      progress_percent: progressPercent,
      parent_task_id: parentId,
      period,
      work_date: workDate,
      is_additional: period === 'evening',
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message || 'Unable to create subtask.');
      return;
    }
    if (hours) {
      await DailyStatusApi.updateRow(result.data.task.id, {
        hours_worked: Number(hours),
        work_date: workDate,
        period,
      });
    }
    onCreated('Subtask created under the selected parent task.');
  };

  return (
    <div className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
        <h2 className="text-sm font-bold text-slate-100">{isEdit ? 'Edit Subtask' : 'Add Subtask'}</h2>
        <p className="mt-1 text-xs text-slate-400">
          {isEdit ? 'Update this activity under the parent Daily Work Updates task.' : 'Creates an activity under a main Daily Work Updates task.'}
        </p>
        <div className="mt-4 space-y-3 text-xs">
          <label className="block text-slate-300">
            Parent Task
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            >
              {parents.length === 0 && <option value="">No parent tasks available</option>}
              {parents.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.person} — {row.project} — {row.taskDescription.slice(0, 60)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-slate-300">
            Subtask / Activity
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              placeholder="Study RCS documents"
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
            Assigned To
            <select
              value={assignedToId}
              onChange={(e) => setAssignedToId(e.target.value)}
              disabled={!canAssignOthers}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 disabled:opacity-70"
            >
              {(canAssignOthers ? people : people.filter((person) => person.id === currentUserId || person.id === assignedToId)).map(
                (person) => (
                  <option key={person.id} value={person.id}>
                    {person.displayName || person.name}
                  </option>
                )
              )}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-slate-300">
              Status
              <select
                value={status}
                onChange={(e) => {
                  const next = e.target.value as Task['status'];
                  setStatus(next);
                  if (next === 'DONE') setProgress(100);
                  if (next === 'TODO' && progress === 100) setProgress(0);
                  if (next === 'IN_PROGRESS' && progress === 0) setProgress(10);
                }}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              >
                <option value="TODO">Not Started</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="DONE">Completed</option>
                <option value="HOLD">On Hold</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </label>
            <label className="block text-slate-300">
              Logged hours
              <input
                type="number"
                min={0}
                step={0.5}
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              />
            </label>
            <label className="block text-slate-300">
              Start date
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
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
          <label className="block text-slate-300">
            Progress %
            <div className="mt-1 flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={progress}
                onChange={(e) => {
                  const next = clampProgress(e.target.value);
                  setProgress(next);
                  if (next >= 100) setStatus('DONE');
                  else if (next > 0 && status === 'TODO') setStatus('IN_PROGRESS');
                  else if (next === 0 && status === 'DONE') setStatus('TODO');
                }}
                className="w-full"
              />
              <input
                type="number"
                min={0}
                max={100}
                value={progress}
                onChange={(e) => {
                  const next = clampProgress(e.target.value);
                  setProgress(next);
                  if (next >= 100) setStatus('DONE');
                  else if (next > 0 && status === 'TODO') setStatus('IN_PROGRESS');
                }}
                className="w-20 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-slate-100"
              />
            </div>
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
            {isEdit ? 'Save Subtask' : 'Create Subtask'}
          </button>
        </div>
      </div>
    </div>
  );
}
