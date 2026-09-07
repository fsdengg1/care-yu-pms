import { EscalationLevel, Lead, LeadStatus, NotificationItem, User } from '../types.js';
import { store } from '../store/db.js';
import { dispatchHandover } from './lifecycleNotify.js';
import { procurementUsers } from './lifecycleNotify.js';

export const SUBMISSION_STAGE_LABELS = {
  BUSINESS_HEAD: 'Submitted to Business Head',
  PM: 'Submitted to PM',
  VISION_TEAM: 'Submitted to Vision Team',
  ROBOTICS_TEAM: 'Submitted to Robotics Team',
  SOFTWARE_TEAM: 'Submitted to Software Team',
} as const;

function feasibilityTeamSubmissionLabel(lead: Lead): string | null {
  const teams = [lead.assigned_team_name, ...(lead.assigned_team_names || [])].filter(Boolean) as string[];
  for (const team of teams) {
    const hay = team.toLowerCase();
    if (hay.includes('vision')) return SUBMISSION_STAGE_LABELS.VISION_TEAM;
    if (hay.includes('robot')) return SUBMISSION_STAGE_LABELS.ROBOTICS_TEAM;
    if (hay.includes('software')) return SUBMISSION_STAGE_LABELS.SOFTWARE_TEAM;
  }
  return null;
}

export function leadSubmissionStatusLabel(lead: Lead): string {
  const qStatus = lead.quotation?.workflow_status;
  const status = lead.status;

  if (qStatus === 'REVISION_REQUESTED') return 'Returned for Clarification';
  if (qStatus === 'REVISION_IN_PROGRESS') return 'Clarification Submitted';
  if (qStatus === 'SUBMITTED_TO_CUSTOMER' || qStatus === 'CUSTOMER_REVIEW' || status === 'NEGOTIATION') {
    return 'Submitted to Customer';
  }
  if (status === 'QUOTATION' || qStatus === 'PENDING_INTERNAL' || status === 'DRAFT') {
    return SUBMISSION_STAGE_LABELS.BUSINESS_HEAD;
  }
  if (status === 'SUBMITTED_TO_PM' || status === 'UNDER_PM_REVIEW' || status === 'RESUBMITTED_TO_PM') {
    return SUBMISSION_STAGE_LABELS.PM;
  }
  if (status === 'RETURNED_TO_SALES' || status === 'ADDITIONAL_INFORMATION_REQUIRED') {
    return 'Returned for Clarification';
  }
  if (status === 'ACCEPTED_FOR_FEASIBILITY' || status === 'FEASIBILITY_IN_PROGRESS') {
    return feasibilityTeamSubmissionLabel(lead) || SUBMISSION_STAGE_LABELS.PM;
  }
  if (status === 'FEASIBILITY_SUBMITTED') {
    const clarification =
      lead.previous_status === 'FEASIBILITY_RETURNED' || Boolean(lead.feasibility_study?.pm_return_reason);
    return clarification ? 'Clarification Submitted' : SUBMISSION_STAGE_LABELS.PM;
  }
  if (status === 'FEASIBILITY_RETURNED') return 'Returned for Clarification';
  if (status === 'COSTING_IN_PROGRESS') return 'Submitted to Procurement Review';
  if (status === 'COSTING_SUBMITTED') return SUBMISSION_STAGE_LABELS.PM;
  if (status === 'COSTING_RETURNED') return 'Returned for Clarification';
  if (status === 'ORDER_CONVERTED' || status === 'WON') return 'Approved';
  if (status === 'FEASIBILITY_REJECTED' || status === 'COSTING_REJECTED' || status === 'CANCELLED') return 'Rejected';

  return workflowContextForStatus(status).status_label;
}

