import { Router } from 'express';
import { AuthedRequest, requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../lib/rbac.js';
import { store } from '../store/db.js';
import {
  CostingRecord,
  FeasibilityStudy,
  Lead,
  LeadStatus,
  QuotationRecord,
  User,
} from '../types.js';
import {
  addDocument,
  appendNegotiation,
  assignSubmittedLeadToPm,
  assignTeamsToLead,
  assignedTeamRecipientIds,
  audit,
  buildMyWork,
  canDeleteLead,
  canEditProjectInput,
  canHandleLeadCommercial,
  canOwnLead,
  canPrepareCosting,
  canPrepareFeasibility,
  canPrepareQuotation,
  handLeadToBusinessHead,
  handLeadToProcurement,
  approveLeadForAssignment,
  reviewLeadTeamIntake,
  convertLeadToProject,
  costingTotal,
  emptyCosting,
  emptyFeasibility,
  emptyQuotation,
  appendFeasibilityReview,
  setFeasibilityAssignmentStatusForLead,
  findLead,
  findPm,
  hydrateLead,
  isProcurementUser,
  newId,
  parseMoney,
  deleteLead,
  removeDocument,
  saveLead,
  stageFromStatus,
  transitionLead,
} from '../lib/leadWorkflow.js';
import {
  assertLeadValidForSubmit,
  LeadValidationError,
  LeadWorkflowError,
  leadOwnerId,
  normalizeLeadDescriptionFields,
  PM_REVIEW_STATUSES,
  sanitizeLeadPatch,
  validateLeadPayload,
} from '../lib/leadValidation.js';
import { transact } from '../store/db.js';
import { documentNamesForLead, emitLeadWorkflow, emitLeadWorkflowAsync, emitWorkflowEvent } from '../lib/workflowEngine.js';
import { fileTypeError, isAllowedFileType, MAX_FILE_SIZE } from '../config/files.js';
import { canAccessEntity } from '../lib/documents.js';
import { notificationService } from '../lib/notificationService.js';
import { CAREYU_OFFICE_ADDRESS } from '../lib/company.js';
import { assignVisitTeam, updateVisitSchedule } from '../lib/customerVisit.js';
import { prepareWorkingQuotation, requestQuotationRevision, submitQuotationToCustomer } from '../lib/quotationCycle.js';
import {
  isCurrentResponsible,
  NOT_RESPONSIBLE_MESSAGE,
  resolveResponsibleUser,
  transferLeadResponsibility,
} from '../lib/responsibility.js';

const router = Router();

function paramId(req: AuthedRequest): string {
  const value = req.params.id;
  return Array.isArray(value) ? value[0] : value;
}

function payloadFor(lead: Lead) {
  const hydrated = hydrateLead(lead);
  return {
    lead: hydrated,
    documents: store.getLeadDocuments().filter((item) => item.lead_id === hydrated.id),
    additionalDocuments: store
      .getEntityDocuments()
      .filter((item) => item.entity_id === hydrated.id && (item.entity_type === 'ADDITIONAL_INPUT' || item.entity_type === 'LEAD'))
      .map((item) => {
        const { file_url: _ignored, ...rest } = item;
        return rest;
      }),
    comments: store.getLeadComments().filter((item) => item.lead_id === hydrated.id),
    activities: store.getLeadActivities().filter((item) => item.lead_id === hydrated.id),
    history: store.getLeadStatusHistory().filter((item) => item.lead_id === hydrated.id),
    assignments: store.getFeasibilityTeamAssignments().filter((item) => item.lead_id === hydrated.id),
    allocations: store.getFeasibilityEmployeeAllocations().filter((item) => item.lead_id === hydrated.id),
    teams: store.getTeams().filter((team) => team.status === 'ACTIVE'),
    users: store.getUsers().filter((user) => user.status === 'ACTIVE'),
    assignmentHistory: store
      .getAssignmentHistory()
      .filter((item) => item.entity_type === 'LEAD' && item.entity_id === hydrated.id),
    tasks: store.getTasks().filter((item) => item.lead_id === hydrated.id && item.task_type === 'LEAD_TASK'),
  };
}

function forbidden(
  res: import('express').Response,
  message = 'Forbidden. This action is not permitted for your role.'
) {
  return res.status(403).json({ message });
}

async function recordPmSubmissionNotification(lead: Lead, actor: User, pmId: string) {
  await emitLeadWorkflowAsync({
    event: 'PROJECT_SUBMITTED',
    lead,
    actor,
    recipientIds: [pmId],
    message: `${actor.name} submitted ${lead.lead_number} – ${lead.customer_name} for PM review.`,
    details: [
      ['Documents', documentNamesForLead(lead.id)],
      ['Submission date/time', lead.submitted_at || new Date().toISOString()],
    ],
  });
}

function notifyOrderConverted(actor: User, lead: Lead, project: { id: string; name: string; code: string; customer_name: string; pm_id?: string; team_lead_id?: string; team_ids?: string[] }) {
  const teamMembers = store
    .getUsers()
    .filter((item) => item.status === 'ACTIVE' && item.team_id && (project.team_ids || []).includes(item.team_id))
    .map((item) => item.id);
  emitLeadWorkflow({
    event: 'NEGOTIATION_COMPLETED',
    lead,
    actor,
    recipientIds: [project.pm_id],
    message: `${actor.name} completed negotiation for ${lead.lead_number}.`,
  });
  emitWorkflowEvent({
    event: 'ORDER_CONVERTED',
    actor,
    entityType: 'PROJECT',
    entityId: project.id,
    entityName: project.name,
    recipientIds: [project.pm_id, project.team_lead_id, ...teamMembers],
    customer: project.customer_name,
    status: 'Order Converted',
    message: `${actor.name} converted ${lead.lead_number} to ${project.code}. Execution can begin.`,
    actionUrl: `/projects/${project.id}`,
    eventKey: `ORDER_CONVERTED:${project.id}`,
  });
}

function workflowError(res: import('express').Response, error: unknown) {
  if (error instanceof LeadValidationError) {
    return res.status(400).json({ message: error.message, errors: error.errors, warnings: error.warnings });
  }
  if (error instanceof LeadWorkflowError) {
    return res.status(error.status).json({ message: error.message });
  }
  const err = error as Error & { status?: number };
  return res.status(err.status || 500).json({
    message: err.message || 'Unable to complete this lead action.',
  });
}

async function submitExistingLead(lead: Lead, user: User, body: Record<string, unknown> = {}): Promise<Lead> {
  if (PM_REVIEW_STATUSES.includes(lead.status)) {
    throw Object.assign(new Error('This lead has already been submitted to the Project Manager.'), { status: 409 });
  }
  const patched = sanitizeLeadPatch(body);
  const descriptionText =
    String(patched.detailed_requirement ?? '').trim() ||
    String(patched.project_description ?? '').trim() ||
    String(patched.requirement_summary ?? '').trim() ||
    String(lead.detailed_requirement ?? '').trim() ||
    String(lead.project_description ?? '').trim() ||
    String(lead.requirement_summary ?? '').trim();
  if (descriptionText) {
    patched.detailed_requirement = descriptionText;
    patched.project_description = descriptionText;
    if (!String(patched.requirement_summary ?? '').trim()) {
      patched.requirement_summary = descriptionText;
    }
  }
  const merged = { ...lead, ...patched } as unknown as Record<string, unknown>;
  const validation = assertLeadValidForSubmit(merged);
  const next: LeadStatus = ['RETURNED_TO_SALES', 'ADDITIONAL_INFORMATION_REQUIRED'].includes(lead.status)
    ? 'RESUBMITTED_TO_PM'
    : 'SUBMITTED_TO_PM';
  const now = new Date().toISOString();
  const withFields = saveLead({
    ...lead,
    ...patched,
    id: lead.id,
    lead_number: lead.lead_number,
    created_by: lead.created_by,
    created_by_id: lead.created_by_id,
    created_by_role: lead.created_by_role,
    status: lead.status,
    priority: validation.normalized.priority || lead.priority,
    expected_value: validation.normalized.expected_value ?? lead.expected_value,
    estimated_opportunity_value:
      validation.normalized.expected_value != null
        ? String(validation.normalized.expected_value)
        : lead.estimated_opportunity_value,
    visit_office_address: CAREYU_OFFICE_ADDRESS,
    visit_status:
      (body.visit_requirement || lead.visit_requirement || 'NONE') === 'NONE'
        ? 'NOT_REQUIRED'
        : lead.visit_assigned_user_ids?.length
          ? lead.visit_status
          : 'PENDING_PM_ASSIGNMENT',
  });
  const updated = transitionLead(withFields, next, user, 'Submitted to PM for review', {
    submitted_at: now,
    submitted_by: user.name,
    submitted_by_id: user.id,
    pm_return_reason: undefined,
  });
  const assigned = assignSubmittedLeadToPm(
    updated,
    user,
    next === 'RESUBMITTED_TO_PM' ? 'Lead resubmitted to Project Manager' : 'Lead submitted to Project Manager'
  );
  if (!PM_REVIEW_STATUSES.includes(assigned.status) || leadOwnerId(assigned) !== assigned.pm_id) {
    throw Object.assign(new Error('Lead owner and status did not stay consistent. Submission was rolled back.'), {
      status: 500,
    });
  }
  await recordPmSubmissionNotification(assigned, user, assigned.pm_id!);
  audit(user, assigned, next, `${user.name} submitted ${lead.lead_number} to PM.`);
  return assigned;
}

async function notifyPmAssignment(lead: Lead, user: User) {
  if (!lead.pm_id) return;
  try {
    await notificationService.notifyAssignment({
      entityType: 'LEAD',
      entityId: lead.id,
      entityName: `${lead.lead_number} – ${lead.customer_name}`,
      recipientUserId: lead.pm_id,
      assignedByUserId: user.id,
      priority: lead.priority,
      createdOn: lead.created_at,
      eventKey: `LEAD_ASSIGNED:${lead.id}:${lead.pm_id}:${lead.assigned_at}`,
    });
  } catch (error) {
    console.error('[leads] notification failed', error);
  }
}

function isPm(user: User) {
  return user.role_code === 'PROJECT_MANAGER' || user.role_code === 'SYSTEM_ADMIN';
}

function comment(
  lead: Lead,
  user: User,
  text: string,
  type: 'PM Review' | 'Information Request' | 'Sales Response' | 'Internal Comment' | 'General'
) {
  const comments = store.getLeadComments();
  comments.unshift({
    id: newId('comm'),
    lead_id: lead.id,
    author_id: user.id,
    author_name: user.name,
    author_role: user.role_name,
    comment: text,
    comment_type: type,
    created_at: new Date().toISOString(),
  });
  store.saveLeadComments(comments);
}

router.get('/', requireAuth, requirePermission('view:leads', 'create:lead'), (req: AuthedRequest, res) => {
  const user = req.user!;
  const allAssignments = store.getFeasibilityTeamAssignments();
  const leads = store.getLeads().map(hydrateLead).filter((lead) => {
    if (['CEO', 'CTO', 'SYSTEM_ADMIN'].includes(user.role_code)) return true;
    return canOwnLead(user, lead);
  });
  const leadIds = new Set(leads.map((lead) => lead.id));
  res.json({
    leads,
    assignments: allAssignments.filter(
      (item) =>
        leadIds.has(item.lead_id) ||
        item.team_lead_id === user.id ||
        Boolean(user.team_id && item.team_id === user.team_id)
    ),
  });
});

router.get(
  '/my-work',
  requireAuth,
  requirePermission('view:leads', 'create:lead', 'create:feasibility', 'create:costing'),
  (req: AuthedRequest, res) => {
    res.json(buildMyWork(req.user!));
  }
);

router.get('/:id', requireAuth, requirePermission('view:leads', 'create:lead', 'create:feasibility', 'create:costing'), (req: AuthedRequest, res) => {
  const lead = findLead(paramId(req));
  if (!lead) return res.status(404).json({ message: 'Lead not found.' });
  const user = req.user!;
  const hydrated = hydrateLead(lead);
  if (!canOwnLead(user, hydrated) && user.role_code !== 'CEO' && user.role_code !== 'CTO') {
    if (!isProcurementUser(user)) return forbidden(res);
  }
  return res.json(payloadFor(lead));
});

router.post('/', requireAuth, requirePermission('create:lead'), async (req: AuthedRequest, res) => {
  const user = req.user!;
  if (!['BUSINESS_HEAD', 'ENG_DIRECTOR', 'SYSTEM_ADMIN'].includes(user.role_code)) {
    return forbidden(res, 'Only Business Head and Engineering Director can create leads.');
  }
  const body = req.body ?? {};
  if (body.status && body.status !== 'DRAFT' && body.status !== 'SUBMITTED_TO_PM') {
    return res.status(403).json({ message: 'Status cannot be set directly. Use the workflow actions.' });
  }
  const wantsSubmit = body.status === 'SUBMITTED_TO_PM';
  const descriptionFields = normalizeLeadDescriptionFields(body);
  const normalizedBody = { ...body, ...descriptionFields };
  const validation = validateLeadPayload(normalizedBody, { submit: wantsSubmit });
  if (validation.errors.length) {
    return res.status(400).json({ message: validation.errors[0].message, errors: validation.errors, warnings: validation.warnings });
  }
  const status: LeadStatus = 'DRAFT';
  const expectedValue = validation.normalized.expected_value ?? parseMoney(body.expected_value ?? body.estimated_opportunity_value);
  const now = new Date().toISOString();
  const leads = store.getLeads();
  const nextNumber = `LD-${String(leads.length + 1).padStart(3, '0')}`;

  const lead: Lead = {
    id: body.id && String(body.id).startsWith('lead-') ? body.id : newId('lead'),
    lead_number: body.lead_number || nextNumber,
    title: body.title || '',
    customer_name: body.customer_name || '',
    customer_type: body.customer_type || 'Other',
    business_vertical:
      body.business_vertical || (user.role_code === 'ENG_DIRECTOR' ? 'Engineering Director' : 'Business Head'),
    created_by: user.name,
    created_by_id: user.id,
    created_by_role: user.role_name,
    sales_owner: body.sales_owner || user.name,
    sales_owner_id: body.sales_owner_id || user.id,
    lead_date: now,
    expected_decision_date: body.expected_decision_date,
    priority: validation.normalized.priority || body.priority || 'Medium',
    status,
    customer_contact: body.customer_contact || '',
    customer_designation: body.customer_designation,
    customer_email: body.customer_email,
    customer_phone: body.customer_phone,
    customer_location: body.customer_location,
    plant_location: body.plant_location,
    requirement_summary: descriptionFields.requirement_summary,
    detailed_requirement: descriptionFields.detailed_requirement,
    application: body.application || '',
    industry_process: body.industry_process,
    current_process: body.current_process,
    expected_automation: body.expected_automation,
    customer_objective: body.customer_objective,
    expected_project_timeline: body.expected_project_timeline,
    customer_target_date: body.customer_target_date,
    production_quantity: body.production_quantity,
    production_rate: body.production_rate,
    cycle_time: body.cycle_time,
    shift_pattern: body.shift_pattern,
    operating_hours: body.operating_hours,
    existing_equipment: body.existing_equipment,
    existing_automation: body.existing_automation,
    integration_requirements: body.integration_requirements,
    technical_requirements: body.technical_requirements,
    machine_dimensions: body.machine_dimensions,
    payload: body.payload,
    accuracy_requirement: body.accuracy_requirement,
    environment_conditions: body.environment_conditions,
    technical_specifications: body.technical_specifications,
    technical_assumptions: body.technical_assumptions,
    customer_dependencies: body.customer_dependencies,
    customer_budget: body.customer_budget,
    estimated_opportunity_value: body.estimated_opportunity_value,
    expected_value: expectedValue,
    pipeline_stage: stageFromStatus(status),
    currency: body.currency || 'INR',
    expected_po_date: body.expected_po_date,
    commercial_remarks: body.commercial_remarks,
    additional_notes: body.additional_notes,
    required_documents: body.required_documents,
    competitor_information: body.competitor_information,
    customer_challenge: body.customer_challenge,
    required_solution: body.required_solution,
    project_description: descriptionFields.project_description,
    custom_fields: Array.isArray(body.custom_fields) ? body.custom_fields : [],
    visit_requirement: body.visit_requirement || 'NONE',
    visit_status: body.visit_requirement && body.visit_requirement !== 'NONE' ? 'PENDING_PM_ASSIGNMENT' : 'NOT_REQUIRED',
    visit_site_name: body.visit_site_name,
    visit_site_address: body.visit_site_address,
    visit_city: body.visit_city,
    visit_state: body.visit_state,
    visit_country: body.visit_country,
    visit_contact_name: body.visit_contact_name,
    visit_contact_phone: body.visit_contact_phone,
    visit_contact_email: body.visit_contact_email,
    visit_preferred_date: body.visit_preferred_date,
    visit_preferred_time: body.visit_preferred_time,
    visit_remarks: body.visit_remarks,
    visit_visitor_name: body.visit_visitor_name,
    visit_visitor_designation: body.visit_visitor_designation,
    visit_visitor_count: body.visit_visitor_count,
    visit_purpose: body.visit_purpose,
    visit_special_requirements: body.visit_special_requirements,
    visit_office_address: CAREYU_OFFICE_ADDRESS,
    created_at: now,
    updated_at: now,
    submitted_at: undefined,
    submitted_by: undefined,
    submitted_by_id: undefined,
    current_owner_id: user.id,
    current_owner_name: user.name,
    responsible_user_id: user.id,
    responsible_user_name: user.name,
    responsible_role_code: user.role_code,
  };

  try {
    const created = await transact(async () => {
      const current = store.getLeads();
      current.unshift(lead);
      store.saveLeads(current);
      audit(user, lead, 'LEAD_CREATED', `${user.name} created lead ${lead.lead_number}`);
      if (!wantsSubmit) return lead;
      return await submitExistingLead(lead, user, body);
    });
    return res.status(201).json(payloadFor(created));
  } catch (error) {
    return workflowError(res, error);
  }
});

router.delete('/:id', requireAuth, requirePermission('edit:lead', 'create:lead'), (req: AuthedRequest, res) => {
  const user = req.user!;
  const lead = findLead(paramId(req));
  if (!lead) return res.status(404).json({ message: 'Lead not found.' });
  if (!canDeleteLead(user, lead)) {
    return forbidden(res, 'You do not have permission to delete this lead.');
  }
  try {
    transact(() => deleteLead(lead, user));
    return res.json({ ok: true, lead_number: lead.lead_number });
  } catch (error) {
    return workflowError(res, error);
  }
});

router.patch('/:id', requireAuth, requirePermission('edit:lead', 'create:lead'), (req: AuthedRequest, res) => {
  const user = req.user!;
  const lead = findLead(paramId(req));
  if (!lead) return res.status(404).json({ message: 'Lead not found.' });
  if (!canEditProjectInput(user, lead)) return forbidden(res, 'Only draft or returned leads can be edited by the owner.');
  const body = sanitizeLeadPatch((req.body ?? {}) as Record<string, unknown>);
  const descriptionFields = normalizeLeadDescriptionFields(body, lead);
  const mergedBody = { ...body, ...descriptionFields };
  const validation = validateLeadPayload({ ...lead, ...mergedBody } as Record<string, unknown>, { submit: false });
  if (validation.errors.length) {
    return res.status(400).json({ message: validation.errors[0].message, errors: validation.errors, warnings: validation.warnings });
  }
  const expectedValue =
    validation.normalized.expected_value ??
    (body.expected_value != null || body.estimated_opportunity_value != null
      ? parseMoney(body.expected_value ?? body.estimated_opportunity_value)
      : lead.expected_value);
  const updated = saveLead({
    ...lead,
    ...mergedBody,
    id: lead.id,
    lead_number: lead.lead_number,
    created_by: lead.created_by,
    created_by_id: lead.created_by_id,
    created_by_role: lead.created_by_role,
    status: lead.status,
    pipeline_stage: lead.pipeline_stage,
    priority: validation.normalized.priority || lead.priority,
    expected_value: expectedValue,
  });
  audit(user, updated, 'LEAD_DRAFT_UPDATED', `${user.name} updated draft ${updated.lead_number}.`);
  return res.json(payloadFor(updated));
});

router.post('/:id/submit', requireAuth, requirePermission('create:lead', 'edit:lead'), async (req: AuthedRequest, res) => {
  const user = req.user!;
  const lead = findLead(paramId(req));
  if (!lead) return res.status(404).json({ message: 'Lead not found.' });
  if (PM_REVIEW_STATUSES.includes(lead.status)) {
    return res.status(409).json({ message: 'This lead has already been submitted to the Project Manager.' });
  }
  if (!canEditProjectInput(user, lead)) return forbidden(res);
  try {
    const assigned = await transact(async () =>
      submitExistingLead(lead, user, (req.body ?? {}) as Record<string, unknown>)
    );
    return res.json(payloadFor(assigned));
  } catch (error) {
    return workflowError(res, error);
  }
});

router.post('/:id/accept', requireAuth, async (req: AuthedRequest, res) => {
  const user = req.user!;
  const lead = findLead(paramId(req));
  if (!lead) return res.status(404).json({ message: 'Lead not found.' });
  if (!isPm(user) && user.role_code !== 'SYSTEM_ADMIN') return forbidden(res);
  if (!isCurrentResponsible(user, lead) && user.role_code !== 'SYSTEM_ADMIN') {
    const ownerId = leadOwnerId(lead);
    const fallbackOwner = resolveResponsibleUser({ lead, roleCode: 'PROJECT_MANAGER' });
    if (ownerId && ownerId !== user.id) {
      return forbidden(res, NOT_RESPONSIBLE_MESSAGE);
    }
    if (!lead.responsible_user_id && fallbackOwner?.id === user.id) {
      // legacy leads without responsible_user_id
    } else if (ownerId && ownerId !== user.id) {
      return forbidden(res, NOT_RESPONSIBLE_MESSAGE);
    }
  }
  if (!PM_REVIEW_STATUSES.includes(lead.status) && lead.status !== 'ACCEPTED_FOR_FEASIBILITY') {
    return res.status(400).json({ message: 'This lead is not awaiting acceptance.' });
  }
  const teamIds = [
    ...((Array.isArray(req.body?.team_ids) ? req.body.team_ids : []) as unknown[]).map((id) => String(id || '').trim()),
    String(req.body?.team_id || '').trim(),
  ].filter(Boolean);
  if (!teamIds.length) {
    return res.status(400).json({
      message: 'Select at least one functional team to accept this lead and start feasibility.',
    });
  }
  const assignees = (req.body?.assignees && typeof req.body.assignees === 'object' ? req.body.assignees : {}) as Record<string, string>;
  if (req.body?.team_lead_id && req.body?.team_id) {
    assignees[String(req.body.team_id)] = String(req.body.team_lead_id);
  }
  try {
    const result = assignTeamsToLead(lead, user, teamIds, assignees, req.body?.notes);
    comment(result.lead, user, req.body?.notes || 'Accepted and assigned to team.', 'PM Review');
    audit(
      user,
      result.lead,
      'LEAD_ACCEPTED',
      `${user.name} accepted ${lead.lead_number} and assigned ${result.lead.assigned_team_name}.`
    );
    emitLeadWorkflow({
      event: 'PROJECT_ASSIGNED',
      lead: result.lead,
      actor: user,
      comments: req.body?.notes,
      extraRecipientIds: assignedTeamRecipientIds(result.lead),
      message: `${user.name} accepted "${lead.title}" and assigned ${result.lead.assigned_team_name}.`,
    });
    return res.json({ ...payloadFor(result.lead), assignments: result.assignments, assignment: result.assignments[0] });
  } catch (error) {
    return workflowError(res, error);
  }
});

router.post('/:id/cancel', requireAuth, requirePermission('review:lead', 'assign:lead'), async (req: AuthedRequest, res) => {
  const user = req.user!;
  const lead = findLead(paramId(req));
  if (!lead) return res.status(404).json({ message: 'Lead not found.' });
  if (!isPm(user)) return forbidden(res);
  if (user.role_code !== 'SYSTEM_ADMIN' && leadOwnerId(lead) !== user.id && lead.pm_id !== user.id) {
    return forbidden(res, NOT_RESPONSIBLE_MESSAGE);
  }
  if (!PM_REVIEW_STATUSES.includes(lead.status) && lead.status !== 'ACCEPTED_FOR_FEASIBILITY') {
    return res.status(400).json({ message: 'This lead cannot be cancelled in its current status.' });
  }
  const reason = String(req.body?.reason || '').trim();
  if (!reason) return res.status(400).json({ message: 'A rejection reason is required.' });
  try {
    const now = new Date().toISOString();
    const updated = transitionLead(lead, 'CANCELLED', user, reason, {
      cancel_reason: reason,
      cancelled_at: now,
      cancelled_by_id: user.id,
      cancelled_by_name: user.name,
      pending_action: false,
      last_action_at: now,
    });
    comment(updated, user, reason, 'PM Review');
    audit(user, updated, 'LEAD_CANCELLED', `${user.name} cancelled ${lead.lead_number}: ${reason}`);
    emitLeadWorkflow({
      event: 'PROJECT_CANCELLED',
      lead: updated,
      actor: user,
      comments: reason,
      message: `${user.name} cancelled "${lead.title}". Reason: ${reason}`,
      extraRecipientIds: [lead.assigned_team_lead_id, lead.pm_id],
    });
    return res.json(payloadFor(updated));
  } catch (error) {
    return workflowError(res, error);
  }
});

router.post('/:id/forward', requireAuth, async (req: AuthedRequest, res) => {
  const user = req.user!;
  const lead = findLead(paramId(req));
  if (!lead) return res.status(404).json({ message: 'Lead not found.' });
  if (!isCurrentResponsible(user, lead)) {
    return forbidden(res, NOT_RESPONSIBLE_MESSAGE);
  }
  const targetId = String(req.body?.responsible_user_id || req.body?.user_id || '').trim();
  const target = store.findUserById(targetId);
  if (!target || target.status !== 'ACTIVE') {
    return res.status(400).json({ message: 'Select an active employee as the next responsible person.' });
  }
  if (target.id === lead.responsible_user_id) {
    return res.status(409).json({ message: 'That employee is already the current responsible person.' });
  }
  const reason = String(req.body?.reason || '').trim() || undefined;
  const transferred = transferLeadResponsibility(lead, target, user, reason);
  const saved = saveLead(transferred.lead);
  try {
    await notificationService.notifyForward({
      entityType: 'LEAD',
      entityId: saved.id,
      entityName: saved.title,
      recipientUserId: target.id,
      assignedByUserId: user.id,
      previousUserId: transferred.previous?.id,
      reason,
      eventKey: `LEAD_FORWARDED:${saved.id}:${target.id}:${saved.assigned_at}`,
    });
  } catch (error) {
    console.error('[leads] forward notification failed', error);
  }
  audit(
    user,
    saved,
    'LEAD_FORWARDED',
    `${user.name} forwarded ${saved.lead_number} to ${target.name}${reason ? `: ${reason}` : '.'}`
  );
  return res.json(payloadFor(saved));
});

router.post('/:id/pm-review', requireAuth, requirePermission('review:lead', 'assign:lead'), async (req: AuthedRequest, res) => {
  const user = req.user!;
  if (!isPm(user)) return forbidden(res);
  const lead = findLead(paramId(req));
  if (!lead) return res.status(404).json({ message: 'Lead not found.' });
  if (user.role_code !== 'SYSTEM_ADMIN' && leadOwnerId(lead) !== user.id && lead.pm_id !== user.id) {
    return forbidden(res, NOT_RESPONSIBLE_MESSAGE);
  }
  if (!['SUBMITTED_TO_PM', 'UNDER_PM_REVIEW', 'RESUBMITTED_TO_PM', 'ACCEPTED_FOR_FEASIBILITY'].includes(lead.status)) {
    return res.status(400).json({ message: 'This lead is not awaiting PM review.' });
  }
  const action = req.body?.action as string;
  if (action === 'return') {
    const reason = String(req.body?.reason || '').trim();
    if (!reason) return res.status(400).json({ message: 'A return reason is required.' });
    try {
      const creator = store.findUserById(lead.created_by_id);
      let updated = transitionLead(lead, 'RETURNED_TO_SALES', user, reason, {
        pm_return_reason: reason,
        pm_review_notes: req.body?.notes,
      });
      if (creator) {
        const transferred = transferLeadResponsibility(updated, creator, user, reason);
        updated = saveLead({ ...transferred.lead, pending_action: true });
        try {
          await notificationService.notifyAssignment({
            entityType: 'LEAD',
            entityId: updated.id,
            entityName: updated.title,
            recipientUserId: creator.id,
            assignedByUserId: user.id,
            priority: updated.priority,
            createdOn: updated.created_at,
            eventKey: `LEAD_RETURNED:${updated.id}:${creator.id}:${updated.assigned_at}`,
          });
        } catch (error) {
          console.error('[leads] return notification failed', error);
        }
      }
      comment(updated, user, reason, 'Information Request');
      audit(user, updated, 'LEAD_RETURNED_TO_SALES', `${user.name} returned ${lead.lead_number}: ${reason}`);
      emitLeadWorkflow({
        event: 'PROJECT_SENT_BACK',
        lead: updated,
        actor: user,
        comments: reason,
        message: `${user.name} sent "${lead.title}" back for correction.`,
      });
      return res.json(payloadFor(updated));
    } catch (error) {
      return workflowError(res, error);
    }
  }

  if (action === 'approve') {
    const updated = approveLeadForAssignment(lead, user, req.body?.notes);
    comment(updated, user, req.body?.notes || 'PM review completed — ready for assignment.', 'PM Review');
    audit(user, updated, 'LEAD_APPROVED', `${user.name} approved ${lead.lead_number} for assignment.`);
    emitLeadWorkflow({
      event: 'PROJECT_APPROVED',
      lead: updated,
      actor: user,
      comments: req.body?.notes,
      message: `${user.name} approved "${lead.title}". Ready for team assignment.`,
    });
    return res.json(payloadFor(updated));
  }

  if (action !== 'approve_assign') {
    return res.status(400).json({ message: 'Action must be approve, approve_assign, or return.' });
  }
  const teamIds = [
    ...((Array.isArray(req.body?.team_ids) ? req.body.team_ids : []) as unknown[]).map((id) => String(id || '').trim()),
    String(req.body?.team_id || '').trim(),
  ].filter(Boolean);
  if (!teamIds.length) return res.status(400).json({ message: 'Select at least one functional team from Organization Management.' });
  const assignees = (req.body?.assignees && typeof req.body.assignees === 'object' ? req.body.assignees : {}) as Record<string, string>;
  if (req.body?.team_lead_id && req.body?.team_id) {
    assignees[String(req.body.team_id)] = String(req.body.team_lead_id);
  }
  try {
    const result = assignTeamsToLead(lead, user, teamIds, assignees, req.body?.notes);
    comment(result.lead, user, req.body?.notes || 'Approved and assigned to team.', 'PM Review');
    audit(
      user,
      result.lead,
      'LEAD_ASSIGNED_TO_TEAM',
      `${user.name} assigned ${lead.lead_number} to ${(result.lead.assigned_team_names || [result.lead.assigned_team_name]).filter(Boolean).join(', ')}.`
    );
    emitLeadWorkflow({
      event: 'PROJECT_ASSIGNED',
      lead: result.lead,
      actor: user,
      comments: req.body?.notes,
      extraRecipientIds: assignedTeamRecipientIds(result.lead),
      message: `${user.name} assigned "${lead.title}" to ${(result.lead.assigned_team_names || [result.lead.assigned_team_name]).filter(Boolean).join(', ')}.`,
    });
    return res.json({ ...payloadFor(result.lead), assignments: result.assignments, assignment: result.assignments[0] });
  } catch (error) {
    const err = error as Error & { status?: number };
    return res.status(err.status || 400).json({ message: err.message });
  }
});

router.post('/:id/assign', requireAuth, requirePermission('assign:lead'), async (req: AuthedRequest, res) => {
  const user = req.user!;
  if (!isPm(user)) return forbidden(res);
  const lead = findLead(paramId(req));
  if (!lead) return res.status(404).json({ message: 'Lead not found.' });
  const teamIds = [
    ...((Array.isArray(req.body?.team_ids) ? req.body.team_ids : []) as unknown[]).map((id) => String(id || '').trim()),
    String(req.body?.team_id || req.body?.assigned_to || '').trim(),
  ].filter(Boolean);
  if (!teamIds.length) return res.status(400).json({ message: 'Select at least one functional team from Organization Management.' });
  const assignees = (req.body?.assignees && typeof req.body.assignees === 'object' ? req.body.assignees : {}) as Record<string, string>;
  if (req.body?.team_lead_id && (req.body?.team_id || req.body?.assigned_to)) {
    assignees[String(req.body.team_id || req.body.assigned_to)] = String(req.body.team_lead_id);
  }
  try {
    const result = assignTeamsToLead(
      lead,
      user,
      teamIds,
      assignees,
      req.body?.notes || req.body?.pm_instructions
    );
    emitLeadWorkflow({
      event: 'PROJECT_ASSIGNED',
      lead: result.lead,
      actor: user,
      comments: req.body?.notes || req.body?.pm_instructions,
      extraRecipientIds: assignedTeamRecipientIds(result.lead),
      message: `${user.name} assigned "${lead.title}" to ${(result.lead.assigned_team_names || [result.lead.assigned_team_name]).filter(Boolean).join(', ')}.`,
    });
    return res.json({ ...payloadFor(result.lead), assignments: result.assignments, assignment: result.assignments[0] });
  } catch (error) {
    const err = error as Error & { status?: number };
    return res.status(err.status || 400).json({ message: err.message });
  }
});

router.post('/:id/team-intake', requireAuth, async (req: AuthedRequest, res) => {
  const user = req.user!;
  const lead = findLead(paramId(req));
  if (!lead) return res.status(404).json({ message: 'Lead not found.' });
  const action = String(req.body?.action || '').toLowerCase() === 'return' ? 'return' : 'accept';
  try {
    const updated = reviewLeadTeamIntake(lead, user, action, req.body?.comments);
    comment(
      updated,
      user,
      req.body?.comments || (action === 'accept' ? 'Team Lead accepted the project.' : 'Returned to PM'),
      'PM Review'
    );
    audit(
      user,
      updated,
      action === 'accept' ? 'PROJECT_ACCEPTED' : 'PROJECT_RETURNED_TO_PM',
      action === 'accept'
        ? `${user.name} accepted ${lead.lead_number}.`
        : `${user.name} returned ${lead.lead_number} to PM.`
    );
    emitLeadWorkflow({
      event: action === 'accept' ? 'PROJECT_ACCEPTED' : 'PROJECT_RETURNED_TO_PM',
      lead: updated,
      actor: user,
      comments: req.body?.comments,
      actionUrl: `/pre-sales/leads/${updated.id}`,
      message:
        action === 'accept'
          ? `${user.name} accepted "${lead.title}" and will start feasibility.`
          : `${user.name} returned "${lead.title}" to the Project Manager.`,
    });
    return res.json(payloadFor(updated));
  } catch (error) {
    return workflowError(res, error);
  }
});

router.post('/:id/feasibility', requireAuth, requirePermission('create:feasibility', 'view:leads'), (req: AuthedRequest, res) => {
  const user = req.user!;
  const lead = findLead(paramId(req));
  if (!lead) return res.status(404).json({ message: 'Lead not found.' });
  if (!canPrepareFeasibility(user, lead) && !isPm(user)) return forbidden(res, 'Only the assigned team can update feasibility.');
  const submit = Boolean(req.body?.submit);
  const start = Boolean(req.body?.start);
  const current = lead.feasibility_study || emptyFeasibility();
  if (current.status === 'APPROVED' && !isPm(user)) {
    return forbidden(res, 'Approved feasibility is read-only.');
  }
  const now = new Date().toISOString();
  const study: FeasibilityStudy = emptyFeasibility({
    ...current,
    ...req.body?.study,
    documents: req.body?.study?.documents || current.documents || [],
    status: submit ? 'SUBMITTED' : current.status === 'RETURNED' ? 'RETURNED' : 'DRAFT',
    submitted_by: submit ? user.name : current.submitted_by,
    submitted_by_id: submit ? user.id : current.submitted_by_id,
    submitted_at: submit ? now : current.submitted_at,
    started_at: start || submit ? current.started_at || now : current.started_at,
    started_by: start || submit ? current.started_by || user.name : current.started_by,
    started_by_id: start || submit ? current.started_by_id || user.id : current.started_by_id,
    review_history: current.review_history,
  });
  const nextStatus: LeadStatus = submit
    ? 'FEASIBILITY_SUBMITTED'
    : lead.status === 'FEASIBILITY_RETURNED'
      ? 'FEASIBILITY_RETURNED'
      : 'FEASIBILITY_IN_PROGRESS';
  let updated = transitionLead(lead, nextStatus, user, submit ? 'Feasibility submitted to PM' : 'Feasibility draft saved', {
    feasibility_study: study,
  });
  if (submit) {
    const pm = findPm(updated) || (updated.pm_id ? store.findUserById(updated.pm_id) : undefined);
    if (pm && pm.role_code === 'PROJECT_MANAGER') {
      const transferred = transferLeadResponsibility(updated, pm, user, 'Feasibility submitted to Project Manager');
      updated = saveLead({
        ...transferred.lead,
        current_owner_id: pm.id,
        current_owner_name: pm.name,
        pending_action: true,
      });
    }
    emitLeadWorkflow({
      event: 'FEASIBILITY_SUBMITTED',
      lead: updated,
      actor: user,
      comments: study.team_remarks,
      details: [
        ['Submitted by', user.name],
        ['Completion date', study.submitted_at || ''],
        ['Feasibility report', study.proposed_solution || study.technical_feasibility || ''],
        ['Documents', (study.documents || []).join(', ')],
      ],
    });
    audit(user, updated, 'FEASIBILITY_SUBMITTED', `${user.name} submitted feasibility for ${lead.lead_number}.`);
    setFeasibilityAssignmentStatusForLead(lead.id, 'SUBMITTED_TO_PM');
  } else {
    audit(user, updated, 'FEASIBILITY_SAVED', `${user.name} saved feasibility for ${lead.lead_number}.`);
    if (nextStatus === 'FEASIBILITY_IN_PROGRESS' && (start || lead.status !== 'FEASIBILITY_IN_PROGRESS' || !current.started_at)) {
      emitLeadWorkflow({
        event: 'FEASIBILITY_STARTED',
        lead: updated,
        actor: user,
        message: `${user.name} started feasibility for ${updated.lead_number}.`,
      });
    }
  }
  return res.json(payloadFor(updated));
});

router.post(
  '/:id/feasibility/review',
  requireAuth,
  requirePermission('review:lead', 'approve:feasibility'),
  (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!isPm(user)) return forbidden(res);
    const lead = findLead(paramId(req));
    if (!lead) return res.status(404).json({ message: 'Lead not found.' });
    if (lead.status !== 'FEASIBILITY_SUBMITTED') {
      return res.status(400).json({ message: 'Feasibility is not awaiting PM approval.' });
    }
    const actionRaw = String(req.body?.action || '').toLowerCase();
    const action = actionRaw === 'accept' ? 'approve' : actionRaw;
    if (action === 'return' || action === 'reject') {
      const reason = String(req.body?.reason || '').trim();
      if (!reason) return res.status(400).json({ message: 'A reason is required.' });
      const rejected = action === 'reject';
      const reviewAction = rejected ? 'REJECT' : 'SEND_BACK';
      const study = appendFeasibilityReview(
        emptyFeasibility({
          ...(lead.feasibility_study || {}),
          status: rejected ? 'REJECTED' : 'RETURNED',
          pm_return_reason: reason,
        }),
        user,
        reviewAction,
        reason
      );
      const updated = transitionLead(lead, rejected ? 'FEASIBILITY_REJECTED' : 'FEASIBILITY_RETURNED', user, reason, {
        feasibility_study: study,
        feasibility_return_reason: reason,
        pending_action: !rejected,
      });
      const owner =
        store.findUserById(lead.assigned_member_id || '') ||
        store.findUserById(lead.assigned_team_lead_id || '');
      let next = updated;
      if (!rejected && owner) {
        const transferred = transferLeadResponsibility(updated, owner, user, reason);
        next = saveLead({ ...transferred.lead, pending_action: true });
      }
      setFeasibilityAssignmentStatusForLead(lead.id, rejected ? 'CANCELLED' : 'CHANGE_SUGGESTED');
      const allocations = store.getFeasibilityEmployeeAllocations().filter((item) => item.lead_id === lead.id);
      emitLeadWorkflow({
        event: rejected ? 'FEASIBILITY_REJECTED' : 'FEASIBILITY_SENT_BACK',
        lead: next,
        actor: user,
        comments: reason,
        extraRecipientIds: allocations.map((item) => item.employee_id),
        message: rejected
          ? `${user.name} rejected feasibility for "${lead.title}". Reason: ${reason}`
          : 'Feasibility requires correction. Please review the PM comments and resubmit.',
      });
      audit(user, next, rejected ? 'FEASIBILITY_REJECTED' : 'FEASIBILITY_RETURNED', `${user.name} ${rejected ? 'rejected' : 'returned'} feasibility for ${lead.lead_number}.`);
      return res.json(payloadFor(next));
    }
    if (action !== 'approve') {
      return res.status(400).json({ message: 'Action must be accept, reject, or send back.' });
    }
    const study = appendFeasibilityReview(
      emptyFeasibility({
        ...(lead.feasibility_study || {}),
        status: 'APPROVED',
        pm_approved_by: user.name,
        pm_approved_at: new Date().toISOString(),
      }),
      user,
      'ACCEPT'
    );
    const updated = transitionLead(lead, 'COSTING_IN_PROGRESS', user, 'Feasibility accepted', { feasibility_study: study });
    const handed = handLeadToProcurement(updated, user, 'Feasibility accepted — procurement pending');
    setFeasibilityAssignmentStatusForLead(lead.id, 'COMPLETED');
    emitLeadWorkflow({
      event: 'FEASIBILITY_APPROVED',
      lead: handed,
      actor: user,
      message: `Feasibility accepted for "${lead.title}". Start vendor identification, costing, and procurement documentation.`,
    });
    audit(user, handed, 'FEASIBILITY_APPROVED', `${user.name} accepted feasibility for ${lead.lead_number}.`);
    return res.json(payloadFor(handed));
  }
);

