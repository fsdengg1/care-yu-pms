'use client';

import { Link, useParams, usePathname, useRouter, useSearchParams } from '@/lib/navigation';
import React, { useEffect, useState } from 'react';
import { resolveDailyUpdateIdFromLocation } from '@/lib/dailyUpdateRoutes';
import { AlertTriangle, ArrowLeft, CheckCircle2, Paperclip, ShieldAlert } from 'lucide-react';
import { StorageService } from '@/lib/storage';
import { DailyUpdatesApi } from '@/lib/dailyUpdatesApi';
import { canPerformPmOperations, canSubmitDailyUpdate } from '@/lib/rbac';
import { formatLongDate, WORK_STATUS_LABELS } from '@/lib/format';
import { DailyUpdate, ProjectActivityItem, User } from '@/lib/types';

export default function DailyUpdateDetailPage() {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const updateId = resolveDailyUpdateIdFromLocation(params.id, pathname, searchParams.get('id'));
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [update, setUpdate] = useState<DailyUpdate | null>(null);
  const [activity, setActivity] = useState<ProjectActivityItem[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submittedFeedback, setSubmittedFeedback] = useState(false);

  const load = async () => {
    if (!updateId) {
      setError('Daily update not found or you do not have access.');
      return;
    }
    const payload = await DailyUpdatesApi.get(updateId);
    if (!payload) {
      setError('Daily update not found or you do not have access.');
      return;
    }
    setUpdate(payload.update);
    setActivity(payload.activity);
    setCanEdit(payload.canEdit);
  };

  useEffect(() => {
    const current = StorageService.getCurrentUser();
    if (!current) return;
    setUser(current);
    void load();
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('action') === 'submitted') {
      setSubmittedFeedback(true);
      window.history.replaceState({}, '', `/daily-updates/${updateId}`);
    }
  }, [updateId]);

  if (!user) return null;
  if (error && !update) {
    return (
      <div className="rounded-xl border border-rose-900 bg-rose-950/40 p-5 text-xs text-rose-300">{error}</div>
    );
  }
  if (!update) return null;

  const isPm = canPerformPmOperations(user);
  const isTl = user.role_code === 'TEAM_LEAD';
  const readOnly = update.submission_status === 'SUBMITTED';

  return (
    <div className="space-y-6 text-xs">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <Link href="/daily-updates" className="inline-flex items-center gap-1 text-cyan-400 hover:underline">
          <ArrowLeft className="h-3 w-3" /> Daily Work Updates
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-100">{update.task_title}</h1>
            <p className="mt-1 text-slate-400">
              {update.customer_name} – {update.project_name} · {formatLongDate(update.work_date)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-bold ${
              update.submission_status === 'SUBMITTED'
                ? 'border-cyan-600 bg-cyan-950 text-cyan-200'
                : 'border-slate-700 bg-slate-800 text-slate-300'
            }`}>
              Current stage: {update.submission_status === 'SUBMITTED' ? 'Submitted' : 'Draft'}
            </span>
            <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${
              update.work_status === 'BLOCKED'
                ? 'border-rose-800 bg-rose-950 text-rose-300'
                : 'border-slate-700 bg-slate-800 text-slate-200'
            }`}>
              {WORK_STATUS_LABELS[update.work_status]}
            </span>
          </div>
        </div>
      </div>

      {submittedFeedback && (
        <div className="rounded-xl border border-cyan-700 bg-cyan-950/70 px-4 py-3 text-cyan-100">
          <div className="flex items-center gap-2 font-bold">
            <CheckCircle2 className="h-4 w-4" />
            Daily Update Submitted Successfully
          </div>
          <div className="mt-0.5 text-[11px] opacity-90">The update is stored against this project/task and visible to the Team Lead.</div>
        </div>
      )}

      {update.work_status === 'BLOCKED' && (
        <div className="rounded-xl border border-rose-900 bg-rose-950/30 p-4 text-rose-200">
          <div className="flex items-center gap-2 font-bold">
            <AlertTriangle className="h-4 w-4" /> BLOCKED — {update.blocker}
          </div>
          <div className="mt-1 text-rose-300/80">Dependency: {update.dependency || '—'} · Support: {update.support_required || '—'}</div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/90 p-5 lg:col-span-2">
          <Detail label="Employee" value={update.user_name} />
          <Detail label="Project / Lead" value={`${update.lead_number ? `${update.lead_number} · ` : ''}${update.project_name}`} />
          <Detail label="Task" value={update.task_title} />
          <Detail label="Progress" value={`${update.progress_percent}%`} />
          <Detail label="Hours worked" value={String(update.hours_worked)} />
          <Detail label="Work completed" value={update.work_completed || '—'} />
          <Detail label="Plan for next working day" value={update.next_plan || '—'} />
          <Detail label="Blocker / Issue" value={update.blocker || '—'} />
          <Detail label="Dependency" value={update.dependency || '—'} />
          <Detail label="Support required" value={update.support_required || '—'} />
          {update.attachments?.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Attachments</div>
              <div className="mt-1 flex flex-wrap gap-2 text-slate-300">
                {update.attachments.map((file) => (
                  <span key={file} className="inline-flex items-center gap-1 rounded border border-slate-800 bg-slate-950 px-2 py-1">
                    <Paperclip className="h-3 w-3" /> {file}
                  </span>
                ))}
              </div>
            </div>
          )}
          {canEdit && canSubmitDailyUpdate(user) && (
            <Link
              href={`/daily-updates/new?assignment=${encodeURIComponent(update.assignment_id)}&draft=${update.id}`}
              className="inline-flex rounded-lg bg-cyan-600 px-3 py-2 font-bold text-white hover:bg-cyan-500"
            >
              Continue draft
            </Link>
          )}
          {readOnly && update.user_id === user.id && (
            <p className="text-slate-500">Submitted updates cannot be edited.</p>
          )}
        </section>

        <section className="space-y-4">
          {(isPm || isTl) && readOnly && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
              <h2 className="mb-2 text-sm font-bold text-slate-100">PM / Team Lead note</h2>
              <p className="mb-2 text-slate-500">Comments are recorded on the project activity. The original update is not edited.</p>
              <textarea
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a review comment"
                className="w-full rounded border border-slate-800 bg-slate-950 p-2.5 text-slate-100"
              />
              <button
                type="button"
                onClick={async () => {
                  const result = await DailyUpdatesApi.comment(update.id, comment);
                  if (!result.ok) {
                    setError(result.message);
                    return;
                  }
                  setComment('');
                  setMessage('Comment added to project activity.');
                  await load();
                }}
                className="mt-2 rounded-lg bg-slate-800 px-3 py-1.5 font-bold text-slate-100 hover:bg-slate-700"
              >
                Add comment
              </button>
              {(isPm || isTl) && update.work_status === 'BLOCKED' && (
                <button
                  type="button"
                  onClick={async () => {
                    const result = await DailyUpdatesApi.escalate(update.id, update.support_required);
                    if (!result.ok) {
                      setError(result.message);
                      return;
                    }
                    setMessage('Escalation created from this blocker.');
                    router.push(`/dashboard/ceo/escalations/${result.data.escalation.id}`);
                  }}
                  className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-rose-800 bg-rose-950 px-3 py-1.5 font-bold text-rose-200 hover:bg-rose-900"
                >
                  <ShieldAlert className="h-3.5 w-3.5" /> Escalate issue
                </button>
              )}
            </div>
          )}

          {update.project_id && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
              <h2 className="mb-3 text-sm font-bold text-slate-100">Project activity</h2>
              <div className="space-y-3">
                {activity.slice(0, 12).map((item) => (
                  <div key={item.id} className="border-b border-slate-800/70 pb-2 last:border-0">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">{item.kind.replace('_', ' ')} · {formatLongDate(item.at)}</div>
                    <div className="font-semibold text-slate-200">{item.title}</div>
                    <div className="text-slate-400">{item.detail}</div>
                    {item.actor && <div className="text-slate-500">{item.actor}</div>}
                  </div>
                ))}
                {activity.length === 0 && <p className="text-slate-500">No project activity yet.</p>}
              </div>
            </div>
          )}
        </section>
      </div>

      {(message || error) && (
        <div className={`rounded-xl border px-4 py-3 ${error ? 'border-rose-900 bg-rose-950/40 text-rose-300' : 'border-emerald-900 bg-emerald-950/30 text-emerald-300'}`}>
          {error || message}
        </div>
      )}

      {(update.pm_comments || []).length > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
          <h2 className="mb-3 text-sm font-bold text-slate-100">Review comments</h2>
          {(update.pm_comments || []).map((item) => (
            <div key={item.id} className="mb-2 border-b border-slate-800/70 pb-2 last:border-0">
              <div className="font-semibold text-slate-200">{item.user_name}</div>
              <div className="text-slate-400">{item.comment}</div>
              <div className="text-[10px] text-slate-500">{formatLongDate(item.created_at)}</div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-0.5 text-slate-200">{value}</div>
    </div>
  );
}
