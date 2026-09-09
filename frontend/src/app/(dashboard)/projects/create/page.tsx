'use client';

import { Link, useRouter, useSearchParams } from '@/lib/navigation';
import React, { Suspense, useEffect, useRef, useState } from 'react';


import { canCreateLead } from '@/lib/rbac';
import { ProjectsApi } from '@/lib/projectsApi';
import { useAuth } from '@/components/auth/AuthProvider';
import { BusinessVertical, CustomerType, LeadCustomField, PriorityLevel, ProjectIntakeStatus, ProjectWorkflowSnapshot, User } from '@/lib/types';
import AdditionalFieldRow from '@/components/leads/AdditionalFieldRow';
import FormSection from '@/components/leads/FormSection';
import EntityDocumentUpload from '@/components/documents/EntityDocumentUpload';
import CreateProjectModal from '@/components/projects/CreateProjectModal';
import ProjectWorkflowBanner from '@/components/projects/ProjectWorkflowBanner';
import { validateLeadForm, numericAmount } from '@/lib/leadValidation';
import { PROJECT_ACTION_SUCCESS } from '@/lib/format';
import { AlertCircle, ArrowLeft, FolderKanban, Plus, Save, Send } from 'lucide-react';

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

function emptyForm(vertical: BusinessVertical = 'Business Head') {
  return {
    title: '',
    customer_name: '',
    customer_type: 'Automotive' as CustomerType,
    business_vertical: vertical,
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
  };
}

function CreateProjectForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user: currentUser } = useAuth();
  const editId = searchParams.get('id');
  const [projectId, setProjectId] = useState<string | null>(editId);
  const [projectCode, setProjectCode] = useState('PRJ-AUTO');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [confirmCreate, setConfirmCreate] = useState(false);
  const [customFields, setCustomFields] = useState<LeadCustomField[]>([]);
  const persistLock = useRef<Promise<string | null> | null>(null);
  const projectIdRef = useRef<string | null>(editId);
  const [formData, setFormData] = useState(() => emptyForm());
  const [intakeStatus, setIntakeStatus] = useState<ProjectIntakeStatus | ''>('');
  const [workflow, setWorkflow] = useState<ProjectWorkflowSnapshot | null>(null);
  const [returnComment, setReturnComment] = useState('');

  useEffect(() => {
    if (currentUser && !canCreateLead(currentUser)) {
      router.replace('/dashboard');
      return;
    }
    if (currentUser?.role_code === 'ENG_DIRECTOR') {
      setFormData((prev) => ({ ...prev, business_vertical: 'Engineering Director' }));
    }
    if (editId) {
      void (async () => {
        const payload = await ProjectsApi.get(editId);
        const project = payload?.project;
        if (!project || project.source !== 'DIRECT_CREATE') return;
        const intake = (project.intake_form || {}) as Record<string, string>;
        projectIdRef.current = project.id;
        setProjectId(project.id);
        setProjectCode(project.code);
        setIntakeStatus(project.intake_status || '');
        setWorkflow(payload.workflow || null);
        setReturnComment(project.intake_comment || '');
        setCustomFields(Array.isArray((project.intake_form as { custom_fields?: LeadCustomField[] })?.custom_fields)
          ? ((project.intake_form as { custom_fields: LeadCustomField[] }).custom_fields)
          : []);
        setFormData((prev) => ({
          ...prev,
          ...emptyForm(currentUser?.role_code === 'ENG_DIRECTOR' ? 'Engineering Director' : 'Business Head'),
          title: intake.title || project.name || '',
          customer_name: intake.customer_name || project.customer_name || '',
          customer_type: (intake.customer_type as CustomerType) || prev.customer_type,
          business_vertical: (intake.business_vertical as BusinessVertical) || prev.business_vertical,
          expected_decision_date: intake.expected_decision_date || '',
          priority: (intake.priority as PriorityLevel) || prev.priority,
          customer_contact: intake.customer_contact || '',
          customer_designation: intake.customer_designation || '',
          customer_email: intake.customer_email || '',
          customer_phone: intake.customer_phone || '',
          customer_location: intake.customer_location || '',
          plant_location: intake.plant_location || '',
          project_description: intake.project_description || '',
          requirement_summary: intake.requirement_summary || '',
          detailed_requirement: intake.detailed_requirement || intake.project_description || '',
          application: intake.application || '',
          industry_process: intake.industry_process || '',
          current_process: intake.current_process || '',
          expected_automation: intake.expected_automation || '',
          required_solution: intake.required_solution || '',
          customer_objective: intake.customer_objective || '',
          customer_challenge: intake.customer_challenge || '',
          competitor_information: intake.competitor_information || '',
          expected_project_timeline: intake.expected_project_timeline || '',
          customer_target_date: intake.customer_target_date || project.target_completion || '',
          production_quantity: intake.production_quantity || '',
          production_rate: intake.production_rate || '',
          cycle_time: intake.cycle_time || '',
          shift_pattern: intake.shift_pattern || '',
          operating_hours: intake.operating_hours || '',
          existing_equipment: intake.existing_equipment || '',
          existing_automation: intake.existing_automation || '',
          integration_requirements: intake.integration_requirements || '',
          technical_requirements: intake.technical_requirements || '',
          machine_dimensions: intake.machine_dimensions || '',
          payload: intake.payload || '',
          accuracy_requirement: intake.accuracy_requirement || '',
          environment_conditions: intake.environment_conditions || '',
          technical_specifications: intake.technical_specifications || '',
          technical_assumptions: intake.technical_assumptions || '',
          customer_dependencies: intake.customer_dependencies || '',
          customer_budget: intake.customer_budget || '',
          estimated_opportunity_value: intake.estimated_opportunity_value || '',
          currency: intake.currency || 'INR',
          expected_po_date: intake.expected_po_date || '',
          commercial_remarks: intake.commercial_remarks || '',
          additional_notes: intake.additional_notes || '',
          required_documents: intake.required_documents || '',
        }));
      })();
    }
  }, [currentUser, editId, router]);

  const payloadFromForm = (user: User) => ({
    id: projectIdRef.current || undefined,
    title: formData.title,
    customer_name: formData.customer_name,
    customer_type: formData.customer_type,
    business_vertical: formData.business_vertical,
    created_by: user.name,
    created_by_id: user.id,
    expected_decision_date: formData.expected_decision_date,
    priority: formData.priority,
    customer_contact: formData.customer_contact,
    customer_designation: formData.customer_designation,
    customer_email: formData.customer_email,
    customer_phone: formData.customer_phone,
    customer_location: formData.customer_location,
    plant_location: formData.plant_location,
    project_description: formData.project_description,
    requirement_summary: formData.requirement_summary,
    detailed_requirement: formData.detailed_requirement,
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
    currency: formData.currency,
    expected_po_date: formData.expected_po_date,
    commercial_remarks: formData.commercial_remarks,
    additional_notes: formData.additional_notes,
    required_documents: formData.required_documents,
    custom_fields: customFields.filter((field) => field.name.trim() || field.value.trim()),
  });

  const persistProject = async (user: User, action: 'draft' | 'submit') => {
    if (persistLock.current) return persistLock.current;
    persistLock.current = (async () => {
      const created = await ProjectsApi.create({ ...payloadFromForm(user), action });
      if (!created.ok || !created.project) {
        throw new Error(created.ok ? 'Unable to save the project.' : created.message || 'Unable to save the project.');
      }
      const id = created.project.id;
      projectIdRef.current = id;
      setProjectId(id);
      setProjectCode(created.project.code);
      setIntakeStatus(created.project.intake_status || '');
      setWorkflow(
        created.workflow || {
          step: 0,
          stage: action === 'submit' ? 'PM Review' : created.project.intake_status === 'RETURNED_TO_CREATOR' ? 'Returned to Creator' : 'Draft',
          status: action === 'submit' ? 'Submitted to PM' : created.project.intake_status === 'RETURNED_TO_CREATOR' ? 'Returned to Creator' : 'Draft',
          intake_status: created.project.intake_status || (action === 'submit' ? 'SUBMITTED_TO_PM' : 'DRAFT'),
        }
      );
      setReturnComment(created.project.intake_comment || '');
      router.replace(`/projects/create?id=${id}`);
      return id;
    })();
    try {
      return await persistLock.current;
    } finally {
      persistLock.current = null;
    }
  };

  const validateForCreate = () => {
    const result = validateLeadForm(formData, { submit: true });
    setFieldErrors(result.errors);
    setMissing(Object.keys(result.errors));
    if (result.list.length) {
      setValidationError(result.list[0].message);
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
      const id = await persistProject(currentUser, 'draft');
      if (!id) {
        setValidationError('Unable to save the draft. Please try again.');
        return;
      }
      setSuccessMessage(PROJECT_ACTION_SUCCESS.draftSaved);
      setMissing([]);
      setFieldErrors({});
      window.setTimeout(() => {
        setSuccessMessage((current) => (current === PROJECT_ACTION_SUCCESS.draftSaved ? null : current));
      }, 4000);
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Unable to save the draft. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async () => {
    if (!currentUser || !canCreateLead(currentUser)) {
      setValidationError('This action is not permitted for your role.');
      return;
    }
    if (!validateForCreate()) {
      setConfirmCreate(false);
      return;
    }
    setBusy(true);
    setValidationError(null);
    try {
      const id = await persistProject(currentUser, 'submit');
      if (!id) throw new Error('Unable to submit the project.');
      setSuccessMessage(PROJECT_ACTION_SUCCESS.submittedToPm);
      setConfirmCreate(false);
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Unable to submit the project. Please try again.');
      setConfirmCreate(false);
    } finally {
      setBusy(false);
    }
  };

  const submitted = intakeStatus === 'SUBMITTED_TO_PM';
  const returned = intakeStatus === 'RETURNED_TO_CREATOR';
  const editable = !intakeStatus || intakeStatus === 'DRAFT' || returned;

  const fieldError = (field: string) =>
    fieldErrors[field] ? <p className="mt-1 text-[11px] text-rose-400">{fieldErrors[field]}</p> : null;

  const addCustomField = () => {
    setCustomFields((current) => [...current, { id: `cf-${Date.now()}`, name: '', value: '' }]);
  };

  if (!currentUser) return null;

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
              <FolderKanban className="h-4 w-4" /> {projectId ? 'Edit Project' : 'Create New Project'}
            </div>
            <h1 className="mt-0.5 text-xl font-bold text-slate-100">Create Project Form</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {editable && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleSaveDraft()}
              className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4 text-slate-400" /> Save Draft
            </button>
          )}
          {editable && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (validateForCreate()) setConfirmCreate(true);
              }}
              className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-semibold text-white shadow-md transition-all hover:bg-cyan-500 disabled:opacity-50"
            >
              <Send className="h-4 w-4" /> {returned ? 'Resubmit to PM' : 'Submit to PM'}
            </button>
          )}
          {(submitted || (!editable && projectId)) && projectId && (
            <Link
              href={`/projects/${projectId}`}
              className="rounded-lg border border-cyan-700 px-4 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-950"
            >
              Open submitted project
            </Link>
          )}
        </div>
      </div>

      {validationError && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-800/80 bg-rose-950/80 p-4 text-xs text-rose-300">
          <AlertCircle className="h-5 w-5 shrink-0 text-rose-400" />
          <div>
            {missing.length > 0 && (
              <div className="font-bold">Please complete all required fields before submitting to PM.</div>
            )}
            <div className={missing.length > 0 ? 'mt-0.5' : 'font-bold'}>{validationError}</div>
          </div>
        </div>
      )}
      {(workflow || successMessage) && (
        <ProjectWorkflowBanner
          workflow={workflow}
          message={successMessage}
        />
      )}
      {returned && returnComment && (
        <div className="rounded-xl border border-amber-800 bg-amber-950/40 px-4 py-3 text-xs text-amber-100">
          <div className="font-bold">Returned to Creator</div>
          <p className="mt-1 text-amber-200">{returnComment}</p>
        </div>
      )}

      <form className="space-y-6 text-xs" onSubmit={(event) => event.preventDefault()}>
        <fieldset className="space-y-6" disabled={!editable}>
        <FormSection title="Section A — Basic Lead Information" hint={`Auto ID: ${projectCode}`}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block font-medium text-slate-400">Project ID (Auto)</label>
              <input type="text" disabled value={projectCode} className="w-full cursor-not-allowed rounded border border-slate-800 bg-slate-950 p-2 font-mono font-bold text-cyan-400" />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block font-semibold text-slate-300">Lead Title *</label>
              <input type="text" required value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="e.g. Vision inspection cell" className={fieldClass(missing.includes('title') || Boolean(fieldErrors.title))} />
              {fieldError('title')}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block font-semibold text-slate-300">Customer Name *</label>
              <input type="text" required value={formData.customer_name} onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })} placeholder="e.g. Customer company name" className={fieldClass(missing.includes('customer_name') || Boolean(fieldErrors.customer_name))} />
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
              <input type="text" value={formData.customer_designation} onChange={(e) => setFormData({ ...formData, customer_designation: e.target.value })} placeholder="e.g. Plant Manager" className={fieldClass(Boolean(fieldErrors.customer_designation))} />
              {fieldError('customer_designation')}
            </div>
            <div>
              <label className="mb-1 block font-semibold text-slate-300">Email Address *</label>
              <input type="email" value={formData.customer_email} onChange={(e) => setFormData({ ...formData, customer_email: e.target.value })} placeholder="name@company.com" className={fieldClass(Boolean(fieldErrors.customer_email))} />
              {fieldError('customer_email')}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block font-semibold text-slate-300">Phone Number *</label>
              <input type="text" inputMode="numeric" maxLength={10} value={formData.customer_phone} onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} placeholder="9876543210" className={fieldClass(Boolean(fieldErrors.customer_phone))} />
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

        <FormSection title="Section C — Additional Project Information">
          <div>
            <label className="mb-1 block font-semibold text-slate-300">Project Description *</label>
            <textarea rows={3} value={formData.project_description || formData.detailed_requirement} onChange={(e) => setFormData({ ...formData, project_description: e.target.value, detailed_requirement: e.target.value })} placeholder="Describe the project scope and what the customer wants to achieve" className={fieldClass(missing.includes('project_description'))} />
          </div>
          <div>
            <label className="mb-1 block font-semibold text-slate-300">Customer Requirement *</label>
              <input type="text" value={formData.requirement_summary} onChange={(e) => setFormData({ ...formData, requirement_summary: e.target.value })} placeholder="High-level summary of the customer requirement" className={fieldClass(missing.includes('requirement_summary') || Boolean(fieldErrors.requirement_summary))} />
              {fieldError('requirement_summary')}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block font-semibold text-slate-300">Application / Use Case *</label>
              <input type="text" value={formData.application} onChange={(e) => setFormData({ ...formData, application: e.target.value })} placeholder="e.g. Surface inspection" className={fieldClass(missing.includes('application') || Boolean(fieldErrors.application))} />
              {fieldError('application')}
            </div>
            <div>
              <label className="mb-1 block font-semibold text-slate-300">Production Quantity *</label>
              <input type="text" inputMode="decimal" value={formData.production_quantity} onChange={(e) => setFormData({ ...formData, production_quantity: e.target.value })} placeholder="1500" className={fieldClass(Boolean(fieldErrors.production_quantity))} />
              {fieldError('production_quantity')}
            </div>
          </div>
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
            {customFields.length === 0 && <p className="text-slate-500">Add project-specific fields such as machine type, production volume, or line details.</p>}
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
            entityType="PROJECT"
            entityId={projectId || undefined}
            canEdit={editable}
            ensureEntity={async () => {
              if (!currentUser) return null;
              return persistProject(currentUser, 'draft');
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
        </fieldset>
      </form>

      <CreateProjectModal open={confirmCreate} busy={busy} onCancel={() => setConfirmCreate(false)} onConfirm={() => void handleCreate()} />
    </div>
  );
}

export default function CreateProjectPage() {
  return (
    <Suspense fallback={<div className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-xs text-slate-400">Loading project form…</div>}>
      <CreateProjectForm />
    </Suspense>
  );
}
