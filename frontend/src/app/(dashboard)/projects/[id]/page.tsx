'use client';

import { Link, useParams, usePathname, useRouter, useSearchParams } from '@/lib/navigation';
import React, { useEffect, useState } from 'react';
import { resolveProjectIdFromLocation } from '@/lib/projectRoutes';
import { ArrowLeft, Bot, ShieldAlert } from 'lucide-react';
import { ProjectsApi } from '@/lib/projectsApi';
import { TasksApi } from '@/lib/tasksApi';
import {
  ESCALATION_LEVEL_LABELS,
  formatDateTime,
  formatInrCompact,
  formatLongDate,
  PROJECT_ACTION_SUCCESS,
  TASK_STATUS_LABELS,
  WORK_STATUS_LABELS,
} from '@/lib/format';
import { StorageService } from '@/lib/storage';
import { canOpenProjectGantt } from '@/lib/rbac';
import { formatEmployeeDisplayName } from '@/lib/people';
import { deadlineCellClass, deadlineTone, toSheetStatus } from '@/lib/dailyStatus';
import { ProjectDetailPayload, ProjectStatus, Task, User } from '@/lib/types';
import ProjectWorkflowBanner from '@/components/projects/ProjectWorkflowBanner';
import SmartEmailNotificationPanel from '@/components/notifications/SmartEmailNotificationPanel';
import ProjectGanttPanel from '@/components/planning/ProjectGanttPanel';
import EntityDocumentUpload from '@/components/documents/EntityDocumentUpload';
import KPIStatCard from '@/components/work/KPIStatCard';
import ModuleCard from '@/components/work/ModuleCard';
import EmployeePerformanceCard from '@/components/work/EmployeePerformanceCard';
import StatusBadge from '@/components/work/StatusBadge';

function healthClass(health: string) {
  if (health === 'CRITICAL') return 'border-rose-800 bg-rose-950 text-rose-300';
  if (health === 'AT_RISK') return 'border-amber-800 bg-amber-950 text-amber-300';
  return 'border-emerald-800 bg-emerald-950 text-emerald-300';
}

const CREATE_INTAKE_FIELDS: Array<[string, string]> = [
  ['title', 'Project title'],
  ['customer_name', 'Customer'],
  ['customer_type', 'Customer type'],
  ['business_vertical', 'Business vertical'],
  ['priority', 'Priority'],
  ['customer_contact', 'Contact name'],
  ['customer_designation', 'Designation'],
  ['customer_email', 'Contact email'],
  ['customer_phone', 'Contact phone'],
  ['customer_location', 'Location'],
  ['plant_location', 'Plant location'],
  ['project_description', 'Project description'],
  ['requirement_summary', 'Requirement summary'],
  ['detailed_requirement', 'Detailed requirement'],
  ['application', 'Application'],
  ['industry_process', 'Industry / process'],
  ['current_process', 'Current process'],
  ['expected_automation', 'Expected automation'],
  ['required_solution', 'Required solution'],
  ['customer_objective', 'Customer objective'],
  ['customer_challenge', 'Customer challenge'],
  ['competitor_information', 'Competitor information'],
  ['expected_project_timeline', 'Expected timeline'],
  ['customer_target_date', 'Target date'],
  ['production_quantity', 'Production quantity'],
  ['production_rate', 'Production rate'],
  ['cycle_time', 'Cycle time'],
  ['shift_pattern', 'Shift pattern'],
  ['operating_hours', 'Operating hours'],
  ['existing_equipment', 'Existing equipment'],
  ['existing_automation', 'Existing automation'],
  ['integration_requirements', 'Integration requirements'],
  ['technical_requirements', 'Technical requirements'],
  ['machine_dimensions', 'Machine dimensions'],
  ['payload', 'Payload'],
  ['accuracy_requirement', 'Accuracy'],
  ['environment_conditions', 'Environment'],
  ['technical_specifications', 'Technical specifications'],
  ['technical_assumptions', 'Technical assumptions'],
  ['customer_dependencies', 'Customer dependencies'],
  ['customer_budget', 'Customer budget'],
  ['estimated_opportunity_value', 'Opportunity value'],
  ['expected_po_date', 'Expected PO date'],
  ['commercial_remarks', 'Commercial remarks'],
  ['additional_notes', 'Additional notes'],
  ['required_documents', 'Required documents'],
];

