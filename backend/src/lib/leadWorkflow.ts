import { store } from '../store/db.js';
import {
  CostingRecord,
  FeasibilityReviewAction,
  FeasibilityReviewRecord,
  FeasibilityStudy,
  FeasibilityTeamAssignment,
  Lead,
  LeadDocument,
  LeadStatus,
  LeadStatusHistory,
  MyWorkItem,
  NegotiationEntry,
  NotificationItem,
  PipelineStage,
  Project,
  QuotationRecord,
  Team,
  User,
} from '../types.js';
import {
  findPm as resolveProjectManager,
  findQuotationOwner,
  resolveProjectManagerForAssignment,
  transferLeadResponsibility,
} from './responsibility.js';
import { assertAllowedTransition, LeadWorkflowError, leadOwnerId, PM_REVIEW_STATUSES } from './leadValidation.js';
import { dispatchHandover, procurementUsers } from './lifecycleNotify.js';
import { applyLeadWorkflowContext, leadSubmissionStatusLabel, workflowContextForStatus } from './workflowEngine.js';
import { CAREYU_OFFICE_ADDRESS } from './company.js';

export function parseMoney(raw: unknown): number {
  const numeric = Number(String(raw ?? '').replace(/[₹,\s]/g, ''));
  return Number.isFinite(numeric) ? numeric : 0;
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function officialLeadSequence(value: string | undefined): number | null {
  const match = String(value || '')
    .trim()
    .toUpperCase()
    .match(/^(?:LEAD|LD)-(\d+)$/);
  if (!match) return null;
  return Number(match[1]);
}

export function compareLeadIdentity(a?: string, b?: string): number {
  const left = officialLeadSequence(a) ?? Number.MAX_SAFE_INTEGER;
  const right = officialLeadSequence(b) ?? Number.MAX_SAFE_INTEGER;
  if (left !== right) return left - right;
  return String(a || '').localeCompare(String(b || ''), undefined, { numeric: true });
}

export function allocateNextLeadIdentity(leads: Lead[]): { id: string; lead_number: string } {
  let max = 0;
  const used = new Set<string>();
  for (const lead of leads) {
    used.add(String(lead.id || '').trim().toUpperCase());
    used.add(String(lead.lead_number || '').trim().toUpperCase());
    const seq = officialLeadSequence(lead.lead_number) ?? officialLeadSequence(lead.id);
    if (seq != null) max = Math.max(max, seq);
  }
  let next = max + 1;
  let leadNumber = `LEAD-${String(next).padStart(3, '0')}`;
  while (used.has(leadNumber)) {
    next += 1;
    leadNumber = `LEAD-${String(next).padStart(3, '0')}`;
  }
  return { id: leadNumber, lead_number: leadNumber };
}

export function stageFromStatus(status: LeadStatus): PipelineStage {
  switch (status) {
    case 'DRAFT':
      return 'PROJECT_INPUT';
    case 'SUBMITTED_TO_PM':
    case 'UNDER_PM_REVIEW':
    case 'RETURNED_TO_SALES':
    case 'ADDITIONAL_INFORMATION_REQUIRED':
    case 'RESUBMITTED_TO_PM':
      return 'PM_REVIEW';
    case 'ACCEPTED_FOR_FEASIBILITY':
    case 'FEASIBILITY_IN_PROGRESS':
    case 'FEASIBILITY_SUBMITTED':
    case 'FEASIBILITY_RETURNED':
    case 'FEASIBILITY_REJECTED':
      return 'FEASIBILITY';
    case 'COSTING_IN_PROGRESS':
    case 'COSTING_SUBMITTED':
    case 'COSTING_RETURNED':
    case 'COSTING_REJECTED':
      return 'COSTING';
    case 'QUOTATION':
      return 'QUOTATION';
    case 'NEGOTIATION':
      return 'NEGOTIATION';
    case 'ORDER_CONVERTED':
    case 'WON':
      return 'CONVERTED';
    case 'LOST':
      return 'REJECTED';
    case 'CANCELLED':
      return 'CANCELLED';
    case 'ON_HOLD':
      return 'PROJECT_INPUT';
    default:
      return 'PROJECT_INPUT';
  }
}

/** Visual lead-pipeline stage label. Independent of any task status. */
export function leadPipelineStageLabel(
  lead: Pick<Lead, 'status' | 'pipeline_stage' | 'quotation' | 'quotation_revisions'>
): string {
  const status = lead.status;
  const pipeline = lead.pipeline_stage || '';
  if (status === 'ORDER_CONVERTED' || status === 'WON' || pipeline === 'CONVERTED') return 'Project';
  const quotation = lead.quotation;
  const revision = quotation?.revision_label || `R${quotation?.revision ?? 0}`;
  const qStatus = quotation?.workflow_status;
  if (qStatus === 'REVISION_REQUESTED' || qStatus === 'REVISION_IN_PROGRESS') {
    return `Quotation — ${revision} · ${qStatus === 'REVISION_REQUESTED' ? 'Revision Requested' : 'Revision in Progress'}`;
  }
  if (
    qStatus === 'SUBMITTED_TO_CUSTOMER' ||
    qStatus === 'CUSTOMER_REVIEW' ||
    status === 'NEGOTIATION' ||
    pipeline === 'NEGOTIATION'
  ) {
    return `Quotation — ${revision} · Submitted to Customer`;
  }
  if (status === 'QUOTATION' || pipeline === 'QUOTATION' || qStatus === 'PENDING_INTERNAL') {
    return `Quotation — ${revision} · Pending with Internal Team`;
  }
  if (
    status === 'COSTING_IN_PROGRESS' ||
    status === 'COSTING_SUBMITTED' ||
    status === 'COSTING_RETURNED' ||
    status === 'COSTING_REJECTED' ||
    pipeline === 'COSTING'
  ) {
    return 'Solution & Costing';
  }
  if (
    status === 'ACCEPTED_FOR_FEASIBILITY' ||
    status === 'FEASIBILITY_IN_PROGRESS' ||
    status === 'FEASIBILITY_SUBMITTED' ||
    status === 'FEASIBILITY_RETURNED' ||
    status === 'FEASIBILITY_REJECTED' ||
    pipeline === 'FEASIBILITY'
  ) {
    return 'Feasibility Study';
  }
  if (
    status === 'SUBMITTED_TO_PM' ||
    status === 'UNDER_PM_REVIEW' ||
    status === 'RETURNED_TO_SALES' ||
    status === 'ADDITIONAL_INFORMATION_REQUIRED' ||
    status === 'RESUBMITTED_TO_PM' ||
    pipeline === 'PM_REVIEW'
  ) {
    return 'PM Review';
  }
  return 'Lead';
}

export function alignSeedLead(lead: Lead): Lead {
  const stage = lead.pipeline_stage;
  if (lead.status === 'WON') {
    return { ...lead, status: 'ORDER_CONVERTED', pipeline_stage: 'CONVERTED' };
  }
  if (lead.status === 'FEASIBILITY_IN_PROGRESS' && stage === 'COSTING') {
    return { ...lead, status: 'COSTING_IN_PROGRESS' };
  }
  if (lead.status === 'FEASIBILITY_IN_PROGRESS' && stage === 'QUOTATION') {
    return { ...lead, status: 'QUOTATION' };
  }
  if (lead.status === 'FEASIBILITY_IN_PROGRESS' && stage === 'NEGOTIATION') {
    return { ...lead, status: 'NEGOTIATION' };
  }
  const qStatus = lead.quotation?.workflow_status;
  if (
    (qStatus === 'SUBMITTED_TO_CUSTOMER' || qStatus === 'CUSTOMER_REVIEW') &&
    (lead.status === 'QUOTATION' || lead.status === 'FEASIBILITY_IN_PROGRESS')
  ) {
    return { ...lead, status: 'NEGOTIATION', pipeline_stage: 'NEGOTIATION' };
  }
  return { ...lead, pipeline_stage: lead.pipeline_stage || stageFromStatus(lead.status) };
}

export function hydrateLead(lead: Lead): Lead {
  const aligned = alignSeedLead(lead);
  const ownerId = aligned.current_owner_id || aligned.responsible_user_id;
  const ownerName = aligned.current_owner_name || aligned.responsible_user_name;
  const assignmentTeams = store
    .getFeasibilityTeamAssignments()
    .filter((item) => item.lead_id === aligned.id && item.status !== 'CANCELLED');
  const assignedTeamIds = [...new Set([
    ...(aligned.assigned_team_ids || []),
    ...(aligned.assigned_team_id ? [aligned.assigned_team_id] : []),
    ...assignmentTeams.map((item) => item.team_id),
  ].filter(Boolean))];
  const assignedTeamNames = [...new Set([
    ...(aligned.assigned_team_names || []),
    ...(aligned.assigned_team_name ? [aligned.assigned_team_name] : []),
    ...assignmentTeams.map((item) => item.team_name),
  ].filter(Boolean))];
  const visit = {
    visit_requirement: aligned.visit_requirement || 'NONE',
    visit_status: aligned.visit_status || (aligned.visit_requirement && aligned.visit_requirement !== 'NONE' ? 'PENDING_PM_ASSIGNMENT' : 'NOT_REQUIRED'),
    visit_office_address: aligned.visit_office_address || CAREYU_OFFICE_ADDRESS,
    visit_assigned_user_ids: aligned.visit_assigned_user_ids || [],
    visit_assigned_user_names: aligned.visit_assigned_user_names || [],
    visit_activity: aligned.visit_activity || [],
  };
  let quotation = aligned.quotation;
  if (quotation) {
    const revision = quotation.revision ?? 0;
    const submitted = Boolean(quotation.submitted_to_customer_at || quotation.sent_at);
    quotation = emptyQuotation({
      ...quotation,
      revision,
      revision_label: quotation.revision_label || `R${revision}`,
      workflow_status:
        quotation.workflow_status ||
        (submitted ? 'SUBMITTED_TO_CUSTOMER' : aligned.status === 'QUOTATION' ? 'PENDING_INTERNAL' : 'DRAFT'),
    });
  }
  return applyLeadWorkflowContext({
    ...aligned,
    ...visit,
    quotation,
    quotation_revisions: aligned.quotation_revisions || [],
    pipeline_stage: stageFromStatus(aligned.status) || aligned.pipeline_stage,
    current_owner_id: ownerId,
    current_owner_name: ownerName,
    responsible_user_id: aligned.responsible_user_id || ownerId,
    responsible_user_name: aligned.responsible_user_name || ownerName,
    assigned_team_ids: assignedTeamIds,
    assigned_team_names: assignedTeamNames,
    feasibility_study: aligned.feasibility_study
      ? {
          ...aligned.feasibility_study,
          review_history: feasibilityReviewHistory(aligned),
        }
      : aligned.feasibility_study,
  });
}

export function findLead(id: string): Lead | undefined {
  return store.getLeads().find((item) => item.id === id || item.lead_number === id);
}

export function saveLead(lead: Lead): Lead {
  return store.saveLeadRecord(lead);
}

export function deleteLead(lead: Lead, user: User): void {
  const leads = store.getLeads().filter((item) => item.id !== lead.id);
  store.saveLeads(leads);
  store.saveLeadDocuments(store.getLeadDocuments().filter((item) => item.lead_id !== lead.id));
  store.saveLeadComments(store.getLeadComments().filter((item) => item.lead_id !== lead.id));
  store.saveLeadActivities(store.getLeadActivities().filter((item) => item.lead_id !== lead.id));
  store.saveLeadStatusHistory(store.getLeadStatusHistory().filter((item) => item.lead_id !== lead.id));
  store.saveFeasibilityTeamAssignments(
    store.getFeasibilityTeamAssignments().filter((item) => item.lead_id !== lead.id)
  );
  store.saveFeasibilityEmployeeAllocations(
    store.getFeasibilityEmployeeAllocations().filter((item) => item.lead_id !== lead.id)
  );
  store.saveTasks(store.getTasks().filter((item) => item.lead_id !== lead.id));
  store.saveDailyUpdates(store.getDailyUpdates().filter((item) => item.lead_id !== lead.id));
  store.saveStageTransitions(store.getStageTransitions().filter((item) => item.lead_id !== lead.id));
  store.saveEntityDocuments(
    store.getEntityDocuments().filter((item) => !(item.entity_type === 'LEAD' && item.entity_id === lead.id))
  );
  store.saveNotifications(
    store.getNotifications().filter((item) => item.entity_id !== lead.id && item.entity_id !== lead.lead_number)
  );
  store.saveAssignmentHistory(
    store.getAssignmentHistory().filter((item) => item.entity_id !== lead.id && item.entity_id !== lead.lead_number)
  );
  audit(user, lead, 'LEAD_DELETED', `${user.name} deleted lead ${lead.lead_number}.`);
}

export function recordHistory(
  lead: Lead,
  oldStatus: LeadStatus,
  newStatus: LeadStatus,
  user: User,
  reason?: string
): LeadStatusHistory {
  const entry: LeadStatusHistory = {
    id: newId('hist'),
    lead_id: lead.id,
    old_status: oldStatus,
    new_status: newStatus,
    changed_by: user.name,
    changed_by_id: user.id,
    changed_by_role: user.role_name,
    reason,
    created_at: new Date().toISOString(),
  };
  return store.appendLeadStatusHistory(entry);
}

export function audit(
  user: User,
  lead: Lead,
  action: string,
  description: string,
  extra?: { old_value?: string; new_value?: string }
) {
  store.appendAudit({
    user_id: user.id,
    user_name: user.name,
    user_role: user.role_name,
    entity_type: 'LEAD',
    entity_id: lead.id,
    entity_name: lead.lead_number,
    action,
    description,
    old_value: extra?.old_value,
    new_value: extra?.new_value,
  });
}

export function notify(partial: Omit<NotificationItem, 'id' | 'created_at' | 'read_status'>) {
  if (!partial.recipient_id) return;
  const actor = partial.sender_id ? store.findUserById(partial.sender_id) : undefined;
  const lead = partial.entity_type === 'LEAD' ? findLead(partial.entity_id) : undefined;
  const ctx = lead ? workflowContextForStatus(lead.status) : undefined;
  dispatchHandover({
    recipientIds: [partial.recipient_id],
    actor,
    entityType: partial.entity_type,
    entityId: partial.entity_id,
    entityName: lead?.title || partial.title,
    customer: lead?.customer_name,
    title: partial.title,
    message: partial.message,
    actionRequired: lead?.action_required || ctx?.action_required || partial.title,
    ctaLabel: 'Open',
    actionUrl: partial.action_url || (lead ? `/pre-sales/leads/${lead.id}` : undefined),
    type: partial.type,
    status: lead ? leadSubmissionStatusLabel(lead) : ctx?.status_label,
    previousStatus: lead?.previous_status,
    dueDate: lead?.due_date || lead?.customer_target_date,
    assignedBy: lead?.assigned_by_name || actor?.name,
    priority: partial.priority,
    eventKey: partial.event_key || `${partial.type}:${partial.entity_id}:${partial.recipient_id}`,
  });
}

export function transitionLead(
  lead: Lead,
  nextStatus: LeadStatus,
  user: User,
  reason?: string,
  extra: Partial<Lead> = {}
): Lead {
  const oldStatus = lead.status;
  if (oldStatus !== nextStatus) {
    assertAllowedTransition(oldStatus, nextStatus);
  }
  const now = new Date().toISOString();
  const updated = saveLead(
    applyLeadWorkflowContext(
      {
        ...lead,
        ...extra,
        status: nextStatus,
        pipeline_stage: stageFromStatus(nextStatus),
        previous_status: oldStatus,
        last_action_at: now,
      },
      oldStatus
    )
  );
  if (oldStatus !== nextStatus) {
    recordHistory(updated, oldStatus, nextStatus, user, reason);
  }
  return hydrateLead(updated);
}

export function findPm(lead?: Lead): User | undefined {
  return resolveProjectManager(lead);
}

export function isProcurementTeam(team: Team): boolean {
  const hay = `${team.code} ${team.name}`.toLowerCase();
  return hay.includes('procurement') || hay.includes('costing');
}

export function isProcurementUser(user: User): boolean {
  if (user.role_code === 'PROCUREMENT') return true;
  const team = store.getTeams().find((item) => item.id === user.team_id);
  return team ? isProcurementTeam(team) : false;
}

export function userIsOnAssignedLeadTeam(user: User, lead: Lead): boolean {
  if (lead.assigned_team_lead_id === user.id || lead.assigned_member_id === user.id) return true;
  if (user.team_id && (user.team_id === lead.assigned_team_id || (lead.assigned_team_ids || []).includes(user.team_id))) {
    return true;
  }
  return store.getFeasibilityTeamAssignments().some(
    (item) =>
      item.lead_id === lead.id &&
      item.status !== 'CANCELLED' &&
      (item.team_lead_id === user.id || (user.team_id && item.team_id === user.team_id))
  );
}

export function assignedTeamRecipientIds(lead: Lead): string[] {
  const ids = new Set<string>();
  for (const id of [lead.assigned_team_lead_id, lead.assigned_member_id, lead.responsible_user_id]) {
    if (id) ids.add(id);
  }
  for (const item of store.getFeasibilityTeamAssignments()) {
    if (item.lead_id !== lead.id || item.status === 'CANCELLED') continue;
    if (item.team_lead_id) ids.add(item.team_lead_id);
  }
  return [...ids];
}

export function canOwnLead(user: User, lead: Lead): boolean {
  if (['SYSTEM_ADMIN', 'CEO', 'CTO', 'BUSINESS_HEAD'].includes(user.role_code)) return true;
  const ownerId = leadOwnerId(lead);
  if (ownerId === user.id) return true;
  if (lead.created_by_id === user.id || lead.sales_owner_id === user.id) return true;
  if (user.role_code === 'PROJECT_MANAGER') {
    if (lead.pm_id === user.id || !lead.pm_id) return true;
  }
  if (user.role_code === 'ENG_DIRECTOR' && lead.business_vertical === 'Engineering Director') return true;
  if (userIsOnAssignedLeadTeam(user, lead)) return true;
  if (
    store.getFeasibilityEmployeeAllocations().some(
      (allocation) => allocation.lead_id === lead.id && allocation.employee_id === user.id
    )
  ) {
    return true;
  }
  if ((lead.visit_assigned_user_ids || []).includes(user.id)) return true;
  if (isProcurementUser(user) && ['COSTING_IN_PROGRESS', 'COSTING_SUBMITTED', 'COSTING_RETURNED', 'COSTING_REJECTED'].includes(lead.status)) {
    return true;
  }
  return false;
}

export function canHandleLeadCommercial(user: User, lead: Lead): boolean {
  if (user.role_code === 'SYSTEM_ADMIN') return true;
  if (!['BUSINESS_HEAD', 'ENG_DIRECTOR', 'SALES'].includes(user.role_code)) return false;
  if (lead.created_by_id === user.id || lead.sales_owner_id === user.id) return true;
  const owner = findQuotationOwner(lead);
  return owner?.id === user.id;
}

export function canEditProjectInput(user: User, lead: Lead): boolean {
  if (user.role_code === 'SYSTEM_ADMIN') return true;
  if (!['BUSINESS_HEAD', 'ENG_DIRECTOR'].includes(user.role_code)) return false;
  if (!['DRAFT', 'RETURNED_TO_SALES', 'ADDITIONAL_INFORMATION_REQUIRED'].includes(lead.status)) return false;
  if (lead.created_by_id === user.id || lead.sales_owner_id === user.id) return true;
  if (user.role_code === 'BUSINESS_HEAD') return true;
  if (user.role_code === 'ENG_DIRECTOR' && lead.business_vertical === 'Engineering Director') return true;
  return false;
}

const PROTECTED_LEAD_STATUSES: LeadStatus[] = ['ORDER_CONVERTED', 'WON'];

export function canDeleteLead(user: User, lead: Lead): boolean {
  if (PROTECTED_LEAD_STATUSES.includes(lead.status)) return false;
  if (!['DRAFT', 'RETURNED_TO_SALES', 'ADDITIONAL_INFORMATION_REQUIRED'].includes(lead.status)) {
    return false;
  }
  if (user.role_code === 'SYSTEM_ADMIN') return true;
  if (!['BUSINESS_HEAD', 'ENG_DIRECTOR'].includes(user.role_code)) return false;
  if (lead.created_by_id === user.id || lead.sales_owner_id === user.id) return true;
  if (user.role_code === 'BUSINESS_HEAD') return true;
  if (user.role_code === 'ENG_DIRECTOR' && lead.business_vertical === 'Engineering Director') return true;
  return false;
}

export function canPrepareFeasibility(user: User, lead: Lead): boolean {
  if (user.role_code === 'SYSTEM_ADMIN') return true;
  if (!['FEASIBILITY_IN_PROGRESS', 'FEASIBILITY_RETURNED'].includes(lead.status)) return false;
  if (lead.assigned_team_lead_id === user.id || lead.assigned_member_id === user.id) return true;
  const mine = store
    .getFeasibilityTeamAssignments()
    .filter(
      (item) =>
        item.lead_id === lead.id &&
        item.status !== 'CANCELLED' &&
        (item.team_lead_id === user.id || (user.team_id && item.team_id === user.team_id))
    );
  if (mine.some((item) => item.status === 'PENDING_TEAM_LEAD_REVIEW')) return false;
  if (mine.length) return true;
  if (user.role_code === 'TEAM_LEAD' && user.team_id === lead.assigned_team_id) return true;
  if (user.team_id && (user.team_id === lead.assigned_team_id || (lead.assigned_team_ids || []).includes(user.team_id))) return true;
  return false;
}

export function canPrepareCosting(user: User, lead: Lead): boolean {
  if (user.role_code === 'SYSTEM_ADMIN') return true;
  if (!['COSTING_IN_PROGRESS', 'COSTING_RETURNED'].includes(lead.status)) return false;
  return isProcurementUser(user);
}

export function canPrepareQuotation(user: User, lead: Lead): boolean {
  if (user.role_code === 'SYSTEM_ADMIN') return true;
  if (!['QUOTATION', 'NEGOTIATION'].includes(lead.status)) return false;
  if (lead.created_by_id === user.id && ['BUSINESS_HEAD', 'ENG_DIRECTOR'].includes(user.role_code)) return true;
  const creator = lead.created_by_id ? store.findUserById(lead.created_by_id) : undefined;
  if (creator && creator.status === 'ACTIVE') return false;
  const owner = findQuotationOwner(lead);
  return owner?.id === user.id;
}

export function handLeadToBusinessHead(lead: Lead, actor: User, reason = 'Ready for quotation'): Lead {
  const owner = findQuotationOwner(lead);
  if (!owner || owner.id === leadOwnerId(lead)) return saveLead(lead);
  const transferred = transferLeadResponsibility(lead, owner, actor, reason);
  return saveLead(transferred.lead);
}

export function handLeadToProcurement(lead: Lead, actor: User, reason = 'Feasibility approved — procurement pending'): Lead {
  const owner = procurementUsers()[0];
  if (!owner || owner.id === leadOwnerId(lead)) return saveLead(lead);
  const transferred = transferLeadResponsibility(lead, owner, actor, reason);
  return saveLead(transferred.lead);
}

export function emptyFeasibility(partial: Partial<FeasibilityStudy> = {}): FeasibilityStudy {
  return {
    technical_feasibility: '',
    required_resources: '',
    proposed_solution: '',
    major_constraints: '',
    estimated_timeline: '',
    technical_assumptions: '',
    required_equipment: '',
    team_remarks: '',
    documents: [],
    status: 'DRAFT',
    ...partial,
  };
}

export function appendFeasibilityReview(
  study: FeasibilityStudy | undefined,
  user: User,
  action: FeasibilityReviewAction,
  reason?: string
): FeasibilityStudy {
  const now = new Date().toISOString();
  const current = emptyFeasibility(study || {});
  const trimmed = (reason || '').trim();
  const entry: FeasibilityReviewRecord = {
    id: newId('fsrev'),
    action,
    reason: trimmed || undefined,
    reviewed_by: user.name,
    reviewed_by_id: user.id,
    reviewed_at: now,
  };
  const history = [...(current.review_history || []), entry];
  return emptyFeasibility({
    ...current,
    review_history: history,
    review_action: action,
    reviewed_by: user.name,
    reviewed_by_id: user.id,
    reviewed_at: now,
    rejection_reason: action === 'REJECT' ? trimmed : current.rejection_reason,
    send_back_reason: action === 'SEND_BACK' ? trimmed : current.send_back_reason,
    pm_return_reason: action === 'ACCEPT' ? current.pm_return_reason : trimmed || current.pm_return_reason,
    pm_approved_by: action === 'ACCEPT' ? user.name : current.pm_approved_by,
    pm_approved_at: action === 'ACCEPT' ? now : current.pm_approved_at,
  });
}

function deriveFeasibilityReviewsFromStatusHistory(leadId: string): FeasibilityReviewRecord[] {
  return store
    .getLeadStatusHistory()
    .filter((item) => item.lead_id === leadId && item.old_status === 'FEASIBILITY_SUBMITTED')
    .filter((item) =>
      ['COSTING_IN_PROGRESS', 'FEASIBILITY_RETURNED', 'FEASIBILITY_REJECTED'].includes(item.new_status)
    )
    .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))
    .map((item) => ({
      id: item.id,
      action:
        item.new_status === 'COSTING_IN_PROGRESS'
          ? ('ACCEPT' as const)
          : item.new_status === 'FEASIBILITY_REJECTED'
            ? ('REJECT' as const)
            : ('SEND_BACK' as const),
      reason: item.reason,
      reviewed_by: item.changed_by,
      reviewed_by_id: item.changed_by_id,
      reviewed_at: item.created_at,
    }));
}