export type WorkflowEventKey =
  | 'PROJECT_SUBMITTED'
  | 'PROJECT_APPROVED'
  | 'PROJECT_SENT_BACK'
  | 'PROJECT_CANCELLED'
  | 'PROJECT_ASSIGNED'
  | 'PROJECT_ACCEPTED'
  | 'PROJECT_RETURNED_TO_PM'
  | 'TASK_ASSIGNED'
  | 'FEASIBILITY_STARTED'
  | 'FEASIBILITY_SUBMITTED'
  | 'FEASIBILITY_SENT_BACK'
  | 'FEASIBILITY_APPROVED'
  | 'FEASIBILITY_REJECTED'
  | 'PROCUREMENT_STARTED'
  | 'PROCUREMENT_SUBMITTED'
  | 'PROCUREMENT_SENT_BACK'
  | 'PROCUREMENT_APPROVED'
  | 'PROCUREMENT_REJECTED'
  | 'QUOTATION_SUBMITTED'
  | 'NEGOTIATION_COMPLETED'
  | 'ORDER_CONVERTED'
  | 'TASK_STARTED'
  | 'DAILY_UPDATE_SUBMITTED'
  | 'ISSUE_RAISED'
  | 'ISSUE_ESCALATED'
  | 'ISSUE_RESOLVED'
  | 'CRITICAL_ESCALATION'
  | 'TASK_COMPLETED'
  | 'TASK_SENT_BACK'
  | 'FINAL_REVIEW_REQUIRED'
  | 'PROJECT_APPROVED_FOR_CLOSURE'
  | 'PROJECT_CLOSED';

export interface LeadWorkflowContext {
  status_label: string;
  action_required: string;
  previous_action: string;
  next_action: string;
  approval_pending: boolean;
  owner_role: string;
}