router.post('/:id/costing', requireAuth, requirePermission('create:costing', 'view:leads'), (req: AuthedRequest, res) => {
  const user = req.user!;
  const lead = findLead(paramId(req));
  if (!lead) return res.status(404).json({ message: 'Lead not found.' });
  if (!canPrepareCosting(user, lead) && !isPm(user)) return forbidden(res, 'Only Procurement / Costing can update costing.');
  const current = lead.costing || emptyCosting();
  if (current.status === 'APPROVED' && !isPm(user)) {
    return forbidden(res, 'Approved costing is read-only.');
  }
  const submit = Boolean(req.body?.submit);
  const incoming = { ...current, ...(req.body?.costing || {}) } as CostingRecord;
  const record = emptyCosting({
    ...incoming,
    component_costs: parseMoney(incoming.component_costs),
    procurement_costs: parseMoney(incoming.procurement_costs),
    engineering_costs: parseMoney(incoming.engineering_costs),
    software_costs: parseMoney(incoming.software_costs),
    installation_costs: parseMoney(incoming.installation_costs),
    other_costs: parseMoney(incoming.other_costs),
    status: submit ? 'SUBMITTED' : 'DRAFT',
    submitted_by: submit ? user.name : current.submitted_by,
    submitted_by_id: submit ? user.id : current.submitted_by_id,
    submitted_at: submit ? new Date().toISOString() : current.submitted_at,
  });
  record.total_estimated_cost = costingTotal(record);
  const nextStatus: LeadStatus = submit
    ? 'COSTING_SUBMITTED'
    : lead.status === 'COSTING_RETURNED'
      ? 'COSTING_RETURNED'
      : 'COSTING_IN_PROGRESS';
  let updated = transitionLead(lead, nextStatus, user, submit ? 'Costing submitted to PM' : 'Costing draft saved', {
    costing: record,
  });
  if (submit) {
    const pm = findPm(updated) || (updated.pm_id ? store.findUserById(updated.pm_id) : undefined);
    if (pm && pm.role_code === 'PROJECT_MANAGER') {
      const transferred = transferLeadResponsibility(updated, pm, user, 'Costing submitted to Project Manager');
      updated = saveLead({
        ...transferred.lead,
        current_owner_id: pm.id,
        current_owner_name: pm.name,
        pending_action: true,
      });
    }
    emitLeadWorkflow({
      event: 'PROCUREMENT_SUBMITTED',
      lead: updated,
      actor: user,
      details: [['Total estimated cost', `₹ ${record.total_estimated_cost.toLocaleString('en-IN')}`]],
      message: `${user.name} submitted procurement/costing totalling ₹ ${record.total_estimated_cost.toLocaleString('en-IN')}.`,
    });
    audit(user, updated, 'COSTING_SUBMITTED', `${user.name} submitted costing for ${lead.lead_number}.`);
  }
  return res.json(payloadFor(updated));
});

