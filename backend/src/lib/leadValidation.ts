import { BusinessVertical, CustomerType, Lead, LeadStatus, PriorityLevel } from '../types.js';

export type FieldError = { field: string; message: string };

export class LeadValidationError extends Error {
  status = 400;
  errors: FieldError[];
  warnings: string[];

  constructor(errors: FieldError[], warnings: string[] = []) {
    super(errors[0]?.message || 'Validation failed.');
    this.name = 'LeadValidationError';
    this.errors = errors;
    this.warnings = warnings;
  }
}

export class LeadWorkflowError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'LeadWorkflowError';
    this.status = status;
  }
}

const PHONE_RE = /^[6-9][0-9]{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
const KEYBOARD_SMASH = new Set([
  'asdf',
  'asdfg',
  'asdfgh',
  'qwer',
  'qwerty',
  'zxcv',
  'dfgh',
  'hjkl',
  'lorem',
  'ipsum',
  'xxxx',
  'xxxxxx',
]);

const PRIORITY_MAP: Record<string, PriorityLevel> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
  Low: 'Low',
  Medium: 'Medium',
  High: 'High',
  Critical: 'Critical',
};

const BUSINESS_VERTICALS: BusinessVertical[] = ['Business Head', 'Engineering Director'];
const CUSTOMER_TYPES: CustomerType[] = [
  'Automotive',
  'Manufacturing',
  'Warehouse / Logistics',
  'FMCG',
  'Electronics',
  'Pharmaceutical',
  'Other',
];

export const PM_REVIEW_STATUSES: LeadStatus[] = ['SUBMITTED_TO_PM', 'UNDER_PM_REVIEW', 'RESUBMITTED_TO_PM'];
export const SALES_EDITABLE_STATUSES: LeadStatus[] = ['DRAFT', 'RETURNED_TO_SALES', 'ADDITIONAL_INFORMATION_REQUIRED'];

export const ALLOWED_STATUS_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  DRAFT: ['SUBMITTED_TO_PM'],
  SUBMITTED_TO_PM: ['UNDER_PM_REVIEW', 'RETURNED_TO_SALES', 'CANCELLED', 'ACCEPTED_FOR_FEASIBILITY', 'FEASIBILITY_IN_PROGRESS'],
  UNDER_PM_REVIEW: ['RETURNED_TO_SALES', 'CANCELLED', 'ACCEPTED_FOR_FEASIBILITY', 'FEASIBILITY_IN_PROGRESS'],
  RETURNED_TO_SALES: ['RESUBMITTED_TO_PM', 'DRAFT'],
  ADDITIONAL_INFORMATION_REQUIRED: ['RESUBMITTED_TO_PM', 'DRAFT'],
  RESUBMITTED_TO_PM: ['UNDER_PM_REVIEW', 'RETURNED_TO_SALES', 'CANCELLED', 'ACCEPTED_FOR_FEASIBILITY', 'FEASIBILITY_IN_PROGRESS'],
  ACCEPTED_FOR_FEASIBILITY: ['FEASIBILITY_IN_PROGRESS', 'RETURNED_TO_SALES', 'CANCELLED'],
  FEASIBILITY_IN_PROGRESS: ['FEASIBILITY_SUBMITTED', 'FEASIBILITY_RETURNED', 'ACCEPTED_FOR_FEASIBILITY', 'CANCELLED'],
  FEASIBILITY_SUBMITTED: ['COSTING_IN_PROGRESS', 'FEASIBILITY_RETURNED', 'FEASIBILITY_REJECTED'],
  FEASIBILITY_RETURNED: ['FEASIBILITY_IN_PROGRESS', 'FEASIBILITY_SUBMITTED'],
  FEASIBILITY_REJECTED: [],
  COSTING_IN_PROGRESS: ['COSTING_SUBMITTED', 'COSTING_RETURNED'],
  COSTING_SUBMITTED: ['QUOTATION', 'COSTING_RETURNED', 'COSTING_REJECTED'],
  COSTING_RETURNED: ['COSTING_IN_PROGRESS', 'COSTING_SUBMITTED'],
  COSTING_REJECTED: [],
  QUOTATION: ['NEGOTIATION', 'LOST'],
  NEGOTIATION: ['ORDER_CONVERTED', 'QUOTATION', 'LOST'],
  ORDER_CONVERTED: [],
  WON: [],
  LOST: [],
  ON_HOLD: ['DRAFT', 'SUBMITTED_TO_PM'],
  CANCELLED: [],
};