const BY_STATUS: Record<LeadStatus, LeadWorkflowContext> = {
  DRAFT: {
    status_label: 'Project Created',
    action_required: 'Complete project input and submit to PM',
    previous_action: 'Project created',
    next_action: 'Submit to Project Manager',
    approval_pending: false,
    owner_role: 'BUSINESS_HEAD',
  },
  SUBMITTED_TO_PM: {
    status_label: SUBMISSION_STAGE_LABELS.PM,
    action_required: 'Review lead and visit requirement',
    previous_action: 'Submitted to PM',
    next_action: 'Review, assign visit team if required, then continue',
    approval_pending: true,
    owner_role: 'PROJECT_MANAGER',
  },
  UNDER_PM_REVIEW: {
    status_label: SUBMISSION_STAGE_LABELS.PM,
    action_required: 'Review Project',
    previous_action: 'Submitted to PM',
    next_action: 'Approve, send back, or cancel',
    approval_pending: true,
    owner_role: 'PROJECT_MANAGER',
  },
  RETURNED_TO_SALES: {
    status_label: 'Returned for Clarification',
    action_required: 'Correct project input and resubmit',
    previous_action: 'PM sent back for correction',
    next_action: 'Resubmit to PM',
    approval_pending: false,
    owner_role: 'BUSINESS_HEAD',
  },
  ADDITIONAL_INFORMATION_REQUIRED: {
    status_label: 'Returned for Clarification',
    action_required: 'Provide additional information and resubmit',
    previous_action: 'PM requested more information',
    next_action: 'Resubmit to PM',
    approval_pending: false,
    owner_role: 'BUSINESS_HEAD',
  },
  RESUBMITTED_TO_PM: {
    status_label: SUBMISSION_STAGE_LABELS.PM,
    action_required: 'Review resubmitted project',
    previous_action: 'Resubmitted to PM',
    next_action: 'Approve, send back, or cancel',
    approval_pending: true,
    owner_role: 'PROJECT_MANAGER',
  },
  ACCEPTED_FOR_FEASIBILITY: {
    status_label: SUBMISSION_STAGE_LABELS.PM,
    action_required: 'Assign Team Lead or Team Member',
    previous_action: 'PM approved project',
    next_action: 'Assign to Team Lead / Team Member',
    approval_pending: false,
    owner_role: 'PROJECT_MANAGER',
  },
  FEASIBILITY_IN_PROGRESS: {
    status_label: SUBMISSION_STAGE_LABELS.PM,
    action_required: 'Complete and submit feasibility',
    previous_action: 'Assigned to team',
    next_action: 'Submit feasibility to PM',
    approval_pending: false,
    owner_role: 'TEAM_LEAD',
  },
  FEASIBILITY_SUBMITTED: {
    status_label: SUBMISSION_STAGE_LABELS.PM,
    action_required: 'Review Feasibility',
    previous_action: 'Feasibility submitted',
    next_action: 'Approve, send back, or reject',
    approval_pending: true,
    owner_role: 'PROJECT_MANAGER',
  },
  FEASIBILITY_RETURNED: {
    status_label: 'Returned for Clarification',
    action_required: 'Correct feasibility and resubmit',
    previous_action: 'PM returned feasibility',
    next_action: 'Resubmit Feasibility',
    approval_pending: false,
    owner_role: 'TEAM_LEAD',
  },
  FEASIBILITY_REJECTED: {
    status_label: 'Feasibility Rejected',
    action_required: 'No further feasibility action',
    previous_action: 'PM rejected feasibility',
    next_action: 'Close or recapture as a new project',
    approval_pending: false,
    owner_role: 'PROJECT_MANAGER',
  },
  COSTING_IN_PROGRESS: {
    status_label: 'Submitted to Procurement Review',
    action_required: 'Complete procurement and submit for PM review',
    previous_action: 'Feasibility approved',
    next_action: 'Submit procurement to PM',
    approval_pending: false,
    owner_role: 'PROCUREMENT',
  },
  COSTING_SUBMITTED: {
    status_label: SUBMISSION_STAGE_LABELS.PM,
    action_required: 'Review procurement',
    previous_action: 'Procurement submitted',
    next_action: 'Approve, send back, or reject',
    approval_pending: true,
    owner_role: 'PROJECT_MANAGER',
  },
  COSTING_RETURNED: {
    status_label: 'Returned for Clarification',
    action_required: 'Revise procurement and resubmit',
    previous_action: 'PM returned procurement',
    next_action: 'Resubmit procurement',
    approval_pending: false,
    owner_role: 'PROCUREMENT',
  },
  COSTING_REJECTED: {
    status_label: 'Procurement Rejected',
    action_required: 'No further procurement action',
    previous_action: 'PM rejected procurement',
    next_action: 'Close or recapture commercially',
    approval_pending: false,
    owner_role: 'PROJECT_MANAGER',
  },
  QUOTATION: {
    status_label: SUBMISSION_STAGE_LABELS.BUSINESS_HEAD,
    action_required: 'Prepare quotation, then mark Submitted to Customer after sending it',
    previous_action: 'Costing approved',
    next_action: 'Submitted to Customer',
    approval_pending: false,
    owner_role: 'BUSINESS_HEAD',
  },
  NEGOTIATION: {
    status_label: 'Submitted to Customer',
    action_required: 'Customer review — follow up or record a revision',
    previous_action: 'Quotation submitted to customer',
    next_action: 'Customer review, revision, or convert order',
    approval_pending: false,
    owner_role: 'BUSINESS_HEAD',
  },
  ORDER_CONVERTED: {
    status_label: 'Order Converted',
    action_required: 'Begin project execution',
    previous_action: 'Order converted',
    next_action: 'Assign execution work',
    approval_pending: false,
    owner_role: 'PROJECT_MANAGER',
  },
  WON: {
    status_label: 'Order Converted',
    action_required: 'Begin project execution',
    previous_action: 'Order converted',
    next_action: 'Assign execution work',
    approval_pending: false,
    owner_role: 'PROJECT_MANAGER',
  },
  LOST: {
    status_label: 'Lost',
    action_required: 'No further action',
    previous_action: 'Marked as lost',
    next_action: 'Closed',
    approval_pending: false,
    owner_role: 'BUSINESS_HEAD',
  },
  ON_HOLD: {
    status_label: 'On Hold',
    action_required: 'Resume or cancel',
    previous_action: 'Placed on hold',
    next_action: 'Resume workflow',
    approval_pending: false,
    owner_role: 'PROJECT_MANAGER',
  },
  CANCELLED: {
    status_label: 'Project Cancelled',
    action_required: 'No further action',
    previous_action: 'Project cancelled',
    next_action: 'Closed',
    approval_pending: false,
    owner_role: 'PROJECT_MANAGER',
  },
};