router.post(
  '/:id/costing/review',
  requireAuth,
  requirePermission('review:lead', 'approve:costing'),
  (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!isPm(user)) return forbidden(res);
    const lead = findLead(paramId(req));
    if (!lead) return res.status(404).json({ message: 'Lead not found.' });
    if (lead.status !== 'COSTING_SUBMITTED') return res.status(400).json({ message: 'Costing is not awaiting PM approval.' });
    const action = req.body?.action as string;
    if (action === 'return' || action === 'reject') {
      const reason = String(req.body?.reason || '').trim();
      if (!reason) return res.status(400).json({ message: 'A return reason is required.' });
      const rejected = action === 'reject';
      const record = emptyCosting({
        ...(lead.costing || {}),
        status: rejected ? 'REJECTED' : 'RETURNED',
        pm_return_reason: reason,
      });
      let updated = transitionLead(lead, rejected ? 'COSTING_REJECTED' : 'COSTING_RETURNED', user, reason, {
        costing: record,
        costing_return_reason: reason,
        pending_action: !rejected,
      });
      if (!rejected) {
        updated = handLeadToProcurement(updated, user, reason);
      }
      emitLeadWorkflow({
        event: rejected ? 'PROCUREMENT_REJECTED' : 'PROCUREMENT_SENT_BACK',
        lead: updated,
        actor: user,
        comments: reason,
        message: rejected
          ? `${user.name} rejected procurement for "${lead.title}". Reason: ${reason}`
          : `${user.name} requested procurement revision: "${reason}"`,
      });
      audit(user, updated, rejected ? 'COSTING_REJECTED' : 'COSTING_RETURNED', `${user.name} ${rejected ? 'rejected' : 'returned'} costing for ${lead.lead_number}.`);
      return res.json(payloadFor(updated));
    }
    const record = emptyCosting({
      ...(lead.costing || {}),
      status: 'APPROVED',
      pm_approved_by: user.name,
      pm_approved_at: new Date().toISOString(),
    });
    let updated = transitionLead(lead, 'QUOTATION', user, 'Costing approved', {
      costing: record,
      expected_value: record.total_estimated_cost || lead.expected_value,
    });
    updated = handLeadToBusinessHead(updated, user, 'Costing approved — ready for quotation');
    emitLeadWorkflow({
      event: 'PROCUREMENT_APPROVED',
      lead: updated,
      actor: user,
      message: `Procurement approved for "${lead.title}". Prepare the customer quotation.`,
    });
    audit(user, updated, 'COSTING_APPROVED', `${user.name} approved costing for ${lead.lead_number}.`);
    return res.json(payloadFor(updated));
  }
);

