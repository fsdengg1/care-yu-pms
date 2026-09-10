'use client';

import React, { useState } from 'react';
import { DailyStatusPerson } from '@/lib/dailyStatus';
import { TasksApi } from '@/lib/tasksApi';
import UserDropdown from './UserDropdown';
import DependencyMultiSelect from './DependencyMultiSelect';

export default function AdditionalTaskForm({
  open,
  people,
  projects: _projects,
  currentUserId,
  requirePerson,
  period,
  workDate,
  onClose,
  onCreated,
}: {
  open: boolean;
  people: DailyStatusPerson[];
  projects: Array<{ id: string; name: string }>;
  currentUserId: string;
  requirePerson: boolean;
  period?: 'morning' | 'evening';
  workDate?: string;
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  const [description, setDescription] = useState('');
  const [projectName, setProjectName] = useState('');
  const [deadline, setDeadline] = useState('');
  const [dependsOn, setDependsOn] = useState<string[]>([]);
  const [personId, setPersonId] = useState(currentUserId);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const assigneeId = requirePerson ? personId : currentUserId;

  const submit = async () => {
    setError('');
    if (requirePerson && !assigneeId) {
      setError('Please select a person first.');
      return;
    }
    if (!description.trim()) {
      setError('Please enter a task description.');
      return;
    }
    const typedProject = projectName.trim();
    setBusy(true);
    const result = await TasksApi.create({
      title: description.trim().slice(0, 120),
      description: description.trim(),
      task_type: typedProject ? 'PROJECT_TASK' : 'NON_PROJECT_TASK',
      project_name: typedProject || undefined,
      assigned_to_id: assigneeId,
      due_date: deadline || undefined,
      depends_on_ids: dependsOn,
      is_additional: true,
      period,
      work_date: workDate,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message || 'Unable to create the additional task.');
      return;
    }
    setDescription('');
    setProjectName('');
    setDeadline('');
    setDependsOn([]);
    setPersonId(currentUserId);
    onCreated('Additional task created.');
    onClose();
  };

  return (
    <div className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-5 text-xs shadow-xl">
        <h3 className="text-sm font-bold text-slate-100">Additional Task</h3>
        <p className="mt-1 text-slate-400">
          {requirePerson ? 'Creates an extra row. Assign the person in this form or later in the sheet.' : 'This additional task is assigned to you only.'}
        </p>
        <div className="mt-4 space-y-3">
          {requirePerson && (
            <div>
              <div className="mb-1 font-semibold text-slate-300">Person</div>
              <UserDropdown people={people} value={assigneeId} onChange={setPersonId} />
            </div>
          )}
          <div>
            <div className="mb-1 font-semibold text-slate-300">Project (optional)</div>
            <input
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              placeholder="Project name"
            />
          </div>
          <div>
            <div className="mb-1 font-semibold text-slate-300">Task description</div>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              placeholder="What extra work needs to be done?"
            />
          </div>
          <div>
            <div className="mb-1 font-semibold text-slate-300">Deadline (optional)</div>
            <input
              type="date"
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            />
          </div>
          <div>
            <div className="mb-1 font-semibold text-slate-300">Dependencies (optional)</div>
            <DependencyMultiSelect
              people={people.filter((person) => person.id !== assigneeId)}
              value={dependsOn}
              onChange={setDependsOn}
            />
          </div>
          {error && <div className="rounded-lg border border-rose-900 bg-rose-950/40 px-3 py-2 text-rose-300">{error}</div>}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-3 py-2 font-bold text-slate-200">
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