export function workflowContextForStatus(status: LeadStatus): LeadWorkflowContext {
  return BY_STATUS[status] || BY_STATUS.DRAFT;
}

export function applyLeadWorkflowContext(lead: Lead, previousStatus?: LeadStatus): Lead {
  const ctx = workflowContextForStatus(lead.status);
  const previous = previousStatus ? workflowContextForStatus(previousStatus) : undefined;
  const awaitingTeamAccept = lead.status === 'ACCEPTED_FOR_FEASIBILITY' && Boolean(lead.assigned_team_lead_id || lead.assigned_member_id);
  const qStatus = lead.quotation?.workflow_status;
  const revision = lead.quotation?.revision_label || 'R0';
  let nextAction = awaitingTeamAccept ? 'Accept project or return to PM' : ctx.next_action;
  let actionRequired = awaitingTeamAccept
    ? 'Review requirements and accept the project'
    : ctx.action_required;
  if (qStatus === 'REVISION_IN_PROGRESS' || qStatus === 'REVISION_REQUESTED') {
    actionRequired = `Revise quotation ${revision}`;
    nextAction = 'Complete revision and click Submitted to Customer';
  } else if (qStatus === 'SUBMITTED_TO_CUSTOMER' || qStatus === 'CUSTOMER_REVIEW') {
    actionRequired = 'Customer review';
    nextAction = 'Record customer revision or convert the order';
  } else if (lead.status === 'QUOTATION') {
    actionRequired = 'Prepare quotation — pending with internal team';
    nextAction = 'After sending to the customer, click Submitted to Customer';
  }
  if (lead.status === 'FEASIBILITY_SUBMITTED' && (previousStatus === 'FEASIBILITY_RETURNED' || lead.previous_status === 'FEASIBILITY_RETURNED')) {
    actionRequired = 'Review clarification from feasibility team';
    nextAction = 'Approve, send back, or reject';
  }
  return {
    ...lead,
    previous_status: previousStatus || lead.previous_status,
    previous_action: previous?.action_required || lead.previous_action || ctx.previous_action,
    next_action: nextAction,
    action_required: actionRequired,
    approval_pending: awaitingTeamAccept ? true : ctx.approval_pending,
    due_date: lead.due_date || lead.customer_target_date || lead.expected_project_timeline || lead.visit_preferred_date,
    pending_action: ctx.approval_pending || awaitingTeamAccept || lead.pending_action !== false,
  };
}

export const ESCALATION_LEVEL_META: Record<EscalationLevel, { level: number; label: string }> = {
  TEAM_LEAD: { level: 1, label: 'LEVEL 1 — Team Lead' },
  PROJECT_MANAGER: { level: 2, label: 'LEVEL 2 — Project Manager' },
  BUSINESS_HEAD: { level: 3, label: 'LEVEL 3 — Business Head' },
  ENG_DIRECTOR: { level: 3, label: 'LEVEL 3 — Engineering Director' },
  CEO: { level: 4, label: 'LEVEL 4 — CEO / Management' },
};

type EventSpec = {
  type: NotificationItem['type'];
  subject: (name: string) => string;
  actionRequired: string;
  ctaLabel: string;
  path: (id: string) => string;
  preferenceCategory: 'assignment' | 'forward' | 'approval' | 'reminder';
};