export function feasibilityReviewHistory(lead: Lead): FeasibilityReviewRecord[] {
  const stored = lead.feasibility_study?.review_history;
  if (Array.isArray(stored) && stored.length) return stored;
  return deriveFeasibilityReviewsFromStatusHistory(lead.id);
}

export function previousFeasibilityReview(lead: Lead): FeasibilityReviewRecord | undefined {
  const history = feasibilityReviewHistory(lead);
  return history[history.length - 1];
}

export function setFeasibilityAssignmentStatusForLead(
  leadId: string,
  status: FeasibilityTeamAssignment['status']
) {
  const now = new Date().toISOString();
  const assignments = store.getFeasibilityTeamAssignments();
  let changed = false;
  const next = assignments.map((item) => {
    if (item.lead_id !== leadId || item.status === 'CANCELLED') return item;
    changed = true;
    return { ...item, status, updated_at: now };
  });
  if (changed) store.saveFeasibilityTeamAssignments(next);
}

function previousReviewSummary(lead: Lead): string {
  const prev = previousFeasibilityReview(lead);
  if (!prev) return '';
  if (prev.action === 'SEND_BACK') return prev.reason ? `Sent Back: ${prev.reason}` : 'Sent Back';
  if (prev.action === 'REJECT') return prev.reason ? `Rejected: ${prev.reason}` : 'Rejected';
  if (prev.action === 'ACCEPT') return 'Accepted';
  return '';
}

