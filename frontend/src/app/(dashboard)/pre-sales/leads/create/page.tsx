'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { StorageService } from '@/lib/storage';
import { canCreateLead } from '@/lib/rbac';
import { LeadApi } from '@/lib/leadApi';
import { useAuth } from '@/components/auth/AuthProvider';
import { BusinessVertical, CustomerType, LeadCustomField, PriorityLevel, User, VisitRequirement } from '@/lib/types';
import AdditionalFieldRow from '@/components/leads/AdditionalFieldRow';
import FormSection from '@/components/leads/FormSection';
import VisitRequirementSection from '@/components/leads/VisitRequirementSection';
import EntityDocumentUpload from '@/components/documents/EntityDocumentUpload';
import SubmitLeadModal from '@/components/leads/SubmitLeadModal';
import { validateLeadForm, numericAmount, resolveLeadDescriptionFields } from '@/lib/leadValidation';
import { workflowStatusPresentation } from '@/lib/format';
import { AlertCircle, ArrowLeft, Building2, CheckCircle2, Loader2, Plus, Save, Send, Trash2 } from 'lucide-react';

const SOLUTION_OPTIONS = [
  'Vision Inspection System',
  'Robotics Cell',
  'Conveyor / Line Automation',
  'ASRS / Shuttle',
  'Palletizer',
  'PLC / Controls',
  'Other',
];

function fieldClass(invalid?: boolean) {
  return `w-full rounded border p-2 focus:border-cyan-500 ${
    invalid ? 'border-rose-700 bg-rose-950/30 text-slate-100' : 'border-slate-800 bg-slate-950 text-slate-100'
  }`;
}

function CreateLeadForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user: currentUser } = useAuth();
  const editId = searchParams.get('id');
  const [leadId, setLeadId] = useState<string | null>(editId);
  const [leadNumber, setLeadNumber] = useState('');
  const [leadStatus, setLeadStatus] = useState('DRAFT');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [customFields, setCustomFields] = useState<LeadCustomField[]>([]);
  const persistLock = useRef<Promise<string | null> | null>(null);
  const leadIdRef = useRef<string | null>(editId);

  const [formData, setFormData] = useState({
    title: '',
    customer_name: '',
    customer_type: 'Automotive' as CustomerType,
    business_vertical: 'Business Head' as BusinessVertical,
    expected_decision_date: '',
    priority: 'Medium' as PriorityLevel,
    customer_contact: '',
    customer_designation: '',
    customer_email: '',
    customer_phone: '',
    customer_location: '',
    plant_location: '',
    project_description: '',
    requirement_summary: '',
    detailed_requirement: '',
    application: '',
    industry_process: '',
    current_process: '',
    expected_automation: '',
    required_solution: '',
    customer_objective: '',
    customer_challenge: '',
    competitor_information: '',
    expected_project_timeline: '',
    customer_target_date: '',
    production_quantity: '',
    production_rate: '',
    cycle_time: '',
    shift_pattern: '',
    operating_hours: '',
    existing_equipment: '',
    existing_automation: '',
    integration_requirements: '',
    technical_requirements: '',
    machine_dimensions: '',
    payload: '',
    accuracy_requirement: '',
    environment_conditions: '',
    technical_specifications: '',
    technical_assumptions: '',
    customer_dependencies: '',
    customer_budget: '',
    estimated_opportunity_value: '',
    currency: 'INR',
    expected_po_date: '',
    commercial_remarks: '',
    additional_notes: '',
    required_documents: '',
    visit_requirement: 'NONE',
    visit_site_name: '',
    visit_site_address: '',
    visit_city: '',
    visit_state: '',
    visit_country: '',
    visit_contact_name: '',
    visit_contact_phone: '',
    visit_contact_email: '',
    visit_preferred_date: '',
    visit_preferred_time: '',
    visit_remarks: '',
    visit_visitor_name: '',
    visit_visitor_designation: '',
    visit_visitor_count: '',
    visit_purpose: '',
    visit_special_requirements: '',
  });

  const isEdit = Boolean(leadId);
  const canEdit = ['DRAFT', 'RETURNED_TO_SALES', 'ADDITIONAL_INFORMATION_REQUIRED'].includes(leadStatus);

  useEffect(() => {
    if (currentUser && !canCreateLead(currentUser)) {
      router.replace('/pre-sales/leads');
      return;
    }
    setLeadNumber(StorageService.generateLeadNumber());
    if (currentUser?.role_code === 'ENG_DIRECTOR') {
      setFormData((prev) => ({ ...prev, business_vertical: 'Engineering Director' }));
    }
    if (editId) {
      void (async () => {
        const payload = await LeadApi.get(editId);
        const lead = payload?.lead;
        if (!lead) return;
        leadIdRef.current = lead.id;
        setLeadId(lead.id);
        setLeadNumber(lead.lead_number);
        setLeadStatus(lead.status);
        setCustomFields(lead.custom_fields || []);
        setFormData((prev) => ({
          ...prev,
          title: lead.title || '',
          customer_name: lead.customer_name || '',
          customer_type: lead.customer_type,
          business_vertical: lead.business_vertical,
          expected_decision_date: lead.expected_decision_date || '',
          priority: lead.priority,
          customer_contact: lead.customer_contact || '',
          customer_designation: lead.customer_designation || '',
          customer_email: lead.customer_email || '',
          customer_phone: lead.customer_phone || '',
          customer_location: lead.customer_location || '',
          plant_location: lead.plant_location || '',
          project_description: lead.project_description || '',
          requirement_summary: lead.requirement_summary || '',
          detailed_requirement: lead.detailed_requirement || '',
          application: lead.application || '',
          industry_process: lead.industry_process || '',
          current_process: lead.current_process || '',
          expected_automation: lead.expected_automation || '',
          required_solution: lead.required_solution || lead.expected_automation || '',
          customer_objective: lead.customer_objective || '',
          customer_challenge: lead.customer_challenge || '',
          competitor_information: lead.competitor_information || '',
          expected_project_timeline: lead.expected_project_timeline || '',
          customer_target_date: lead.customer_target_date || '',
          production_quantity: lead.production_quantity || '',
          production_rate: lead.production_rate || '',
          cycle_time: lead.cycle_time || '',
          shift_pattern: lead.shift_pattern || '',
          operating_hours: lead.operating_hours || '',
          existing_equipment: lead.existing_equipment || '',
          existing_automation: lead.existing_automation || '',
          integration_requirements: lead.integration_requirements || '',
          technical_requirements: lead.technical_requirements || '',
          machine_dimensions: lead.machine_dimensions || '',
          payload: lead.payload || '',
          accuracy_requirement: lead.accuracy_requirement || '',
          environment_conditions: lead.environment_conditions || '',
          technical_specifications: lead.technical_specifications || '',
          technical_assumptions: lead.technical_assumptions || '',
          customer_dependencies: lead.customer_dependencies || '',
          customer_budget: lead.customer_budget || '',
          estimated_opportunity_value: lead.estimated_opportunity_value || '',
          currency: lead.currency || 'INR',
          expected_po_date: lead.expected_po_date || '',
          commercial_remarks: lead.commercial_remarks || '',
          additional_notes: lead.additional_notes || '',
          required_documents: lead.required_documents || '',
          visit_requirement: lead.visit_requirement || 'NONE',
          visit_site_name: lead.visit_site_name || '',
          visit_site_address: lead.visit_site_address || '',
          visit_city: lead.visit_city || '',
          visit_state: lead.visit_state || '',
          visit_country: lead.visit_country || '',
          visit_contact_name: lead.visit_contact_name || '',
          visit_contact_phone: lead.visit_contact_phone || '',
          visit_contact_email: lead.visit_contact_email || '',
          visit_preferred_date: (lead.visit_preferred_date || '').slice(0, 10),
          visit_preferred_time: lead.visit_preferred_time || '',
          visit_remarks: lead.visit_remarks || '',
          visit_visitor_name: lead.visit_visitor_name || '',
          visit_visitor_designation: lead.visit_visitor_designation || '',
          visit_visitor_count: lead.visit_visitor_count || '',
          visit_purpose: lead.visit_purpose || '',
          visit_special_requirements: lead.visit_special_requirements || '',
        }));
      })();
    }
  }, [currentUser, editId, router]);

  const payloadFromForm = (user: User, status: 'DRAFT' | 'SUBMITTED_TO_PM') => {
    const { detailed: detailedText, summary: summaryText } = resolveLeadDescriptionFields(formData);
    return {
      title: formData.title,
      customer_name: formData.customer_name,
      customer_type: formData.customer_type,
      business_vertical: formData.business_vertical,
      created_by: user.name,
      created_by_id: user.id,
      created_by_role: user.role_name,
      sales_owner: user.name,
      sales_owner_id: user.id,
      lead_date: new Date().toISOString(),
      expected_decision_date: formData.expected_decision_date,
      priority: formData.priority,
      status,
      customer_contact: formData.customer_contact,
      customer_designation: formData.customer_designation,
      customer_email: formData.customer_email,
      customer_phone: formData.customer_phone,
      customer_location: formData.customer_location,
      plant_location: formData.plant_location,
      project_description: detailedText,
      requirement_summary: summaryText,
      detailed_requirement: detailedText,
      application: formData.application,
      industry_process: formData.industry_process,
      current_process: formData.current_process,
      expected_automation: formData.expected_automation || formData.required_solution,
      required_solution: formData.required_solution,
      customer_objective: formData.customer_objective,
      customer_challenge: formData.customer_challenge,
      competitor_information: formData.competitor_information,
      expected_project_timeline: formData.expected_project_timeline,
      customer_target_date: formData.customer_target_date,
      production_quantity: formData.production_quantity,
      production_rate: formData.production_rate,
      cycle_time: formData.cycle_time,
      shift_pattern: formData.shift_pattern,
      operating_hours: formData.operating_hours,
      existing_equipment: formData.existing_equipment,
      existing_automation: formData.existing_automation,
      integration_requirements: formData.integration_requirements,
      technical_requirements: formData.technical_requirements,
      machine_dimensions: formData.machine_dimensions,
      payload: formData.payload,
      accuracy_requirement: formData.accuracy_requirement,
      environment_conditions: formData.environment_conditions,
      technical_specifications: formData.technical_specifications,
      technical_assumptions: formData.technical_assumptions,
      customer_dependencies: formData.customer_dependencies,
      customer_budget: formData.customer_budget,
      estimated_opportunity_value: formData.estimated_opportunity_value,
      expected_value: numericAmount(formData.estimated_opportunity_value) ?? 0,
      pipeline_stage: status === 'SUBMITTED_TO_PM' ? ('PM_REVIEW' as const) : ('PROJECT_INPUT' as const),
      currency: formData.currency,
      expected_po_date: formData.expected_po_date,
      commercial_remarks: formData.commercial_remarks,
      additional_notes: formData.additional_notes,
      required_documents: formData.required_documents,
      custom_fields: customFields.filter((field) => field.name.trim() || field.value.trim()),
      visit_requirement: (formData.visit_requirement || 'NONE') as VisitRequirement,
      visit_site_name: formData.visit_site_name,
      visit_site_address: formData.visit_site_address,
      visit_city: formData.visit_city,
      visit_state: formData.visit_state,
      visit_country: formData.visit_country,
      visit_contact_name: formData.visit_contact_name,
      visit_contact_phone: formData.visit_contact_phone,
      visit_contact_email: formData.visit_contact_email,
      visit_preferred_date: formData.visit_preferred_date,
      visit_preferred_time: formData.visit_preferred_time,
      visit_remarks: formData.visit_remarks,
      visit_visitor_name: formData.visit_visitor_name,
      visit_visitor_designation: formData.visit_visitor_designation,
      visit_visitor_count: formData.visit_visitor_count,
      visit_purpose: formData.visit_purpose,
      visit_special_requirements: formData.visit_special_requirements,
    };
  };

  const persistDraft = async (user: User) => {
    if (persistLock.current) return persistLock.current;
    persistLock.current = (async () => {
      const payload = payloadFromForm(user, 'DRAFT');
      const existingId = leadIdRef.current;
      if (existingId) {
        const updated = await LeadApi.update(existingId, payload);
        if (!updated.ok) {
          const nextErrors: Record<string, string> = {};
          for (const item of updated.errors || []) nextErrors[item.field] = item.message;
          if (Object.keys(nextErrors).length) {
            setFieldErrors(nextErrors);
            setMissing(Object.keys(nextErrors));
          }
          throw new Error(updated.message || 'Unable to save the draft.');
        }
        return updated.payload.lead.id || existingId;
      }
      const created = await LeadApi.create(payload);
      if (!created.ok || !created.payload?.lead) {
        const nextErrors: Record<string, string> = {};
        for (const item of created.ok ? [] : created.errors || []) nextErrors[item.field] = item.message;
        if (Object.keys(nextErrors).length) {
          setFieldErrors(nextErrors);
          setMissing(Object.keys(nextErrors));
        }
        throw new Error((created.ok ? undefined : created.message) || 'Unable to save the draft.');
      }
      const id = created.payload.lead.id;
      leadIdRef.current = id;
      setLeadId(id);
      setLeadNumber(created.payload.lead.lead_number);
      setLeadStatus(created.payload.lead.status);
      router.replace(`/pre-sales/leads/create?id=${id}`);
      return id;
    })();
    try {
      return await persistLock.current;
    } finally {
      persistLock.current = null;
    }
  };

  const validateForSubmit = () => {
    const result = validateLeadForm(formData, { submit: true });
    setFieldErrors(result.errors);
    setMissing(Object.keys(result.errors));
    if (result.list.length) {
      const summary = result.list.map((item) => item.message).join(' ');
      setValidationError(summary);
      const first = result.list[0].field;
      window.setTimeout(() => {
        document.getElementById(`lead-field-${first}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        document.getElementsByName(first)[0]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
      return false;
    }
    setValidationError(null);
    return true;
  };

  const handleSaveDraft = async () => {
    if (!currentUser || !canCreateLead(currentUser)) {
      setValidationError('This action is not permitted for your role.');
      return;
    }
    setBusy(true);
    setValidationError(null);
    try {
      const id = await persistDraft(currentUser);
      if (!id) {
        setValidationError('Unable to save the draft. Please try again.');
        return;
      }
      StorageService.logAudit({
        user_id: currentUser.id,
        user_name: currentUser.name,
        user_role: currentUser.role_name,
        entity_type: 'LEAD',
        entity_id: id,
        action: 'LEAD_DRAFT_CREATED',
        description: `Saved draft for Lead ${leadNumber} (${formData.title}).`,
      });
      setSuccessMessage('Lead saved as draft successfully.');
      setMissing([]);
      setFieldErrors({});
      window.setTimeout(() => setSuccessMessage(null), 4000);
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Unable to save the draft. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async () => {
    if (busy) return;
    if (!currentUser || !canCreateLead(currentUser)) {
      setValidationError('This action is not permitted for your role.');
      return;
    }
    if (!validateForSubmit()) {
      setConfirmSubmit(false);
      return;
    }
    if (!canEdit) {
      setValidationError('This lead has already been submitted to the Project Manager.');
      setConfirmSubmit(false);
      return;
    }
    setBusy(true);
    setValidationError(null);
    try {
      const payload = payloadFromForm(currentUser, 'SUBMITTED_TO_PM');
      const existingId = leadIdRef.current;
      const submitted = existingId
        ? await LeadApi.submit(existingId, payload)
        : await LeadApi.create(payload);
      if (!submitted.ok) {
        const nextErrors: Record<string, string> = {};
        for (const item of submitted.errors || []) nextErrors[item.field] = item.message;
        setFieldErrors(nextErrors);
        setMissing(Object.keys(nextErrors));
        const summary = (submitted.errors || []).map((item) => item.message).join(' ');
        setValidationError(summary || submitted.message || 'Unable to submit this lead. The Project Manager assignment was not completed.');
        const first = submitted.errors?.[0]?.field;
        if (first) {
          window.setTimeout(() => {
            document.getElementById(`lead-field-${first}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            document.getElementsByName(first)[0]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 50);
        }
        return;
      }
      const id = submitted.payload.lead.id;
      leadIdRef.current = id;
      setLeadId(id);
      StorageService.logAudit({
        user_id: currentUser.id,
        user_name: currentUser.name,
        user_role: currentUser.role_name,
        entity_type: 'LEAD',
        entity_id: id,
        action: 'LEAD_SUBMITTED_TO_PM',
        description: `Submitted Lead ${leadNumber} (${formData.title}) to PM for technical review.`,
      });
      setSuccessMessage('Submitted Successfully');
      setLeadStatus(submitted.payload.lead.status);
      setConfirmSubmit(false);
      router.push(`/pre-sales/leads/${id}?action=submitted`);
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Unable to submit the lead. Please try again.');
      setConfirmSubmit(false);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteLead = async () => {
    const id = leadIdRef.current;
    if (!id || leadStatus !== 'DRAFT') return;
    if (!window.confirm(`Delete draft lead ${leadNumber}? This cannot be undone.`)) return;
    setBusy(true);
    setValidationError(null);
    const result = await LeadApi.delete(id);
    setBusy(false);
    if (!result.ok) {
      setValidationError(result.message || 'Unable to delete this lead.');
      return;
    }
    router.push('/pre-sales/leads');
  };

  const fieldError = (field: string) =>
    fieldErrors[field] ? <p className="mt-1 text-[11px] text-rose-400">{fieldErrors[field]}</p> : null;

  const addCustomField = () => {
    setCustomFields((current) => [...current, { id: `cf-${Date.now()}`, name: '', value: '' }]);
  };

  if (!currentUser) {
    return <div className="p-6 text-slate-400">Loading lead form...</div>;
  }
  const formStage = workflowStatusPresentation(leadStatus);

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <div className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg border border-slate-800 bg-slate-950 p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
              <Building2 className="h-4 w-4" /> {isEdit ? 'Edit Customer Lead' : 'Create New Customer Lead'}
            </div>
            <h1 className="mt-0.5 text-xl font-bold text-slate-100">Pre-Sales Lead Form</h1>
            {isEdit && leadNumber && (
              <p className="mt-0.5 font-mono text-[11px] text-cyan-400">{leadNumber}</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className={`rounded-full border px-3 py-1 text-xs font-bold ${formStage.badgeClass}`}>
            Current stage: {formStage.label}
          </span>
          {isEdit && leadStatus === 'DRAFT' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleDeleteLead()}
              className="flex items-center gap-2 rounded-lg border border-rose-800 bg-rose-950 px-4 py-2 text-xs font-semibold text-rose-200 transition-colors hover:bg-rose-900 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete Lead
            </button>
          )}
          <button
            type="button"
            disabled={busy || !canEdit}
            onClick={() => void handleSaveDraft()}
            className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4 text-slate-400" /> Save Draft
          </button>
          <button
            type="button"
            disabled={busy || !canEdit}
            onClick={() => {
              if (validateForSubmit()) setConfirmSubmit(true);
            }}
            className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-semibold text-white shadow-md transition-all hover:bg-cyan-500 disabled:opacity-50"
            data-demo="submit-to-pm"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {busy ? 'Submitting…' : 'Submit to PM'}
          </button>
        </div>
      </div>

      {validationError && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-800/80 bg-rose-950/80 p-4 text-xs text-rose-300">
          <AlertCircle className="h-5 w-5 shrink-0 text-rose-400" />
          <div>
            {missing.length > 0 && (
              <div className="font-bold">Please complete all required fields before submitting the lead.</div>
            )}
            <div className={missing.length > 0 ? 'mt-0.5' : 'font-bold'}>{validationError}</div>
          </div>
        </div>
      )}
      {successMessage && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-800/80 bg-emerald-950/50 p-4 text-xs text-emerald-300">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          {successMessage}
        </div>
      )}

      <form className="space-y-6 text-xs" onSubmit={(event) => event.preventDefault()}>
        <fieldset disabled={!canEdit} className="space-y-6 disabled:opacity-90">
        <FormSection title="Section A — Basic Lead Information" hint={`Auto ID: ${leadNumber}`}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block font-medium text-slate-400">Lead ID (Auto)</label>
              <input type="text" disabled value={leadNumber} className="w-full cursor-not-allowed rounded border border-slate-800 bg-slate-950 p-2 font-mono font-bold text-cyan-400" />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block font-semibold text-slate-300">Lead Title *</label>
              <input type="text" required name="title" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="e.g. Vision inspection cell" className={fieldClass(missing.includes('title') || Boolean(fieldErrors.title))} />
              {fieldError('title')}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block font-semibold text-slate-300">Customer Name *</label>
              <input type="text" required name="customer_name" value={formData.customer_name} onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })} placeholder="e.g. Customer company name" className={fieldClass(missing.includes('customer_name') || Boolean(fieldErrors.customer_name))} />
              {fieldError('customer_name')}
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-400">Customer Type</label>
              <select value={formData.customer_type} onChange={(e) => setFormData({ ...formData, customer_type: e.target.value as CustomerType })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500">
                <option value="Automotive">Automotive</option>
                <option value="Manufacturing">Manufacturing</option>
                <option value="Warehouse / Logistics">Warehouse / Logistics</option>
                <option value="FMCG">FMCG</option>
                <option value="Electronics">Electronics</option>
                <option value="Pharmaceutical">Pharmaceutical</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block font-semibold text-slate-300">Business Vertical *</label>
              <select value={formData.business_vertical} onChange={(e) => setFormData({ ...formData, business_vertical: e.target.value as BusinessVertical })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 font-medium text-slate-100 focus:border-cyan-500">
                <option value="Business Head">Business Head (Sharadha Patil)</option>
                <option value="Engineering Director">Engineering Director (Sabarigiri)</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block font-medium text-slate-400">Created By</label>
              <input type="text" disabled value={`${currentUser.name} (${currentUser.role_name})`} className="w-full cursor-not-allowed rounded border border-slate-800 bg-slate-950 p-2 text-slate-400" />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-400">Priority Level</label>
              <select value={formData.priority} onChange={(e) => setFormData({ ...formData, priority: e.target.value as PriorityLevel })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500">
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-400">Expected Decision Date</label>
              <input type="date" value={formData.expected_decision_date} onChange={(e) => setFormData({ ...formData, expected_decision_date: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
            </div>
          </div>
        </FormSection>

        <FormSection title="Section B — Customer Contact Information">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block font-semibold text-slate-300">Contact Person *</label>
              <input type="text" required value={formData.customer_contact} onChange={(e) => setFormData({ ...formData, customer_contact: e.target.value })} placeholder="e.g. Contact person name" className={fieldClass(missing.includes('customer_contact') || Boolean(fieldErrors.customer_contact))} />
              {fieldError('customer_contact')}
            </div>
            <div>
              <label className="mb-1 block font-semibold text-slate-300">Designation *</label>
              <input
                type="text"
                name="customer_designation"
                id="lead-field-customer_designation"
                value={formData.customer_designation}
                onChange={(e) => setFormData({ ...formData, customer_designation: e.target.value })}
                placeholder="e.g. Plant Manager"
                className={fieldClass(missing.includes('customer_designation') || Boolean(fieldErrors.customer_designation))}
              />
              {fieldError('customer_designation')}
            </div>
            <div>
              <label className="mb-1 block font-semibold text-slate-300">Email Address *</label>
              <input
                type="email"
                name="customer_email"
                id="lead-field-customer_email"
                value={formData.customer_email}
                onChange={(e) => setFormData({ ...formData, customer_email: e.target.value })}
                placeholder="name@company.com"
                className={fieldClass(missing.includes('customer_email') || Boolean(fieldErrors.customer_email))}
              />
              {fieldError('customer_email')}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block font-semibold text-slate-300">Phone Number *</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={10}
                name="customer_phone"
                id="lead-field-customer_phone"
                value={formData.customer_phone}
                onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                placeholder="9876543210"
                className={fieldClass(missing.includes('customer_phone') || Boolean(fieldErrors.customer_phone))}
              />
              {fieldError('customer_phone')}
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-400">Customer Office Location</label>
              <input type="text" value={formData.customer_location} onChange={(e) => setFormData({ ...formData, customer_location: e.target.value })} placeholder="e.g. City, State" className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-400">Plant / Site Location</label>
              <input type="text" value={formData.plant_location} onChange={(e) => setFormData({ ...formData, plant_location: e.target.value })} placeholder="e.g. Plant / site location" className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
            </div>
          </div>
        </FormSection>

        <FormSection title="Section C — Project Requirements (Required for Submit)" hint="Fill these before submitting to PM">
          <div>
            <label className="mb-1 block font-semibold text-slate-300" htmlFor="lead-field-detailed_requirement">
              Project Description / Customer Requirement *
            </label>
            <p className="mb-2 text-[11px] text-slate-500">
              Describe what the customer needs — scope, technical needs, and expected outcome.
            </p>
            <textarea
              id="lead-field-detailed_requirement"
              name="detailed_requirement"
              rows={3}
              value={formData.project_description || formData.detailed_requirement || formData.requirement_summary}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  project_description: e.target.value,
                  detailed_requirement: e.target.value,
                  requirement_summary: e.target.value,
                })
              }
              placeholder="e.g. Vision inspection system for automotive brake disc surface defect detection"
              className={fieldClass(
                missing.includes('detailed_requirement') ||
                  missing.includes('project_description') ||
                  missing.includes('requirement_summary') ||
                  Boolean(fieldErrors.detailed_requirement)
              )}
            />
            {fieldError('detailed_requirement')}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block font-semibold text-slate-300" htmlFor="lead-field-application">
                Application / Use Case *
              </label>
              <input
                type="text"
                id="lead-field-application"
                name="application"
                value={formData.application}
                onChange={(e) => setFormData({ ...formData, application: e.target.value })}
                placeholder="e.g. Surface inspection"
                className={fieldClass(missing.includes('application') || Boolean(fieldErrors.application))}
              />
              {fieldError('application')}
            </div>
            <div>
              <label className="mb-1 block font-semibold text-slate-300" htmlFor="lead-field-production_quantity">
                Production Quantity *
              </label>
              <input
                type="text"
                inputMode="decimal"
                id="lead-field-production_quantity"
                name="production_quantity"
                value={formData.production_quantity}
                onChange={(e) => setFormData({ ...formData, production_quantity: e.target.value })}
                placeholder="1500"
                className={fieldClass(missing.includes('production_quantity') || Boolean(fieldErrors.production_quantity))}
              />
              {fieldError('production_quantity')}
            </div>
          </div>
        </FormSection>

        <FormSection title="Section D — Additional Project Information">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block font-medium text-slate-400">Estimated Project Value</label>
              <input type="text" inputMode="decimal" value={formData.estimated_opportunity_value} onChange={(e) => setFormData({ ...formData, estimated_opportunity_value: e.target.value })} placeholder="600000" className={fieldClass(Boolean(fieldErrors.estimated_opportunity_value))} />
              {fieldError('estimated_opportunity_value')}
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-400">Required Solution</label>
              <select value={formData.required_solution} onChange={(e) => setFormData({ ...formData, required_solution: e.target.value, expected_automation: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500">
                <option value="">Select solution</option>
                {SOLUTION_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block font-medium text-slate-400">Technical Requirements</label>
              <textarea rows={3} value={formData.technical_requirements} onChange={(e) => setFormData({ ...formData, technical_requirements: e.target.value })} placeholder="PLC, robot, vision, accuracy, utilities..." className="w-full rounded border border-slate-800 bg-slate-950 p-2.5 text-slate-200 focus:border-cyan-500" />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-400">Commercial Requirements</label>
              <textarea rows={3} value={formData.commercial_remarks} onChange={(e) => setFormData({ ...formData, commercial_remarks: e.target.value })} placeholder="Budget, payment, delivery, commercial notes" className="w-full rounded border border-slate-800 bg-slate-950 p-2.5 text-slate-200 focus:border-cyan-500" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block font-medium text-slate-400">Competitor Information</label>
              <textarea rows={2} value={formData.competitor_information} onChange={(e) => setFormData({ ...formData, competitor_information: e.target.value })} placeholder="Known competitors or alternate quotes" className="w-full rounded border border-slate-800 bg-slate-950 p-2.5 text-slate-200 focus:border-cyan-500" />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-400">Customer Challenge</label>
              <textarea rows={2} value={formData.customer_challenge} onChange={(e) => setFormData({ ...formData, customer_challenge: e.target.value })} placeholder="Pain points, quality escapes, manpower issues" className="w-full rounded border border-slate-800 bg-slate-950 p-2.5 text-slate-200 focus:border-cyan-500" />
            </div>
          </div>
          <div>
            <label className="mb-1 block font-medium text-slate-400">Remarks</label>
            <textarea rows={2} value={formData.additional_notes} onChange={(e) => setFormData({ ...formData, additional_notes: e.target.value })} placeholder="Any additional notes for PM review" className="w-full rounded border border-slate-800 bg-slate-950 p-2.5 text-slate-200 focus:border-cyan-500" />
          </div>

          <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/50 p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-200">Custom additional fields</h3>
              <button type="button" onClick={addCustomField} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-[11px] font-semibold text-slate-200 hover:border-cyan-700">
                <Plus className="h-3.5 w-3.5" /> Add Additional Field
              </button>
            </div>
            {customFields.length === 0 && <p className="text-slate-500">Add lead-specific fields such as machine type, production volume, or line details.</p>}
          {customFields.map((field) => (
              <AdditionalFieldRow
                key={field.id}
                field={field}
                onChange={(next) => setCustomFields((current) => current.map((item) => (item.id === field.id ? next : item)))}
                onRemove={() => setCustomFields((current) => current.filter((item) => item.id !== field.id))}
              />
            ))}
          </div>

          <EntityDocumentUpload
            title="Documents"
            entityType="ADDITIONAL_INPUT"
            entityId={leadId || undefined}
            canEdit={canEdit}
            ensureEntity={async () => {
              if (!currentUser) return null;
              return persistDraft(currentUser);
            }}
          />

          <details className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
            <summary className="cursor-pointer font-semibold text-slate-200">Further technical & commercial details</summary>
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Industry / Process</span>
                  <input value={formData.industry_process} onChange={(e) => setFormData({ ...formData, industry_process: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Current Process</span>
                  <input value={formData.current_process} onChange={(e) => setFormData({ ...formData, current_process: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Expected Automation</span>
                  <input value={formData.expected_automation} onChange={(e) => setFormData({ ...formData, expected_automation: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Customer Objective</span>
                  <input value={formData.customer_objective} onChange={(e) => setFormData({ ...formData, customer_objective: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Expected Project Timeline</span>
                  <input value={formData.expected_project_timeline} onChange={(e) => setFormData({ ...formData, expected_project_timeline: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Customer Target Date</span>
                  <input type="date" value={formData.customer_target_date} onChange={(e) => setFormData({ ...formData, customer_target_date: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Production Rate</span>
                  <input value={formData.production_rate} onChange={(e) => setFormData({ ...formData, production_rate: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Cycle Time</span>
                  <input value={formData.cycle_time} onChange={(e) => setFormData({ ...formData, cycle_time: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Shift Pattern</span>
                  <input value={formData.shift_pattern} onChange={(e) => setFormData({ ...formData, shift_pattern: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Operating Hours</span>
                  <input value={formData.operating_hours} onChange={(e) => setFormData({ ...formData, operating_hours: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Existing Equipment</span>
                  <input value={formData.existing_equipment} onChange={(e) => setFormData({ ...formData, existing_equipment: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Existing Automation</span>
                  <input value={formData.existing_automation} onChange={(e) => setFormData({ ...formData, existing_automation: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Integration Requirements</span>
                  <input value={formData.integration_requirements} onChange={(e) => setFormData({ ...formData, integration_requirements: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Machine Dimensions</span>
                  <input value={formData.machine_dimensions} onChange={(e) => setFormData({ ...formData, machine_dimensions: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Payload</span>
                  <input value={formData.payload} onChange={(e) => setFormData({ ...formData, payload: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Accuracy Requirement</span>
                  <input value={formData.accuracy_requirement} onChange={(e) => setFormData({ ...formData, accuracy_requirement: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Environment Conditions</span>
                  <input value={formData.environment_conditions} onChange={(e) => setFormData({ ...formData, environment_conditions: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Customer Budget</span>
                  <input value={formData.customer_budget} onChange={(e) => setFormData({ ...formData, customer_budget: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Expected PO Date</span>
                  <input type="date" value={formData.expected_po_date} onChange={(e) => setFormData({ ...formData, expected_po_date: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block font-medium text-slate-400">Technical Specifications</span>
                <textarea rows={2} value={formData.technical_specifications} onChange={(e) => setFormData({ ...formData, technical_specifications: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2.5 text-slate-200 focus:border-cyan-500" />
              </label>
              <label className="block">
                <span className="mb-1 block font-medium text-slate-400">Technical Assumptions</span>
                <textarea rows={2} value={formData.technical_assumptions} onChange={(e) => setFormData({ ...formData, technical_assumptions: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2.5 text-slate-200 focus:border-cyan-500" />
              </label>
              <label className="block">
                <span className="mb-1 block font-medium text-slate-400">Customer Dependencies</span>
                <textarea rows={2} value={formData.customer_dependencies} onChange={(e) => setFormData({ ...formData, customer_dependencies: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2.5 text-slate-200 focus:border-cyan-500" />
              </label>
              <label className="block">
                <span className="mb-1 block font-medium text-slate-400">Required Documents (notes)</span>
                <textarea rows={2} value={formData.required_documents} onChange={(e) => setFormData({ ...formData, required_documents: e.target.value })} placeholder="List any documents still expected from the customer" className="w-full rounded border border-slate-800 bg-slate-950 p-2.5 text-slate-200 focus:border-cyan-500" />
              </label>
            </div>
          </details>
        </FormSection>

        <FormSection title="Section E — Customer Requested Visit">
          <VisitRequirementSection
            formData={{
              visit_requirement: (formData.visit_requirement || 'NONE') as VisitRequirement,
              visit_site_name: formData.visit_site_name,
              visit_site_address: formData.visit_site_address,
              visit_city: formData.visit_city,
              visit_state: formData.visit_state,
              visit_country: formData.visit_country,
              visit_contact_name: formData.visit_contact_name,
              visit_contact_phone: formData.visit_contact_phone,
              visit_contact_email: formData.visit_contact_email,
              visit_preferred_date: formData.visit_preferred_date,
              visit_preferred_time: formData.visit_preferred_time,
              visit_remarks: formData.visit_remarks,
              visit_visitor_name: formData.visit_visitor_name,
              visit_visitor_designation: formData.visit_visitor_designation,
              visit_visitor_count: formData.visit_visitor_count,
              visit_purpose: formData.visit_purpose,
              visit_special_requirements: formData.visit_special_requirements,
            }}
            customerName={formData.customer_name}
            onChange={(patch) => setFormData((current) => ({ ...current, ...patch }))}
            missing={missing}
            fieldErrors={fieldErrors}
            fieldError={fieldError}
          />
        </FormSection>
        </fieldset>
      </form>

      {canEdit && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              disabled={busy || !canEdit}
              onClick={() => void handleSaveDraft()}
              className="flex w-full max-w-xs items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4 text-slate-400" /> Save Draft
            </button>
            <button
              type="button"
              disabled={busy || !canEdit}
              onClick={() => {
                if (validateForSubmit()) setConfirmSubmit(true);
              }}
              className="flex w-full max-w-xs items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-cyan-500 disabled:opacity-50"
              data-demo="submit-to-pm-bottom"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {busy ? 'Submitting…' : 'Submit to PM'}
            </button>
          </div>
        </div>
      )}

      <SubmitLeadModal open={confirmSubmit} busy={busy} onCancel={() => setConfirmSubmit(false)} onConfirm={() => void handleSubmit()} />
    </div>
  );
}

export default function CreateLeadPage() {
  return (
    <Suspense fallback={<div className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-xs text-slate-400">Loading lead form…</div>}>
      <CreateLeadForm />
    </Suspense>
  );
}
