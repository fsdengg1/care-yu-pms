import { apiRequest } from './api';
import { StorageService } from './storage';
import {
  FeasibilityStudy,
  FeasibilityTeamAssignment,
  Lead,
  LeadWorkflowPayload,
  MyWorkItem,
  CostingRecord,
  QuotationRecord,
} from './types';

export interface BusinessHeadDashboard {
  pipelineValue: number;
  activeOpportunities: number;
  technicalReview: number;
  commercialProposals: number;
  returned: number;
  drafts: number;
  quotationReady: number;
  negotiations: number;
  leads: Lead[];
}

function syncPayload(payload: LeadWorkflowPayload) {
  StorageService.upsertLead(payload.lead);
  if (payload.documents) {
    StorageService.replaceLeadDocuments(payload.lead.id, payload.documents);
  }
  if (payload.assignments?.length) {
    const existing = StorageService.getFeasibilityTeamAssignments().filter((item) => item.lead_id !== payload.lead.id);
    StorageService.saveFeasibilityTeamAssignments([...payload.assignments, ...existing]);
  }
  return payload;
}

async function call<T>(path: string, options?: RequestInit) {
  return apiRequest<T>(path, options);
}

export const LeadApi = {
  async list(): Promise<Lead[]> {
    const result = await call<{ leads: Lead[]; assignments?: FeasibilityTeamAssignment[] }>('/api/leads');
    if (!result.ok) return [];
    StorageService.saveLeads(result.data.leads);
    if (result.data.assignments) {
      StorageService.saveFeasibilityTeamAssignments(result.data.assignments);
    }
    return result.data.leads;
  },

  async get(id: string): Promise<LeadWorkflowPayload | null> {
    const result = await call<LeadWorkflowPayload>(`/api/leads/${id}`);
    if (result.ok) return syncPayload(result.data);
    const lead = StorageService.getLeadById(id);
    if (!lead) return null;
    return {
      lead,
      documents: StorageService.getLeadDocuments(lead.id),
      comments: StorageService.getLeadComments(lead.id),
      activities: StorageService.getLeadActivities(lead.id),
      history: StorageService.getLeadStatusHistory(lead.id),
      assignments: StorageService.getFeasibilityTeamAssignmentsByLeadId(lead.id),
      allocations: StorageService.getFeasibilityAllocationsByLeadId(lead.id),
      teams: StorageService.getTeams(),
      users: StorageService.getUsers(),
    };
  },

  async create(body: Partial<Lead>) {
    const result = await call<LeadWorkflowPayload>('/api/leads', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (result.ok) return { ok: true as const, payload: syncPayload(result.data) };
    return { ok: false as const, message: result.message, errors: result.errors, status: result.status };
  },

  async update(id: string, body: Partial<Lead>) {
    const result = await call<LeadWorkflowPayload>(`/api/leads/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    if (result.ok) return { ok: true as const, payload: syncPayload(result.data) };
    return { ok: false as const, message: result.message, errors: result.errors, status: result.status };
  },

  async submit(id: string, body: Partial<Lead> = {}) {
    const result = await call<LeadWorkflowPayload>(`/api/leads/${id}/submit`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (result.ok) return { ok: true as const, payload: syncPayload(result.data) };
    return { ok: false as const, message: result.message, errors: result.errors, status: result.status };
  },

  async accept(id: string, body: { team_id: string; team_lead_id?: string; notes?: string }) {
    const result = await call<LeadWorkflowPayload>(`/api/leads/${id}/accept`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (result.ok) return { ok: true as const, payload: syncPayload(result.data) };
    return { ok: false as const, message: result.message, status: result.status };
  },

  async forward(id: string, body: { responsible_user_id: string; reason?: string }) {
    const result = await call<LeadWorkflowPayload>(`/api/leads/${id}/forward`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (result.ok) return syncPayload(result.data);
    return result;
  },

  async pmReview(id: string, body: {
    action: 'approve' | 'approve_assign' | 'return';
    team_id?: string;
    team_ids?: string[];
    team_lead_id?: string;
    assignees?: Record<string, string>;
    notes?: string;
    reason?: string;
  }) {
    const result = await call<LeadWorkflowPayload>(`/api/leads/${id}/pm-review`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (result.ok) return { ok: true as const, payload: syncPayload(result.data) };
    return { ok: false as const, message: result.message, status: result.status };
  },

  async teamIntake(id: string, action: 'accept' | 'return', comments?: string) {
    const result = await call<LeadWorkflowPayload>(`/api/leads/${id}/team-intake`, {
      method: 'POST',
      body: JSON.stringify({ action, comments }),
    });
    if (result.ok) return { ok: true as const, payload: syncPayload(result.data) };
    return { ok: false as const, message: result.message, status: result.status };
  },

  async saveFeasibility(id: string, study: Partial<FeasibilityStudy>, submit = false, start = false) {
    const result = await call<LeadWorkflowPayload>(`/api/leads/${id}/feasibility`, {
      method: 'POST',
      body: JSON.stringify({ study, submit, start }),
    });
    if (result.ok) return { ok: true as const, payload: syncPayload(result.data) };
    return { ok: false as const, message: result.message || (submit ? 'Unable to submit feasibility.' : 'Unable to save feasibility.') };
  },

  async reviewFeasibility(id: string, action: 'approve' | 'return' | 'reject', reason?: string) {
    const result = await call<LeadWorkflowPayload>(`/api/leads/${id}/feasibility/review`, {
      method: 'POST',
      body: JSON.stringify({ action, reason }),
    });
    if (result.ok) return { ok: true as const, payload: syncPayload(result.data) };
    return { ok: false as const, message: result.message, status: result.status };
  },

  async saveCosting(id: string, costing: Partial<CostingRecord>, submit = false) {
    const result = await call<LeadWorkflowPayload>(`/api/leads/${id}/costing`, {
      method: 'POST',
      body: JSON.stringify({ costing, submit }),
    });
    if (result.ok) return syncPayload(result.data);
    return null;
  },

  async reviewCosting(id: string, action: 'approve' | 'return' | 'reject', reason?: string) {
    const result = await call<LeadWorkflowPayload>(`/api/leads/${id}/costing/review`, {
      method: 'POST',
      body: JSON.stringify({ action, reason }),
    });
    if (result.ok) return { ok: true as const, payload: syncPayload(result.data) };
    return { ok: false as const, message: result.message, status: result.status };
  },

  async saveQuotation(id: string, quotation: Partial<QuotationRecord>, send = false) {
    const result = await call<LeadWorkflowPayload>(`/api/leads/${id}/quotation`, {
      method: 'POST',
      body: JSON.stringify({ quotation, send }),
    });
    if (result.ok) return syncPayload(result.data);
    return null;
  },

  async submitQuotationToCustomer(id: string, body: { method: string; submitted_date?: string; remarks?: string }) {
    const result = await call<LeadWorkflowPayload>(`/api/leads/${id}/quotation/submit-to-customer`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (result.ok) return { ok: true as const, payload: syncPayload(result.data) };
    return { ok: false as const, message: result.message };
  },

  async requestQuotationRevision(id: string, reason: string) {
    const result = await call<LeadWorkflowPayload>(`/api/leads/${id}/quotation/request-revision`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    if (result.ok) return { ok: true as const, payload: syncPayload(result.data) };
    return { ok: false as const, message: result.message };
  },

  async assignVisitTeam(id: string, userIds: string[]) {
    const result = await call<LeadWorkflowPayload>(`/api/leads/${id}/visit/assign`, {
      method: 'POST',
      body: JSON.stringify({ user_ids: userIds }),
    });
    if (result.ok) return syncPayload(result.data);
    return null;
  },

  async scheduleVisit(id: string, body: { scheduled_date?: string; scheduled_time?: string; status?: string }) {
    const result = await call<LeadWorkflowPayload>(`/api/leads/${id}/visit/schedule`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (result.ok) return syncPayload(result.data);
    return null;
  },

  async negotiation(id: string, body: Record<string, unknown>) {
    const result = await call<LeadWorkflowPayload>(`/api/leads/${id}/negotiation`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (result.ok) return syncPayload(result.data);
    return null;
  },

  async convert(id: string) {
    const result = await call<LeadWorkflowPayload>(`/api/leads/${id}/convert`, { method: 'POST', body: '{}' });
    if (result.ok) return syncPayload(result.data);
    return null;
  },

  async addDocument(id: string, body: {
    file_name: string;
    category: string;
    file_type?: string;
    file_size?: string;
    file_url?: string;
    mime_type?: string;
  }) {
    const result = await call<LeadWorkflowPayload & { document?: import('./types').LeadDocument }>(`/api/leads/${id}/documents`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (result.ok) return syncPayload(result.data);
    const user = StorageService.getCurrentUser();
    const lead = StorageService.getLeadById(id);
    if (!user || !lead) return null;
    StorageService.addLeadDocument({
      lead_id: id,
      file_name: body.file_name,
      file_type: body.file_type || 'Document',
      file_size: body.file_size || '—',
      uploaded_by: user.name,
      uploaded_by_id: user.id,
      category: (body.category as import('./types').LeadDocument['category']) || 'Other',
      file_url: body.file_url,
      mime_type: body.mime_type,
      upload_status: 'UPLOADED',
    });
    return {
      lead,
      documents: StorageService.getLeadDocuments(id),
    } as LeadWorkflowPayload;
  },

  async deleteDocument(id: string, documentId: string) {
    const result = await call<LeadWorkflowPayload>(`/api/leads/${id}/documents/${documentId}`, {
      method: 'DELETE',
    });
    if (result.ok) return syncPayload(result.data);
    StorageService.removeLeadDocument(id, documentId);
    const lead = StorageService.getLeadById(id);
    if (!lead) return null;
    return {
      lead,
      documents: StorageService.getLeadDocuments(id),
    } as LeadWorkflowPayload;
  },

  async documentFile(id: string, documentId: string) {
    const result = await call<{ document: import('./types').LeadDocument }>(`/api/leads/${id}/documents/${documentId}/file`);
    if (result.ok) return result.data;
    return { message: result.message };
  },

  async myWork(): Promise<{ items: MyWorkItem[]; groups: Record<string, MyWorkItem[]> }> {
    const result = await call<{ items: MyWorkItem[]; groups: Record<string, MyWorkItem[]> }>('/api/leads/my-work');
    if (result.ok) return result.data;
    return { items: [], groups: {} };
  },

  async cancel(id: string, reason: string) {
    const result = await call<LeadWorkflowPayload>(`/api/leads/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    if (result.ok) return { ok: true as const, ...syncPayload(result.data) };
    return result;
  },

  async pmDashboard(): Promise<{
    pendingPmReview: number;
    feasibilityPending: number;
    procurementPending: number;
    returnedToSales: number;
    pendingReviews: Array<{
      id: string;
      lead_number: string;
      customer_name: string;
      title: string;
      business_vertical: string;
      sales_owner: string;
      priority: string;
      lead_date?: string;
      submitted_at?: string;
      status: string;
      href: string;
    }>;
  } | null> {
    const result = await call<{
      pendingPmReview: number;
      feasibilityPending: number;
      procurementPending: number;
      returnedToSales: number;
      pendingReviews: Array<{
        id: string;
        lead_number: string;
        customer_name: string;
        title: string;
        business_vertical: string;
        sales_owner: string;
        priority: string;
        lead_date?: string;
        submitted_at?: string;
        status: string;
        href: string;
      }>;
    }>('/api/dashboard/pm');
    if (result.ok) return result.data;
    return null;
  },

  async businessHeadDashboard(): Promise<BusinessHeadDashboard | null> {
    const result = await call<BusinessHeadDashboard>('/api/dashboard/business-head');
    if (result.ok) return result.data;
    return null;
  },

  async teams(): Promise<{ id: string; name: string; team_lead_id?: string; team_lead_name?: string }[]> {
    const result = await call<{ teams: FeasibilityTeamAssignment[] }>('/api/teams');
    if (!result.ok) return StorageService.getTeams();
    return result.data.teams as unknown as { id: string; name: string; team_lead_id?: string; team_lead_name?: string }[];
  },
};