function pendingReviewStatusLabel(lead: Lead): string {
  if (lead.status === 'FEASIBILITY_SUBMITTED') {
    const prev = previousFeasibilityReview(lead);
    if (prev?.action === 'SEND_BACK' || lead.previous_status === 'FEASIBILITY_RETURNED') return 'Resubmitted';
    return 'Submitted to PM';
  }
  if (lead.status === 'RESUBMITTED_TO_PM') return 'Resubmitted';
  return lead.status;
}

export function emptyCosting(partial: Partial<CostingRecord> = {}): CostingRecord {
  return {
    bom_components: '',
    vendor_requirements: '',
    vendor_quotations: '',
    component_costs: 0,
    procurement_costs: 0,
    engineering_costs: 0,
    software_costs: 0,
    installation_costs: 0,
    other_costs: 0,
    total_estimated_cost: 0,
    commercial_assumptions: '',
    documents: [],
    status: 'DRAFT',
    ...partial,
  };
}

export function costingTotal(record: CostingRecord): number {
  return (
    Number(record.component_costs || 0) +
    Number(record.procurement_costs || 0) +
    Number(record.engineering_costs || 0) +
    Number(record.software_costs || 0) +
    Number(record.installation_costs || 0) +
    Number(record.other_costs || 0)
  );
}