router.post(
  '/:id/quotation',
  requireAuth,
  requirePermission('create:quotation', 'edit:lead', 'create:lead'),
  async (req: AuthedRequest, res) => {
    const user = req.user!;
    const lead = findLead(paramId(req));
    if (!lead) return res.status(404).json({ message: 'Lead not found.' });
    if (lead.status !== 'QUOTATION' && lead.status !== 'NEGOTIATION') {
      return res.status(400).json({ message: 'Quotation can be prepared only after costing is approved.' });
    }
    if (!canPrepareQuotation(user, lead)) {
      return res.status(403).json({
        message: 'Only the lead creator can prepare this quotation. The quotation owner is assigned automatically from who created the lead.',
      });
    }
    const send = Boolean(req.body?.send);
    const incoming = { ...(lead.quotation || emptyQuotation()), ...(req.body?.quotation || {}) } as QuotationRecord;
    const quotation = prepareWorkingQuotation(lead, {
      ...incoming,
      quotation_value: parseMoney(incoming.quotation_value),
    }, user);
    if (quotation.workflow_status === 'SUBMITTED_TO_CUSTOMER' || quotation.workflow_status === 'CUSTOMER_REVIEW') {
      return res.status(400).json({
        message: 'This quotation version is already submitted. Use Customer Requested Revision to create the next revision.',
      });
    }
    const updated = transitionLead(lead, 'QUOTATION', user, 'Quotation saved', {
      quotation,
      expected_value: quotation.quotation_value || lead.expected_value,
      estimated_opportunity_value: String(quotation.quotation_value || lead.estimated_opportunity_value || ''),
    });
    audit(user, updated, 'QUOTATION_SAVED', `${user.name} saved quotation ${quotation.revision_label} for ${lead.lead_number}.`);
    if (send && updated.customer_email) {
      await notificationService.notifyClientEmail({
        actor: user,
        entityType: 'LEAD',
        entityId: updated.id,
        entityName: updated.title,
        customerName: updated.customer_name,
        customerEmail: updated.customer_email,
        customerContact: updated.customer_contact,
        type: 'CLIENT_PROPOSAL',
        subject: `Proposal – ${updated.title}`,
        intro: `${user.name} has sent a commercial proposal for ${updated.title}.`,
        details: [
          ['Quotation value', String(quotation.quotation_value || '')],
          ['Validity', quotation.validity || ''],
          ['Payment terms', quotation.payment_terms || ''],
          ['Revision', quotation.revision_label || 'R0'],
        ],
        eventKey: `CLIENT_PROPOSAL:${updated.id}:${quotation.revision_label || 'R0'}:${Date.now()}`,
      });
    }
    return res.json(payloadFor(updated));
  }
);