const NAME_FIELDS: Array<{ field: keyof Lead | string; label: string; requiredOnSubmit: boolean }> = [
  { field: 'customer_name', label: 'Customer Name', requiredOnSubmit: true },
  { field: 'title', label: 'Lead Title', requiredOnSubmit: true },
  { field: 'customer_contact', label: 'Contact Name', requiredOnSubmit: true },
  { field: 'customer_designation', label: 'Designation', requiredOnSubmit: true },
  { field: 'customer_location', label: 'Office', requiredOnSubmit: false },
  { field: 'plant_location', label: 'Plant', requiredOnSubmit: false },
  { field: 'industry_process', label: 'Industry', requiredOnSubmit: false },
  { field: 'application', label: 'Application', requiredOnSubmit: true },
];

function asString(value: unknown): string {
  return String(value ?? '').trim();
}

/** Keep description fields aligned when any one of them is filled. */
export function normalizeLeadDescriptionFields(
  body: Record<string, unknown>,
  existing?: Partial<Lead>
): Pick<Lead, 'detailed_requirement' | 'project_description' | 'requirement_summary'> {
  const project =
    asString(body.project_description) ||
    asString(existing?.project_description);
  const summary =
    asString(body.requirement_summary) ||
    asString(existing?.requirement_summary);
  const detailed =
    asString(body.detailed_requirement) ||
    asString(existing?.detailed_requirement);
  const text =
    detailed ||
    [project, summary].filter(Boolean).join('\n\n') ||
    project ||
    summary;
  return {
    detailed_requirement: text,
    project_description: project || text,
    requirement_summary: summary || text,
  };
}

function lettersOnly(value: string): string {
  return value.replace(/[^A-Za-z]/g, '').toLowerCase();
}

export function isMeaningfulName(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.length < 2 || trimmed.length > 200) return false;
  if (/^\d+$/.test(trimmed)) return false;
  if (/^[^A-Za-z0-9]+$/.test(trimmed)) return false;
  if (/^(.)\1{4,}$/.test(trimmed)) return false;
  const letters = lettersOnly(trimmed);
  if (letters.length < 2) return false;
  if (KEYBOARD_SMASH.has(letters)) return false;
  return true;
}

export function normalizePriority(raw: unknown): PriorityLevel | null {
  if (raw == null || raw === '') return null;
  return PRIORITY_MAP[String(raw).trim()] || null;
}

export function parseStrictNumber(
  raw: unknown,
  options: { min?: number; max?: number; integer?: boolean; allowEmpty?: boolean } = {}
): { ok: true; value?: number } | { ok: false; message: string } {
  if (raw == null || raw === '') {
    if (options.allowEmpty) return { ok: true, value: undefined };
    return { ok: false, message: 'Enter a valid number.' };
  }
  const text = String(raw).trim();
  if (!text) {
    if (options.allowEmpty) return { ok: true, value: undefined };
    return { ok: false, message: 'Enter a valid number.' };
  }
  if (/[₹Rs]/i.test(text) && !options.allowEmpty) {
    return { ok: false, message: 'Enter a numeric value without currency symbols.' };
  }
  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    return { ok: false, message: 'Enter a numeric value without letters or units.' };
  }
  const value = Number(text);
  if (!Number.isFinite(value) || Number.isNaN(value)) {
    return { ok: false, message: 'Enter a valid number.' };
  }
  if (options.integer && !Number.isInteger(value)) {
    return { ok: false, message: 'Enter a whole number.' };
  }
  if (options.min != null && value < options.min) {
    return { ok: false, message: options.min > 0 ? 'Enter a valid positive number.' : 'Value cannot be negative.' };
  }
  if (options.max != null && value > options.max) {
    return { ok: false, message: `Enter a number no greater than ${options.max}.` };
  }
  return { ok: true, value };
}