export function pendingTeamAssignment(leadId: string): FeasibilityTeamAssignment | undefined {
  return store
    .getFeasibilityTeamAssignments()
    .find((item) => item.lead_id === leadId && item.status === 'PENDING_TEAM_LEAD_REVIEW');
}

export function pendingTeamAssignmentForUser(leadId: string, user: User): FeasibilityTeamAssignment | undefined {
  return store
    .getFeasibilityTeamAssignments()
    .find(
      (item) =>
        item.lead_id === leadId &&
        item.status === 'PENDING_TEAM_LEAD_REVIEW' &&
        (item.team_lead_id === user.id || (user.team_id && item.team_id === user.team_id))
    );
}

export function approveLeadForAssignment(lead: Lead, user: User, notes?: string): Lead {
  if (lead.status === 'ACCEPTED_FOR_FEASIBILITY') return hydrateLead(lead);
  const now = new Date().toISOString();
  return transitionLead(lead, 'ACCEPTED_FOR_FEASIBILITY', user, 'PM review completed — ready for assignment', {
    pm_review_notes: notes || lead.pm_review_notes,
    reviewed_at: now,
    accepted_at: lead.accepted_at || now,
    accepted_by_id: lead.accepted_by_id || user.id,
    accepted_by_name: lead.accepted_by_name || user.name,
    pm_id: user.role_code === 'PROJECT_MANAGER' ? user.id : lead.pm_id || findPm()?.id,
    pm_name: user.role_code === 'PROJECT_MANAGER' ? user.name : lead.pm_name || findPm()?.name,
  });
}

export function assignTeamToLead(
  lead: Lead,
  user: User,
  teamId: string,
  assigneeId?: string,
  notes?: string
): { lead: Lead; assignment: FeasibilityTeamAssignment; previousResponsibleUserId?: string } {
  const team = store.getTeams().find((item) => item.id === teamId && item.status === 'ACTIVE');
  if (!team) {
    throw Object.assign(new Error('Selected team was not found in Organization Management.'), { status: 400 });
  }
  const users = store.getUsers();
  const requested = assigneeId ? users.find((item) => item.id === assigneeId) : undefined;
  const fallbackLead = team.team_lead_id ? users.find((item) => item.id === team.team_lead_id) : undefined;
  const assignee = requested || fallbackLead;
  if (!assignee) {
    throw Object.assign(new Error('Select a Team Lead or Team Member to assign this project.'), { status: 400 });
  }
  const due = new Date();
  due.setDate(due.getDate() + 7);
  const direct = assignee.role_code !== 'TEAM_LEAD';
  const teamLead = direct
    ? (assignee.team_lead_id ? users.find((item) => item.id === assignee.team_lead_id) : fallbackLead)
    : assignee;

  const now = new Date().toISOString();
  const existing = store
    .getFeasibilityTeamAssignments()
    .find((item) => item.lead_id === lead.id && item.team_id === team.id && item.status !== 'CANCELLED');
  const nextStatusForAssignment = existing && ['IN_PROGRESS', 'SUBMITTED_TO_PM', 'COMPLETED'].includes(existing.status)
    ? existing.status
    : direct
      ? 'READY_TO_START'
      : 'PENDING_TEAM_LEAD_REVIEW';
  const assignment: FeasibilityTeamAssignment = {
    id: existing?.id || newId('fta'),
    lead_id: lead.id,
    team_id: team.id,
    team_name: team.name,
    team_lead_id: teamLead?.id,
    team_lead_name: teamLead?.name || team.team_lead_name,
    assignment_type: existing?.assignment_type || 'NORMAL',
    priority: lead.priority,
    due_date: existing?.due_date || due.toISOString().slice(0, 10),
    pm_instructions: notes || existing?.pm_instructions || 'Prepare technical feasibility for this opportunity.',
    status: nextStatusForAssignment,
    created_by: existing?.created_by || user.name,
    created_by_id: existing?.created_by_id || user.id,
    created_at: existing?.created_at || now,
    updated_at: now,
  };

  const assignments = store.getFeasibilityTeamAssignments();
  if (existing) {
    store.saveFeasibilityTeamAssignments(assignments.map((item) => (item.id === existing.id ? assignment : item)));
  } else {
    assignments.unshift(assignment);
    store.saveFeasibilityTeamAssignments(assignments);
  }

  const working =
    lead.status === 'ACCEPTED_FOR_FEASIBILITY' || lead.status === 'FEASIBILITY_IN_PROGRESS'
      ? lead
      : approveLeadForAssignment(lead, user, notes);
  const existingIds = [...new Set([...(working.assigned_team_ids || []), ...(working.assigned_team_id ? [working.assigned_team_id] : []), team.id])];
  const existingNames = [...new Set([...(working.assigned_team_names || []), ...(working.assigned_team_name ? [working.assigned_team_name] : []), team.name])];
  const pending = store
    .getFeasibilityTeamAssignments()
    .some((item) => item.lead_id === lead.id && item.status === 'PENDING_TEAM_LEAD_REVIEW');
  const keepStatus = ['FEASIBILITY_IN_PROGRESS', 'FEASIBILITY_SUBMITTED', 'FEASIBILITY_RETURNED'].includes(working.status);
  const nextStatus = keepStatus
    ? working.status
    : pending || !direct
      ? 'ACCEPTED_FOR_FEASIBILITY'
      : 'FEASIBILITY_IN_PROGRESS';
  const updatedBase = transitionLead(working, nextStatus, user, direct ? 'Directly assigned to team member' : 'Assigned to Team Lead', {
    assigned_team_id: working.assigned_team_id || team.id,
    assigned_team_name: working.assigned_team_name || team.name,
    assigned_team_ids: existingIds,
    assigned_team_names: existingNames,
    assigned_team_lead_id: working.assigned_team_lead_id || teamLead?.id,
    assigned_team_lead_name: working.assigned_team_lead_name || teamLead?.name || team.team_lead_name,
    assignment_path: working.assignment_path || (direct ? 'DIRECT_MEMBER' : 'TEAM_LEAD'),
    assigned_member_id: working.assigned_member_id || (direct ? assignee.id : undefined),
    assigned_member_name: working.assigned_member_name || (direct ? assignee.name : undefined),
    pm_id: user.role_code === 'PROJECT_MANAGER' ? user.id : working.pm_id || findPm()?.id,
    pm_name: user.role_code === 'PROJECT_MANAGER' ? user.name : lead.pm_name || findPm()?.name,
    pm_review_notes: notes || lead.pm_review_notes,
    reviewed_at: now,
    accepted_at: lead.accepted_at || now,
    accepted_by_id: lead.accepted_by_id || user.id,
    accepted_by_name: lead.accepted_by_name || user.name,
  });

  const transferred = transferLeadResponsibility(
    updatedBase,
    assignee,
    user,
    notes || `Assigned to ${direct ? assignee.name : team.name}`
  );
  const updated = saveLead(transferred.lead);
  return { lead: updated, assignment, previousResponsibleUserId: transferred.previous?.id };
}

