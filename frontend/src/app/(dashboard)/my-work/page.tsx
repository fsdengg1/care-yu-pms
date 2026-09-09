'use client';

import { Link } from '@/lib/navigation';
import React, { useEffect, useMemo, useState } from 'react';
import { LeadApi } from '@/lib/leadApi';
import { DailyUpdatesApi } from '@/lib/dailyUpdatesApi';
import { DailyStatusApi } from '@/lib/dailyStatusApi';
import { TasksApi } from '@/lib/tasksApi';
import { StorageService } from '@/lib/storage';
import { MyWorkItem, User, WorkAssignment } from '@/lib/types';
import { LEAD_STATUS_LABELS } from '@/lib/format';
import { deadlineCellClass, deadlineTone, DailyStatusPerson, DailyStatusRow, formatSheetDate, sheetStatusClass, toSheetStatus, appTodayIso } from '@/lib/dailyStatus';
import { canCreateLead, canCreateWorkTask, canSubmitDailyUpdate } from '@/lib/rbac';
import { isLeadTask, leadWorkLabel, assignmentStatusLabel, canAssigneeEditAssignment } from '@/lib/leadTasks';
import AdditionalTaskForm from '@/components/work/AdditionalTaskForm';
import CreateTaskForm from '@/components/work/CreateTaskForm';
import LeadTaskBadge from '@/components/work/LeadTaskBadge';
import TaskAccessBadges from '@/components/work/TaskAccessBadges';
import PendingTaskAssignmentCard from '@/components/work/PendingTaskAssignmentCard';
import AddSubtaskForm, { EditableSubtask } from '@/components/work/AddSubtaskForm';
import RequestDependencyForm from '@/components/work/RequestDependencyForm';
import RowMoreMenu from '@/components/work/RowMoreMenu';
import {
  CheckSquare, ArrowRight, Inbox, Plus, RotateCcw, FileText, Handshake, Scan, Calculator, Building2, AlertTriangle
} from 'lucide-react';

const GROUP_META: Record<string, { title: string; icon: React.ReactNode }> = {
  CREATE: { title: 'Project Input', icon: <Plus className="h-4 w-4" /> },
  DRAFT: { title: 'Drafts to complete', icon: <FileText className="h-4 w-4" /> },
  RETURNED: { title: 'Returned Items', icon: <RotateCcw className="h-4 w-4" /> },
  PM_REVIEW: { title: 'PM Review', icon: <Scan className="h-4 w-4" /> },
  ASSIGN: { title: 'Assign to Team', icon: <Scan className="h-4 w-4" /> },
  FEASIBILITY: { title: 'Feasibility', icon: <Scan className="h-4 w-4" /> },
  FEASIBILITY_APPROVAL: { title: 'PM Approval — Feasibility', icon: <Scan className="h-4 w-4" /> },
  COSTING: { title: 'Procurement / Costing', icon: <Calculator className="h-4 w-4" /> },
  COSTING_APPROVAL: { title: 'PM Approval — Costing', icon: <Calculator className="h-4 w-4" /> },
  QUOTATION: { title: 'Quotation', icon: <Building2 className="h-4 w-4" /> },
  NEGOTIATION: { title: 'Negotiation', icon: <Handshake className="h-4 w-4" /> },
  EXECUTION: { title: 'Project Execution', icon: <CheckSquare className="h-4 w-4" /> },
  TASK: { title: 'Assigned Tasks', icon: <CheckSquare className="h-4 w-4" /> },
  TASK_REVIEW: { title: 'Task Review', icon: <Scan className="h-4 w-4" /> },
  ESCALATION: { title: 'Escalations', icon: <AlertTriangle className="h-4 w-4" /> },
};

const ORDER = [
  'CREATE',
  'DRAFT',
  'RETURNED',
  'PM_REVIEW',
  'ASSIGN',
  'FEASIBILITY',
  'FEASIBILITY_APPROVAL',
  'COSTING',
  'COSTING_APPROVAL',
  'QUOTATION',
  'NEGOTIATION',
  'EXECUTION',
  'TASK_REVIEW',
  'TASK',
  'ESCALATION',
];