export function parseMoneyStrict(
  raw: unknown,
  options: { required?: boolean; min?: number } = {}
): { ok: true; value?: number } | { ok: false; message: string } {
  if (raw == null || raw === '') {
    if (options.required) return { ok: false, message: 'Enter a valid amount.' };
    return { ok: true, value: undefined };
  }
  const text = String(raw).trim();
  if (!text) {
    if (options.required) return { ok: false, message: 'Enter a valid amount.' };
    return { ok: true, value: undefined };
  }
  if (/₹|Rs\.?|lakh|crore/i.test(text)) {
    return { ok: false, message: 'Enter a numeric amount without currency symbols.' };
  }
  const stripped = text.replace(/,/g, '').replace(/\s/g, '');
  if (/[a-zA-Z]/.test(stripped)) {
    return { ok: false, message: 'Enter a numeric amount without currency words or symbols stored in the value.' };
  }
  if (!/^-?\d+(\.\d{1,2})?$/.test(stripped)) {
    return { ok: false, message: 'Enter a valid amount greater than 0.' };
  }
  const value = Number(stripped);
  if (!Number.isFinite(value) || Number.isNaN(value)) {
    return { ok: false, message: 'Enter a valid amount.' };
  }
  const min = options.min ?? 0;
  if (value < min) {
    return { ok: false, message: min > 0 ? 'Enter a valid amount greater than 0.' : 'Amount cannot be negative.' };
  }
  return { ok: true, value };
}

export function isValidPhone(value: string): boolean {
  return PHONE_RE.test(value.trim());
}

export function isValidEmail(value: string): boolean {
  const email = value.trim();
  if (!email || /\s/.test(email)) return false;
  return EMAIL_RE.test(email);
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) && !/^\d{4}-\d{2}-\d{2}T/.test(value)) return false;
  const date = new Date(value);
  return !Number.isNaN(+date);
}

export function assertAllowedTransition(from: LeadStatus, to: LeadStatus) {
  if (from === to) return;
  const allowed = ALLOWED_STATUS_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    throw new LeadWorkflowError(`Status change from ${from} to ${to} is not permitted.`, 403);
  }
}

export function leadOwnerId(lead: Pick<Lead, 'current_owner_id' | 'responsible_user_id'>): string | undefined {
  return lead.current_owner_id || lead.responsible_user_id;
}

function push(errors: FieldError[], field: string, message: string) {
  errors.push({ field, message });
}

function validateNameField(errors: FieldError[], field: string, label: string, value: unknown, required: boolean) {
  const text = asString(value);
  if (!text) {
    if (required) push(errors, field, `${label} is required.`);
    return;
  }
  if (!isMeaningfulName(text)) {
    push(errors, field, `Enter a valid ${label.toLowerCase()}.`);
  }
}