export function assignTeamsToLead(
  lead: Lead,
  user: User,
  teamIds: string[],
  assignees?: Record<string, string>,
  notes?: string
): { lead: Lead; assignments: FeasibilityTeamAssignment[] } {
  const unique = [...new Set(teamIds.map((id) => String(id || '').trim()).filter(Boolean))];
  if (!unique.length) {
    throw Object.assign(new Error('Select at least one functional team.'), { status: 400 });
  }
  let current = lead;
  const created: FeasibilityTeamAssignment[] = [];
  for (const teamId of unique) {
    const result = assignTeamToLead(current, user, teamId, assignees?.[teamId], notes);
    current = result.lead;
    created.push(result.assignment);
  }
  return { lead: current, assignments: created };
}

export function reviewLeadTeamIntake(
  lead: Lead,
  user: User,
  action: 'accept' | 'return',
  comments?: string
): Lead {
  const isAdmin = user.role_code === 'SYSTEM_ADMIN';
  const assignment =
    pendingTeamAssignmentForUser(lead.id, user) ||
    (lead.assigned_team_lead_id === user.id || lead.assigned_member_id === user.id
      ? pendingTeamAssignment(lead.id)
      : undefined);
  const isAssignedLead = Boolean(
    assignment ||
      lead.assigned_team_lead_id === user.id ||
      lead.assigned_member_id === user.id ||
      (user.role_code === 'TEAM_LEAD' && Boolean(user.team_id) && (user.team_id === lead.assigned_team_id || (lead.assigned_team_ids || []).includes(user.team_id || '')))
  );
  if (!isAdmin && !isAssignedLead) {
    throw new LeadWorkflowError('Only the assigned Team Lead or Team Member can accept or return this project.', 403);
  }
  if (!['ACCEPTED_FOR_FEASIBILITY', 'FEASIBILITY_IN_PROGRESS'].includes(lead.status)) {
    throw new LeadWorkflowError('This project is not awaiting Team Lead review.', 400);
  }
  const note = (comments || '').trim();
  const now = new Date().toISOString();

  if (action === 'accept') {
    if (assignment && !['PENDING_TEAM_LEAD_REVIEW', 'CLARIFICATION_REQUIRED'].includes(assignment.status)) {
      throw new LeadWorkflowError('This project has already been accepted for the current review cycle.', 400);
    }
    if (!assignment && lead.status === 'FEASIBILITY_IN_PROGRESS') {
      throw new LeadWorkflowError('This project has already been accepted for the current review cycle.', 400);
    }
  }

  if (action === 'return') {
    if (!note) throw new LeadWorkflowError('Comments are required when returning a project to the Project Manager.', 400);
    if (assignment) {
      const assignments = store.getFeasibilityTeamAssignments().map((item) =>
        item.id === assignment.id ? { ...item, status: 'CANCELLED' as const, updated_at: now } : item
      );
      store.saveFeasibilityTeamAssignments(assignments);
    }
    const remaining = store
      .getFeasibilityTeamAssignments()
      .filter((item) => item.lead_id === lead.id && item.status !== 'CANCELLED');
    const remainingIds = remaining.map((item) => item.team_id);
    const remainingNames = remaining.map((item) => item.team_name);
    const primary = remaining[0];
    let updated = transitionLead(lead, remaining.length ? lead.status : 'ACCEPTED_FOR_FEASIBILITY', user, note, {
      assigned_team_id: primary?.team_id,
      assigned_team_name: primary?.team_name,
      assigned_team_ids: remainingIds,
      assigned_team_names: remainingNames,
      assigned_team_lead_id: remaining.length ? lead.assigned_team_lead_id : undefined,
      assigned_team_lead_name: remaining.length ? lead.assigned_team_lead_name : undefined,
      assignment_path: remaining.length ? lead.assignment_path : undefined,
      assigned_member_id: remaining.length ? lead.assigned_member_id : undefined,
      assigned_member_name: remaining.length ? lead.assigned_member_name : undefined,
      pm_return_reason: note,
    });
    if (!remaining.length) {
      const pm = findPm(updated) || (updated.pm_id ? store.findUserById(updated.pm_id) : undefined);
      if (pm) {
        const transferred = transferLeadResponsibility(updated, pm, user, note);
        updated = saveLead({ ...transferred.lead, pending_action: true });
      }
    }
    return hydrateLead(updated);
  }

  if (assignment) {
    const assignments = store.getFeasibilityTeamAssignments().map((item) =>
      item.id === assignment.id ? { ...item, status: 'IN_PROGRESS' as const, updated_at: now } : item
    );
    store.saveFeasibilityTeamAssignments(assignments);
  }
  return transitionLead(lead, 'FEASIBILITY_IN_PROGRESS', user, 'Project accepted by Team Lead', {
    accepted_at: now,
  });
}

export function convertLeadToProject(lead: Lead, user: User): { lead: Lead; project: Project } {
  const projects = store.getProjects();
  const existing = projects.find((project) => project.lead_id === lead.id);
  const quotationValue = lead.quotation?.revised_value || lead.quotation?.quotation_value || lead.expected_value || 0;
  const now = new Date().toISOString();
  const pm = findPm();

  const project: Project = existing
    ? {
        ...existing,
        name: existing.name || lead.title,
        customer_name: lead.customer_name,
        pm_id: lead.pm_id || existing.pm_id || pm?.id || user.id,
        pm_name: lead.pm_name || existing.pm_name || pm?.name || user.name,
        lead_id: lead.id,
        lead_number: lead.lead_number,
        status: existing.status === 'CANCELLED' ? 'ACTIVE' : existing.status,
        value: existing.value ?? quotationValue,
        start_date: existing.start_date || existing.created_at.slice(0, 10),
        current_phase: existing.current_phase || 'EXECUTION',
        team_ids: existing.team_ids?.length
          ? existing.team_ids
          : lead.assigned_team_id
            ? [lead.assigned_team_id]
            : existing.team_ids,
        team_lead_id: existing.team_lead_id || lead.assigned_team_lead_id,
        team_lead_name: existing.team_lead_name || lead.assigned_team_lead_name,
        intake_status:
          existing.intake_status ||
          (existing.team_lead_id || lead.assigned_team_lead_id ? 'PENDING_TL_REVIEW' : 'AWAITING_ASSIGNMENT'),
        assignment_path: existing.assignment_path || (lead.assigned_team_lead_id ? 'TEAM_LEAD' : undefined),
        updated_at: now,
      }
    : {
        id: newId('prj'),
        code: `PRJ-${String(projects.length + 1).padStart(3, '0')}`,
        name: lead.title,
        customer_name: lead.customer_name,
        pm_id: lead.pm_id || pm?.id || user.id,
        pm_name: lead.pm_name || pm?.name || user.name,
        progress: 0,
        health: 'ON_TRACK',
        status: 'ACTIVE',
        lead_id: lead.id,
        lead_number: lead.lead_number,
        team_ids: lead.assigned_team_id ? [lead.assigned_team_id] : [],
        team_lead_id: lead.assigned_team_lead_id,
        team_lead_name: lead.assigned_team_lead_name,
        intake_status: lead.assigned_team_lead_id ? 'PENDING_TL_REVIEW' : 'AWAITING_ASSIGNMENT',
        assignment_path: lead.assigned_team_lead_id ? 'TEAM_LEAD' : undefined,
        value: quotationValue,
        start_date: now.slice(0, 10),
        target_completion: new Date(Date.now() + 90 * 24 * 3600000).toISOString().slice(0, 10),
        current_phase: 'EXECUTION',
        last_update_at: now,
        created_at: now,
        updated_at: now,
      };

  if (existing) {
    const index = projects.findIndex((item) => item.id === existing.id);
    projects[index] = project;
  } else {
    projects.unshift(project);
  }
  store.saveProjects(projects);

  const updated = transitionLead(lead, 'ORDER_CONVERTED', user, 'Customer accepted proposal', {
    project_id: project.id,
    converted_at: now,
    expected_value: quotationValue || lead.expected_value,
    estimated_opportunity_value: String(quotationValue || lead.expected_value || ''),
  });

  store.appendAudit({
    user_id: user.id,
    user_name: user.name,
    user_role: user.role_name,
    entity_type: 'PROJECT',
    entity_id: project.id,
    entity_name: project.code,
    action: 'PROJECT_CREATED_FROM_LEAD',
    description: `${user.name} converted ${lead.lead_number} into project ${project.code}.`,
  });

  return { lead: updated, project };
}

function leadWorkHref(lead: Lead): string {
  if (['DRAFT', 'RETURNED_TO_SALES', 'ADDITIONAL_INFORMATION_REQUIRED'].includes(lead.status)) {
    return `/pre-sales/leads/create?id=${encodeURIComponent(lead.id)}`;
  }
  if (lead.status === 'FEASIBILITY_SUBMITTED' || lead.status === 'FEASIBILITY_RETURNED') {
    return `/pre-sales/leads/${lead.id}?tab=feasibility`;
  }
  return `/pre-sales/leads/${lead.id}`;
}