router.post(
  '/:id/visit/assign',
  requireAuth,
  requirePermission('assign:lead', 'review:lead', 'edit:lead'),
  (req: AuthedRequest, res) => {
    try {
      const user = req.user!;
      const lead = findLead(paramId(req));
      if (!lead) return res.status(404).json({ message: 'Lead not found.' });
      if (!['PROJECT_MANAGER', 'SYSTEM_ADMIN'].includes(user.role_code)) {
        return forbidden(res, 'Only the Project Manager can assign the CareYu visit team.');
      }
      const ids = Array.isArray(req.body?.user_ids) ? req.body.user_ids.map((id: unknown) => String(id)) : [];
      const members = store.getUsers().filter((item) => item.status === 'ACTIVE' && ids.includes(item.id));
      const updated = assignVisitTeam(hydrateLead(lead), user, members);
      return res.json(payloadFor(updated));
    } catch (error) {
      return workflowError(res, error);
    }
  }
);

router.post(
  '/:id/visit/schedule',
  requireAuth,
  requirePermission('assign:lead', 'review:lead', 'edit:lead'),
  (req: AuthedRequest, res) => {
    try {
      const user = req.user!;
      const lead = findLead(paramId(req));
      if (!lead) return res.status(404).json({ message: 'Lead not found.' });
      const updated = updateVisitSchedule(hydrateLead(lead), user, {
        scheduled_date: req.body?.scheduled_date,
        scheduled_time: req.body?.scheduled_time,
        status: req.body?.status,
      });
      return res.json(payloadFor(updated));
    } catch (error) {
      return workflowError(res, error);
    }
  }
);

