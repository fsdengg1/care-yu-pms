'use client';

import { Link } from '@/lib/navigation';
import React, { useCallback, useEffect, useState } from 'react';
import { User, WorkAssignment, DailyUpdateSummary } from '@/lib/types';
import { DailyUpdatesApi } from '@/lib/dailyUpdatesApi';
import { DailyStatusApi } from '@/lib/dailyStatusApi';
import { TasksApi } from '@/lib/tasksApi';
import { formatLongDate } from '@/lib/format';
import { CheckSquare, Inbox, Plus } from 'lucide-react';
import PendingActionsCard from '@/components/work/PendingActionsCard';
import LeadPipelinePanel from '@/components/dashboards/LeadPipelinePanel';
import LeadWorkflowTimeline from '@/components/dashboards/LeadWorkflowTimeline';
import ProjectGanttPanel from '@/components/planning/ProjectGanttPanel';
import MemberTaskCard from '@/components/work/MemberTaskCard';
import AdditionalTaskForm from '@/components/work/AdditionalTaskForm';
import CreateTaskForm from '@/components/work/CreateTaskForm';
import AddSubtaskForm from '@/components/work/AddSubtaskForm';
import MySubtasksPanel from '@/components/work/MySubtasksPanel';
import PendingTaskAssignmentCard from '@/components/work/PendingTaskAssignmentCard';
import { DailyStatusPerson, DailyStatusRow } from '@/lib/dailyStatus';
import { canCreateWorkTask } from '@/lib/rbac';