function workItem(lead: Lead, category: MyWorkItem['category'], summary: string): MyWorkItem {
  const hydrated = hydrateLead(lead);
  return {
    lead_id: lead.id,
    lead_number: lead.lead_number,
    title: lead.title,
    customer_name: lead.customer_name,
    status: lead.status,
    pipeline_stage: hydrated.pipeline_stage || stageFromStatus(lead.status),
    category,
    summary,
    href: leadWorkHref(lead),
    priority: lead.priority,
    due_date: hydrated.due_date,
    action_required: hydrated.action_required || summary,
    current_owner: hydrated.current_owner_name,
    assigned_by: hydrated.assigned_by_name,
    approval_pending: hydrated.approval_pending,
  };
}

export function buildMyWork(user: User): { items: MyWorkItem[]; groups: Record<string, MyWorkItem[]> } {
  const leads = store.getLeads().map(hydrateLead);
  const items: MyWorkItem[] = [];
  const seen = new Set<string>();

  const add = (lead: Lead, category: MyWorkItem['category'], summary: string) => {
    const key = `${lead.id}:${category}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(workItem(lead, category, summary));
  };

  const canCapture = ['BUSINESS_HEAD', 'ENG_DIRECTOR'].includes(user.role_code);
  if (canCapture) {
    items.push({
      lead_id: 'new',
      lead_number: 'NEW',
      title: 'Create New Lead',
      customer_name: '',
      status: 'DRAFT',
      pipeline_stage: 'PROJECT_INPUT',
      category: 'CREATE',
      summary: 'Capture a new customer opportunity on the Pre-Sales Lead Form.',
      href: '/pre-sales/leads/create',
      priority: 'High',
    });
  }

  for (const lead of leads) {
    const ownerId = leadOwnerId(lead);
    const isOwner = ownerId === user.id;
    const isCreator = lead.created_by_id === user.id || lead.sales_owner_id === user.id;
    const isSalesRole = ['BUSINESS_HEAD', 'ENG_DIRECTOR', 'SALES', 'EMPLOYEE', 'PROJECT_ENGINEER'].includes(user.role_code);
    const salesVisible =
      isCreator ||
      (user.role_code === 'BUSINESS_HEAD' && lead.business_vertical === 'Business Head') ||
      (user.role_code === 'ENG_DIRECTOR' && lead.business_vertical === 'Engineering Director');

    if (isSalesRole && salesVisible) {
      if (lead.status === 'DRAFT') {
        add(lead, 'DRAFT', 'Finish and submit this draft to PM.');
      }
      if (['RETURNED_TO_SALES', 'ADDITIONAL_INFORMATION_REQUIRED'].includes(lead.status)) {
        add(lead, 'RETURNED', lead.pm_return_reason || 'PM returned this lead for correction.');
      }
    }
    if (canHandleLeadCommercial(user, lead)) {
      if (lead.status === 'QUOTATION') {
        add(lead, 'QUOTATION', 'Approved costing is ready. Prepare and send the quotation.');
      }
      if (lead.status === 'NEGOTIATION') {
        add(lead, 'NEGOTIATION', 'Active commercial follow-up. Update negotiation or convert to order.');
      }
    }

    const pmSeesLead =
      user.role_code === 'SYSTEM_ADMIN' ||
      ((user.role_code === 'PROJECT_MANAGER' || user.role_code === 'SYSTEM_ADMIN') &&
        (isOwner || lead.pm_id === user.id));

    if (pmSeesLead) {
      if (PM_REVIEW_STATUSES.includes(lead.status) && (isOwner || user.role_code === 'SYSTEM_ADMIN')) {
        add(lead, 'PM_REVIEW', 'Review project input. Approve, send back, or cancel.');
      }
      if (lead.status === 'ACCEPTED_FOR_FEASIBILITY' && !lead.assigned_team_id) {
        add(lead, 'ASSIGN', 'Assign a Team Lead or Team Member to continue the workflow.');
      }
      if (lead.status === 'FEASIBILITY_SUBMITTED' && (isOwner || lead.pm_id === user.id || user.role_code === 'SYSTEM_ADMIN')) {
        add(lead, 'FEASIBILITY_APPROVAL', 'Review submitted feasibility and approve or return to the team.');
      }
      if (lead.status === 'COSTING_SUBMITTED' && (isOwner || lead.pm_id === user.id || user.role_code === 'SYSTEM_ADMIN')) {
        add(lead, 'COSTING_APPROVAL', 'Review submitted costing and approve or return for revision.');
      }
    }

    const pendingMine = user.role_code === 'TEAM_LEAD' ? pendingTeamAssignmentForUser(lead.id, user) : undefined;
    if (
      user.role_code === 'TEAM_LEAD' &&
      pendingMine &&
      ['ACCEPTED_FOR_FEASIBILITY', 'FEASIBILITY_IN_PROGRESS'].includes(lead.status)
    ) {
      add(lead, 'FEASIBILITY', 'Review requirements and accept the project, or return it to the Project Manager.');
    } else if (
      canPrepareFeasibility(user, lead) ||
      (user.role_code === 'TEAM_LEAD' &&
        ['FEASIBILITY_IN_PROGRESS', 'FEASIBILITY_RETURNED'].includes(lead.status) &&
        userIsOnAssignedLeadTeam(user, lead))
    ) {
      add(
        lead,
        'FEASIBILITY',
        lead.status === 'FEASIBILITY_RETURNED'
          ? lead.feasibility_return_reason || 'PM returned feasibility for correction.'
          : 'Prepare and submit the feasibility study.'
      );
    }

    if (isProcurementUser(user) && ['COSTING_IN_PROGRESS', 'COSTING_RETURNED'].includes(lead.status)) {
      add(
        lead,
        'COSTING',
        lead.status === 'COSTING_RETURNED'
          ? lead.costing_return_reason || 'PM returned costing for revision.'
          : 'Prepare BOM, vendor quotations, and project costing.'
      );
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const addGeneric = (item: MyWorkItem) => {
    const key = `${item.lead_id}:${item.category}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(item);
  };

  for (const project of store.getProjects()) {
    if (project.status === 'CANCELLED') continue;
    const intake = project.intake_status || (project.team_lead_id ? 'PENDING_TL_REVIEW' : 'AWAITING_ASSIGNMENT');
    const href = `/projects/${project.id}`;
    const base = {
      lead_id: project.id,
      lead_number: project.code,
      title: project.name,
      customer_name: project.customer_name,
      href,
      priority: (project.health === 'CRITICAL' ? 'Critical' : project.health === 'AT_RISK' ? 'High' : 'Medium') as MyWorkItem['priority'],
      due_date: project.target_completion || project.start_date,
    };

    if (
      (user.role_code === 'PROJECT_MANAGER' && project.pm_id === user.id) ||
      user.role_code === 'SYSTEM_ADMIN'
    ) {
      if (intake === 'SUBMITTED_TO_PM' && project.status === 'ACTIVE') {
        addGeneric({
          ...base,
          status: 'SUBMITTED_TO_PM',
          pipeline_stage: 'PM_REVIEW',
          category: 'EXECUTION',
          summary: 'Review the submitted project, then accept and assign a Team Lead, or return with comments.',
        });
      }
      if (project.status === 'ACTIVE' && intake === 'AWAITING_ASSIGNMENT') {
        addGeneric({
          ...base,
          status: 'AWAITING_ASSIGNMENT',
          pipeline_stage: 'EXECUTION',
          category: 'EXECUTION',
          summary: 'Assign this project to a Team Lead or directly to a team member.',
        });
      }
      if (intake === 'RETURNED' && project.status === 'ACTIVE') {
        addGeneric({
          ...base,
          status: 'RETURNED',
          pipeline_stage: 'EXECUTION',
          category: 'EXECUTION',
          summary: project.intake_comment || 'Team Lead returned this project. Reassign or update instructions.',
        });
      }
      if (project.tl_reviewed_at && !project.pm_approved_at && (project.status === 'ACTIVE' || project.status === 'HANDOVER')) {
        addGeneric({
          ...base,
          status: project.status === 'HANDOVER' ? 'HANDOVER' : 'PM_FINAL_REVIEW',
          pipeline_stage: 'EXECUTION',
          category: 'EXECUTION',
          summary:
            project.status === 'HANDOVER'
              ? 'Complete handover documents and close the project.'
              : 'Team Lead completed final validation. Approve handover and close the project.',
        });
      }
    }

    if (
      project.created_by_id === user.id &&
      project.source === 'DIRECT_CREATE' &&
      intake === 'RETURNED_TO_CREATOR' &&
      project.status === 'ACTIVE'
    ) {
      addGeneric({
        ...base,
        href: `/projects/create?id=${project.id}`,
        status: 'RETURNED_TO_CREATOR',
        pipeline_stage: 'PM_REVIEW',
        category: 'EXECUTION',
        summary: project.intake_comment || 'PM returned this project. Update the details and resubmit.',
      });
    }

    if (user.role_code === 'TEAM_LEAD' && project.team_lead_id === user.id && project.status === 'ACTIVE') {
      if (intake === 'PENDING_TL_REVIEW') {
        addGeneric({
          ...base,
          status: 'PENDING_TL_REVIEW',
          pipeline_stage: 'EXECUTION',
          category: 'EXECUTION',
          summary: 'Review requirements and accept the project, or return it to the Project Manager.',
        });
      }
      const tasks = store.getTasks().filter((task) => task.project_id === project.id);
      const allComplete =
        tasks.length > 0 &&
        tasks.every((task) => task.status === 'DONE' && task.review_status !== 'PENDING_TL_REVIEW' && task.review_status !== 'CORRECTION_REQUIRED');
      if (allComplete && !project.tl_reviewed_at) {
        addGeneric({
          ...base,
          status: 'TL_FINAL_REVIEW',
          pipeline_stage: 'EXECUTION',
          category: 'EXECUTION',
          summary: 'All tasks are complete. Perform Team Lead final validation.',
        });
      }
    }
  }

  for (const task of store.getTasks()) {
    const project = task.project_id ? store.getProjects().find((item) => item.id === task.project_id) : undefined;
    const overdue = Boolean(task.due_date && task.due_date < today && task.status !== 'DONE');
    const href = `/my-work?task=${encodeURIComponent(task.id)}`;
    const base = {
      lead_id: task.id,
      lead_number: project?.code || 'TASK',
      title: task.title,
      customer_name: project?.customer_name || '',
      href,
      priority: overdue ? ('Critical' as const) : task.priority,
      due_date: task.due_date,
    };
    if (task.review_status === 'PENDING_TL_REVIEW') {
      const assignee = store.findUserById(task.assigned_to_id);
      const isReviewer =
        user.role_code === 'TEAM_LEAD' &&
        (project?.team_lead_id === user.id || assignee?.team_lead_id === user.id || assignee?.team_id === user.team_id);
      if (isReviewer) {
        addGeneric({
          ...base,
          status: 'PENDING_TL_REVIEW',
          pipeline_stage: 'EXECUTION',
          category: 'TASK_REVIEW',
          summary: overdue
            ? `OVERDUE. Review ${task.assigned_to}'s completed work and approve or send back.`
            : `Review ${task.assigned_to}'s completed work and approve or send back.`,
        });
      }
    }
    if (task.assigned_to_id === user.id) {
      if (task.review_status === 'CORRECTION_REQUIRED') {
        addGeneric({
          ...base,
          status: 'CORRECTION_REQUIRED',
          pipeline_stage: 'EXECUTION',
          category: 'TASK',
          summary: task.remarks || 'Correct this task and resubmit for Team Lead review.',
        });
      } else if (task.review_status !== 'PENDING_TL_REVIEW' && task.status !== 'DONE') {
        addGeneric({
          ...base,
          status: task.status,
          pipeline_stage: 'EXECUTION',
          category: 'TASK',
          summary: overdue
            ? `OVERDUE. ${task.status === 'BLOCKED' ? task.blocked_reason || 'Resolve the blocker.' : 'Start or complete this assigned task.'}`
            : task.status === 'BLOCKED'
              ? task.blocked_reason || 'Resolve the blocker and continue.'
              : 'Execute this assigned task.',
        });
      }
    }
  }

  for (const escalation of store.getEscalations()) {
    if (escalation.status === 'RESOLVED') continue;
    const project = escalation.project_id
      ? store.getProjects().find((item) => item.id === escalation.project_id)
      : undefined;
    const level = escalation.current_level;
    const canAct =
      user.role_code === 'SYSTEM_ADMIN' ||
      (level === 'TEAM_LEAD' &&
        user.role_code === 'TEAM_LEAD' &&
        (project?.team_lead_id === user.id || escalation.team_id === user.team_id)) ||
      (level === 'PROJECT_MANAGER' && user.role_code === 'PROJECT_MANAGER' && (!project || project.pm_id === user.id)) ||
      ((level === 'BUSINESS_HEAD' || level === 'ENG_DIRECTOR') && ['BUSINESS_HEAD', 'ENG_DIRECTOR'].includes(user.role_code)) ||
      (level === 'CEO' && user.role_code === 'CEO');
    if (!canAct) continue;
    addGeneric({
      lead_id: escalation.id,
      lead_number: escalation.code,
      title: escalation.issue,
      customer_name: escalation.customer_name,
      status: `${escalation.status}:${level}`,
      pipeline_stage: 'EXECUTION',
      category: 'ESCALATION',
      summary: `${escalation.severity} issue at ${level.replace('_', ' ')}: ${escalation.impact}`,
      href: `/dashboard/ceo/escalations/${escalation.id}`,
      priority: escalation.severity === 'CRITICAL' ? 'Critical' : escalation.severity === 'HIGH' ? 'High' : 'Medium',
    });
  }

  items.sort((a, b) => {
    if (a.lead_id === 'new') return -1;
    if (b.lead_id === 'new') return 1;
    return compareLeadIdentity(a.lead_number, b.lead_number);
  });

  const groups: Record<string, MyWorkItem[]> = {};
  for (const item of items) {
    groups[item.category] = groups[item.category] || [];
    groups[item.category].push(item);
  }
  return { items, groups };
}