const EVENTS: Record<WorkflowEventKey, EventSpec> = {
  PROJECT_SUBMITTED: {
    type: 'NEW_LEAD_TO_PM',
    subject: (name) => `Project Submitted for PM Review – ${name}`,
    actionRequired: 'Review Project',
    ctaLabel: 'Open Project',
    path: (id) => `/pre-sales/leads/${id}`,
    preferenceCategory: 'approval',
  },
  PROJECT_APPROVED: {
    type: 'LEAD_ACCEPTED',
    subject: (name) => `Project Approved – ${name}`,
    actionRequired: 'Review assignment and start work',
    ctaLabel: 'Open Project',
    path: (id) => `/pre-sales/leads/${id}`,
    preferenceCategory: 'assignment',
  },
  PROJECT_SENT_BACK: {
    type: 'LEAD_RETURNED_TO_SALES',
    subject: (name) => `Correction Required – ${name}`,
    actionRequired: 'Correct project input and resubmit',
    ctaLabel: 'Open Project',
    path: (id) => `/pre-sales/leads/${id}`,
    preferenceCategory: 'approval',
  },
  PROJECT_CANCELLED: {
    type: 'STATUS_CHANGED',
    subject: (name) => `Project Cancelled – ${name}`,
    actionRequired: 'Review cancellation reason',
    ctaLabel: 'Open Project',
    path: (id) => `/pre-sales/leads/${id}`,
    preferenceCategory: 'approval',
  },
  PROJECT_ASSIGNED: {
    type: 'FEASIBILITY_ASSIGNED_TO_TEAM_LEAD',
    subject: (name) => `Project Assigned – ${name}`,
    actionRequired: 'Accept project or return to PM',
    ctaLabel: 'Open Project',
    path: (id) => `/pre-sales/leads/${id}`,
    preferenceCategory: 'assignment',
  },
  PROJECT_ACCEPTED: {
    type: 'LEAD_ACCEPTED',
    subject: (name) => `Project Accepted – ${name}`,
    actionRequired: 'Monitor task breakdown',
    ctaLabel: 'Open Project',
    path: (id) => `/projects/${id}`,
    preferenceCategory: 'assignment',
  },
  PROJECT_RETURNED_TO_PM: {
    type: 'ACTION_REQUIRED',
    subject: (name) => `Project Returned to PM – ${name}`,
    actionRequired: 'Review Team Lead comments and reassign',
    ctaLabel: 'Open Project',
    path: (id) => `/projects/${id}`,
    preferenceCategory: 'approval',
  },
  TASK_ASSIGNED: {
    type: 'TASK_ASSIGNED',
    subject: (name) => `Task Assigned – ${name}`,
    actionRequired: 'Review requirements and begin execution',
    ctaLabel: 'Open Task',
    path: (id) => `/my-work?task=${encodeURIComponent(id)}`,
    preferenceCategory: 'assignment',
  },
  FEASIBILITY_STARTED: {
    type: 'FEASIBILITY_READY_TO_START',
    subject: (name) => `Feasibility In Progress – ${name}`,
    actionRequired: 'Monitor feasibility progress',
    ctaLabel: 'Open Feasibility',
    path: (id) => `/pre-sales/leads/${id}?tab=feasibility`,
    preferenceCategory: 'assignment',
  },
  FEASIBILITY_SUBMITTED: {
    type: 'FEASIBILITY_SUBMITTED_TO_PM',
    subject: (name) => `Feasibility Submitted – Review Required – ${name}`,
    actionRequired: 'Review Feasibility',
    ctaLabel: 'Review Feasibility',
    path: (id) => `/pre-sales/leads/${id}?tab=feasibility`,
    preferenceCategory: 'approval',
  },
  FEASIBILITY_SENT_BACK: {
    type: 'FEASIBILITY_RETURNED_TO_TEAM',
    subject: (name) => `Feasibility Correction Required – ${name}`,
    actionRequired: 'Review the PM comments and resubmit',
    ctaLabel: 'Open Feasibility',
    path: (id) => `/pre-sales/leads/${id}?tab=feasibility`,
    preferenceCategory: 'approval',
  },
  FEASIBILITY_APPROVED: {
    type: 'COSTING_ASSIGNED',
    subject: (name) => `Procurement Pending – ${name}`,
    actionRequired: 'Start procurement',
    ctaLabel: 'Open Procurement',
    path: (id) => `/pre-sales/leads/${id}`,
    preferenceCategory: 'assignment',
  },
  FEASIBILITY_REJECTED: {
    type: 'STATUS_CHANGED',
    subject: (name) => `Feasibility Rejected – ${name}`,
    actionRequired: 'Review rejection reason',
    ctaLabel: 'Open Project',
    path: (id) => `/pre-sales/leads/${id}`,
    preferenceCategory: 'approval',
  },
  PROCUREMENT_STARTED: {
    type: 'COSTING_ASSIGNED',
    subject: (name) => `Procurement In Progress – ${name}`,
    actionRequired: 'Monitor procurement',
    ctaLabel: 'Open Procurement',
    path: (id) => `/pre-sales/leads/${id}`,
    preferenceCategory: 'assignment',
  },
  PROCUREMENT_SUBMITTED: {
    type: 'COSTING_SUBMITTED_TO_PM',
    subject: (name) => `Procurement Submitted – Review Required – ${name}`,
    actionRequired: 'Review procurement',
    ctaLabel: 'Review Procurement',
    path: (id) => `/pre-sales/leads/${id}`,
    preferenceCategory: 'approval',
  },
  PROCUREMENT_SENT_BACK: {
    type: 'COSTING_RETURNED',
    subject: (name) => `Procurement Correction Required – ${name}`,
    actionRequired: 'Revise procurement using PM comments',
    ctaLabel: 'Open Procurement',
    path: (id) => `/pre-sales/leads/${id}`,
    preferenceCategory: 'approval',
  },
  PROCUREMENT_APPROVED: {
    type: 'QUOTATION_READY',
    subject: (name) => `Quotation Preparation Required – ${name}`,
    actionRequired: 'Prepare and submit quotation',
    ctaLabel: 'Open Quotation',
    path: (id) => `/pre-sales/leads/${id}`,
    preferenceCategory: 'assignment',
  },
  PROCUREMENT_REJECTED: {
    type: 'STATUS_CHANGED',
    subject: (name) => `Procurement Rejected – ${name}`,
    actionRequired: 'Review rejection reason',
    ctaLabel: 'Open Project',
    path: (id) => `/pre-sales/leads/${id}`,
    preferenceCategory: 'approval',
  },
  QUOTATION_SUBMITTED: {
    type: 'QUOTATION_READY',
    subject: (name) => `Quotation Submitted – ${name}`,
    actionRequired: 'Review quotation and follow negotiation',
    ctaLabel: 'Open Lead',
    path: (id) => `/pre-sales/leads/${id}`,
    preferenceCategory: 'approval',
  },
  NEGOTIATION_COMPLETED: {
    type: 'ACTION_REQUIRED',
    subject: (name) => `Negotiation Completed – ${name}`,
    actionRequired: 'Convert to order',
    ctaLabel: 'Open Lead',
    path: (id) => `/pre-sales/leads/${id}`,
    preferenceCategory: 'approval',
  },
  ORDER_CONVERTED: {
    type: 'LEAD_CONVERTED',
    subject: (name) => `Order Converted – ${name}`,
    actionRequired: 'Open project and assign execution work',
    ctaLabel: 'Open Project',
    path: (id) => `/projects/${id}`,
    preferenceCategory: 'assignment',
  },
  TASK_STARTED: {
    type: 'STATUS_CHANGED',
    subject: (name) => `Task In Progress – ${name}`,
    actionRequired: 'Monitor progress',
    ctaLabel: 'Open Task',
    path: (id) => `/my-work?task=${encodeURIComponent(id)}`,
    preferenceCategory: 'assignment',
  },
  DAILY_UPDATE_SUBMITTED: {
    type: 'DAILY_UPDATE_SUBMITTED',
    subject: (name) => `Daily Update Submitted – ${name}`,
    actionRequired: 'Review the daily update',
    ctaLabel: 'Open Daily Update',
    path: (id) => `/daily-updates/${id}`,
    preferenceCategory: 'assignment',
  },
  ISSUE_RAISED: {
    type: 'DAILY_UPDATE_BLOCKED',
    subject: (name) => `Issue Raised – ${name}`,
    actionRequired: 'Review the blocker and start resolution',
    ctaLabel: 'Review Issue',
    path: (id) => `/daily-updates/${id}`,
    preferenceCategory: 'approval',
  },
  ISSUE_ESCALATED: {
    type: 'ESCALATION',
    subject: (name) => `Issue Escalated – ${name}`,
    actionRequired: 'Review and resolve or escalate further',
    ctaLabel: 'Open Escalation',
    path: (id) => `/dashboard/ceo/escalations/${id}`,
    preferenceCategory: 'approval',
  },
  ISSUE_RESOLVED: {
    type: 'STATUS_CHANGED',
    subject: (name) => `Issue Resolved – ${name}`,
    actionRequired: 'Continue execution',
    ctaLabel: 'Open Project',
    path: (id) => `/projects/${id}`,
    preferenceCategory: 'assignment',
  },
  CRITICAL_ESCALATION: {
    type: 'CRITICAL_ESCALATION',
    subject: (name) => `LEVEL 4 Escalation – ${name}`,
    actionRequired: 'Management decision required',
    ctaLabel: 'Open Escalation',
    path: (id) => `/dashboard/ceo/escalations/${id}`,
    preferenceCategory: 'approval',
  },
  TASK_COMPLETED: {
    type: 'APPROVAL_REQUIRED',
    subject: (name) => `Task Completed – Pending Team Lead Review – ${name}`,
    actionRequired: 'Review completed task',
    ctaLabel: 'Review Task',
    path: (id) => `/my-work?task=${encodeURIComponent(id)}`,
    preferenceCategory: 'approval',
  },
  TASK_SENT_BACK: {
    type: 'ACTION_REQUIRED',
    subject: (name) => `Task Correction Required – ${name}`,
    actionRequired: 'Correct the task and resubmit',
    ctaLabel: 'Open Task',
    path: (id) => `/my-work?task=${encodeURIComponent(id)}`,
    preferenceCategory: 'approval',
  },
  FINAL_REVIEW_REQUIRED: {
    type: 'APPROVAL_REQUIRED',
    subject: (name) => `Project Completed – Pending Final Review – ${name}`,
    actionRequired: 'Perform final validation',
    ctaLabel: 'Open Project',
    path: (id) => `/projects/${id}`,
    preferenceCategory: 'approval',
  },
  PROJECT_APPROVED_FOR_CLOSURE: {
    type: 'APPROVAL_REQUIRED',
    subject: (name) => `Ready for Handover – ${name}`,
    actionRequired: 'Complete handover and closure documents',
    ctaLabel: 'Open Project',
    path: (id) => `/projects/${id}`,
    preferenceCategory: 'approval',
  },
  PROJECT_CLOSED: {
    type: 'PROJECT_COMPLETED',
    subject: (name) => `Project Closed – ${name}`,
    actionRequired: 'Review project closure records',
    ctaLabel: 'Open Project',
    path: (id) => `/projects/${id}`,
    preferenceCategory: 'assignment',
  },
};

