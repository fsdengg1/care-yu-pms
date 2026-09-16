'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { DailySheetStatus, DailyStatusPerson, SHEET_STATUSES, formatSheetDate, fromSheetStatus, toSheetStatus } from '@/lib/dailyStatus';
import { TasksApi } from '@/lib/tasksApi';
import { Lead, Task } from '@/lib/types';
import { projectStageFlowSummary } from '@/lib/projectStageFlow';
import DependencyMultiSelect from './DependencyMultiSelect';
import StatusDropdown from './StatusDropdown';
import UserDropdown from './UserDropdown';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function CreateLeadTaskForm({
  open,
  lead,
  people,
  currentUserId: _currentUserId,
  editing,
  onClose,
  onCreated,
}: {
  open: boolean;
  lead: Lead;
  people: DailyStatusPerson[];
  currentUserId: string;
  editing?: Task | null;
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  const today = useMemo(todayIso, [open]);
  const stageLabel = projectStageFlowSummary(lead).stageLabel;
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [dependsOn, setDependsOn] = useState<string[]>([]);
  const [status, setStatus] = useState<DailySheetStatus>('Not Started');
  const [deadline, setDeadline] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const isEdit = Boolean(editing?.id);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setDescription(editing.description || editing.title || '');
      setAssigneeId(editing.assigned_to_id || '');
      setDependsOn(Array.isArray(editing.depends_on_ids) ? editing.depends_on_ids : editing.depends_on_id ? [editing.depends_on_id] : []);
      setStatus(toSheetStatus(editing.status));
      setDeadline(editing.due_date ? String(editing.due_date).slice(0, 10) : '');
      setError('');
      return;
    }
    setDescription('');
    setAssigneeId('');
    setDependsOn([]);
    setStatus('Not Started');
    setDeadline('');
    setError('');
  }, [open, editing]);

  if (!open) return null;

  const reset = () => {
    setDescription('');
    setAssigneeId('');
    setDependsOn([]);
    setStatus('Not Started');
    setDeadline('');
    setError('');
  };

  const submit = async () => {
    setError('');
    if (!description.trim()) {
      setError('Please enter a task description.');
      return;
    }
    if (!assigneeId) {
      setError('Please select a team member.');
      return;
    }
    if (!deadline) {
      setError('Task deadline is required.');
      return;
    }
    setBusy(true);
    const body = {
      title: description.trim().slice(0, 120),
      description: description.trim(),
      assigned_to_id: assigneeId,
      due_date: deadline,
      depends_on_ids: dependsOn,
      status: fromSheetStatus(status),
    };
    const result = isEdit && editing
      ? await TasksApi.update(editing.id, body)
      : await TasksApi.create({
          ...body,
          task_type: 'LEAD_TASK',
          lead_id: lead.id,
          start_date: today,
        });
    setBusy(false);
    if (!result.ok) {
      setError(result.message || (isEdit ? 'Unable to update the lead task.' : 'Unable to create the lead task.'));
      return;
    }
    reset();
    onCreated(
      isEdit
        ? 'Lead task updated. The same task is shown in My Assigned Work and Daily Work Updates.'
        : 'Lead task created. The assignee must accept it before they can edit it.'
    );
    onClose();
  };

  return (
    <div className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-5 text-xs shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-bold text-slate-100">{isEdit ? 'Edit Lead Task' : 'Create Lead Task'}</h3>
          <button type="button" onClick={() => { reset(); onClose(); }} className="text-slate-400 hover:text-slate-100" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <div>
            <div className="mb-1 font-semibold text-slate-300">Lead</div>
            <div className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-200">
              {lead.lead_number} • {lead.title}
            </div>
          </div>
          <div>
            <div className="mb-1 font-semibold text-slate-300">Lead Stage</div>
            <div className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-200">{stageLabel}</div>
            <div className="mt-1 text-[10px] text-slate-500">Lead stage is independent of this task&apos;s status.</div>
          </div>
          <div>
            <div className="mb-1 font-semibold text-slate-300">Task Description</div>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              placeholder="What work needs to be done?"
            />
          </div>
          <div>
            <div className="mb-1 font-semibold text-slate-300">Assign To</div>
            <UserDropdown
              people={people}
              value={assigneeId}
              onChange={setAssigneeId}
              placeholder="Select Team Member"
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
          <div>
            <div className="mb-1 font-semibold text-slate-300">Status</div>
            <StatusDropdown value={status} onChange={setStatus} />
            <div className="mt-1 text-[10px] text-slate-500">{SHEET_STATUSES.join(' · ')}</div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <div className="mb-1 font-semibold text-slate-300">Current Date</div>
              <input
                type="text"
                readOnly
                value={formatSheetDate(today)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-400"
              />
            </div>
            <div>
              <div className="mb-1 font-semibold text-slate-300">Task Deadline</div>
              <input
                type="date"
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              />
            </div>
          </div>
          <div>
            <div className="mb-1 font-semibold text-slate-300">Task Type</div>
            <div className="flex items-center gap-2 text-slate-200">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-violet-400" />
              Lead Based Task
            </div>
          </div>
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
            {isEdit ? 'Save Changes' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  );
}
