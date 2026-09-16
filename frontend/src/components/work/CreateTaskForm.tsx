'use client';

import React, { useEffect, useState } from 'react';
import { DailySheetStatus, DailyStatusPerson, SHEET_STATUSES, appTodayIso, formatSheetDate } from '@/lib/dailyStatus';
import { TasksApi } from '@/lib/tasksApi';
import { PriorityLevel } from '@/lib/types';
import DependencyMultiSelect from './DependencyMultiSelect';
import StatusDropdown from './StatusDropdown';
import UserDropdown from './UserDropdown';

const PRIORITIES: PriorityLevel[] = ['Low', 'Medium', 'High', 'Critical'];

export default function CreateTaskForm({
  open,
  people,
  projects: _projects,
  currentUserId,
  assignedToId,
  period,
  workDate,
  isAdditional,
  canAssignOthers = false,
  onClose,
  onCreated,
}: {
  open: boolean;
  people: DailyStatusPerson[];
  projects: Array<{ id: string; name: string }>;
  currentUserId: string;
  assignedToId?: string;
  period?: 'morning' | 'evening';
  workDate?: string;
  isAdditional?: boolean;
  canAssignOthers?: boolean;
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  const defaultDate = workDate || appTodayIso();
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [dependsOn, setDependsOn] = useState<string[]>([]);
  const [status, setStatus] = useState<DailySheetStatus>('Not Started');
  const [priority, setPriority] = useState<PriorityLevel>('Medium');
  const [startDate, setStartDate] = useState(defaultDate);
  const [deadline, setDeadline] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [assigneeId, setAssigneeId] = useState(assignedToId || currentUserId);

  useEffect(() => {
    if (!open) return;
    setAssigneeId(assignedToId || currentUserId);
    setStartDate(workDate || appTodayIso());
  }, [open, assignedToId, currentUserId, workDate]);

  if (!open) return null;

  const reset = () => {
    setProjectName('');
    setDescription('');
    setDependsOn([]);
    setStatus('Not Started');
    setPriority('Medium');
    setStartDate(workDate || appTodayIso());
    setDeadline('');
    setError('');
  };

  const submit = async () => {
    setError('');
    const assignee = canAssignOthers ? assigneeId : currentUserId;
    if (!assignee) {
      setError('Select a person.');
      return;
    }
    if (!projectName.trim()) {
      setError('Project is required.');
      return;
    }
    if (!description.trim()) {
      setError('Please enter a task description.');
      return;
    }
    if (!deadline) {
      setError('Task deadline is required.');
      return;
    }
    setBusy(true);
    const result = await TasksApi.create({
      title: description.trim().slice(0, 120),
      description: description.trim(),
      task_type: 'PROJECT_TASK',
      project_name: projectName.trim(),
      assigned_to_id: assignee,
      start_date: startDate || defaultDate,
      due_date: deadline,
      depends_on_ids: dependsOn,
      status,
      priority,
      period,
      work_date: workDate,
      is_additional: isAdditional,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message || 'Unable to create the task.');
      return;
    }
    reset();
    onCreated('Task created. It now appears in Daily Work Updates and the assigned employee dashboard.');
    onClose();
  };

  return (
    <div className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-5 text-xs shadow-xl">
        <h3 className="text-sm font-bold text-slate-100">Add Task</h3>
        <p className="mt-1 text-slate-400">
          Creates one shared task record. The assigned employee sees it in Daily Work Updates and their dashboard.
        </p>
        <div className="mt-4 space-y-3">
          <div>
            <div className="mb-1 font-semibold text-slate-300">Person *</div>
            {canAssignOthers ? (
              <UserDropdown people={people} value={assigneeId} onChange={setAssigneeId} placeholder="Select person" />
            ) : (
              <input
                readOnly
                value={people.find((person) => person.id === currentUserId)?.displayName || 'You'}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-400"
              />
            )}
          </div>
          <div>
            <div className="mb-1 font-semibold text-slate-300">Project *</div>
            <input
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              placeholder="Project name"
            />
          </div>
          <div>
            <div className="mb-1 font-semibold text-slate-300">Task Description *</div>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              placeholder="What work needs to be done?"
            />
          </div>
          <div>
            <div className="mb-1 font-semibold text-slate-300">Dependencies</div>
            <DependencyMultiSelect
              people={people.filter((person) => person.id !== assigneeId)}
              value={dependsOn}
              onChange={setDependsOn}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <div className="mb-1 font-semibold text-slate-300">Status</div>
              <StatusDropdown value={status} onChange={setStatus} />
              <div className="mt-1 text-[10px] text-slate-500">{SHEET_STATUSES.join(' · ')}</div>
            </div>
            <div>
              <div className="mb-1 font-semibold text-slate-300">Priority</div>
              <select
                value={priority}
                onChange={(event) => setPriority(event.target.value as PriorityLevel)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              >
                {PRIORITIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <div className="mb-1 font-semibold text-slate-300">Start Date</div>
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              />
            </div>
            <div>
              <div className="mb-1 font-semibold text-slate-300">Task Deadline *</div>
              <input
                type="date"
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              />
            </div>
          </div>
          <div className="text-[10px] text-slate-500">Current working date: {formatSheetDate(workDate || defaultDate)}</div>
          {error && <div className="rounded-lg border border-rose-900 bg-rose-950/40 px-3 py-2 text-rose-300">{error}</div>}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              reset();
              onClose();
            }}
            className="rounded-lg border border-slate-700 px-3 py-2 font-bold text-slate-200"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="rounded-lg bg-cyan-600 px-3 py-2 font-bold text-white hover:bg-cyan-500 disabled:opacity-60"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