export function validateLeadPayload(body: Record<string, unknown>, options: { submit: boolean }): {
  errors: FieldError[];
  warnings: string[];
  normalized: {
    priority?: PriorityLevel;
    expected_value?: number;
    customer_budget_value?: number;
    business_vertical?: BusinessVertical;
    customer_type?: CustomerType;
  };
} {
  const errors: FieldError[] = [];
  const warnings: string[] = [];
  const submit = options.submit;

  if (submit) {
    for (const item of NAME_FIELDS) {
      validateNameField(errors, String(item.field), item.label, body[String(item.field)], item.requiredOnSubmit);
    }
  const descriptionText =
    asString(body.detailed_requirement) ||
    [asString(body.project_description), asString(body.requirement_summary)].filter(Boolean).join('\n\n') ||
    asString(body.project_description) ||
    asString(body.requirement_summary);
    if (!descriptionText) {
      push(errors, 'detailed_requirement', 'Project Description / Customer Requirement is required.');
    }
    if (!asString(body.sales_owner_id) && !asString(body.sales_owner)) {
      push(errors, 'sales_owner', 'Sales Owner is required.');
    }
    if (!asString(body.customer_email)) {
      push(errors, 'customer_email', 'Enter a valid email address.');
    }
    if (!asString(body.customer_phone)) {
      push(errors, 'customer_phone', 'Phone number must contain exactly 10 digits and start with 6, 7, 8, or 9.');
    }
  } else {
    for (const item of NAME_FIELDS) {
      if (asString(body[String(item.field)])) {
        validateNameField(errors, String(item.field), item.label, body[String(item.field)], false);
      }
    }
  }

  const email = asString(body.customer_email);
  if (email && !isValidEmail(email)) {
    const existing = errors.find((item) => item.field === 'customer_email');
    if (existing) existing.message = 'Enter a valid email address.';
    else push(errors, 'customer_email', 'Enter a valid email address.');
  }

  const phone = asString(body.customer_phone);
  if (phone && !isValidPhone(phone)) {
    const existing = errors.find((item) => item.field === 'customer_phone');
    if (existing) existing.message = 'Phone number must contain exactly 10 digits and start with 6, 7, 8, or 9.';
    else push(errors, 'customer_phone', 'Phone number must contain exactly 10 digits and start with 6, 7, 8, or 9.');
  }

  const vertical = asString(body.business_vertical);
  if (submit && !vertical) {
    push(errors, 'business_vertical', 'Business Vertical is required.');
  } else if (vertical && !BUSINESS_VERTICALS.includes(vertical as BusinessVertical)) {
    push(errors, 'business_vertical', 'Select a valid business vertical.');
  }

  const customerType = asString(body.customer_type);
  if (customerType && !CUSTOMER_TYPES.includes(customerType as CustomerType)) {
    push(errors, 'customer_type', 'Select a valid customer type.');
  }

  const priority = normalizePriority(body.priority);
  if (submit && body.priority != null && body.priority !== '' && !priority) {
    push(errors, 'priority', 'Priority must be LOW, MEDIUM, or HIGH.');
  } else if (submit && !priority && body.priority) {
    push(errors, 'priority', 'Priority must be LOW, MEDIUM, or HIGH.');
  } else if (submit && !body.priority) {
    push(errors, 'priority', 'Priority is required.');
  }

  const quantity = parseStrictNumber(body.production_quantity, { min: 0.0001, max: 1_000_000_000, allowEmpty: !submit });
  if (!quantity.ok) {
    push(errors, 'production_quantity', submit ? 'Enter a valid positive number.' : quantity.message);
  } else if (submit && (quantity.value == null || quantity.value <= 0)) {
    push(errors, 'production_quantity', 'Enter a valid positive number.');
  }

  const optionalPositive = [
    { field: 'production_rate', label: 'Production Rate', max: 1_000_000_000 },
    { field: 'cycle_time', label: 'Cycle Time', max: 1_000_000 },
    { field: 'payload', label: 'Payload', max: 1_000_000_000 },
  ] as const;
  for (const item of optionalPositive) {
    const parsed = parseStrictNumber(body[item.field], { min: 0.0001, allowEmpty: true, max: item.max });
    if (!parsed.ok) push(errors, item.field, `Enter a valid positive number for ${item.label.toLowerCase()}.`);
  }

  const hours = parseStrictNumber(body.operating_hours, { min: 0.0001, max: 24, allowEmpty: true });
  if (!hours.ok) {
    push(errors, 'operating_hours', 'Operating hours must be a number greater than 0 and at most 24.');
  }

  const accuracyRaw = asString(body.accuracy_requirement);
  if (accuracyRaw && /^-?\d+(\.\d+)?%?$/.test(accuracyRaw.replace(/\s/g, ''))) {
    const numeric = Number(accuracyRaw.replace(/%/g, ''));
    if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 100) {
      push(errors, 'accuracy_requirement', 'Accuracy must be a number greater than 0 and at most 100.');
    }
  } else if (accuracyRaw && /[a-zA-Z]/.test(accuracyRaw) && /^-?\d/.test(accuracyRaw)) {
    push(errors, 'accuracy_requirement', 'Enter a numeric accuracy value.');
  } else if (accuracyRaw && /^-?\d+(\.\d+)?$/.test(accuracyRaw)) {
    const numeric = Number(accuracyRaw);
    if (numeric <= 0) push(errors, 'accuracy_requirement', 'Accuracy must be greater than 0.');
  }

  const budget = parseMoneyStrict(body.customer_budget, { min: 0 });
  if (!budget.ok) push(errors, 'customer_budget', budget.message);
  const estimated = parseMoneyStrict(body.estimated_opportunity_value ?? body.expected_value, { min: 0 });
  if (!estimated.ok) push(errors, 'estimated_opportunity_value', estimated.message === 'Amount cannot be negative.' ? 'Amount cannot be negative.' : estimated.message);

  if (budget.ok && estimated.ok && budget.value != null && estimated.value != null && budget.value > 0 && estimated.value > budget.value * 3) {
    warnings.push('Estimated value is much higher than the stated budget. Please confirm both amounts.');
  }
  if (budget.ok && estimated.ok && budget.value != null && estimated.value != null && estimated.value > 0 && budget.value > estimated.value * 3) {
    warnings.push('Budget is much higher than the estimated value. Please confirm both amounts.');
  }

  const poDate = asString(body.expected_po_date);
  if (poDate) {
    if (!isValidIsoDate(poDate)) {
      push(errors, 'expected_po_date', 'Enter a valid expected PO date.');
    } else {
      const date = new Date(poDate.slice(0, 10) + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (date < today && submit) {
        push(errors, 'expected_po_date', 'Expected PO date cannot be in the past for a new lead.');
      }
    }
  }

  const decisionDate = asString(body.expected_decision_date);
  if (decisionDate && !isValidIsoDate(decisionDate)) {
    push(errors, 'expected_decision_date', 'Enter a valid date.');
  }
  const targetDate = asString(body.customer_target_date);
  if (targetDate && !isValidIsoDate(targetDate)) {
    push(errors, 'customer_target_date', 'Enter a valid date.');
  }

  const visitRequirement = asString(body.visit_requirement || 'NONE');
  if (submit && visitRequirement && !['NONE', 'CUSTOMER_SITE', 'CAREYU_OFFICE'].includes(visitRequirement)) {
    push(errors, 'visit_requirement', 'Select a valid visit requirement.');
  }
  const visitPhone = asString(body.visit_contact_phone);
  if (visitPhone && !isValidPhone(visitPhone)) {
    push(errors, 'visit_contact_phone', 'Phone number must contain exactly 10 digits and start with 6, 7, 8, or 9.');
  }
  const visitEmail = asString(body.visit_contact_email);
  if (visitEmail && !isValidEmail(visitEmail)) {
    push(errors, 'visit_contact_email', 'Enter a valid email address.');
  }
  const visitorCount = parseStrictNumber(body.visit_visitor_count, { min: 1, integer: true, allowEmpty: true });
  if (!visitorCount.ok) push(errors, 'visit_visitor_count', 'Enter the number of visitors.');
  const visitDate = asString(body.visit_preferred_date);
  if (visitDate && !isValidIsoDate(visitDate)) {
    push(errors, 'visit_preferred_date', 'Enter a valid preferred visit date.');
  }

  if (body.status != null && body.status !== '' && body.status !== 'DRAFT' && body.status !== 'SUBMITTED_TO_PM') {
    push(errors, 'status', 'Status cannot be set directly. Use the workflow actions.');
  }

  return {
    errors,
    warnings,
    normalized: {
      priority: priority || undefined,
      expected_value: estimated.ok ? estimated.value : undefined,
      customer_budget_value: budget.ok ? budget.value : undefined,
      business_vertical: BUSINESS_VERTICALS.includes(vertical as BusinessVertical) ? (vertical as BusinessVertical) : undefined,
      customer_type: CUSTOMER_TYPES.includes(customerType as CustomerType) ? (customerType as CustomerType) : undefined,
    },
  };
}

