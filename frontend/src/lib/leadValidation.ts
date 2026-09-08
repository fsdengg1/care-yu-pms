export type FieldError = { field: string; message: string };

export const LEAD_SUBMIT_FIELD_LABELS: Record<string, string> = {
  customer_name: 'Customer Name',
  title: 'Lead Title',
  customer_contact: 'Contact Person',
  customer_designation: 'Designation',
  detailed_requirement: 'Project Description / Customer Requirement',
  project_description: 'Project Description / Customer Requirement',
  requirement_summary: 'Project Description / Customer Requirement',
  application: 'Application / Use Case',
  production_quantity: 'Production Quantity',
  business_vertical: 'Business Vertical',
  priority: 'Priority Level',
  customer_email: 'Email Address',
  customer_phone: 'Phone Number',
};

/** Accept any project-description field; combine separate inputs into one API value. */
export function resolveLeadDescriptionFields(form: Record<string, string>) {
  const project = (form.project_description || '').trim();
  const summary = (form.requirement_summary || '').trim();
  const detailed = (form.detailed_requirement || '').trim();
  const text = detailed || [project, summary].filter(Boolean).join('\n\n') || project || summary;
  return { detailed: text, summary: summary || text };
}

const PHONE_RE = /^[6-9][0-9]{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
const KEYBOARD_SMASH = new Set(['asdf', 'asdfg', 'asdfgh', 'qwer', 'qwerty', 'zxcv', 'dfgh', 'hjkl']);
const PRIORITIES = new Set(['Low', 'Medium', 'High', 'Critical', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

export function isMeaningfulName(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.length < 2 || trimmed.length > 200) return false;
  if (/^\d+$/.test(trimmed)) return false;
  if (/^[^A-Za-z0-9]+$/.test(trimmed)) return false;
  if (/^(.)\1{4,}$/.test(trimmed)) return false;
  const letters = trimmed.replace(/[^A-Za-z]/g, '').toLowerCase();
  if (letters.length < 2) return false;
  if (KEYBOARD_SMASH.has(letters)) return false;
  return true;
}

export function isValidPhone(value: string): boolean {
  return PHONE_RE.test(value.trim());
}

export function isValidEmail(value: string): boolean {
  const email = value.trim();
  if (!email || /\s/.test(email)) return false;
  return EMAIL_RE.test(email);
}

function parsePositiveNumber(raw: string, allowEmpty = false): string | null {
  const text = raw.trim();
  if (!text) return allowEmpty ? null : 'Enter a valid positive number.';
  if (!/^-?\d+(\.\d+)?$/.test(text)) return 'Enter a valid positive number.';
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0) return 'Enter a valid positive number.';
  return null;
}

function parseAmount(raw: string, allowEmpty = true): string | null {
  const text = raw.trim();
  if (!text) return allowEmpty ? null : 'Enter a valid amount greater than 0.';
  if (/₹|Rs\.?|lakh|crore/i.test(text)) return 'Enter a numeric amount without currency symbols.';
  const stripped = text.replace(/,/g, '').replace(/\s/g, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(stripped)) return 'Enter a valid amount greater than 0.';
  const value = Number(stripped);
  if (!Number.isFinite(value)) return 'Enter a valid amount.';
  if (value < 0) return 'Amount cannot be negative.';
  return null;
}

export function validateLeadForm(
  form: Record<string, string>,
  options: { submit: boolean }
): { errors: Record<string, string>; list: FieldError[] } {
  const errors: Record<string, string> = {};
  const requiredNames: Array<[string, string]> = [
    ['customer_name', 'Customer Name'],
    ['title', 'Lead Title'],
    ['customer_contact', 'Contact Name'],
    ['customer_designation', 'Designation'],
    ['application', 'Application'],
  ];
  const optionalNames: Array<[string, string]> = [
    ['customer_location', 'Office'],
    ['plant_location', 'Plant'],
    ['industry_process', 'Industry'],
  ];

  const checkName = (field: string, label: string, required: boolean) => {
    const value = (form[field] || '').trim();
    if (!value) {
      if (required) errors[field] = `${label} is required.`;
      return;
    }
    if (!isMeaningfulName(value)) errors[field] = `Enter a valid ${label.toLowerCase()}.`;
  };

  if (options.submit) {
    for (const [field, label] of requiredNames) checkName(field, label, true);
    const { detailed } = resolveLeadDescriptionFields(form);
    if (!detailed) {
      errors.detailed_requirement = `${LEAD_SUBMIT_FIELD_LABELS.detailed_requirement} is required.`;
    }
    if (!(form.business_vertical || '').trim()) errors.business_vertical = 'Business Vertical is required.';
    if (!(form.priority || '').trim() || !PRIORITIES.has(form.priority)) {
      errors.priority = 'Priority must be LOW, MEDIUM, or HIGH.';
    }
    const qty = parsePositiveNumber(form.production_quantity || '', false);
    if (qty) errors.production_quantity = qty;
  } else {
    for (const [field, label] of [...requiredNames, ...optionalNames]) {
      if ((form[field] || '').trim()) checkName(field, label, false);
    }
  }
  for (const [field, label] of optionalNames) {
    if ((form[field] || '').trim()) checkName(field, label, false);
  }

  const email = (form.customer_email || '').trim();
  if (options.submit && !email) errors.customer_email = 'Enter a valid email address.';
  else if (email && !isValidEmail(email)) errors.customer_email = 'Enter a valid email address.';

  const phone = (form.customer_phone || '').trim();
  if (options.submit && !phone) {
    errors.customer_phone = 'Phone number must contain exactly 10 digits and start with 6, 7, 8, or 9.';
  } else if (phone && !isValidPhone(phone)) {
    errors.customer_phone = 'Phone number must contain exactly 10 digits and start with 6, 7, 8, or 9.';
  }

  const rate = parsePositiveNumber(form.production_rate || '', true);
  if (rate) errors.production_rate = rate;
  const cycle = parsePositiveNumber(form.cycle_time || '', true);
  if (cycle) errors.cycle_time = cycle;
  const payload = parsePositiveNumber(form.payload || '', true);
  if (payload) errors.payload = payload;
  const hours = (form.operating_hours || '').trim();
  if (hours) {
    if (!/^-?\d+(\.\d+)?$/.test(hours) || Number(hours) <= 0 || Number(hours) > 24) {
      errors.operating_hours = 'Operating hours must be a number greater than 0 and at most 24.';
    }
  }
  const accuracy = (form.accuracy_requirement || '').trim().replace(/%/g, '');
  if (accuracy && /^-?\d+(\.\d+)?$/.test(accuracy)) {
    const value = Number(accuracy);
    if (value <= 0 || value > 100) errors.accuracy_requirement = 'Accuracy must be a number greater than 0 and at most 100.';
  } else if (accuracy && /[a-zA-Z]/.test(accuracy) && /^-?\d/.test(accuracy)) {
    errors.accuracy_requirement = 'Enter a numeric accuracy value.';
  }

  const amount = parseAmount(form.estimated_opportunity_value || '', true);
  if (amount) errors.estimated_opportunity_value = amount;
  const budget = parseAmount(form.customer_budget || '', true);
  if (budget) errors.customer_budget = budget;

  if (options.submit) {
    const visit = (form.visit_requirement || 'NONE').trim();
    if (visit && !['NONE', 'CUSTOMER_SITE', 'CAREYU_OFFICE'].includes(visit)) {
      errors.visit_requirement = 'Select a valid visit requirement.';
    }
    const visitPhone = (form.visit_contact_phone || '').trim();
    if (visitPhone && !isValidPhone(visitPhone)) {
      errors.visit_contact_phone = 'Phone number must contain exactly 10 digits and start with 6, 7, 8, or 9.';
    }
    const visitEmail = (form.visit_contact_email || '').trim();
    if (visitEmail && !isValidEmail(visitEmail)) {
      errors.visit_contact_email = 'Enter a valid email address.';
    }
    const count = parsePositiveNumber(form.visit_visitor_count || '', true);
    if (count) errors.visit_visitor_count = count;
  }

  const po = (form.expected_po_date || '').trim();
  if (po) {
    const date = new Date(`${po.slice(0, 10)}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (Number.isNaN(+date)) errors.expected_po_date = 'Enter a valid expected PO date.';
    else if (options.submit && date < today) errors.expected_po_date = 'Expected PO date cannot be in the past for a new lead.';
  }

  return { errors, list: Object.entries(errors).map(([field, message]) => ({ field, message })) };
}

export function numericAmount(raw: string): number | undefined {
  const text = raw.trim().replace(/,/g, '');
  if (!text) return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}