export function buildPmDashboard(user: User) {
  const leads = store.getLeads().map(hydrateLead);
  const assigned = leads.filter((lead) => {
    if (user.role_code === 'SYSTEM_ADMIN') return true;
    const ownerId = leadOwnerId(lead);
    return ownerId === user.id || lead.pm_id === user.id;
  });

  const pendingReviews = assigned.filter(
    (lead) =>
      (PM_REVIEW_STATUSES.includes(lead.status) || lead.status === 'FEASIBILITY_SUBMITTED') &&
      (leadOwnerId(lead) === user.id || lead.pm_id === user.id || user.role_code === 'SYSTEM_ADMIN')
  );
  const feasibilityPending = assigned.filter((lead) =>
    ['ACCEPTED_FOR_FEASIBILITY', 'FEASIBILITY_IN_PROGRESS', 'FEASIBILITY_SUBMITTED', 'FEASIBILITY_RETURNED'].includes(
      lead.status
    )
  );
  const procurementPending = assigned.filter((lead) =>
    ['COSTING_IN_PROGRESS', 'COSTING_SUBMITTED', 'COSTING_RETURNED'].includes(lead.status)
  );
  const returnedToSales = leads.filter((lead) =>
    ['RETURNED_TO_SALES', 'ADDITIONAL_INFORMATION_REQUIRED'].includes(lead.status)
  );

  return {
    pendingPmReview: pendingReviews.length,
    feasibilityPending: feasibilityPending.length,
    procurementPending: procurementPending.length,
    returnedToSales: returnedToSales.length,
    pendingReviews: pendingReviews
      .slice()
      .sort((a, b) => compareLeadIdentity(a.lead_number, b.lead_number))
      .map((lead) => {
        const previous = previousFeasibilityReview(lead);
        const feasibilityQueue = lead.status === 'FEASIBILITY_SUBMITTED';
        return {
          id: lead.id,
          lead_number: lead.lead_number,
          customer_name: lead.customer_name,
          title: lead.title,
          business_vertical: lead.business_vertical,
          sales_owner: lead.sales_owner,
          sales_owner_id: lead.sales_owner_id,
          priority: lead.priority,
          lead_date: lead.lead_date,
          submitted_at: lead.submitted_at,
          status: lead.status,
          status_label: pendingReviewStatusLabel(lead),
          previous_review: previousReviewSummary(lead),
          previous_review_action: previous?.action,
          previous_review_reason: previous?.reason,
          previous_review_by: previous?.reviewed_by,
          previous_review_at: previous?.reviewed_at,
          current_owner_id: leadOwnerId(lead),
          current_owner_name: lead.current_owner_name || lead.responsible_user_name,
          href: feasibilityQueue ? `/pre-sales/leads/${lead.id}?tab=feasibility` : `/pre-sales/leads/${lead.id}`,
        };
      }),
    myWork: buildMyWork(user),
  };
}

export function assignSubmittedLeadToPm(lead: Lead, actor: User, reason: string): Lead {
  const pm = resolveProjectManagerForAssignment(lead, actor);
  if (!pm || pm.role_code !== 'PROJECT_MANAGER' || pm.status !== 'ACTIVE') {
    throw Object.assign(new Error('No active Project Manager is available to receive this lead.'), { status: 409 });
  }
  const transferred = transferLeadResponsibility(lead, pm, actor, reason);
  const saved = saveLead({
    ...transferred.lead,
    pm_id: pm.id,
    pm_name: pm.name,
    current_owner_id: pm.id,
    current_owner_name: pm.name,
    responsible_user_id: pm.id,
    responsible_user_name: pm.name,
    responsible_role_code: pm.role_code,
    pending_action: true,
  });
  const ownerId = leadOwnerId(saved);
  if (ownerId !== pm.id || saved.responsible_user_id !== pm.id) {
    throw Object.assign(new Error('Lead assignment did not persist consistently. Submission was rolled back.'), {
      status: 500,
    });
  }
  return hydrateLead(saved);
}