type WorkFilter = 'ALL' | 'PROJECT' | 'LEAD' | 'NON_PROJECT' | 'OVERDUE' | 'TODAY' | 'UPCOMING' | 'COMPLETED';

function assignmentType(item: WorkAssignment) {
  return item.task_type || (item.project_id ? 'PROJECT_TASK' : 'NON_PROJECT_TASK');
}

function matchesFilter(item: WorkAssignment, filter: WorkFilter) {
  const today = appTodayIso();
  const type = assignmentType(item);
  const done = item.current_status === 'COMPLETED' || item.current_status === 'DONE';
  if (filter === 'PROJECT') return type === 'PROJECT_TASK';
  if (filter === 'LEAD') return type === 'LEAD_TASK';
  if (filter === 'NON_PROJECT') return type === 'NON_PROJECT_TASK';
  if (filter === 'COMPLETED') return done;
  if (filter === 'OVERDUE') return Boolean(item.due_date && item.due_date < today && !done && item.current_status !== 'PENDING_TL_REVIEW');
  if (filter === 'TODAY') return item.due_date === today;
  if (filter === 'UPCOMING') return Boolean(item.due_date && item.due_date > today && !done);
  return true;
}

export default function MyAssignedWorkPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const [groups, setGroups] = useState<Record<string, MyWorkItem[]>>({});
  const [items, setItems] = useState<MyWorkItem[]>([]);
  const [assignments, setAssignments] = useState<WorkAssignment[]>([]);
  const [filter, setFilter] = useState<WorkFilter>('ALL');
  const [showCreate, setShowCreate] = useState(false);
  const [taskBusy, setTaskBusy] = useState<string | null>(null);
  const [additionalOpen, setAdditionalOpen] = useState(false);
  const [subtaskOpen, setSubtaskOpen] = useState(false);
  const [editingSubtask, setEditingSubtask] = useState<EditableSubtask | null>(null);
  const [dependencyFor, setDependencyFor] = useState<{ id: string; label: string } | null>(null);
  const [sheetPeople, setSheetPeople] = useState<DailyStatusPerson[]>([]);
  const [sheetProjects, setSheetProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [sheetRows, setSheetRows] = useState<DailyStatusRow[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const loadAssignments = async () => {
    setAssignments(await DailyUpdatesApi.assignments(true));
  };

  const loadSheetMeta = async () => {
    const sheet = await DailyStatusApi.sheet();
    if (sheet.ok) {
      setSheetPeople(sheet.people);
      setSheetProjects(sheet.projects);
      setSheetRows(sheet.rows);
    }
  };

  useEffect(() => {
    const user = StorageService.getCurrentUser();
    if (!user) return;
    setCurrentUser(user);
    setFocusTaskId(new URLSearchParams(window.location.search).get('task'));
    void (async () => {
      const result = await LeadApi.myWork();
      setGroups(result.groups);
      setItems(result.items);
      await loadAssignments();
      await loadSheetMeta();
    })();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const refresh = () => {
      void loadAssignments();
      void loadSheetMeta();
    };
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    const timer = window.setInterval(refresh, 12000);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.clearInterval(timer);
    };
  }, [currentUser]);

  const visibleAssignments = useMemo(
    () =>
      assignments.filter(
        (item) => item.acceptance_status !== 'REJECTED' && matchesFilter(item, filter)
      ),
    [assignments, filter]
  );

  const pendingRequests = useMemo(
    () => assignments.filter((item) => item.acceptance_status === 'REQUESTED' && item.assigned_to_id === currentUser?.id),
    [assignments, currentUser]
  );
  const pendingLeadAssignments = pendingRequests.filter((item) => isLeadTask(item));
  const pendingDependencyRequests = pendingRequests.filter((item) => !isLeadTask(item));

  const refreshWork = async () => {
    const result = await LeadApi.myWork();
    setGroups(result.groups);
    setItems(result.items);
    await loadAssignments();
    await loadSheetMeta();
  };

  const updateTask = async (
    assignment: WorkAssignment,
    body: { status?: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED'; blocked_reason?: string; progress_percent?: number; review_action?: 'approve' | 'return' | 'resubmit'; review_comments?: string }
  ) => {
    const taskId = assignment.task_id || (assignment.source === 'TASK' ? assignment.id : '');
    if (!taskId) return;
    setTaskBusy(taskId);
    await TasksApi.update(taskId, body);
    await refreshWork();
    setTaskBusy(null);
  };

  const acceptOrReject = async (assignment: WorkAssignment, action: 'accept' | 'reject') => {
    const taskId = assignment.task_id || (assignment.source === 'TASK' ? assignment.id : '');
    if (!taskId) return;
    setTaskBusy(taskId);
    const result =
      action === 'accept'
        ? await TasksApi.accept(taskId)
        : await TasksApi.reject(taskId, window.prompt('Reason for reject (optional)') || undefined);
    setTaskBusy(null);
    if (!result.ok) {
      setNotice(result.message || 'Unable to update dependency request.');
      return;
    }
    setNotice(result.data.message || (action === 'accept' ? 'Task accepted. You can now edit it in My Assigned Work and Daily Work Updates.' : 'Task declined.'));
    await refreshWork();
  };

  if (!currentUser) return null;

  const actionable = items.filter((item) => item.category !== 'CREATE');
  const isCommercial = ['BUSINESS_HEAD', 'ENG_DIRECTOR', 'SALES'].includes(currentUser.role_code);
  const canCreateLeads = canCreateLead(currentUser);
  const today = appTodayIso();

  return (
    <div className="space-y-6 text-xs">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
          <CheckSquare className="h-4 w-4" /> My Work
        </div>
        <h1 className="mt-1 text-xl font-bold text-slate-100">My Assigned Work</h1>
        <p className="mt-0.5 text-xs text-slate-400">
          Tasks for <span className="font-semibold text-cyan-300">{currentUser.name}</span> based on role, workflow state, and assignment.
        </p>
        {notice && <div className="mt-3 rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-emerald-200">{notice}</div>}
      </div>

      <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/90 p-5">
          <div className="flex flex-col gap-3 border-b border-slate-800 pb-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-bold text-slate-100">Assigned execution work</h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  setEditingSubtask(null);
                  setSubtaskOpen(true);
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1 font-bold text-slate-100 hover:border-cyan-600"
              >
                <Plus className="h-3 w-3" /> Add Subtask
              </button>
              <button onClick={() => setAdditionalOpen(true)} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1 font-bold text-slate-100 hover:border-cyan-600">
                <Plus className="h-3 w-3" /> Additional Task
              </button>
              <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-2.5 py-1 font-bold text-white">
                <Plus className="h-3 w-3" /> Create Task
              </button>
              <Link href="/daily-updates" className="text-cyan-400 hover:underline">Daily Work Updates</Link>
            </div>
          </div>
          {pendingLeadAssignments.length > 0 && (
            <div className="space-y-2">
              {pendingLeadAssignments.map((item) => {
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
          {pendingDependencyRequests.length > 0 && (
            <div className="rounded-lg border border-amber-800/60 bg-amber-950/20 p-3">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-amber-300">
                Dependency requests awaiting your response ({pendingDependencyRequests.length})
              </div>
              <div className="space-y-2">
                {pendingDependencyRequests.map((item) => {
                  const taskId = item.task_id || item.id;
                  const busy = taskBusy === taskId;
                  return (
                    <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-800 bg-slate-950/50 px-3 py-2">
                      <div>
                        <div className="font-semibold text-slate-100">{item.description || item.task_title}</div>
                        <div className="text-[11px] text-slate-400">
                          {item.project_name || '—'}
                          {item.requested_by_name ? ` · from ${item.requested_by_name}` : ''}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          disabled={busy}
                          onClick={() => void acceptOrReject(item, 'accept')}
                          className="rounded-lg bg-emerald-700 px-2.5 py-1 font-bold text-white hover:bg-emerald-600 disabled:opacity-60"
                        >
                          Accept
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => void acceptOrReject(item, 'reject')}
                          className="rounded-lg border border-rose-800 px-2.5 py-1 font-bold text-rose-200 hover:bg-rose-950 disabled:opacity-60"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-1">
            {([
              ['ALL', 'All'],
              ['PROJECT', 'Project Tasks'],
              ['LEAD', 'Lead Tasks'],
              ['NON_PROJECT', 'Non-Project Tasks'],
              ['OVERDUE', 'Overdue'],
              ['TODAY', 'Today'],
              ['UPCOMING', 'Upcoming'],
              ['COMPLETED', 'Completed'],
            ] as Array<[WorkFilter, string]>).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                  filter === key ? 'border-cyan-600 bg-cyan-600 text-white' : 'border-slate-700 text-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] table-fixed text-left">
              <thead className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="w-[16%] p-2">Project / Lead</th>
                  <th className="w-[20%] p-2">Task Description</th>
                  <th className="w-[11%] p-2">Dependencies</th>
                  <th className="w-[8%] whitespace-nowrap p-2">Start Date</th>
                  <th className="w-[8%] whitespace-nowrap p-2">Current Date</th>
                  <th className="w-[8%] whitespace-nowrap p-2">Task Deadline</th>
                  <th className="w-[8%] p-2">Status</th>
                  <th className="w-[8%] p-2">Type</th>
                  <th className="w-[12%] p-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {visibleAssignments.map((item) => {
                  const overdue = Boolean(item.due_date && item.due_date < today && item.current_status !== 'DONE' && item.current_status !== 'COMPLETED');
                  const taskId = item.task_id || (item.source === 'TASK' ? item.id : '');
                  const busy = taskBusy === taskId;
                  const isAssignee = item.assigned_to_id === currentUser.id;
                  const canEditDetails = canAssigneeEditAssignment(currentUser.id, item);
                  const isReviewer = currentUser.role_code === 'TEAM_LEAD' && item.review_status === 'PENDING_TL_REVIEW';
                  const sheetStatus = toSheetStatus(item.current_status);
                  const done = item.current_status === 'DONE' || item.current_status === 'COMPLETED';
                  const pendingAccept = item.acceptance_status === 'REQUESTED';
                  const canDaily = Boolean(
                    currentUser && canSubmitDailyUpdate(currentUser) && isAssignee && canEditDetails && !pendingAccept
                  );
                  const canComplete =
                    Boolean(taskId && isAssignee && !done && canEditDetails && item.review_status !== 'PENDING_TL_REVIEW');
                  const leadBased = isLeadTask(item);
                  return (
                  <tr
                    key={item.id}
                    className={
                      focusTaskId && (item.task_id === focusTaskId || item.id === focusTaskId)
                        ? 'bg-cyan-950/40'
                        : leadBased
                          ? 'lead-task'
                        : overdue
                          ? 'bg-rose-950/20'
                          : undefined
                    }
                  >
                    <td className="align-top p-2">
                      {leadBased ? (
                        <div>
                          <div className="font-semibold text-slate-100">{leadWorkLabel(item)}</div>
                          <div className="mt-1">
                            <TaskAccessBadges
                              leadTask
                              acceptanceStatus={item.acceptance_status}
                              createdByName={item.created_by || item.assigned_by}
                              viewOnly={pendingAccept && isAssignee && !canEditDetails}
                            />
                          </div>
                          {!isAssignee && item.assigned_to ? (
                            <div className="mt-1 text-[10px] text-slate-400">Assigned to {item.assigned_to}</div>
                          ) : null}
                        </div>
                      ) : (
                        <>
                          {item.lead_number && <span className="mr-1 font-mono text-cyan-400">{item.lead_number}</span>}
                          {assignmentType(item) === 'NON_PROJECT_TASK' ? '—' : item.project_name || '—'}
                        </>
                      )}
                    </td>
                    <td className="align-top p-2 font-semibold text-slate-100">
                      <div className="line-clamp-3 whitespace-normal break-words leading-snug">
                        {item.description || item.task_title}
                      </div>
                      {item.acceptance_status === 'REQUESTED' && !leadBased && (
                        <span className="mt-1 inline-block rounded border border-amber-700 bg-amber-950/40 px-1.5 py-0.5 text-[10px] font-bold text-amber-200">
                          Dependency request
                        </span>
                      )}
                      {item.parent_task_id && (
                        <span className="mt-1 ml-1 inline-block rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-slate-300">
                          Subtask
                        </span>
                      )}
                    </td>
                    <td className="align-top p-2">
                      <div className="line-clamp-3 break-words">{item.depends_on_title || item.dependency || '—'}</div>
                    </td>
                    <td className="align-top whitespace-nowrap p-2 tabular-nums text-slate-200">
                      {formatSheetDate(item.start_date)}
                    </td>
                    <td className="align-top whitespace-nowrap p-2 tabular-nums text-slate-200">
                      {formatSheetDate(today)}
                    </td>
                    <td className={`align-top whitespace-nowrap p-2 tabular-nums ${deadlineCellClass(deadlineTone(sheetStatus, item.due_date, today))}`}>
                      {overdue && <AlertTriangle className="mr-1 inline h-3 w-3" />}
                      {formatSheetDate(item.due_date)}
                    </td>
                    <td className="align-top p-2">
                      <span className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-bold ${sheetStatusClass(sheetStatus)}`}>
                        {pendingAccept ? assignmentStatusLabel(item) : sheetStatus}
                      </span>
                      {item.blocked && item.blocker && (
                        <div className="mt-0.5 flex items-center gap-1 text-[10px] text-rose-300">
                          <AlertTriangle className="h-3 w-3" /> {item.blocker}
                        </div>
                      )}
                    </td>
                    <td className="align-top p-2">
                      {leadBased ? <LeadTaskBadge /> : assignmentType(item) === 'NON_PROJECT_TASK' ? 'Non-Project' : 'Project Task'}
                    </td>
                    <td className="align-top p-2">
                      <div className="flex flex-nowrap items-start justify-end gap-1">
                        {canComplete && (
                          <button
                            disabled={busy}
                            onClick={() => {
                              if (!window.confirm('Are you sure you want to mark this task as completed?')) return;
                              void updateTask(item, {
                                status: 'DONE',
                                progress_percent: 100,
                                review_action: item.review_status === 'CORRECTION_REQUIRED' ? 'resubmit' : undefined,
                              });
                            }}
                            className="h-7 shrink-0 rounded-md bg-emerald-700 px-2 text-[10px] font-bold text-white hover:bg-emerald-600 disabled:opacity-60"
                          >
                            {item.review_status === 'CORRECTION_REQUIRED' ? 'Resubmit' : 'Complete'}
                          </button>
                        )}
                        {canDaily && (
                          <Link
                            href={`/daily-updates/new?assignment=${encodeURIComponent(item.id)}`}
                            className="inline-flex h-7 shrink-0 items-center rounded-md bg-cyan-600 px-2 text-[10px] font-bold text-white hover:bg-cyan-500"
                          >
                            Daily Update
                          </Link>
                        )}
                        {taskId && isAssignee && item.acceptance_status === 'REQUESTED' && (
                          <>
                            <button
                              disabled={busy}
                              onClick={() => void acceptOrReject(item, 'accept')}
                              className="h-7 rounded-md bg-emerald-700 px-2 text-[10px] font-bold text-white hover:bg-emerald-600 disabled:opacity-60"
                            >
                              Accept Task
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => void acceptOrReject(item, 'reject')}
                              className="h-7 rounded-md border border-rose-800 px-2 text-[10px] font-bold text-rose-200 hover:bg-rose-950 disabled:opacity-60"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        <RowMoreMenu
                          items={[
                            ...(taskId && isAssignee && canEditDetails
                              ? [{
                                  id: 'dep',
                                  label: 'Request Dependency',
                                  onSelect: () =>
                                    setDependencyFor({
                                      id: taskId,
                                      label: item.description || item.task_title || 'Task',
                                    }),
                                }]
                              : []),
                            ...(taskId && isAssignee && !done && canEditDetails
                              ? [{
                                  id: 'issue',
                                  label: 'Raise Issue / Doubt',
                                  onSelect: () => {
                                    const reason = window.prompt('Describe the issue or doubt') || '';
                                    if (!reason.trim()) return;
                                    void updateTask(item, { status: 'BLOCKED', blocked_reason: reason.trim() });
                                  },
                                }]
                              : []),
                            ...(taskId && isAssignee && (item.current_status === 'TODO' || item.current_status === 'NOT_STARTED') && !item.blocked && canEditDetails
                              ? [{
                                  id: 'start',
                                  label: 'Start Task',
                                  onSelect: () => void updateTask(item, { status: 'IN_PROGRESS' }),
                                }]
                              : []),
                            ...(taskId && isAssignee && item.parent_task_id && canEditDetails
                              ? [
                                  {
                                    id: 'edit-sub',
                                    label: 'Edit Subtask',
                                    onSelect: () => {
                                      setEditingSubtask({
                                        id: taskId,
                                        parentId: item.parent_task_id || '',
                                        title: item.task_title || item.description || '',
                                        description: item.description || item.task_title || '',
                                        assignedToId: item.assigned_to_id || currentUser.id,
                                        dueDate: item.due_date ? String(item.due_date).slice(0, 10) : '',
                                        progressPercent: item.progress_percent || 0,
                                        status:
                                          item.current_status === 'DONE' || item.current_status === 'COMPLETED'
                                            ? 'DONE'
                                            : item.current_status === 'IN_PROGRESS'
                                              ? 'IN_PROGRESS'
                                              : item.current_status === 'BLOCKED' || item.current_status === 'WAITING'
                                                ? 'WAITING'
                                                : item.current_status === 'HOLD'
                                                  ? 'HOLD'
                                                  : 'TODO',
                                      });
                                      setSubtaskOpen(true);
                                    },
                                  },
                                  {
                                    id: 'del-sub',
                                    label: 'Delete Subtask',
                                    danger: true,
                                    onSelect: () => {
                                      if (!window.confirm('Delete this subtask?')) return;
                                      void (async () => {
                                        setTaskBusy(taskId);
                                        const result = await TasksApi.bulkDelete([taskId]);
                                        setTaskBusy(null);
                                        if (!result.ok) {
                                          setNotice(result.message || 'Unable to delete subtask.');
                                          return;
                                        }
                                        setNotice(result.data.message || 'Subtask deleted.');
                                        await refreshWork();
                                      })();
                                    },
                                  },
                                ]
                              : []),
                            ...(taskId && isReviewer
                              ? [
                                  {
                                    id: 'approve',
                                    label: 'Approve',
                                    onSelect: () => void updateTask(item, { review_action: 'approve' }),
                                  },
                                  {
                                    id: 'return',
                                    label: 'Send Back',
                                    danger: true,
                                    onSelect: () => {
                                      const comments = window.prompt('Comments for send-back (required)') || '';
                                      if (!comments.trim()) return;
                                      void updateTask(item, { review_action: 'return', review_comments: comments.trim() });
                                    },
                                  },
                                ]
                              : []),
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                  );
                })}
                {visibleAssignments.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-4 text-center text-slate-500">No tasks in this filter.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {(groups.TASK || []).length > 0 && (
            <p className="text-[11px] text-slate-500">
              {groups.TASK.length} open assigned {groups.TASK.length === 1 ? 'task is' : 'tasks are'} shown in the table above.
            </p>
          )}
        </div>

      {isCommercial && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ...(canCreateLeads ? [{ label: 'Create New Lead', value: 'Open form', href: '/pre-sales/leads/create' }] : [{ label: 'Lead pipeline', value: 'View', href: '/pre-sales/leads' }]),
            { label: 'Ready for quotation', value: String((groups.QUOTATION || []).length), href: '/pre-sales/leads' },
            { label: 'Active negotiations', value: String((groups.NEGOTIATION || []).length), href: '/pre-sales/leads' },
            { label: 'Returned by PM', value: String((groups.RETURNED || []).length), href: '/pre-sales/leads' },
          ].map((card) => (
            <Link key={card.label} href={card.href} className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 hover:border-cyan-800">
              <div className="text-slate-400">{card.label}</div>
              <div className="mt-2 text-2xl font-bold text-slate-100">{card.value}</div>
            </Link>
          ))}
        </div>
      )}

      {ORDER.filter((key) => key !== 'TASK' && (groups[key] || []).length > 0).map((key) => {
        const meta = GROUP_META[key];
        const list = groups[key] || [];
        return (
          <div key={key} className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/90 p-5">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2 font-bold text-slate-100">
              <span className="text-cyan-400">{meta?.icon}</span>
              {meta?.title || key}
              <span className="ml-auto rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">{list.length}</span>
            </div>
            {list.map((item) => (
              <Link
                key={`${item.category}-${item.lead_id}`}
                href={item.href}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3 hover:border-cyan-800"
              >
                <div>
                  <div className="font-bold text-slate-100">
                    {item.category === 'CREATE' ? item.title : (
                      <>
                        <span className="mr-2 font-mono text-cyan-400">{item.lead_number}</span>
                        {item.title}
                      </>
                    )}
                  </div>
                  <div className="mt-0.5 text-slate-400">{item.summary}</div>
                  {item.category !== 'CREATE' && (
                    <div className="mt-1 text-[11px] text-slate-500">{item.customer_name} · {LEAD_STATUS_LABELS[item.status] || item.status}</div>
                  )}
                </div>
                <span className="flex items-center gap-1 text-cyan-400">
                  Open <ArrowRight className="h-3 w-3" />
                </span>
              </Link>
            ))}
          </div>
        );
      })}

      {actionable.length === 0 && assignments.length === 0 && !isCommercial && (
        <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/90 p-12 text-center text-slate-500">
          <Inbox className="mx-auto h-8 w-8 text-slate-600" />
          <p>No work assigned to you yet. New project and team allocations appear here automatically.</p>
        </div>
      )}

      {actionable.length === 0 && isCommercial && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-8 text-center">
          <p className="text-slate-300">No returned items or commercial follow-ups right now.</p>
          {canCreateLeads ? (
            <Link href="/pre-sales/leads/create" className="mt-3 inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 font-bold text-white hover:bg-cyan-500">
              <Plus className="h-4 w-4" /> Create New Lead
            </Link>
          ) : (
            <Link href="/pre-sales/leads" className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 font-bold text-slate-100 hover:border-cyan-700">
              View lead pipeline
            </Link>
          )}
        </div>
      )}
      <CreateTaskForm
        open={showCreate}
        people={sheetPeople}
        projects={sheetProjects}
        currentUserId={currentUser.id}
        onClose={() => setShowCreate(false)}
        onCreated={(message) => {
          setNotice(message);
          void refreshWork();
        }}
      />
      <AdditionalTaskForm
        open={additionalOpen}
        people={sheetPeople}
        projects={sheetProjects}
        currentUserId={currentUser.id}
        requirePerson={false}
        onClose={() => setAdditionalOpen(false)}
        onCreated={(message) => {
          setNotice(message);
          void refreshWork();
        }}
      />
      {subtaskOpen && (
        <AddSubtaskForm
          parents={sheetRows}
          people={sheetPeople}
          currentUserId={currentUser.id}
          canAssignOthers={canCreateWorkTask(currentUser)}
          editing={editingSubtask}
          onCancel={() => {
            setSubtaskOpen(false);
            setEditingSubtask(null);
          }}
          onCreated={(message) => {
            setNotice(message);
            setSubtaskOpen(false);
            setEditingSubtask(null);
            void refreshWork();
          }}
        />
      )}
      {dependencyFor && (
        <RequestDependencyForm
          fromTaskId={dependencyFor.id}
          fromTaskLabel={dependencyFor.label}
          people={sheetPeople.filter((person) => person.id !== currentUser.id)}
          onCancel={() => setDependencyFor(null)}
          onCreated={(message) => {
            setNotice(message);
            setDependencyFor(null);
            void refreshWork();
          }}
        />
      )}
    </div>
  );
}