export function emitWorkflowEvent(input: {
  event: WorkflowEventKey;
  actor: User;
  entityType: string;
  entityId: string;
  entityName: string;
  recipientIds: Array<string | undefined>;
  customer?: string;
  status?: string;
  previousStatus?: string;
  dueDate?: string;
  comments?: string;
  assignedBy?: string;
  details?: Array<[string, string]>;
  message?: string;
  actionUrl?: string;
  eventKey?: string;
  priority?: NotificationItem['priority'];
}) {
  const spec = EVENTS[input.event];
  dispatchHandover({
    recipientIds: input.recipientIds,
    actor: input.actor,
    entityType: input.entityType,
    entityId: input.entityId,
    entityName: input.entityName,
    customer: input.customer,
    title: spec.subject(input.entityName),
    message: input.message || `${input.actor.name} moved "${input.entityName}" to the next workflow owner.`,
    actionRequired: spec.actionRequired,
    ctaLabel: spec.ctaLabel,
    actionUrl: input.actionUrl || spec.path(input.entityId),
    type: spec.type,
    status: input.status,
    previousStatus: input.previousStatus,
    dueDate: input.dueDate,
    comments: input.comments,
    assignedBy: input.assignedBy || input.actor.name,
    details: input.details,
    priority: input.priority,
    eventKey: input.eventKey || `${input.event}:${input.entityId}`,
    preferenceCategory: spec.preferenceCategory,
  });
}