export default function EmployeeDashboard({ user }: { user: User }) {
  const [assignments, setAssignments] = useState<WorkAssignment[]>([]);
  const [summary, setSummary] = useState<DailyUpdateSummary | null>(null);
  const [additionalOpen, setAdditionalOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [subtaskOpen, setSubtaskOpen] = useState(false);
  const [people, setPeople] = useState<DailyStatusPerson[]>([]);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [sheetRows, setSheetRows] = useState<DailyStatusRow[]>([]);
  const [notice, setNotice] = useState('');
  const [taskBusy, setTaskBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [nextAssignments, nextSummary, sheet] = await Promise.all([
      DailyUpdatesApi.assignments(true),
      DailyUpdatesApi.summary(),
      DailyStatusApi.sheet(),
    ]);
    setAssignments(nextAssignments);
    setSummary(nextSummary);
    if (sheet.ok) {
      setPeople(sheet.people);
      setProjects(sheet.projects);
      setSheetRows((sheet.rows || []).filter((row) => row.personId === user.id));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const nextDue = [...assignments]
    .filter((item) => item.due_date && item.current_status !== 'COMPLETED' && item.review_status !== 'PENDING_TL_REVIEW' && item.acceptance_status !== 'REQUESTED')
    .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))[0];
  const submittedToday = (summary?.submittedToday ?? 0) > 0;
  const ganttProjectId = assignments.find((item) => item.project_id)?.project_id;
  const pendingLead = assignments.filter((item) => item.acceptance_status === 'REQUESTED' && item.assigned_to_id === user.id);
  const activeAssignments = assignments.filter((item) => item.acceptance_status !== 'REQUESTED' && item.acceptance_status !== 'REJECTED');

  const acceptOrReject = async (assignment: WorkAssignment, action: 'accept' | 'reject') => {
    const taskId = assignment.task_id || (assignment.source === 'TASK' ? assignment.id : '');
    if (!taskId) return;
    setTaskBusy(taskId);
    const result =
      action === 'accept'
        ? await TasksApi.accept(taskId)
        : await TasksApi.reject(taskId, window.prompt('Reason for decline (optional)') || undefined);
    setTaskBusy(null);
    if (!result.ok) {
      setNotice(result.message || 'Unable to update the assignment.');
      return;
    }
    setNotice(result.data.message || (action === 'accept' ? 'Task accepted.' : 'Task declined.'));
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-gradient-to-r from-slate-900 via-cyan-950/20 to-slate-900 p-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
            <CheckSquare className="h-4 w-4" /> Team Member Dashboard
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-100">Hello, {user.name}</h1>
          <p className="mt-1 text-xs text-slate-400">
            Only work assigned to you from live projects. Start tasks, update progress, submit daily updates, and raise issues here.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-bold text-white hover:bg-cyan-500"
          >
            <Plus className="h-3.5 w-3.5" /> Create Task
          </button>
          <button
            type="button"
            onClick={() => setSubtaskOpen(true)}
            disabled={sheetRows.length === 0}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-4 py-2 text-xs font-bold text-slate-100 hover:border-cyan-600 disabled:opacity-60"
          >
            <Plus className="h-3.5 w-3.5" /> Add Subtask
          </button>
          <button
            type="button"
            onClick={() => setAdditionalOpen(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-4 py-2 text-xs font-bold text-slate-100 hover:border-cyan-600"
          >
            <Plus className="h-3.5 w-3.5" /> Additional Task
          </button>
          <Link href="/daily-updates" className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-bold text-slate-100 hover:border-cyan-600">
            Daily Work Updates
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
          <div className="text-xs font-medium text-slate-400">Assigned Active Tasks</div>
          <div className="mt-2 text-2xl font-bold text-slate-100">
            {assignments.filter((item) => item.current_status !== 'COMPLETED' && item.review_status !== 'PENDING_TL_REVIEW' && item.acceptance_status !== 'REQUESTED').length}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">From your project and team assignments</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
          <div className="text-xs font-medium text-slate-400">Next Deadline</div>
          <div className="mt-2 text-2xl font-bold text-slate-100">{nextDue ? formatLongDate(nextDue.due_date) : 'None'}</div>
          <div className="mt-1 text-[11px] text-slate-500">{nextDue?.task_title || 'No scheduled task deadlines'}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
          <div className="text-xs font-medium text-slate-400">Today&apos;s Daily Log</div>
          <div className="mt-2 text-2xl font-bold text-slate-100">{submittedToday ? 'Submitted' : 'Pending'}</div>
          <div className="mt-1 text-[11px] text-slate-500">
            {summary?.blocked ? `${summary.blocked} blocked` : 'No blocked items in your last updates'}
          </div>
        </div>
      </div>

      {pendingLead.length > 0 && (
        <div className="space-y-3">
          {pendingLead.map((item) => {
            const taskId = item.task_id || item.id;
            return (
              <PendingTaskAssignmentCard
                key={item.id}
                item={item}
                busy={taskBusy === taskId}
                onAccept={() => void acceptOrReject(item, 'accept')}
                onDecline={() => void acceptOrReject(item, 'reject')}
              />
            );
          })}
        </div>
      )}

      <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
        <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-2">
          <h2 className="text-sm font-bold text-slate-100">My Assigned Work</h2>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setCreateOpen(true)} className="text-xs font-bold text-cyan-400 hover:underline">
              Create Task
            </button>
            <button type="button" onClick={() => setAdditionalOpen(true)} className="text-xs font-bold text-cyan-400 hover:underline">
              Additional Task
            </button>
            <Link href="/my-work" className="text-xs text-cyan-400 hover:underline">View all</Link>
          </div>
        </div>
        {activeAssignments.length === 0 ? (
          <div className="space-y-2 p-8 text-center">
            <Inbox className="mx-auto h-6 w-6 text-slate-600" />
            <p className="text-xs font-medium text-slate-300">No assigned tasks found.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {activeAssignments.map((item) => (
              <MemberTaskCard
                key={item.id}
                assignment={item}
                onChanged={load}
                parents={sheetRows}
                people={people}
                canAssignOthers={canCreateWorkTask(user)}
              />
            ))}
          </div>
        )}
      </div>

      <ProjectGanttPanel user={user} projectId={ganttProjectId} lockLabel="Gantt — Read Only" />

      <MySubtasksPanel
        rows={sheetRows}
        people={people}
        currentUserId={user.id}
        canAssignOthers={canCreateWorkTask(user)}
        onChanged={load}
      />

      <PendingActionsCard />
      <LeadPipelinePanel />
      <LeadWorkflowTimeline />
      {notice && (
        <div className="rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-200">{notice}</div>
      )}
      <CreateTaskForm
        open={createOpen}
        people={people}
        projects={projects}
        currentUserId={user.id}
        onClose={() => setCreateOpen(false)}
        onCreated={(message) => {
          setNotice(message);
          void load();
        }}
      />
      <AdditionalTaskForm
        open={additionalOpen}
        people={people}
        projects={projects}
        currentUserId={user.id}
        requirePerson={false}
        onClose={() => setAdditionalOpen(false)}
        onCreated={(message) => {
          setNotice(message);
          void load();
        }}
      />
      {subtaskOpen && (
        <AddSubtaskForm
          parents={sheetRows}
          people={people}
          currentUserId={user.id}
          canAssignOthers={canCreateWorkTask(user)}
          onCancel={() => setSubtaskOpen(false)}
          onCreated={(message) => {
            setNotice(message);
            setSubtaskOpen(false);
            void load();
          }}
        />
      )}
    </div>
  );
}