router.post(
  '/:id/quotation/submit-to-customer',
  requireAuth,
  requirePermission('create:quotation', 'edit:lead', 'create:lead'),
  (req: AuthedRequest, res) => {
    try {
      const user = req.user!;
      const lead = findLead(paramId(req));
      if (!lead) return res.status(404).json({ message: 'Lead not found.' });
      if (!canPrepareQuotation(user, lead) && !canHandleLeadCommercial(user, lead)) return forbidden(res);
      const updated = submitQuotationToCustomer(hydrateLead(lead), user, {
        method: req.body?.method,
        submitted_date: req.body?.submitted_date,
        remarks: req.body?.remarks,
      });
      emitLeadWorkflow({
        event: 'QUOTATION_SUBMITTED',
        lead: updated,
        actor: user,
        message: `${user.name} submitted ${updated.quotation?.revision_label || 'R0'} to the customer.`,
      });
      return res.json(payloadFor(updated));
    } catch (error) {
      return workflowError(res, error);
    }
  }
);

router.post(
  '/:id/quotation/request-revision',
  requireAuth,
  requirePermission('create:quotation', 'edit:lead', 'create:lead'),
  (req: AuthedRequest, res) => {
    try {
      const user = req.user!;
      const lead = findLead(paramId(req));
      if (!lead) return res.status(404).json({ message: 'Lead not found.' });
      if (!canHandleLeadCommercial(user, lead) && user.role_code !== 'SYSTEM_ADMIN') return forbidden(res);
      const updated = requestQuotationRevision(hydrateLead(lead), user, String(req.body?.reason || ''));
      return res.json(payloadFor(updated));
    } catch (error) {
      return workflowError(res, error);
    }
  }
);