export function emitLeadWorkflow(params: {
  event: WorkflowEventKey;
  lead: Lead;
  actor: User;
  recipientIds?: Array<string | undefined>;
  comments?: string;
  details?: Array<[string, string]>;
  message?: string;
  extraRecipientIds?: Array<string | undefined>;
  actionUrl?: string;
}) {
  const ctx = workflowContextForStatus(params.lead.status);
  const recipients = params.recipientIds || defaultLeadRecipients(params.event, params.lead);
  emitWorkflowEvent({
    event: params.event,
    actor: params.actor,
    entityType: 'LEAD',
    entityId: params.lead.id,
    entityName: params.lead.title,
    recipientIds: [...recipients, ...(params.extraRecipientIds || [])],
    customer: params.lead.customer_name,
    status: leadSubmissionStatusLabel(params.lead),
    previousStatus: params.lead.previous_status,
    dueDate: params.lead.due_date || params.lead.customer_target_date,
    comments: params.comments,
    assignedBy: params.lead.assigned_by_name || params.actor.name,
    details: [
      ['Project name', params.lead.title],
      ['Customer', params.lead.customer_name],
      ['Submitted by', params.lead.submitted_by || params.actor.name],
      ['Requirements', params.lead.requirement_summary || params.lead.detailed_requirement || ''],
      ['Priority', String(params.lead.priority || '')],
      ['Current owner', params.lead.current_owner_name || params.lead.responsible_user_name || ''],
      ['Action required', ctx.action_required],
      ['Next action', ctx.next_action],
      ...(params.details || []),
    ],
    message: params.message,
    actionUrl: params.actionUrl,
  });
}

