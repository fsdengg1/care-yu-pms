import { Task, WorkAssignment, WorkTaskType } from './types';

export function isLeadTaskType(type?: WorkTaskType | string) {
  return type === 'LEAD_TASK';
}

export function isLeadTask(item: Pick<WorkAssignment, 'task_type'> | Pick<Task, 'task_type'>) {
  return isLeadTaskType(item.task_type);
}

/** Assigned work whose parent context is a Lead (not a Project or non-project task). */
export function isLeadBasedAssignment(
  item: Pick<WorkAssignment, 'task_type' | 'source' | 'lead_id'>
) {
  if (item.task_type === 'LEAD_TASK') return true;
  if (item.source === 'FEASIBILITY_ALLOCATION' || item.source === 'FEASIBILITY_ASSIGNMENT') return true;
  if (item.task_type === 'PROJECT_TASK' || item.task_type === 'NON_PROJECT_TASK') return false;
  return Boolean(item.lead_id);
}

export function leadWorkLabel(item: Pick<WorkAssignment, 'lead_number' | 'lead_name' | 'project_name'>) {
  const parts = [item.lead_number, item.lead_name].filter(Boolean);
  return parts.join(' – ') || item.project_name || 'Lead task';
}

export function assignmentStatusLabel(item: Pick<WorkAssignment, 'acceptance_status' | 'current_status'>) {
  if (item.acceptance_status === 'REQUESTED') return 'Pending Acceptance';
  if (item.acceptance_status === 'REJECTED') return 'Declined';
  if (item.acceptance_status === 'ACCEPTED') return 'Accepted';
  if (item.current_status === 'COMPLETED' || item.current_status === 'DONE') return 'Completed';
  if (item.current_status === 'IN_PROGRESS') return 'In Progress';
  if (item.current_status === 'HOLD') return 'Hold';
  if (item.current_status === 'WAITING' || item.current_status === 'BLOCKED') return 'Waiting';
  return 'Yet to Start';
}

export function createdByLabel(name?: string) {
  const trimmed = (name || '').trim();
  return trimmed ? `Created by ${trimmed}` : '';
}

export function canAssigneeEditAssignment(
  userId: string,
  item: Pick<WorkAssignment, 'assigned_to_id' | 'created_by_id' | 'assigned_by_id' | 'acceptance_status'>
) {
  const isCreator = item.created_by_id === userId || item.assigned_by_id === userId;
  if (item.acceptance_status === 'REQUESTED' && item.assigned_to_id === userId && !isCreator) return false;
  return item.assigned_to_id === userId || isCreator;
}