router.post(
  '/:id/negotiation',
  requireAuth,
  requirePermission('create:quotation', 'edit:lead', 'create:lead'),
  (req: AuthedRequest, res) => {
    const user = req.user!;
    const lead = findLead(paramId(req));
    if (!lead) return res.status(404).json({ message: 'Lead not found.' });
    if (!canHandleLeadCommercial(user, lead)) {
      return forbidden(res, 'You do not have permission to manage negotiation for this lead.');
    }
    if (lead.status !== 'NEGOTIATION' && lead.status !== 'QUOTATION') {
      return res.status(400).json({ message: 'Negotiation is available after a quotation is sent.' });
    }
    try {
      const action = (req.body?.action || 'UPDATE') as 'UPDATE' | 'REVISED_QUOTATION' | 'CONVERT' | 'LOST';
      if (action === 'CONVERT') {
        const working =
          lead.status === 'NEGOTIATION' ? lead : transitionLead(lead, 'NEGOTIATION', user, 'Moved to negotiation');
        const withHistory = appendNegotiation(working, user, { ...req.body, action: 'CONVERT' });
        const result = convertLeadToProject(withHistory, user);
        notifyOrderConverted(user, result.lead, result.project);
        audit(user, result.lead, 'ORDER_CONVERTED', `${user.name} converted ${lead.lead_number} to ${result.project.code}.`);
        return res.json({ ...payloadFor(result.lead), project: result.project });
      }
      if (action === 'LOST') {
        const withHistory = appendNegotiation(lead, user, { ...req.body, action: 'LOST' });
        const updated = transitionLead(withHistory, 'LOST', user, req.body?.notes || req.body?.customer_feedback || 'Marked as lost');
        audit(user, updated, 'LEAD_LOST', `${user.name} marked ${lead.lead_number} as lost.`);
        return res.json(payloadFor(updated));
      }
      if (action === 'REVISED_QUOTATION') {
        const revised = parseMoney(req.body?.revised_value);
        if (!revised || revised <= 0) {
          return res.status(400).json({ message: 'Enter a revised quotation value greater than 0.' });
        }
      }
      const working = lead.status === 'QUOTATION' ? transitionLead(lead, 'NEGOTIATION', user, 'Negotiation started') : lead;
      const updated = appendNegotiation(working, user, {
        ...req.body,
        action,
        revised_value: req.body?.revised_value != null ? parseMoney(req.body.revised_value) : undefined,
      });
      return res.json(payloadFor(updated));
    } catch (error) {
      return workflowError(res, error);
    }
  }
);