function defaultLeadRecipients(event: WorkflowEventKey, lead: Lead): Array<string | undefined> {
  switch (event) {
    case 'PROJECT_SUBMITTED':
      return [lead.pm_id, lead.responsible_user_id];
    case 'PROJECT_APPROVED':
      return [lead.created_by_id, lead.sales_owner_id];
    case 'PROJECT_SENT_BACK':
    case 'PROJECT_CANCELLED':
    case 'FEASIBILITY_REJECTED':
    case 'PROCUREMENT_REJECTED':
      return [lead.created_by_id, lead.sales_owner_id];
    case 'PROJECT_ASSIGNED':
      return [lead.assigned_member_id || lead.assigned_team_lead_id, lead.responsible_user_id];
    case 'PROJECT_ACCEPTED':
      return [lead.pm_id];
    case 'PROJECT_RETURNED_TO_PM':
      return [lead.pm_id];
    case 'FEASIBILITY_SENT_BACK':
      return [lead.assigned_member_id, lead.assigned_team_lead_id, lead.responsible_user_id];
    case 'FEASIBILITY_STARTED':
      return [lead.assigned_team_lead_id, lead.pm_id];
    case 'FEASIBILITY_SUBMITTED':
    case 'PROCUREMENT_SUBMITTED':
    case 'QUOTATION_SUBMITTED':
    case 'NEGOTIATION_COMPLETED':
      return [lead.pm_id];
    case 'FEASIBILITY_APPROVED':
    case 'PROCUREMENT_STARTED':
    case 'PROCUREMENT_SENT_BACK':
      return procurementUsers().map((user) => user.id);
    case 'PROCUREMENT_APPROVED':
      return [lead.created_by_id, lead.sales_owner_id, lead.responsible_user_id];
    default:
      return [lead.responsible_user_id, lead.current_owner_id];
  }
}

export function documentNamesForLead(leadId: string): string {
  const leadDocs = store
    .getLeadDocuments()
    .filter((item) => item.lead_id === leadId)
    .map((item) => item.file_name);
  const entityDocs = store
    .getEntityDocuments()
    .filter((item) => item.entity_id === leadId && (item.entity_type === 'ADDITIONAL_INPUT' || item.entity_type === 'LEAD'))
    .map((item) => item.original_file_name || item.file_name);
  return [...leadDocs, ...entityDocs].filter(Boolean).join(', ');
}
