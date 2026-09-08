import { workflowActionLabel, WorkflowActionLead } from './workflowActionLabel';

export function formatInrCompact(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '₹ 0';
  if (value >= 10000000) {
    const cr = value / 10000000;
    return `₹ ${cr.toFixed(cr >= 10 ? 0 : 2).replace(/\.00$/, '')} Cr`;
  }
  if (value >= 100000) {
    const lakh = value / 100000;
    return `₹ ${lakh.toFixed(lakh >= 10 ? 0 : 0)}L`;
  }
  return `₹ ${value.toLocaleString('en-IN')}`;
}

export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.round(diffMs / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function formatClock(iso: string): string {
  const date = new Date(iso);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  if (date >= startOfToday) {
    return date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  }
  const yesterday = new Date(startOfToday);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date >= yesterday) return 'Yesterday';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export const WORK_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: 'Yet to Start',
  IN_PROGRESS: 'In Progress',
  BLOCKED: 'Waiting',
  WAITING: 'Waiting',
  COMPLETED: 'Completed',
  HOLD: 'Hold',
  TODO: 'Yet to Start',
  DONE: 'Completed',
  PENDING_TL_REVIEW: 'Pending Team Lead Review',
  CORRECTION_REQUIRED: 'Correction Required',
};

export function formatLongDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(+date)) return value;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const PIPELINE_STAGE_LABELS: Record<string, string> = {
  PROJECT_INPUT: 'Project Input',
  PM_REVIEW: 'PM Review',
  FEASIBILITY: 'Feasibility',
  COSTING: 'Solution & Costing',
  QUOTATION: 'Quotation',
  NEGOTIATION: 'Submitted to Customer',
  CONVERTED: 'Order Converted',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

export const LEAD_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED_TO_PM: 'Submitted to PM for Review',
  UNDER_PM_REVIEW: 'Submitted to PM for Review',
  RETURNED_TO_SALES: 'Returned for Clarification',
  ADDITIONAL_INFORMATION_REQUIRED: 'Returned for Clarification',
  RESUBMITTED_TO_PM: 'Submitted to PM for Review',
  ACCEPTED_FOR_FEASIBILITY: 'Submitted to Feasibility Team',
  FEASIBILITY_IN_PROGRESS: 'Submitted to Feasibility Team',
  FEASIBILITY_SUBMITTED: 'Submitted to PM for Review',
  FEASIBILITY_RETURNED: 'Returned for Clarification',
  FEASIBILITY_REJECTED: 'Rejected',
  COSTING_IN_PROGRESS: 'Submitted to Procurement Review',
  COSTING_SUBMITTED: 'Submitted to PM for Review',
  COSTING_RETURNED: 'Returned for Clarification',
  COSTING_REJECTED: 'Rejected',
  QUOTATION: 'Submitted to Business Head for Review',
  NEGOTIATION: 'Submitted to Customer',
  ORDER_CONVERTED: 'Approved',
  WON: 'Approved',
  LOST: 'Lost',
  ON_HOLD: 'On Hold',
  CANCELLED: 'Rejected',
};

export type WorkflowActionKind = 'submit' | 'approve' | 'reject';

export const WORKFLOW_ACTION_SUCCESS: Record<WorkflowActionKind, string> = {
  submit: 'Submitted Successfully',
  approve: 'Approved Successfully',
  reject: 'Rejected Successfully',
};

export const WORKFLOW_STAGE_FOR_ACTION: Record<WorkflowActionKind, string> = {
  submit: 'Submitted',
  approve: 'Approved',
  reject: 'Rejected',
};

const SUBMITTED_STATUSES = new Set([
  'SUBMITTED_TO_PM',
  'UNDER_PM_REVIEW',
  'RESUBMITTED_TO_PM',
  'FEASIBILITY_SUBMITTED',
  'COSTING_SUBMITTED',
]);
const APPROVED_STATUSES = new Set(['ACCEPTED_FOR_FEASIBILITY']);
const REJECTED_STATUSES = new Set(['CANCELLED', 'FEASIBILITY_REJECTED', 'COSTING_REJECTED']);

export type WorkflowStatusTone = 'draft' | 'submitted' | 'approved' | 'rejected' | 'returned' | 'progress';

