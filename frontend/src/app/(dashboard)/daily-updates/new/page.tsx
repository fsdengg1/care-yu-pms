'use client';

import { Link, useRouter, useSearchParams } from '@/lib/navigation';
import React, { Suspense, useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, Paperclip, Save, Send } from 'lucide-react';
import { StorageService } from '@/lib/storage';
import { DailyUpdatesApi } from '@/lib/dailyUpdatesApi';
import { canSubmitDailyUpdate } from '@/lib/rbac';
import { formatLongDate, PIPELINE_STAGE_LABELS } from '@/lib/format';
import { DailyUpdate, DailyWorkStatus, User, WorkAssignment } from '@/lib/types';

const STATUSES: DailyWorkStatus[] = ['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED'];

export default function NewDailyUpdatePage() {
  return (
    <Suspense fallback={<div className="text-xs text-slate-400">Loading form…</div>}>
      <NewDailyUpdateInner />
    </Suspense>
  );
}

function NewDailyUpdateInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const assignmentId = searchParams.get('assignment') || '';
  const draftId = searchParams.get('draft') || '';

  const [user, setUser] = useState<User | null>(null);
  const [assignment, setAssignment] = useState<WorkAssignment | null>(null);
  const [draft, setDraft] = useState<DailyUpdate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    work_date: new Date().toISOString().slice(0, 10),
    work_completed: '',
    progress_percent: 0,
    hours_worked: 0,
    work_status: 'IN_PROGRESS' as DailyWorkStatus,
    blocker: '',
    dependency: '',
    support_required: '',
    next_plan: '',
    attachments: [] as string[],
  });

  useEffect(() => {
    const current = StorageService.getCurrentUser();
    if (!current) return;
    if (!canSubmitDailyUpdate(current)) {
      router.replace('/daily-updates');
      return;
    }
    setUser(current);
    void (async () => {
      if (draftId) {
        const payload = await DailyUpdatesApi.get(draftId);
        if (payload?.update) {
          setDraft(payload.update);
          setForm({
            work_date: payload.update.work_date,
            work_completed: payload.update.work_completed,
            progress_percent: payload.update.progress_percent,
            hours_worked: payload.update.hours_worked,
            work_status: payload.update.work_status,
            blocker: payload.update.blocker || '',
            dependency: payload.update.dependency || '',
            support_required: payload.update.support_required || '',
            next_plan: payload.update.next_plan,
            attachments: payload.update.attachments || [],
          });
        }
      }
      const items = await DailyUpdatesApi.assignments(true);
      const found = items.find((item) => item.id === assignmentId || item.task_id === assignmentId);
      if (!found && !draftId) {
        setError('This assignment is not linked to your user. Choose work from My Assigned Work.');
        return;
      }
      if (found) {
        setAssignment(found);
        if (found.acceptance_status === 'REQUESTED' && found.assigned_to_id === current.id && found.created_by_id !== current.id) {
          setError('Accept this lead task in My Assigned Work or Daily Work Updates before submitting a daily update. This form stays attached to the same task.');
        }
        setForm((prev) => ({ ...prev, progress_percent: prev.progress_percent || found.progress_percent || 0 }));
      }
    })();
  }, [assignmentId, draftId, router]);

  const blocked = form.work_status === 'BLOCKED';

  const payload = {
    assignment_id: assignment?.id || assignmentId,
    ...form,
    progress_percent: Number(form.progress_percent),
    hours_worked: Number(form.hours_worked),
  };

  const save = async (submit: boolean) => {
    setError(null);
    if (!payload.assignment_id) {
      setError('Select an assigned task from My Assigned Work.');
      return;
    }
    if (
      assignment?.acceptance_status === 'REQUESTED' &&
      assignment.assigned_to_id === user?.id &&
      assignment.created_by_id !== user?.id
    ) {
      setError('Accept this lead task before submitting a daily update. The update stays attached to the same task.');
      return;
    }
    if (submit && blocked && (!form.blocker.trim() || !form.dependency.trim() || !form.support_required.trim())) {
      setError('Blocked updates require Blocker / Issue, Dependency, and Support required.');
      return;
    }
    if (submit && !form.work_completed.trim()) {
      setError('Work completed today is required to submit.');
      return;
    }
    if (submit && !form.next_plan.trim()) {
      setError('Next action / ETA is required to submit.');
      return;
    }
    setSaving(true);
    const body = { ...payload, submission_status: (submit ? 'SUBMITTED' : 'DRAFT') as 'DRAFT' | 'SUBMITTED' };
    const result = draft
      ? await DailyUpdatesApi.patch(draft.id, body)
      : await DailyUpdatesApi.save(body);
    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.push(submit ? `/daily-updates/${result.data.update.id}?action=submitted` : '/daily-updates');
  };

  if (!user) return null;

  return (
    <div className="space-y-6 text-xs">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <Link href="/daily-updates" className="inline-flex items-center gap-1 text-cyan-400 hover:underline">
          <ArrowLeft className="h-3 w-3" /> Back to Daily Work Updates
        </Link>
        <h1 className="mt-2 text-xl font-bold text-slate-100">Add Daily Update</h1>
        <p className="mt-1 text-slate-400">Project, task, and date are filled from your assignment. You cannot pick unrelated work.</p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-900 bg-rose-950/40 px-4 py-3 text-rose-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="grid gap-4 rounded-xl border border-slate-800 bg-slate-900/90 p-5 md:grid-cols-3">
        <Field label="Project / Lead" value={assignment ? `${assignment.lead_number ? `${assignment.lead_number} · ` : ''}${assignment.project_name}` : '—'} />
        <Field label="Customer" value={assignment?.customer_name || '—'} />
        <Field label="Task / Assignment" value={assignment?.task_title || '—'} />
        <Field label="Workflow stage" value={assignment ? (PIPELINE_STAGE_LABELS[assignment.workflow_stage] || assignment.workflow_stage) : '—'} />
        <Field label="Date" value={formatLongDate(form.work_date)} />
        <Field label="Assigned to" value={user.name} />
      </div>

      <form className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/90 p-5" onSubmit={(e) => { e.preventDefault(); void save(true); }}>
        <label className="block">
          <span className="mb-1 block font-semibold text-slate-300">Work completed today</span>
          <textarea
            rows={3}
            value={form.work_completed}
            onChange={(e) => setForm({ ...form, work_completed: e.target.value })}
            placeholder="What did you complete on this assignment today?"
            className="w-full rounded border border-slate-800 bg-slate-950 p-2.5 text-slate-100"
          />
        </label>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="block">
            <span className="mb-1 block font-semibold text-slate-300">Progress %</span>
            <input
              type="number"
              min={0}
              max={100}
              value={form.progress_percent}
              onChange={(e) => setForm({ ...form, progress_percent: Number(e.target.value) })}
              className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100"
            />
          </label>
          <label className="block">
            <span className="mb-1 block font-semibold text-slate-300">Hours worked</span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={form.hours_worked}
              onChange={(e) => setForm({ ...form, hours_worked: Number(e.target.value) })}
              className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100"
            />
          </label>
          <label className="block">
            <span className="mb-1 block font-semibold text-slate-300">Current status</span>
            <select
              value={form.work_status}
              onChange={(e) => setForm({ ...form, work_status: e.target.value as DailyWorkStatus })}
              className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100"
            >
              {STATUSES.map((item) => (
                <option key={item} value={item}>{item.replace('_', ' ')}</option>
              ))}
            </select>
          </label>
        </div>

        {blocked && (
          <div className="rounded-lg border border-rose-900 bg-rose-950/30 p-3 text-rose-200">
            Blocked status flags this task and project for the Project Manager. Blocker, dependency, and support required are mandatory.
          </div>
        )}

        <label className="block">
          <span className="mb-1 block font-semibold text-slate-300">Blocker / Issue {blocked && '*'}</span>
          <textarea
            rows={2}
            value={form.blocker}
            onChange={(e) => setForm({ ...form, blocker: e.target.value })}
            placeholder="e.g. Camera not received from vendor"
            className="w-full rounded border border-slate-800 bg-slate-950 p-2.5 text-slate-100"
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-semibold text-slate-300">Dependency {blocked && '*'}</span>
          <input
            value={form.dependency}
            onChange={(e) => setForm({ ...form, dependency: e.target.value })}
            placeholder="What this work is waiting on"
            className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100"
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-semibold text-slate-300">Support required {blocked && '*'}</span>
          <input
            value={form.support_required}
            onChange={(e) => setForm({ ...form, support_required: e.target.value })}
            placeholder="Who needs to help and what is needed"
            className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100"
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-semibold text-slate-300">Next action / ETA *</span>
          <textarea
            rows={2}
            value={form.next_plan}
            onChange={(e) => setForm({ ...form, next_plan: e.target.value })}
            placeholder="Next step on this same assignment"
            className="w-full rounded border border-slate-800 bg-slate-950 p-2.5 text-slate-100"
          />
        </label>
        <label className="block">
          <span className="mb-1 flex items-center gap-1 font-semibold text-slate-300"><Paperclip className="h-3.5 w-3.5" /> Attachments / supporting documents</span>
          <input
            type="file"
            multiple
            onChange={(e) => {
              const names = Array.from(e.target.files || []).map((file) => file.name);
              setForm({ ...form, attachments: names });
            }}
            className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-300"
          />
          {form.attachments.length > 0 && (
            <div className="mt-1 text-slate-400">{form.attachments.join(', ')}</div>
          )}
        </label>

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => void save(false)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 font-bold text-slate-100 hover:bg-slate-700"
          >
            <Save className="h-4 w-4" /> Save Draft
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 font-bold text-white hover:bg-cyan-500"
          >
            <Send className="h-4 w-4" /> Submit Update
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 font-semibold text-slate-100">{value}</div>
    </div>
  );
}