export function assertLeadValidForSubmit(body: Record<string, unknown>) {
  const result = validateLeadPayload(body, { submit: true });
  if (result.errors.length) {
    throw new LeadValidationError(result.errors, result.warnings);
  }
  return result;
}

export function sanitizeLeadPatch(body: Record<string, unknown>): Record<string, unknown> {
  const blocked = [
    'id',
    'lead_number',
    'status',
    'pipeline_stage',
    'created_by',
    'created_by_id',
    'created_by_role',
    'responsible_user_id',
    'responsible_user_name',
    'responsible_role_code',
    'current_owner_id',
    'current_owner_name',
    'assigned_by_id',
    'assigned_by_name',
    'assigned_at',
    'pm_id',
    'pm_name',
    'assigned_team_id',
    'assigned_team_name',
    'assigned_team_lead_id',
    'assigned_team_lead_name',
    'submitted_at',
    'submitted_by',
    'submitted_by_id',
    'accepted_at',
    'accepted_by_id',
    'accepted_by_name',
    'project_id',
    'converted_at',
    'visit_assigned_user_ids',
    'visit_assigned_user_names',
    'visit_assigned_by',
    'visit_assigned_by_id',
    'visit_assigned_at',
    'visit_status',
    'visit_scheduled_date',
    'visit_scheduled_time',
    'visit_activity',
    'quotation_revisions',
  ];
  const next = { ...body };
  for (const key of blocked) {
    delete next[key];
  }
  return next;
}
