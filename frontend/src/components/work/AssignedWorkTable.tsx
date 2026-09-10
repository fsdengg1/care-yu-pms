'use client';

import { Link } from '@/lib/navigation';
import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { User, WorkAssignment } from '@/lib/types';
import { canSubmitDailyUpdate } from '@/lib/rbac';
import { assignmentStatusLabel, canAssigneeEditAssignment } from '@/lib/leadTasks';
import { AssignedWorkGroup, AssignedWorkNode, WorkFilter, buildAssignedWorkGroups } from '@/lib/assignedWork';
import { deadlineCellClass, deadlineTone, formatSheetDate, sheetStatusClass, toSheetStatus } from '@/lib/dailyStatus';
import RowMoreMenu, { RowMoreMenuItem } from './RowMoreMenu';

export default function AssignedWorkTable({
  assignments,
  filter,
  currentUser,
  today,
  focusTaskId,
  taskBusy,
  onUpdateTask,
  onAcceptOrReject,
  onRequestDependency,
  onEditSubtask,
  onDeleteSubtask,
}: {
  assignments: WorkAssignment[];
  filter: WorkFilter;
  currentUser: User;
  today: string;
  focusTaskId: string | null;
  taskBusy: string | null;
  onUpdateTask: (
    assignment: WorkAssignment,
    body: { status?: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED'; blocked_reason?: string; progress_percent?: number; review_action?: 'approve' | 'return' | 'resubmit'; review_comments?: string }
  ) => void;
  onAcceptOrReject: (assignment: WorkAssignment, action: 'accept' | 'reject') => void;
  onRequestDependency: (taskId: string, label: string) => void;
  onEditSubtask: (assignment: WorkAssignment) => void;
  onDeleteSubtask: (assignment: WorkAssignment) => void;
}) {
  const groups = useMemo(() => buildAssignedWorkGroups(assignments, filter, today), [assignments, filter, today]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!focusTaskId) return;
    const match = groups.find((group) =>
      group.nodes.some(
        (node) =>
          node.item?.task_id === focusTaskId ||
          node.item?.id === focusTaskId ||
          node.children.some((child) => child.item?.task_id === focusTaskId || child.item?.id === focusTaskId)
      )
    );
    if (match) setCollapsed((prev) => ({ ...prev, [match.id]: false }));
  }, [focusTaskId, groups]);

  const renderRow = (node: AssignedWorkNode, depth: 0 | 1, group: AssignedWorkGroup) => {
    const item = node.item;
    if (!item) {
      return (
        <React.Fragment key={`${group.id}-${node.children[0]?.item?.parent_task_id || node.contextTitle}`}>
          <tr className="border-b border-slate-800/60">
            <td className="px-4 py-2.5" colSpan={5}>
              <div className="pl-4 text-[11px] text-slate-500">{node.contextTitle}</div>
            </td>
          </tr>
          {node.children.map((child) => renderRow(child, 1, group))}
        </React.Fragment>
      );
    }

    const overdue = Boolean(item.due_date && item.due_date < today && item.current_status !== 'DONE' && item.current_status !== 'COMPLETED');
    const taskId = item.task_id || (item.source === 'TASK' ? item.id : '');
    const busy = taskBusy === taskId;
    const isAssignee = item.assigned_to_id === currentUser.id;
    const canEditDetails = canAssigneeEditAssignment(currentUser.id, item);
    const isReviewer = currentUser.role_code === 'TEAM_LEAD' && item.review_status === 'PENDING_TL_REVIEW';
    const sheetStatus = toSheetStatus(item.current_status);
    const done = item.current_status === 'DONE' || item.current_status === 'COMPLETED';
    const pendingAccept = item.acceptance_status === 'REQUESTED';
    const canDaily = Boolean(currentUser && canSubmitDailyUpdate(currentUser) && isAssignee && canEditDetails && !pendingAccept);
    const canComplete = Boolean(taskId && isAssignee && !done && canEditDetails && item.review_status !== 'PENDING_TL_REVIEW');
    const focused = Boolean(focusTaskId && (item.task_id === focusTaskId || item.id === focusTaskId));
    const isSubtask = depth === 1 || Boolean(item.parent_task_id);

    const moreItems: RowMoreMenuItem[] = [
      ...(taskId && isAssignee && canEditDetails
        ? [{
            id: 'dep',
            label: 'Request Dependency',
            onSelect: () => onRequestDependency(taskId, item.description || item.task_title || 'Task'),
          }]
        : []),
      ...(taskId && isAssignee && !done && canEditDetails
        ? [{
            id: 'issue',
            label: 'Raise Issue / Doubt',
            onSelect: () => {
              const reason = window.prompt('Describe the issue or doubt') || '';
              if (!reason.trim()) return;
              onUpdateTask(item, { status: 'BLOCKED', blocked_reason: reason.trim() });
            },
          }]
        : []),
      ...(taskId && isAssignee && (item.current_status === 'TODO' || item.current_status === 'NOT_STARTED') && !item.blocked && canEditDetails
        ? [{ id: 'start', label: 'Start Task', onSelect: () => onUpdateTask(item, { status: 'IN_PROGRESS' }) }]
        : []),
      ...(taskId && isAssignee && item.parent_task_id && canEditDetails
        ? [
            { id: 'edit-sub', label: 'Edit Subtask', onSelect: () => onEditSubtask(item) },
            {
              id: 'del-sub',
              label: 'Delete Subtask',
              danger: true,
              onSelect: () => {
                if (!window.confirm('Delete this subtask?')) return;
                onDeleteSubtask(item);
              },
            },
          ]
        : []),
      ...(taskId && isReviewer
        ? [
            { id: 'approve', label: 'Approve', onSelect: () => onUpdateTask(item, { review_action: 'approve' }) },
            {
              id: 'return',
              label: 'Send Back',
              danger: true,
              onSelect: () => {
                const comments = window.prompt('Comments for send-back (required)') || '';
                if (!comments.trim()) return;
                onUpdateTask(item, { review_action: 'return', review_comments: comments.trim() });
              },
            },
          ]
        : []),
    ];

    return (
      <React.Fragment key={item.id}>
        <tr className={`border-b border-slate-800/60 last:border-0 ${focused ? 'bg-cyan-950/30' : overdue ? 'bg-rose-950/15' : ''}`}>
          <td className="px-4 py-3 align-top">
            <div className={isSubtask ? 'pl-6' : 'pl-1'}>
              <div className="flex min-w-0 items-start gap-2">
                {isSubtask ? <span className="mt-0.5 shrink-0 text-slate-600">└</span> : null}
                <div className="min-w-0">
                  <div className="line-clamp-2 break-words font-semibold leading-snug text-slate-100">
                    {item.description || item.task_title}
                  </div>
                  {!isAssignee && item.assigned_to ? (
                    <div className="mt-1 text-[10px] text-slate-500">Assigned to {item.assigned_to}</div>
                  ) : null}
                </div>
              </div>
            </div>
          </td>
          <td className="whitespace-nowrap px-3 py-3 align-top tabular-nums text-slate-300">{formatSheetDate(item.start_date)}</td>
          <td className={`whitespace-nowrap px-3 py-3 align-top tabular-nums ${deadlineCellClass(deadlineTone(sheetStatus, item.due_date, today))}`}>
            {overdue && <AlertTriangle className="mr-1 inline h-3 w-3" />}
            {formatSheetDate(item.due_date)}
          </td>
          <td className="px-3 py-3 align-top">
            <span className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-bold ${sheetStatusClass(sheetStatus)}`}>
              {pendingAccept ? assignmentStatusLabel(item) : sheetStatus}
            </span>
          </td>
          <td className="px-3 py-3 align-top">
            <div className="flex flex-nowrap items-center justify-end gap-1">
              {canComplete && (
                <button
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm('Are you sure you want to mark this task as completed?')) return;
                    onUpdateTask(item, {
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
                    onClick={() => onAcceptOrReject(item, 'accept')}
                    className="h-7 shrink-0 rounded-md bg-emerald-700 px-2 text-[10px] font-bold text-white hover:bg-emerald-600 disabled:opacity-60"
                  >
                    Accept
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => onAcceptOrReject(item, 'reject')}
                    className="h-7 shrink-0 rounded-md border border-rose-800 px-2 text-[10px] font-bold text-rose-200 hover:bg-rose-950 disabled:opacity-60"
                  >
                    Reject
                  </button>
                </>
              )}
              <RowMoreMenu items={moreItems} />
            </div>
          </td>
        </tr>
        {node.children.map((child) => renderRow(child, 1, group))}
      </React.Fragment>
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] table-fixed text-left">
        <colgroup>
          <col className="w-[42%]" />
          <col className="w-[14%]" />
          <col className="w-[14%]" />
          <col className="w-[14%]" />
          <col className="w-[16%]" />
        </colgroup>
        <thead className="text-[10px] uppercase tracking-wider text-slate-500">
          <tr className="border-b border-slate-800">
            <th className="px-4 py-2 font-semibold">Lead / Task</th>
            <th className="whitespace-nowrap px-3 py-2 font-semibold">Start Date</th>
            <th className="whitespace-nowrap px-3 py-2 font-semibold">Deadline</th>
            <th className="px-3 py-2 font-semibold">Status</th>
            <th className="px-3 py-2 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => {
            const isOpen = !group.nested || !collapsed[group.id];
            return (
              <React.Fragment key={group.id}>
                <tr className="border-t border-slate-800 bg-slate-800/50">
                  <td colSpan={5} className="p-0">
                    {group.nested ? (
                      <button
                        type="button"
                        onClick={() => setCollapsed((prev) => ({ ...prev, [group.id]: !prev[group.id] }))}
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-slate-800"
                        aria-expanded={isOpen}
                      >
                        {isOpen ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
                        <span className="font-mono font-bold text-cyan-400">{group.code}</span>
                        <span className="font-semibold text-slate-100">— {group.title}</span>
                        {group.subtitle ? <span className="truncate text-slate-500">{group.subtitle}</span> : null}
                        <span className="ml-auto shrink-0 text-[11px] text-slate-400">
                          {group.taskCount} {group.taskCount === 1 ? 'Task' : 'Tasks'}
                        </span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 px-4 py-2.5">
                        <span className="font-mono font-bold text-cyan-400">{group.code}</span>
                        <span className="font-semibold text-slate-100">— {group.title}</span>
                        {group.subtitle ? <span className="truncate text-slate-500">{group.subtitle}</span> : null}
                        <span className="ml-auto shrink-0 text-[11px] text-slate-400">
                          {group.taskCount} {group.taskCount === 1 ? 'Task' : 'Tasks'}
                        </span>
                      </div>
                    )}
                  </td>
                </tr>
                {isOpen && group.nodes.map((node) => renderRow(node, 0, group))}
              </React.Fragment>
            );
          })}
          {groups.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                No lead tasks in this filter.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
