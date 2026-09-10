'use client';

import { Link } from '@/lib/navigation';
import React, { useEffect, useMemo, useState } from 'react';
import { DailyUpdatesApi } from '@/lib/dailyUpdatesApi';
import { DailyStatusApi } from '@/lib/dailyStatusApi';
import { TasksApi } from '@/lib/tasksApi';
import { StorageService } from '@/lib/storage';
import { User, WorkAssignment } from '@/lib/types';
import { DailyStatusPerson, DailyStatusRow, appTodayIso } from '@/lib/dailyStatus';
import { canCreateWorkTask } from '@/lib/rbac';
import { isLeadBasedAssignment } from '@/lib/leadTasks';
import { WorkFilter } from '@/lib/assignedWork';
import CreateTaskForm from '@/components/work/CreateTaskForm';
import PendingTaskAssignmentCard from '@/components/work/PendingTaskAssignmentCard';
import AssignedWorkTable from '@/components/work/AssignedWorkTable';
import AddSubtaskForm, { EditableSubtask } from '@/components/work/AddSubtaskForm';
import RequestDependencyForm from '@/components/work/RequestDependencyForm';
import { CheckSquare, Plus } from 'lucide-react';

export default function MyAssignedWorkPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<WorkAssignment[]>([]);
  const [filter, setFilter] = useState<WorkFilter>('ALL');
  const [showCreate, setShowCreate] = useState(false);
  const [taskBusy, setTaskBusy] = useState<string | null>(null);
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

  const leadAssignments = useMemo(() => assignments.filter(isLeadBasedAssignment), [assignments]);
  const pendingLeadAssignments = useMemo(
    () => leadAssignments.filter((item) => item.acceptance_status === 'REQUESTED' && item.assigned_to_id === currentUser?.id),
    [leadAssignments, currentUser]
  );

  const refreshWork = async () => {
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
      setNotice(result.message || 'Unable to update assignment.');
      return;
    }
    setNotice(
      result.data.message ||
        (action === 'accept'
          ? 'Task accepted. You can now edit it in My Assigned Work and Daily Work Updates.'
          : 'Task declined.')
    );
    await refreshWork();
  };

  if (!currentUser) return null;

  const today = appTodayIso();

  return (
    <div className="space-y-6 text-xs">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
          <CheckSquare className="h-4 w-4" /> My Work
        </div>
        <h1 className="mt-1 text-xl font-bold text-slate-100">My Assigned Work</h1>
        <p className="mt-0.5 text-xs text-slate-400">
          Lead-based tasks assigned to <span className="font-semibold text-cyan-300">{currentUser.name}</span>.
        </p>
        {notice && <div className="mt-3 rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-emerald-200">{notice}</div>}
      </div>

      <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/90 p-5">
        <div className="flex flex-col gap-3 border-b border-slate-800 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-bold text-slate-100">My Lead Work</h2>
            <p className="mt-0.5 text-[11px] text-slate-400">Lead-based tasks assigned to you.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-2.5 py-1 font-bold text-white">
              <Plus className="h-3 w-3" /> Create Task
            </button>
            <Link href="/daily-updates" className="text-cyan-400 hover:underline">
              Daily Work Updates
            </Link>
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
        <div className="flex flex-wrap gap-1">
          {([
            ['ALL', 'All'],
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
        <AssignedWorkTable
          assignments={leadAssignments}
          filter={filter}
          currentUser={currentUser}
          today={today}
          focusTaskId={focusTaskId}
          taskBusy={taskBusy}
          onUpdateTask={(item, body) => void updateTask(item, body)}
          onAcceptOrReject={(item, action) => void acceptOrReject(item, action)}
          onRequestDependency={(taskId, label) => setDependencyFor({ id: taskId, label })}
          onEditSubtask={(item) => {
            const taskId = item.task_id || item.id;
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
          }}
          onDeleteSubtask={(item) => {
            const taskId = item.task_id || item.id;
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
          }}
        />
      </div>

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