export function workflowStatusPresentation(status: string, lead?: WorkflowActionLead): {
  label: string;
  tone: WorkflowStatusTone;
  badgeClass: string;
  bannerClass: string;
} {
  const label = lead ? workflowActionLabel(lead) : LEAD_STATUS_LABELS[status] || status.replace(/_/g, ' ');
  if (SUBMITTED_STATUSES.has(status) || status === 'SUBMITTED') {
    return {
      label,
      tone: 'submitted',
      badgeClass: 'border-cyan-600 bg-cyan-950 text-cyan-300',
      bannerClass: 'border-cyan-700 bg-cyan-950/50 text-cyan-300',
    };
  }
  if (APPROVED_STATUSES.has(status) || status === 'APPROVED') {
    return {
      label: 'Approved',
      tone: 'approved',
      badgeClass: 'border-emerald-600 bg-emerald-950 text-emerald-300',
      bannerClass: 'border-emerald-700 bg-emerald-950/50 text-emerald-300',
    };
  }
  if (REJECTED_STATUSES.has(status) || status === 'REJECTED' || status === 'LOST') {
    return {
      label: status === 'LOST' ? 'Lost' : 'Rejected',
      tone: 'rejected',
      badgeClass: 'border-rose-600 bg-rose-950 text-rose-300',
      bannerClass: 'border-rose-700 bg-rose-950/50 text-rose-300',
    };
  }
  if (status === 'DRAFT') {
    return {
      label,
      tone: 'draft',
      badgeClass: 'border-slate-600 bg-slate-800 text-slate-300',
      bannerClass: 'border-slate-700 bg-slate-900 text-slate-100',
    };
  }
  if (status === 'RETURNED_TO_SALES' || status === 'ADDITIONAL_INFORMATION_REQUIRED' || status === 'FEASIBILITY_RETURNED' || status === 'COSTING_RETURNED') {
    return {
      label,
      tone: 'returned',
      badgeClass: 'border-amber-600 bg-amber-950 text-amber-300',
      bannerClass: 'border-amber-700 bg-amber-950/50 text-amber-300',
    };
  }
  return {
    label,
    tone: 'progress',
    badgeClass: 'border-indigo-700 bg-indigo-950 text-indigo-300',
    bannerClass: 'border-indigo-800 bg-indigo-950/40 text-indigo-300',
  };
}

export function workflowActionFromQuery(value: string | null): WorkflowActionKind | null {
  if (value === 'submitted' || value === 'submit') return 'submit';
  if (value === 'approved' || value === 'approve') return 'approve';
  if (value === 'rejected' || value === 'reject') return 'reject';
  return null;
}

export function formatDateTime(value?: string): string {
  if (!value) return '—';
  const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(+date)) return value;
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export const TASK_STATUS_LABELS: Record<string, string> = {
  TODO: 'Yet to Start',
  IN_PROGRESS: 'In Progress',
  BLOCKED: 'Waiting',
  WAITING: 'Waiting',
  HOLD: 'Hold',
  DONE: 'Completed',
  PENDING_TL_REVIEW: 'Pending Team Lead Review',
  CORRECTION_REQUIRED: 'Correction Required',
};

export const PROJECT_INTAKE_STEPS = [
  { key: 'DRAFT', stage: 'Draft' },
  { key: 'SUBMITTED_TO_PM', stage: 'Submitted to PM' },
  { key: 'PM_REVIEW', stage: 'PM Review' },
];

export const PROJECT_STEPS = [
  { step: 1, stage: 'Project Assignment' },
  { step: 2, stage: 'Team Lead Review' },
  { step: 3, stage: 'Task Breakdown' },
  { step: 4, stage: 'Team Member Execution' },
  { step: 5, stage: 'Daily Work Update' },
  { step: 6, stage: 'Team Lead Review & Monitor' },
  { step: 7, stage: 'Escalation' },
  { step: 8, stage: 'Resolution & Completion' },
];

export const PROJECT_ACTION_SUCCESS: Record<string, string> = {
  submittedToPm: 'Project Submitted to PM Successfully',
  draftSaved: 'Project saved as draft.',
  pmAccepted: 'Project Accepted Successfully',
  pmReturned: 'Project Returned to Creator',
  assigned: 'Project Assigned Successfully',
  accepted: 'Project Accepted Successfully',
  returned: 'Project Returned Successfully',
  taskAssigned: 'Task Assigned Successfully',
  taskStarted: 'Task Started Successfully',
  progressUpdated: 'Progress Updated Successfully',
  dailyUpdate: 'Daily Work Update Submitted Successfully',
  issueRaised: 'Issue Raised Successfully',
  escalated: 'Issue Escalated Successfully',
  onTrack: 'Project marked On Track',
  issueIdentified: 'Issue / Blocker Identified',
  taskCompleted: 'Task Completed Successfully',
  tlReview: 'Team Lead Review Completed Successfully',
  approved: 'Project Approved Successfully',
  completed: 'Project Completed Successfully',
  resolved: 'Issue Resolved Successfully',
};

export const ESCALATION_LEVEL_LABELS: Record<string, string> = {
  TEAM_LEAD: 'Level 1 — Team Lead',
  PROJECT_MANAGER: 'Level 2 — Project Manager',
  BUSINESS_HEAD: 'Level 3 — Business Head',
  ENG_DIRECTOR: 'Level 3 — Engineering Director',
  CEO: 'Level 4 — CEO',
};

export { formatEmployeeDisplayName, dedupeByStableId } from './people';