router.post('/:id/convert', requireAuth, requirePermission('convert:lead', 'create:lead'), (req: AuthedRequest, res) => {
  const user = req.user!;
  const lead = findLead(paramId(req));
  if (!lead) return res.status(404).json({ message: 'Lead not found.' });
  if (!canHandleLeadCommercial(user, lead)) {
    return forbidden(res);
  }
  if (!['NEGOTIATION', 'QUOTATION'].includes(lead.status)) {
    return res.status(400).json({ message: 'Only quoted opportunities can be converted to an order.' });
  }
  const result = convertLeadToProject(lead, user);
  notifyOrderConverted(user, result.lead, result.project);
  return res.json({ ...payloadFor(result.lead), project: result.project });
});

router.post(
  '/:id/documents',
  requireAuth,
  requirePermission('create:lead', 'edit:lead', 'view:leads', 'create:feasibility', 'create:costing'),
  (req: AuthedRequest, res) => {
    const user = req.user!;
    const lead = findLead(paramId(req));
    if (!lead) return res.status(404).json({ message: 'Lead not found.' });
    const fileName = String(req.body?.file_name || '');
    const sizeBytes = req.body?.size_bytes != null ? Number(req.body.size_bytes) : undefined;
    if (fileName && !isAllowedFileType(fileName)) {
      return res.status(400).json({ message: fileTypeError() });
    }
    if (typeof sizeBytes === 'number' && !Number.isNaN(sizeBytes) && sizeBytes > MAX_FILE_SIZE) {
      return res.status(400).json({ message: fileTypeError() });
    }
    const doc = addDocument(lead, user, req.body ?? {});
    return res.status(201).json({ document: doc, ...payloadFor(lead) });
  }
);

router.get(
  '/:id/documents/:docId/file',
  requireAuth,
  requirePermission('view:leads', 'create:lead', 'create:feasibility', 'create:costing'),
  (req: AuthedRequest, res) => {
    const user = req.user!;
    const lead = findLead(paramId(req));
    if (!lead) return res.status(404).json({ message: 'Lead not found.' });
    if (!canAccessEntity(user, 'LEAD', lead.id) && !canOwnLead(user, lead)) {
      return forbidden(res, 'You do not have permission to view this project.');
    }
    const docId = Array.isArray(req.params.docId) ? req.params.docId[0] : req.params.docId;
    const doc = store.getLeadDocuments().find((item) => item.id === docId && item.lead_id === lead.id);
    if (!doc) return res.status(404).json({ message: 'Document not found.' });
    return res.json({ document: doc });
  }
);

router.delete(
  '/:id/documents/:docId',
  requireAuth,
  requirePermission('create:lead', 'edit:lead'),
  (req: AuthedRequest, res) => {
    const user = req.user!;
    const lead = findLead(paramId(req));
    if (!lead) return res.status(404).json({ message: 'Lead not found.' });
    if (!canEditProjectInput(user, lead)) {
      return forbidden(res, 'Documents can only be deleted before the lead is submitted.');
    }
    const docId = Array.isArray(req.params.docId) ? req.params.docId[0] : req.params.docId;
    const removed = removeDocument(lead, user, docId);
    if (!removed) return res.status(404).json({ message: 'Document not found.' });
    return res.json({ document: removed, ...payloadFor(lead) });
  }
);

export default router;