export function buildBusinessHeadDashboard(user: User) {
  const leads = store
    .getLeads()
    .map(hydrateLead)
    .filter((lead) => canOwnLead(user, lead) || user.role_code === 'SYSTEM_ADMIN');

  const closed = new Set(['CONVERTED', 'REJECTED', 'CANCELLED']);
  const active = leads.filter(
    (lead) => !closed.has(lead.pipeline_stage || '') && lead.status !== 'LOST' && lead.status !== 'ON_HOLD' && lead.status !== 'ORDER_CONVERTED'
  );
  const pipelineValue = active.reduce((sum, lead) => {
    if (typeof lead.expected_value === 'number' && Number.isFinite(lead.expected_value)) return sum + lead.expected_value;
    return sum + parseMoney(lead.estimated_opportunity_value);
  }, 0);

  const technicalReview = leads.filter((lead) =>
    ['ACCEPTED_FOR_FEASIBILITY', 'FEASIBILITY_IN_PROGRESS', 'FEASIBILITY_SUBMITTED', 'FEASIBILITY_RETURNED'].includes(lead.status)
  );
  const commercial = leads.filter((lead) => ['QUOTATION', 'NEGOTIATION'].includes(lead.status));
  const returned = leads.filter((lead) =>
    ['RETURNED_TO_SALES', 'ADDITIONAL_INFORMATION_REQUIRED'].includes(lead.status)
  );
  const drafts = leads.filter((lead) => lead.status === 'DRAFT');

  return {
    pipelineValue,
    activeOpportunities: active.length,
    technicalReview: technicalReview.length,
    commercialProposals: commercial.length,
    returned: returned.length,
    drafts: drafts.length,
    quotationReady: leads.filter((lead) => lead.status === 'QUOTATION').length,
    negotiations: leads.filter((lead) => lead.status === 'NEGOTIATION').length,
    leads: leads.slice().sort((a, b) => compareLeadIdentity(a.lead_number, b.lead_number)),
  };
}

export function addDocument(lead: Lead, user: User, body: Partial<LeadDocument> & { file_data?: string; mime_type?: string }): LeadDocument {
  const docs = store.getLeadDocuments();
  const existing = docs.find(
    (item) => item.lead_id === lead.id && item.file_name.toLowerCase() === String(body.file_name || '').toLowerCase()
  );
  if (existing) return existing;
  const doc: LeadDocument = {
    id: newId('doc'),
    lead_id: lead.id,
    file_name: body.file_name || 'Untitled document',
    file_type: body.file_type || 'Document',
    file_size: body.file_size || '—',
    uploaded_by: user.name,
    uploaded_by_id: user.id,
    upload_date: new Date().toISOString(),
    category: (body.category as LeadDocument['category']) || 'Other',
    file_url: body.file_url || body.file_data,
    mime_type: body.mime_type,
    upload_status: 'UPLOADED',
  };
  docs.unshift(doc);
  store.saveLeadDocuments(docs);
  audit(user, lead, 'DOCUMENT_ADDED', `${user.name} attached ${doc.file_name} to ${lead.lead_number}.`);
  notify({
    recipient_id: findPm()?.id || '',
    type: 'DOCUMENT_ADDED',
    title: `Document added: ${lead.lead_number}`,
    message: `${user.name} uploaded ${doc.file_name}.`,
    entity_type: 'LEAD',
    entity_id: lead.id,
  });
  return doc;
}

export function removeDocument(lead: Lead, user: User, documentId: string) {
  const docs = store.getLeadDocuments();
  const index = docs.findIndex((item) => item.id === documentId && item.lead_id === lead.id);
  if (index === -1) return null;
  const removed = docs[index];
  docs.splice(index, 1);
  store.saveLeadDocuments(docs);
  audit(user, lead, 'DOCUMENT_REMOVED', `${user.name} removed ${removed.file_name} from ${lead.lead_number}.`);
  return removed;
}

export function appendNegotiation(lead: Lead, user: User, body: Partial<NegotiationEntry>): Lead {
  const entry: NegotiationEntry = {
    id: newId('neg'),
    customer_feedback: body.customer_feedback || '',
    notes: body.notes || '',
    revised_value: body.revised_value != null ? Number(body.revised_value) : undefined,
    customer_requests: body.customer_requests || '',
    commercial_changes: body.commercial_changes || '',
    follow_up_date: body.follow_up_date,
    document_name: body.document_name,
    action: body.action || 'UPDATE',
    created_by: user.name,
    created_by_id: user.id,
    created_at: new Date().toISOString(),
  };
  const history = [...(lead.negotiation_history || [])];
  history.unshift(entry);
  const extra: Partial<Lead> = { negotiation_history: history };
  if (entry.revised_value && lead.quotation) {
    extra.quotation = { ...lead.quotation, revised_value: entry.revised_value };
    extra.expected_value = entry.revised_value;
    extra.estimated_opportunity_value = String(entry.revised_value);
  }
  const updated = saveLead({ ...lead, ...extra });
  audit(
    user,
    updated,
    entry.action === 'REVISED_QUOTATION' ? 'REVISED_QUOTATION_SENT' : 'NEGOTIATION_UPDATED',
    `${user.name} recorded a negotiation update on ${lead.lead_number}.`,
    { new_value: entry.revised_value != null ? String(entry.revised_value) : entry.notes }
  );
  return updated;
}

export function emptyQuotation(partial: Partial<QuotationRecord> = {}): QuotationRecord {
  const revision = partial.revision ?? 0;
  return {
    quotation_value: 0,
    commercial_terms: '',
    validity: '',
    payment_terms: '',
    delivery_terms: '',
    revision,
    revision_label: partial.revision_label || `R${revision}`,
    workflow_status: partial.workflow_status || 'PENDING_INTERNAL',
    ...partial,
  };
}

const ACTIVITY_CAPTIONS: Record<string, string> = {
  DRAFT: 'Lead created',
  SUBMITTED_TO_PM: 'Lead submitted to PM for review',
  UNDER_PM_REVIEW: 'PM started review',
  RETURNED_TO_SALES: 'Returned for clarification',
  ADDITIONAL_INFORMATION_REQUIRED: 'Returned for clarification',
  RESUBMITTED_TO_PM: 'Resubmitted to PM for review',
  ACCEPTED_FOR_FEASIBILITY: 'Submitted to feasibility team',
  FEASIBILITY_IN_PROGRESS: 'Submitted to feasibility team',
  FEASIBILITY_SUBMITTED: 'Feasibility submitted to PM for review',
  FEASIBILITY_RETURNED: 'Returned for clarification',
  FEASIBILITY_REJECTED: 'Feasibility rejected',
  COSTING_IN_PROGRESS: 'Sent to procurement / costing',
  COSTING_SUBMITTED: 'Costing submitted to PM for review',
  COSTING_RETURNED: 'Costing returned for revision',
  COSTING_REJECTED: 'Costing rejected',
  QUOTATION: 'Quotation prepared',
  NEGOTIATION: 'Quotation submitted to customer',
  ORDER_CONVERTED: 'Order converted',
  LOST: 'Lead lost',
  CANCELLED: 'Lead cancelled',
};

export type LeadWorkflowEvent = {
  id: string;
  at: string;
  lead_id: string;
  lead_number: string;
  customer_name: string;
  title: string;
  project_title?: string;
  actor: string;
  status: string;
  href: string;
};

export function buildLeadActivityFeed(user: User, limit = 120): LeadWorkflowEvent[] {
  const leads = store.getLeads().map(hydrateLead).filter((lead) => {
    if (['CEO', 'CTO', 'SYSTEM_ADMIN'].includes(user.role_code)) return true;
    return canOwnLead(user, lead);
  });
  const leadMap = new Map(leads.map((lead) => [lead.id, lead]));
  const events: LeadWorkflowEvent[] = [];

  for (const lead of leads) {
    events.push({
      id: `created-${lead.id}`,
      at: lead.created_at || lead.lead_date || lead.updated_at,
      lead_id: lead.id,
      lead_number: lead.lead_number,
      customer_name: lead.customer_name,
      title: 'Lead created',
      project_title: lead.title,
      actor: lead.created_by || lead.sales_owner,
      status: 'DRAFT',
      href: `/pre-sales/leads/${lead.id}`,
    });
  }

  for (const item of store.getLeadStatusHistory()) {
    const lead = leadMap.get(item.lead_id);
    if (!lead) continue;
    if (item.new_status === 'DRAFT' && item.old_status === 'DRAFT') continue;
    events.push({
      id: item.id,
      at: item.created_at,
      lead_id: lead.id,
      lead_number: lead.lead_number,
      customer_name: lead.customer_name,
      title: ACTIVITY_CAPTIONS[item.new_status] || item.new_status.replace(/_/g, ' '),
      project_title: lead.title,
      actor: item.changed_by,
      status: item.new_status,
      href: `/pre-sales/leads/${lead.id}`,
    });
  }

  events.sort((a, b) => b.at.localeCompare(a.at));
  const seen = new Set<string>();
  const unique: LeadWorkflowEvent[] = [];
  for (const event of events) {
    const key = `${event.lead_id}:${event.title}:${event.at.slice(0, 16)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(event);
    if (unique.length >= limit) break;
  }
  return unique;
}