const INTAKE_FIELDS: Array<[string, string]> = [
  ['title', 'Project title'],
  ['customer_name', 'Customer'],
  ['customer_contact_name', 'Contact name'],
  ['customer_contact_email', 'Contact email'],
  ['customer_contact_phone', 'Contact phone'],
  ['customer_location', 'Location'],
  ['industry', 'Industry'],
  ['project_type', 'Project type'],
  ['estimated_opportunity_value', 'Opportunity value'],
  ['customer_target_date', 'Target date'],
  ['scope_summary', 'Scope'],
  ['requirements_summary', 'Requirements'],
  ['technical_notes', 'Technical notes'],
  ['dependencies', 'Dependencies'],
  ['pm_instructions', 'PM instructions'],
  ['project_goals', 'Project goals'],
  ['timeline_notes', 'Timeline'],
];

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const projectId = resolveProjectIdFromLocation(params.id, pathname, searchParams.get('id'));
  const router = useRouter();
  const [detail, setDetail] = useState<ProjectDetailPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<ProjectStatus>('ACTIVE');
  const [target, setTarget] = useState('');
  const [remark, setRemark] = useState('');
  const [escIssue, setEscIssue] = useState('');
  const [escImpact, setEscImpact] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [intakeComment, setIntakeComment] = useState('');
  const [tlComment, setTlComment] = useState('');
  const [monitorComment, setMonitorComment] = useState('');
  const [taskBusy, setTaskBusy] = useState<string | null>(null);
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    priority: 'Medium',
    start_date: '',
    due_date: '',
    assigned_to_ids: [] as string[],
    depends_on_id: '',
  });
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [historyFilter, setHistoryFilter] = useState('');
  const [historyQuery, setHistoryQuery] = useState('');
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);

  const load = async () => {
    if (!projectId) {
      setError('Project not found or you do not have access.');
      return;
    }
    const payload = await ProjectsApi.get(projectId);
    if (!payload) {
      setError('Project not found or you do not have access.');
      return;
    }
    setDetail(payload);
    setStatus(payload.project.status);
    setTarget(payload.project.target_completion || '');
    setEscIssue(payload.project.issue || '');
  };

  useEffect(() => {
    setUser(StorageService.getCurrentUser());
    void load();
  }, [projectId]);

  if (error && !detail) {
    return <div className="rounded-xl border border-rose-900 bg-rose-950/40 p-5 text-xs text-rose-300">{error}</div>;
  }
  if (!detail) return null;

  const project = detail.project;
  const workflow = detail.workflow;
  const intake = (project.intake_form || {}) as Record<string, unknown>;
  const allTasks = detail.tasks || [];
  const memberOnly = Boolean(
    user &&
      !detail.canManage &&
      user.role_code !== 'TEAM_LEAD' &&
      !['CEO', 'CTO', 'BUSINESS_HEAD', 'ENG_DIRECTOR', 'SYSTEM_ADMIN'].includes(user.role_code)
  );
  const visibleTasks = memberOnly ? allTasks.filter((task) => task.assigned_to_id === user?.id) : allTasks;
  const doneCount = allTasks.filter((task) => task.status === 'DONE' && task.review_status !== 'PENDING_TL_REVIEW').length;
  const taskProgress = allTasks.length ? Math.round((doneCount / allTasks.length) * 100) : project.progress;
  const inProgressCount = allTasks.filter((task) => task.status === 'IN_PROGRESS').length;
  const waitingCount = allTasks.filter((task) => task.status === 'BLOCKED' || task.status === 'WAITING').length;
  const holdCount = allTasks.filter((task) => task.status === 'HOLD').length;
  const overdueCount = allTasks.filter((task) => task.due_date && task.due_date < new Date().toISOString().slice(0, 10) && task.status !== 'DONE').length;
  const teamMemberCount = new Set(allTasks.map((task) => task.assigned_to_id).filter(Boolean)).size;
  const filteredVisible = employeeFilter ? visibleTasks.filter((task) => task.assigned_to_id === employeeFilter) : visibleTasks;
  const historyTasks = visibleTasks.filter((task) => {
    if (historyFilter === 'Completed') return task.status === 'DONE';
    if (historyFilter === 'In Progress') return task.status === 'IN_PROGRESS';
    if (historyFilter === 'Waiting') return task.status === 'BLOCKED' || task.status === 'WAITING';
    if (historyFilter === 'Hold') return task.status === 'HOLD';
    if (historyFilter === 'Yet to Start') return task.status === 'TODO';
    if (historyFilter === 'Overdue') return Boolean(task.due_date && task.due_date < new Date().toISOString().slice(0, 10) && task.status !== 'DONE');
    return true;
  }).filter((task) => {
    const q = historyQuery.trim().toLowerCase();
    if (!q) return true;
    return [task.title, task.description, task.assigned_to].filter(Boolean).join(' ').toLowerCase().includes(q);
  });

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    await fn();
  };

  const updateTask = async (task: Task, body: Parameters<typeof TasksApi.update>[1], success: string) => {
    setTaskBusy(task.id);
    const result = await TasksApi.update(task.id, body);
    setTaskBusy(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setMessage(success);
    await load();
  };

  return (
    <div className="space-y-6 text-xs">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <Link href="/dashboard" className="inline-flex items-center gap-1 text-cyan-400 hover:underline">
          <ArrowLeft className="h-3 w-3" /> Dashboard
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
              <Bot className="h-4 w-4" /> Project overview
            </div>
            <h1 className="mt-1 text-xl font-bold text-slate-100">{project.name}</h1>
            <p className="mt-1 text-slate-400">
              Project No: {project.code}
              {project.lead_number ? ` · Lead ${project.lead_number}` : ''}
              {` · ${formatLongDate(project.start_date)} → ${formatLongDate(project.target_completion)}`}
            </p>
            {canOpenProjectGantt(user, project) && (
              <Link href={`/projects/planning?project=${project.id}`} className="mt-2 inline-block text-cyan-400 hover:underline">
                Open Gantt & Planning
              </Link>
            )}
          </div>
          <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${healthClass(project.health)}`}>
            {project.health.replace('_', ' ')}
          </span>
        </div>
      </div>

      <ProjectWorkflowBanner workflow={workflow} message={message} error={error} />

      <SmartEmailNotificationPanel entityType="PROJECT" entityId={project.id} />

      {user &&
        canOpenProjectGantt(user, project) &&
        !['DRAFT', 'SUBMITTED_TO_PM', 'RETURNED_TO_CREATOR'].includes(project.intake_status || '') && (
          <ProjectGanttPanel user={user} projectId={project.id} />
        )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
        <KPIStatCard label="Total Tasks" value={allTasks.length} />
        <KPIStatCard label="Completed" value={doneCount} tone="success" />
        <KPIStatCard label="In Progress" value={inProgressCount} />
        <KPIStatCard label="Waiting" value={waitingCount} tone="warning" />
        <KPIStatCard label="Hold" value={holdCount} tone="warning" />
        <KPIStatCard label="Overdue" value={overdueCount} tone="danger" />
        <KPIStatCard label="Team Members" value={teamMemberCount} />
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
        <h2 className="mb-3 text-sm font-bold text-slate-100">Overall Project Progress</h2>
        <div className="mb-1 flex items-center justify-between text-slate-400">
          <span>{taskProgress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-800">
          <div className={`h-full ${project.health === 'CRITICAL' ? 'bg-rose-500' : project.health === 'AT_RISK' ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${taskProgress}%` }} />
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Project ID" value={project.code} />
        <Field label="Lead ID" value={project.lead_number || project.lead_id || '—'} href={project.lead_id ? `/pre-sales/leads/${project.lead_id}` : undefined} />
        <Field label="Project Manager" value={formatEmployeeDisplayName(project.pm_name)} />
        <Field label="Team Lead" value={formatEmployeeDisplayName(project.team_lead_name || '—')} />
        <Field label="Assigned member" value={formatEmployeeDisplayName(project.assigned_member_name || '—')} />
        <Field label="Assigned by" value={project.assigned_by_name ? `${project.assigned_by_name} · ${formatDateTime(project.assigned_at)}` : '—'} />
        <Field label="Project value" value={formatInrCompact(project.value || 0)} />
        <Field label="Start date" value={formatLongDate(project.start_date)} />
        <Field label="Target completion" value={formatLongDate(project.target_completion)} />
        <Field label="Overall progress" value={`${taskProgress}%`} />
        <Field label="Health" value={project.health.replace('_', ' ')} />
        <Field label="Monitor" value={project.monitor_status === 'ISSUE_IDENTIFIED' ? 'Issue / Blocker Identified' : project.monitor_status === 'ON_TRACK' ? 'On Track' : '—'} />
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
        <h2 className="mb-3 text-sm font-bold text-slate-100">Current status</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Current stage" value={detail.currentStatus.phase} />
          <Field label="Current task" value={detail.currentStatus.current_task} />
          <Field label="Current owner" value={detail.currentStatus.current_owner} />
          <Field label="Current blocker" value={detail.currentStatus.current_blocker || '—'} />
          <Field label="Last update" value={formatLongDate(detail.currentStatus.last_update)} />
          <Field
            label="Next milestone"
            value={detail.currentStatus.next_milestone
              ? `${detail.currentStatus.next_milestone.name} · ${formatLongDate(detail.currentStatus.next_milestone.date)}${detail.currentStatus.next_milestone.delayed ? ' · DELAYED' : ''}`
              : '—'}
          />
        </div>
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-slate-400">
            <span>Progress</span>
            <span className="text-slate-100">{taskProgress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded bg-slate-800">
            <div
              className={`h-full ${project.health === 'CRITICAL' ? 'bg-rose-500' : project.health === 'AT_RISK' ? 'bg-amber-400' : 'bg-emerald-500'}`}
              style={{ width: `${taskProgress}%` }}
            />
          </div>
        </div>
      </section>

      {(Object.keys(intake).length > 0 || project.source === 'DIRECT_CREATE') && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
          <h2 className="mb-3 text-sm font-bold text-slate-100">Project scope & requirements</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(project.source === 'DIRECT_CREATE' ? CREATE_INTAKE_FIELDS : INTAKE_FIELDS).map(([key, label]) => {
              const value = intake[key];
              if (value === undefined || value === null || value === '') return null;
              return <Field key={key} label={label} value={String(value)} />;
            })}
          </div>
          {project.intake_comment && (
            <p className="mt-3 rounded border border-slate-800 bg-slate-950/60 p-2 text-slate-300">Latest comment: {project.intake_comment}</p>
          )}
        </section>
      )}

      <EntityDocumentUpload
        entityType="PROJECT"
        entityId={project.id}
        canEdit={Boolean(detail.canManage || user?.role_code === 'TEAM_LEAD')}
        ensureEntity={async () => project.id}
        title="Documents"
      />

      {(detail.actions?.canPmReview || detail.actions?.canAssign || detail.actions?.canIntake || detail.actions?.canTlReview || (detail.actions?.canEscalate && !detail.canManage) || detail.actions?.canMonitor || detail.actions?.canBreakdown) && (
        <section className="space-y-4 rounded-xl border border-cyan-900/50 bg-slate-900/90 p-5">
          <h2 className="text-sm font-bold text-slate-100">Execution workflow</h2>
          {detail.actions?.canPmReview && (
            <div className="space-y-2">
              <p className="text-slate-400">Review the complete project information. Accept to continue to Team Lead assignment, or return to the creator with a reason.</p>
              <textarea rows={2} value={intakeComment} onChange={(e) => setIntakeComment(e.target.value)} placeholder="Comments (required if returning)" className="w-full rounded border border-slate-800 bg-slate-950 p-2.5 text-slate-100" />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void run(async () => {
                    const result = await ProjectsApi.pmReview(project.id, 'accept', intakeComment);
                    if (!result.ok) {
                      setError(result.message);
                      return;
                    }
                    setMessage(PROJECT_ACTION_SUCCESS.pmAccepted);
                    await load();
                  })}
                  className="rounded-lg bg-emerald-700 px-4 py-2 font-bold text-white hover:bg-emerald-600"
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => void run(async () => {
                    const result = await ProjectsApi.pmReview(project.id, 'return', intakeComment);
                    if (!result.ok) {
                      setError(result.message);
                      return;
                    }
                    setMessage(PROJECT_ACTION_SUCCESS.pmReturned);
                    await load();
                  })}
                  className="rounded-lg border border-amber-800 bg-amber-950 px-4 py-2 font-bold text-amber-100 hover:bg-amber-900"
                >
                  Return to Creator
                </button>
              </div>
            </div>
          )}
          {detail.actions?.canAssign && (
            <div className="space-y-2">
              <p className="text-slate-400">Assign to one or more teams. Pick Team Leads and Team Members across Software, Vision, Robotics, Procurement, and Execution. You stay the Project Manager.</p>
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start">
                <TeamPeoplePicker
                  teams={detail.assignableTeams || []}
                  people={detail.assignableUsers || []}
                  selectedIds={assigneeIds}
                  onChange={setAssigneeIds}
                  emptyLabel="No Team Leads or Team Members available."
                />
                <button
                  type="button"
                  onClick={() => void run(async () => {
                    if (!assigneeIds.length) {
                      setError('Select at least one Team Lead or Team Member.');
                      return;
                    }
                    const result = await ProjectsApi.assign(project.id, assigneeIds);
                    if (!result.ok) {
                      setError(result.message);
                      return;
                    }
                    setAssigneeIds([]);
                    setMessage(PROJECT_ACTION_SUCCESS.assigned);
                    await load();
                  })}
                  className="rounded-lg bg-cyan-600 px-4 py-2 font-bold text-white hover:bg-cyan-500"
                >
                  Assign project
                </button>
              </div>
            </div>
          )}
          {detail.actions?.canIntake && (
            <div className="space-y-2">
              <p className="text-slate-400">Review scope, requirements, documents, timeline, dependencies, and PM instructions. Accept to break into tasks, or return with comments.</p>
              <textarea rows={2} value={intakeComment} onChange={(e) => setIntakeComment(e.target.value)} placeholder="Comments (required if returning)" className="w-full rounded border border-slate-800 bg-slate-950 p-2.5 text-slate-100" />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void run(async () => {
                    const result = await ProjectsApi.intake(project.id, 'accept', intakeComment);
                    if (!result.ok) {
                      setError(result.message);
                      return;
                    }
                    setMessage(PROJECT_ACTION_SUCCESS.accepted);
                    await load();
                  })}
                  className="rounded-lg bg-emerald-700 px-4 py-2 font-bold text-white hover:bg-emerald-600"
                >
                  Accept Project
                </button>
                <button
                  type="button"
                  onClick={() => void run(async () => {
                    const result = await ProjectsApi.intake(project.id, 'return', intakeComment);
                    if (!result.ok) {
                      setError(result.message);
                      return;
                    }
                    setMessage(PROJECT_ACTION_SUCCESS.returned);
                    await load();
                  })}
                  className="rounded-lg border border-amber-800 bg-amber-950 px-4 py-2 font-bold text-amber-100 hover:bg-amber-900"
                >
                  Return / Cancel
                </button>
              </div>
            </div>
          )}
          {detail.actions?.canBreakdown && (
            <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <h3 className="font-bold text-slate-100">Task breakdown & assignment</h3>
              <div className="grid gap-2 md:grid-cols-2">
                <input value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} placeholder="Task name" className="rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
                <div>
                  <div className="mb-1 text-slate-400">Assigned team member *</div>
                  <TeamPeoplePicker
                    teams={(detail.assignableTeams || []).filter((team) =>
                      user?.role_code === 'TEAM_LEAD' ? team.id === user.team_id : true
                    )}
                    people={(detail.assignableUsers || []).filter((item) =>
                      user?.role_code === 'TEAM_LEAD' ? item.team_id === user.team_id || item.id === user.id : true
                    )}
                    selectedIds={taskForm.assigned_to_ids}
                    onChange={(ids) => setTaskForm({ ...taskForm, assigned_to_ids: ids })}
                    emptyLabel="No team members available."
                    compact
                  />
                </div>
                <input value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} placeholder="Description" className="rounded border border-slate-800 bg-slate-950 p-2 text-slate-100 md:col-span-2" />
                <select value={taskForm.priority} onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })} className="rounded border border-slate-800 bg-slate-950 p-2 text-slate-100">
                  <option>Low</option>
                  <option>Medium</option>
                  <option>High</option>
                  <option>Critical</option>
                </select>
                <input type="date" value={taskForm.start_date} onChange={(e) => setTaskForm({ ...taskForm, start_date: e.target.value })} className="rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" title="Start date" />
                <input type="date" value={taskForm.due_date} onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })} className="rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
                <select value={taskForm.depends_on_id} onChange={(e) => setTaskForm({ ...taskForm, depends_on_id: e.target.value })} className="rounded border border-slate-800 bg-slate-950 p-2 text-slate-100 md:col-span-2">
                  <option value="">No dependency</option>
                  {allTasks.map((task) => (
                    <option key={task.id} value={task.id}>{task.title}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => void run(async () => {
                  if (!taskForm.title.trim() || !taskForm.assigned_to_ids.length) {
                    setError('Task name and at least one assigned team member are required.');
                    return;
                  }
                  const result = await TasksApi.create({
                    title: taskForm.title.trim(),
                    description: taskForm.description,
                    task_type: 'PROJECT_TASK',
                    project_id: project.id,
                    assigned_to_id: taskForm.assigned_to_ids[0],
                    assigned_to_ids: taskForm.assigned_to_ids,
                    start_date: taskForm.start_date || undefined,
                    due_date: taskForm.due_date || undefined,
                    priority: taskForm.priority,
                    depends_on_id: taskForm.depends_on_id || undefined,
                  });
                  if (!result.ok) {
                    setError(result.message);
                    return;
                  }
                  setTaskForm({ title: '', description: '', priority: 'Medium', start_date: '', due_date: '', assigned_to_ids: [], depends_on_id: '' });
                  setMessage(PROJECT_ACTION_SUCCESS.taskAssigned);
                  await load();
                })}
                className="rounded-lg bg-cyan-600 px-4 py-2 font-bold text-white hover:bg-cyan-500"
              >
                Assign task
              </button>
            </div>
          )}
          {detail.actions?.canMonitor && (
            <div className="space-y-2">
              <p className="text-slate-400">Review task progress, daily updates, quality, issues, and overall health.</p>
              <textarea rows={2} value={monitorComment} onChange={(e) => setMonitorComment(e.target.value)} placeholder="Comments required if an issue/blocker is identified" className="w-full rounded border border-slate-800 bg-slate-950 p-2.5 text-slate-100" />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void run(async () => {
                    const result = await ProjectsApi.monitor(project.id, 'ON_TRACK', monitorComment);
                    if (!result.ok) {
                      setError(result.message);
                      return;
                    }
                    setMessage(PROJECT_ACTION_SUCCESS.onTrack);
                    await load();
                  })}
                  className="rounded-lg bg-emerald-700 px-4 py-2 font-bold text-white hover:bg-emerald-600"
                >
                  On Track
                </button>
                <button
                  type="button"
                  onClick={() => void run(async () => {
                    const result = await ProjectsApi.monitor(project.id, 'ISSUE_IDENTIFIED', monitorComment);
                    if (!result.ok) {
                      setError(result.message);
                      return;
                    }
                    setMessage(PROJECT_ACTION_SUCCESS.issueIdentified);
                    await load();
                  })}
                  className="rounded-lg border border-amber-800 bg-amber-950 px-4 py-2 font-bold text-amber-100 hover:bg-amber-900"
                >
                  Issue / Blocker Identified
                </button>
              </div>
            </div>
          )}
          {detail.actions?.canTlReview && (
            <div className="space-y-2">
              <p className="text-slate-400">All tasks are complete. Submit Team Lead final review so the PM can approve closure.</p>
              <textarea rows={2} value={tlComment} onChange={(e) => setTlComment(e.target.value)} placeholder="Final review notes" className="w-full rounded border border-slate-800 bg-slate-950 p-2.5 text-slate-100" />
              <button
                type="button"
                onClick={() => void run(async () => {
                  const result = await ProjectsApi.tlReview(project.id, tlComment);
                  if (!result.ok) {
                    setError(result.message);
                    return;
                  }
                  setMessage(PROJECT_ACTION_SUCCESS.tlReview);
                  await load();
                })}
                className="rounded-lg bg-cyan-600 px-4 py-2 font-bold text-white hover:bg-cyan-500"
              >
                Submit Team Lead review
              </button>
            </div>
          )}
          {detail.actions?.canEscalate && !detail.canManage && (
            <div className="grid gap-2 md:grid-cols-2">
              <input value={escIssue} onChange={(e) => setEscIssue(e.target.value)} placeholder="Escalation issue" className="rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
              <input value={escImpact} onChange={(e) => setEscImpact(e.target.value)} placeholder="Impact" className="rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
              <button
                type="button"
                onClick={() => void run(async () => {
                  const result = await ProjectsApi.escalate(project.id, { issue: escIssue, impact: escImpact, severity: 'HIGH' });
                  if (!result.ok) {
                    setError(result.message);
                    return;
                  }
                  setMessage(PROJECT_ACTION_SUCCESS.escalated);
                  await load();
                })}
                className="inline-flex items-center gap-1 rounded-lg border border-rose-800 bg-rose-950 px-4 py-2 font-bold text-rose-200 hover:bg-rose-900"
              >
                <ShieldAlert className="h-3.5 w-3.5" /> Escalate issue
              </button>
            </div>
          )}
        </section>
      )}

      <section className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-100">Project Modules</h2>
          <span className="text-slate-400">{doneCount}/{allTasks.length || 0} complete · {taskProgress}%</span>
        </div>
        {filteredVisible.length === 0 && <p className="text-slate-500">No tasks assigned yet.</p>}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredVisible.map((task) => (
            <ModuleCard
              key={task.id}
              name={task.title}
              assignee={task.assigned_to}
              progress={task.progress_percent || 0}
              status={TASK_STATUS_LABELS[task.status] || task.status}
              onClick={() => setSelectedModuleId(selectedModuleId === task.id ? null : task.id)}
            />
          ))}
        </div>
        <div className="mt-4 space-y-2">
          {visibleTasks.filter((task) => !selectedModuleId || task.id === selectedModuleId).slice(0, selectedModuleId ? 50 : 0).map((task) => {
            const isAssignee = user?.id === task.assigned_to_id;
            const busy = taskBusy === task.id;
            return (
              <div key={task.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-slate-100">{task.title}</div>
                    <div className="text-slate-400">{task.description || '—'}</div>
                    <div className="mt-1 text-slate-500">
                      {task.assigned_to} · {TASK_STATUS_LABELS[task.review_status === 'PENDING_TL_REVIEW' ? 'PENDING_TL_REVIEW' : task.status] || task.status}
                      {task.priority ? ` · ${task.priority}` : ''}
                      {` · ${task.progress_percent || 0}%`}
                      {task.start_date ? ` · start ${formatLongDate(task.start_date)}` : ''}
                      {task.due_date ? (
                        <>
                          {' · due '}
                          <span className={`rounded px-1.5 py-0.5 ${deadlineCellClass(deadlineTone(toSheetStatus(task.status), task.due_date))}`}>
                            {formatLongDate(task.due_date)}
                          </span>
                        </>
                      ) : ''}
                    </div>
                    {task.blocked_reason && <div className="mt-1 text-rose-300">Issue: {task.blocked_reason}</div>}
                    {(task.comments || []).slice(0, 2).map((comment) => (
                      <div key={comment.id} className="mt-1 text-slate-500">{comment.user_name}: {comment.comment}</div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {isAssignee && task.status === 'TODO' && task.review_status !== 'PENDING_TL_REVIEW' && (
                      <button disabled={busy} onClick={() => void updateTask(task, { status: 'IN_PROGRESS' }, PROJECT_ACTION_SUCCESS.taskStarted)} className="rounded border border-slate-700 px-2.5 py-1 font-bold text-slate-100 hover:border-cyan-700 disabled:opacity-60">
                        Start Task
                      </button>
                    )}
                    {isAssignee && task.status === 'IN_PROGRESS' && task.review_status !== 'PENDING_TL_REVIEW' && (
                      <button
                        disabled={busy}
                        onClick={() => {
                          const raw = window.prompt('Progress % (0-100)', String(task.progress_percent || 0)) || '';
                          const value = Math.max(0, Math.min(100, Number(raw)));
                          if (!Number.isFinite(value)) return;
                          void updateTask(task, { progress_percent: value, status: 'IN_PROGRESS' }, PROJECT_ACTION_SUCCESS.progressUpdated);
                        }}
                        className="rounded border border-slate-700 px-2.5 py-1 font-bold text-slate-100 hover:border-cyan-700 disabled:opacity-60"
                      >
                        Update progress
                      </button>
                    )}
                    {isAssignee && task.status === 'IN_PROGRESS' && task.review_status !== 'PENDING_TL_REVIEW' && (
                      <>
                        <button
                          disabled={busy}
                          onClick={() => {
                            const reason = window.prompt('Describe the issue or doubt') || '';
                            if (!reason.trim()) return;
                            void updateTask(task, { status: 'BLOCKED', blocked_reason: reason.trim() }, PROJECT_ACTION_SUCCESS.issueRaised);
                          }}
                          className="rounded border border-amber-800 px-2.5 py-1 font-bold text-amber-100 hover:bg-amber-950 disabled:opacity-60"
                        >
                          Raise Issue / Doubt
                        </button>
                        {(task.status === 'IN_PROGRESS' || task.review_status === 'CORRECTION_REQUIRED') && (
                          <button
                            disabled={busy}
                            onClick={() => {
                              if (!window.confirm('Are you sure you want to mark this task as completed?')) return;
                              void updateTask(task, { status: 'DONE', progress_percent: 100 }, PROJECT_ACTION_SUCCESS.taskCompleted);
                            }}
                            className="rounded bg-emerald-700 px-2.5 py-1 font-bold text-white hover:bg-emerald-600 disabled:opacity-60"
                          >
                            Mark Task Completed
                          </button>
                        )}
                      </>
                    )}
                    {user?.role_code === 'TEAM_LEAD' && task.review_status === 'PENDING_TL_REVIEW' && (
                      <>
                        <button disabled={busy} onClick={() => void updateTask(task, { review_action: 'approve' }, PROJECT_ACTION_SUCCESS.taskCompleted)} className="rounded bg-emerald-700 px-2.5 py-1 font-bold text-white hover:bg-emerald-600 disabled:opacity-60">Validate complete</button>
                        <button
                          disabled={busy}
                          onClick={() => {
                            const comments = window.prompt('Comments for send-back') || '';
                            if (!comments.trim()) return;
                            void updateTask(task, { review_action: 'return', review_comments: comments.trim() }, 'Task returned for correction');
                          }}
                          className="rounded border border-rose-800 px-2.5 py-1 font-bold text-rose-200 hover:bg-rose-950 disabled:opacity-60"
                        >
                          Send back
                        </button>
                      </>
                    )}
                    {isAssignee && (
                      <>
                        <button
                          disabled={busy}
                          onClick={() => {
                            const comment = window.prompt('Work comment') || '';
                            if (!comment.trim()) return;
                            void (async () => {
                              setTaskBusy(task.id);
                              const result = await TasksApi.comment(task.id, comment.trim());
                              setTaskBusy(null);
                              if (!result.ok) {
                                setError(result.message);
                                return;
                              }
                              setMessage('Comment added.');
                              await load();
                            })();
                          }}
                          className="rounded border border-slate-700 px-2.5 py-1 font-bold text-slate-100 hover:border-cyan-700 disabled:opacity-60"
                        >
                          Comment
                        </button>
                        <Link href={`/daily-updates/new?assignment=${encodeURIComponent(task.id)}`} className="rounded bg-cyan-600 px-2.5 py-1 font-bold text-white hover:bg-cyan-500">Daily update</Link>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
        <h2 className="mb-3 text-sm font-bold text-slate-100">Team</h2>
        {detail.teams.length === 0 && <p className="text-slate-500">No teams assigned to this project yet.</p>}
        <div className="grid gap-3 lg:grid-cols-2">
          {detail.teams.map((team) => (
            <div key={team.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <div className="font-semibold text-slate-100">{team.name}</div>
              <div className="text-slate-400">Lead: {team.team_lead_name || '—'}</div>
              <div className="mt-1 text-slate-500">
                Workload {team.workload.open}/{team.workload.total || team.members.length} open
              </div>
              <div className="mt-2 space-y-1">
                      {team.members.map((member) => (
                  <div key={member.id} className="flex justify-between text-slate-300">
                    <span>{formatEmployeeDisplayName(member.name)} · {member.role_name}</span>
                    <span className="text-slate-500">{member.open_tasks} open</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
        <h2 className="mb-3 text-sm font-bold text-slate-100">Team Performance</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[...new Map(allTasks.map((task) => [task.assigned_to_id, task.assigned_to])).entries()].map(([id, name]) => {
            const mine = allTasks.filter((task) => task.assigned_to_id === id);
            const completed = mine.filter((task) => task.status === 'DONE').length;
            return (
              <EmployeePerformanceCard
                key={id}
                name={formatEmployeeDisplayName(name)}
                total={mine.length}
                completed={completed}
                inProgress={mine.filter((task) => task.status === 'IN_PROGRESS').length}
                hold={mine.filter((task) => task.status === 'HOLD').length}
                overdue={mine.filter((task) => task.due_date && task.due_date < new Date().toISOString().slice(0, 10) && task.status !== 'DONE').length}
                progress={mine.length ? Math.round((completed / mine.length) * 100) : 0}
                onClick={() => setEmployeeFilter(employeeFilter === id ? '' : id)}
              />
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
        <h2 className="text-sm font-bold text-slate-100">Task History</h2>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
          <span>{visibleTasks.length} Tasks</span>
          <span>{doneCount} Completed</span>
          <span>{inProgressCount} In Progress</span>
          <span>{overdueCount} Overdue</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {['', 'Completed', 'In Progress', 'Waiting', 'Hold', 'Yet to Start', 'Overdue'].map((item) => (
            <button
              key={item || 'All'}
              type="button"
              onClick={() => setHistoryFilter(item)}
              className={`rounded-full border px-3 py-1 text-[11px] font-bold ${historyFilter === item ? 'border-cyan-500 bg-cyan-950 text-cyan-200' : 'border-slate-700 text-slate-300'}`}
            >
              {item || 'All'}
            </button>
          ))}
          <input
            value={historyQuery}
            onChange={(e) => setHistoryQuery(e.target.value)}
            placeholder="Search"
            className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-slate-200"
          />
        </div>
        <div className="mt-3 space-y-2">
          {historyTasks.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => setSelectedModuleId(task.id)}
              className="w-full rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-left hover:border-cyan-700"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-slate-100">{formatEmployeeDisplayName(task.assigned_to)}</div>
                  <div className="wrap-break-word text-slate-400">{task.title}</div>
                </div>
                <StatusBadge status={TASK_STATUS_LABELS[task.status] || task.status} />
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-100">Daily work updates</h2>
          <Link href={`/daily-updates?project=${project.id}`} className="text-cyan-400 hover:underline">Open module</Link>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <UpdateCard title="Latest employee update" update={detail.dailyWork.latestEmployee} />
          <UpdateCard title="Latest team lead update" update={detail.dailyWork.latestTeamLead} />
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Latest PM update</div>
            {detail.dailyWork.latestPmRemark ? (
              <>
                <div className="mt-1 font-semibold text-slate-100">{detail.dailyWork.latestPmRemark.user_name}</div>
                <div className="text-slate-400">{detail.dailyWork.latestPmRemark.comment}</div>
                <div className="mt-1 text-slate-500">{formatLongDate(detail.dailyWork.latestPmRemark.created_at)}</div>
              </>
            ) : (
              <p className="mt-1 text-slate-500">No PM remark yet.</p>
            )}
          </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 font-semibold text-slate-200">Recent blockers</h3>
            {detail.dailyWork.recentBlockers.length === 0 && <p className="text-slate-500">No recent blockers.</p>}
            {detail.dailyWork.recentBlockers.map((item) => (
              <Link key={item.id} href={`/daily-updates/${item.id}`} className="mb-2 block rounded border border-rose-900/40 bg-rose-950/20 p-2 text-rose-200">
                BLOCKED — {item.blocker} · {item.user_name}
              </Link>
            ))}
          </div>
          <div>
            <h3 className="mb-2 font-semibold text-slate-200">Recent completed work</h3>
            {detail.dailyWork.recentCompleted.length === 0 && <p className="text-slate-500">No completed updates yet.</p>}
            {detail.dailyWork.recentCompleted.map((item) => (
              <div key={item.id} className="mb-2 rounded border border-slate-800 p-2 text-slate-300">
                {item.task_title} · {item.user_name} · {item.progress_percent}%
              </div>
            ))}
          </div>
        </div>
        {(detail.dailyUpdates || []).length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 font-semibold text-slate-200">Update history</h3>
            {detail.dailyUpdates!.map((item) => (
              <Link key={item.id} href={`/daily-updates/${item.id}`} className="mb-2 block rounded border border-slate-800 p-2 text-slate-300 hover:border-cyan-800">
                {formatLongDate(item.work_date)} · {item.user_name} · {WORK_STATUS_LABELS[item.work_status] || item.work_status} · {item.progress_percent}% · {item.work_completed || item.task_title}
              </Link>
            ))}
          </div>
        )}
      </section>

      {detail.escalations.length > 0 && (
        <section className="rounded-xl border border-rose-900/40 bg-slate-900/90 p-5">
          <h2 className="mb-3 text-sm font-bold text-slate-100">Escalation history</h2>
          {detail.escalations.map((item) => (
            <Link key={item.id} href={`/dashboard/ceo/escalations/${item.id}`} className="mb-3 block rounded-lg border border-slate-800 bg-slate-950/60 p-3 hover:border-rose-800">
              <div className="font-semibold text-slate-100">{item.code} · {item.issue}</div>
              <div className="text-slate-400">
                {ESCALATION_LEVEL_LABELS[item.current_level] || item.current_level} · {item.status === 'RESOLVED' ? 'Resolved' : 'Open'}
                {item.raised_by_name ? ` · raised by ${item.raised_by_name}` : ''}
                {` · ${formatDateTime(item.created_at)}`}
              </div>
              {(item.history || []).map((event) => (
                <div key={event.id} className="mt-1 text-slate-500">
                  {event.action} · {ESCALATION_LEVEL_LABELS[event.level] || event.level} · {event.actor_name} · {formatDateTime(event.at)}
                  {event.comments ? ` · ${event.comments}` : ''}
                </div>
              ))}
            </Link>
          ))}
        </section>
      )}

      {detail.delayedMilestones.length > 0 && (
        <section className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-5">
          <h2 className="mb-2 text-sm font-bold text-amber-200">Delayed milestones</h2>
          {detail.delayedMilestones.map((item) => (
            <div key={item.name} className="text-slate-300">{item.name} · {formatLongDate(item.date)} · {item.owner}</div>
          ))}
        </section>
      )}

      {detail.canManage && (
        <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/90 p-5">
          <h2 className="text-sm font-bold text-slate-100">PM controls</h2>
          <p className="text-slate-500">Overall progress is calculated from completed tasks. Approve handover only after Team Lead final review. Stage changes happen through workflow actions, not this form.</p>
          <Link href={`/projects/planning?project=${project.id}`} className="inline-flex rounded-lg bg-cyan-600 px-3 py-1.5 font-bold text-white hover:bg-cyan-500">
            Open Gantt & Planning
          </Link>
          <div className="flex flex-wrap gap-2">
            {detail.actions?.canHandover && (
              <button
                type="button"
                onClick={() => void run(async () => {
                  const result = await ProjectsApi.patch(project.id, { status: 'HANDOVER' });
                  if (!result.ok) {
                    setError(result.message);
                    return;
                  }
                  setMessage(PROJECT_ACTION_SUCCESS.approved);
                  await load();
                })}
                className="rounded-lg bg-emerald-700 px-4 py-2 font-bold text-white hover:bg-emerald-600"
              >
                Approve handover
              </button>
            )}
            {detail.actions?.canComplete && (
              <button
                type="button"
                onClick={() => void run(async () => {
                  const result = await ProjectsApi.patch(project.id, { status: 'COMPLETED' });
                  if (!result.ok) {
                    setError(result.message);
                    return;
                  }
                  setMessage(PROJECT_ACTION_SUCCESS.completed);
                  router.push('/dashboard');
                })}
                className="rounded-lg bg-cyan-600 px-4 py-2 font-bold text-white hover:bg-cyan-500"
              >
                Complete project
              </button>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-slate-400">Status</span>
              {status === 'HANDOVER' || status === 'COMPLETED' ? (
                <input readOnly value={status === 'HANDOVER' ? 'Ready for handover' : 'Project closed'} className="w-full cursor-not-allowed rounded border border-slate-800 bg-slate-950 p-2 text-slate-400" />
              ) : (
                <select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100">
                  <option value="ACTIVE">In execution</option>
                  <option value="ON_HOLD">On hold</option>
                </select>
              )}
            </label>
            <label className="block">
              <span className="mb-1 block text-slate-400">Current stage</span>
              <input readOnly value={workflow?.stage || 'Project Assignment'} className="w-full cursor-not-allowed rounded border border-slate-800 bg-slate-950 p-2 text-slate-400" />
            </label>
            <label className="block">
              <span className="mb-1 block text-slate-400">Target completion</span>
              <input type="date" value={target} onChange={(e) => setTarget(e.target.value)} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-slate-400">Project remark</span>
            <textarea rows={2} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="PM note for management visibility" className="w-full rounded border border-slate-800 bg-slate-950 p-2.5 text-slate-100" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void run(async () => {
                const result = await ProjectsApi.patch(project.id, {
                  status,
                  target_completion: target,
                  remarks: remark,
                });
                if (!result.ok) {
                  setError(result.message);
                  return;
                }
                setRemark('');
                setMessage(status === 'COMPLETED' ? PROJECT_ACTION_SUCCESS.completed : status === 'HANDOVER' ? PROJECT_ACTION_SUCCESS.approved : 'Project updated.');
                if (status === 'COMPLETED') {
                  router.push('/dashboard');
                  return;
                }
                await load();
              })}
              className="rounded-lg bg-cyan-600 px-4 py-2 font-bold text-white hover:bg-cyan-500"
            >
              Save project status
            </button>
            {project.issue && (
              <button
                type="button"
                onClick={() => void run(async () => {
                  const result = await ProjectsApi.patch(project.id, { issue: null });
                  if (!result.ok) {
                    setError(result.message);
                    return;
                  }
                  setMessage('Blocker cleared.');
                  await load();
                })}
                className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 font-bold text-slate-100 hover:bg-slate-700"
              >
                Resolve blocker
              </button>
            )}
          </div>
          <div className="grid gap-2 border-t border-slate-800 pt-4 md:grid-cols-2">
            <input value={escIssue} onChange={(e) => setEscIssue(e.target.value)} placeholder="Escalation issue" className="rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
            <input value={escImpact} onChange={(e) => setEscImpact(e.target.value)} placeholder="Impact" className="rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
          </div>
          <button
            type="button"
            onClick={() => void run(async () => {
              const result = await ProjectsApi.escalate(project.id, { issue: escIssue, impact: escImpact, severity: 'HIGH' });
              if (!result.ok) {
                setError(result.message);
                return;
              }
              setMessage(PROJECT_ACTION_SUCCESS.escalated);
              await load();
            })}
            className="inline-flex items-center gap-1 rounded-lg border border-rose-800 bg-rose-950 px-4 py-2 font-bold text-rose-200 hover:bg-rose-900"
          >
            <ShieldAlert className="h-3.5 w-3.5" /> Escalate issue
          </button>
        </section>
      )}

      <section className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-100">Activity / audit</h2>
          <Link href={`/projects/${project.id}/activity`} className="text-cyan-400 hover:underline">Full history</Link>
        </div>
        {detail.activity.slice(0, 8).map((item) => (
          <div key={item.id} className="border-b border-slate-800/70 py-2 last:border-0">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">{item.kind.replace('_', ' ')} · {formatLongDate(item.at)}</div>
            <div className="font-semibold text-slate-200">{item.title}</div>
            <div className="text-slate-400">{item.detail}</div>
          </div>
        ))}
        {detail.activity.length === 0 && <p className="text-slate-500">No project activity yet.</p>}
      </section>
    </div>
  );
}

function Field({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      {href ? (
        <Link href={href} className="mt-1 block font-semibold text-cyan-300 hover:underline">{value}</Link>
      ) : (
        <div className="mt-1 font-semibold text-slate-100">{value}</div>
      )}
    </div>
  );
}

type PickerPerson = { id: string; name: string; role_code?: string; role_name: string; team_id?: string; team_name?: string; open_tasks?: number };
type PickerTeam = { id: string; name: string; team_lead_id?: string; team_lead_name?: string; members: PickerPerson[] };

function TeamPeoplePicker({
  teams,
  people,
  selectedIds,
  onChange,
  emptyLabel,
  compact,
}: {
  teams: PickerTeam[];
  people: PickerPerson[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  emptyLabel: string;
  compact?: boolean;
}) {
  const grouped = teams.length
    ? teams
    : Object.entries(
        people.reduce<Record<string, PickerPerson[]>>((map, person) => {
          const key = person.team_name || 'Other';
          map[key] = [...(map[key] || []), person];
          return map;
        }, {})
      ).map(([name, members]) => ({ id: name, name, members }));

  const togglePerson = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id]);
  };

  const toggleTeam = (members: PickerPerson[]) => {
    const ids = members.map((member) => member.id);
    if (!ids.length) return;
    const allSelected = ids.every((id) => selectedIds.includes(id));
    onChange(allSelected ? selectedIds.filter((id) => !ids.includes(id)) : [...new Set([...selectedIds, ...ids])]);
  };

  return (
    <div className={`min-w-64 flex-1 rounded border border-slate-800 bg-slate-950 p-2 ${compact ? 'max-h-44' : 'max-h-64'} overflow-y-auto`}>
      {grouped.length === 0 && <p className="p-2 text-slate-500">{emptyLabel}</p>}
      {grouped.map((team) => {
        const memberIds = team.members.map((member) => member.id);
        const selectedCount = memberIds.filter((id) => selectedIds.includes(id)).length;
        const allSelected = memberIds.length > 0 && selectedCount === memberIds.length;
        const open = team.members.reduce((sum, member) => sum + (member.open_tasks || 0), 0);
        return (
          <div key={team.id} className="mb-2 rounded border border-slate-800/80 p-2 last:mb-0">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={allSelected}
                disabled={!memberIds.length}
                onChange={() => toggleTeam(team.members)}
                className="h-4 w-4 rounded accent-cyan-500"
              />
              <span className="font-semibold text-slate-100">{team.name}</span>
              <span className="text-slate-500">
                {team.members.length
                  ? `${team.members.length} ${team.members.length === 1 ? 'person' : 'people'} · ${open} open`
                  : 'No members yet'}
              </span>
            </label>
            <div className="mt-1 space-y-1 pl-6">
              {team.members.map((member) => (
                <label key={member.id} className="flex cursor-pointer items-center gap-2 text-slate-200">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(member.id)}
                    onChange={() => togglePerson(member.id)}
                    className="h-4 w-4 rounded accent-cyan-500"
                  />
                  <span>
                    {member.name} · {member.role_name}
                    {typeof member.open_tasks === 'number' ? ` · ${member.open_tasks} open` : ''}
                  </span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
      {selectedIds.length > 0 && (
        <div className="mt-1 px-1 text-cyan-300">{selectedIds.length} selected</div>
      )}
    </div>
  );
}

function UpdateCard({ title, update }: { title: string; update?: { id: string; user_name: string; work_completed?: string; work_status: string; progress_percent: number; submitted_at?: string; created_at: string } }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{title}</div>
      {update ? (
        <>
          <div className="mt-1 font-semibold text-slate-100">{update.user_name}</div>
          <div className="text-slate-400">{update.work_completed || '—'}</div>
          <div className="mt-1 text-slate-500">
            {WORK_STATUS_LABELS[update.work_status] || update.work_status} · {update.progress_percent}% · {formatLongDate(update.submitted_at || update.created_at)}
          </div>
          <Link href={`/daily-updates/${update.id}`} className="mt-1 inline-block text-cyan-400 hover:underline">Open</Link>
        </>
      ) : (
        <p className="mt-1 text-slate-500">No update yet.</p>
      )}
    </div>
  );
}
