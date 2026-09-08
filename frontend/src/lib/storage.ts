import { INITIAL_USERS, INITIAL_ROLES, INITIAL_TEAMS } from './seedData';
import {
  User,
  Role,
  Team,
  AuditLog,
  NotificationItem,
  Lead,
  LeadActivity,
  LeadComment,
  LeadStatusHistory,
  LeadDocument,
  LeadEngineeringView,
  FeasibilityTeamAssignment,
  FeasibilityEmployeeAllocation,
  FeasibilitySuggestion,
  Task,
} from './types';

// v6 — Phase 3A Architecture Correction (Lead-centric multi-team feasibility)
const STORAGE_KEYS = {
  USERS: 'cya_users_v10',
  ROLES: 'cya_roles_v6',
  TEAMS: 'cya_teams_v8',
  AUDITS: 'cya_audits_v7',
  NOTIFS: 'cya_notifs_v7',
  CURRENT_USER: 'cya_current_user_v6',
  AUTH_TOKEN: 'cya_auth_token_v6',
  SETUP_TOKEN: 'cya_password_setup_token',
  LEADS: 'cya_leads_v7',
  LEAD_ACTIVITIES: 'cya_lead_activities_v7',
  LEAD_COMMENTS: 'cya_lead_comments_v7',
  LEAD_STATUS_HISTORY: 'cya_lead_history_v7',
  LEAD_DOCUMENTS: 'cya_lead_documents_v7',
  FEASIBILITY_TEAM_ASSIGNMENTS: 'cya_fta_v7',
  FEASIBILITY_EMPLOYEE_ALLOCATIONS: 'cya_fea_v7',
  FEASIBILITY_SUGGESTIONS: 'cya_fs_v7',
  TASKS: 'cya_tasks_v7',
};

const RETIRED_DEMO_USER_IDS = new Set([
  'u-ceo',
  'u-bh',
  'u-ed',
  'u-robotlead1',
  'u-emp-sw',
  'u-emp-sw-2',
  'u-emp-sw-3',
  'u-emp-vis-1',
  'u-emp-vis-2',
  'u-emp-rob-1',
  'u-emp-rob-2',
  'u-emp-rob-3',
  'u-emp-rob-4',
  'u-tl-proc',
  'u-emp-proc-1',
  'u-emp-proc-2',
  'u-tl-exec',
  'u-emp-exec-1',
  'u-emp-exec-2',
  'u-emp-exec-3',
  'u-emp-exec-4',
  'u-emp-exec-5',
]);

export class StorageService {
  private static isBrowser = typeof window !== 'undefined';

  // ============================================================
  // USERS
  // ============================================================
  static getUsers(): User[] {
    if (!this.isBrowser) return INITIAL_USERS.filter((user) => !RETIRED_DEMO_USER_IDS.has(user.id));
    const stored = localStorage.getItem(STORAGE_KEYS.USERS);
    const seedUsers = INITIAL_USERS.filter((user) => !RETIRED_DEMO_USER_IDS.has(user.id));
    if (!stored) {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(seedUsers));
      return seedUsers;
    }
    const parsed: User[] = JSON.parse(stored);
    const seedById = new Map(INITIAL_USERS.map((u) => [u.id, u]));
    const named = new Set<string>();
    const overlayed = parsed
      .filter((user) => !RETIRED_DEMO_USER_IDS.has(user.id))
      .map((user) => {
        const seed = seedById.get(user.id);
        if (!seed || !named.has(user.id)) return user;
        return { ...user, name: seed.name, role_name: seed.role_name, role_code: seed.role_code };
      });
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(overlayed));
    return overlayed;
  }

  static saveUsers(users: User[]) {
    if (this.isBrowser) localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  }

  // ============================================================
  // ROLES & TEAMS
  // ============================================================
  static getRoles(): Role[] {
    if (!this.isBrowser) return INITIAL_ROLES;
    const stored = localStorage.getItem(STORAGE_KEYS.ROLES);
    if (!stored) {
      localStorage.setItem(STORAGE_KEYS.ROLES, JSON.stringify(INITIAL_ROLES));
      return INITIAL_ROLES;
    }
    const parsed: Role[] = JSON.parse(stored);
    const knownIds = new Set(parsed.map((r) => r.id));
    const missing = INITIAL_ROLES.filter((r) => !knownIds.has(r.id));
    if (missing.length === 0) return parsed;
    const merged = [...parsed, ...missing];
    localStorage.setItem(STORAGE_KEYS.ROLES, JSON.stringify(merged));
    return merged;
  }

  static getTeams(): Team[] {
    if (!this.isBrowser) return INITIAL_TEAMS;
    const stored = localStorage.getItem(STORAGE_KEYS.TEAMS);
    if (!stored) {
      localStorage.setItem(STORAGE_KEYS.TEAMS, JSON.stringify(INITIAL_TEAMS));
      return INITIAL_TEAMS;
    }
    const parsed: Team[] = JSON.parse(stored);
    const seedById = new Map(INITIAL_TEAMS.map((team) => [team.id, team]));
    const overlayed = parsed.map((team) => {
      const seed = seedById.get(team.id);
      return seed
        ? {
            ...team,
            name: seed.name,
            code: seed.code,
            description: seed.description,
            team_lead_id: seed.team_lead_id,
            team_lead_name: seed.team_lead_name,
          }
        : team;
    });
    const knownIds = new Set(overlayed.map((team) => team.id));
    const missing = INITIAL_TEAMS.filter((team) => !knownIds.has(team.id));
    const merged = missing.length === 0 ? overlayed : [...overlayed, ...missing];
    localStorage.setItem(STORAGE_KEYS.TEAMS, JSON.stringify(merged));
    return merged;
  }

  static saveTeams(teams: Team[]) {
    if (this.isBrowser) localStorage.setItem(STORAGE_KEYS.TEAMS, JSON.stringify(teams));
  }

  // ============================================================
  // AUDIT LOG
  // ============================================================
  static getAudits(): AuditLog[] {
    if (!this.isBrowser) return [];
    const stored = localStorage.getItem(STORAGE_KEYS.AUDITS);
    return stored ? JSON.parse(stored) : [];
  }

  static logAudit(audit: Omit<AuditLog, 'id' | 'created_at'>) {
    const audits = this.getAudits();
    const newLog: AuditLog = { ...audit, id: `log-${Date.now()}`, created_at: new Date().toISOString() };
    audits.unshift(newLog);
    if (this.isBrowser) localStorage.setItem(STORAGE_KEYS.AUDITS, JSON.stringify(audits));
    return newLog;
  }

  // ============================================================
  // NOTIFICATIONS
  // ============================================================
  static getNotifications(recipientId?: string): NotificationItem[] {
    if (!this.isBrowser) return [];
    const stored = localStorage.getItem(STORAGE_KEYS.NOTIFS);
    const notifs: NotificationItem[] = stored ? JSON.parse(stored) : [];
    const active = notifs.filter((n) => !n.is_cleared);
    if (recipientId) return active.filter((n) => n.recipient_id === recipientId || recipientId === 'u-ceo');
    return active;
  }

  static sendNotification(notif: Omit<NotificationItem, 'id' | 'created_at' | 'read_status'>) {
    const notifs = this.getNotifications();
    const newNotif: NotificationItem = {
      ...notif,
      id: `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      read_status: false,
      created_at: new Date().toISOString(),
    };
    notifs.unshift(newNotif);
    if (this.isBrowser) localStorage.setItem(STORAGE_KEYS.NOTIFS, JSON.stringify(notifs));
    return newNotif;
  }

  static clearNotifications(recipientId?: string) {
    if (!this.isBrowser) return;
    if (!recipientId) {
      localStorage.removeItem(STORAGE_KEYS.NOTIFS);
      return;
    }
    const stored = localStorage.getItem(STORAGE_KEYS.NOTIFS);
    if (!stored) return;
    const notifs: NotificationItem[] = JSON.parse(stored);
    const remaining = notifs.filter((n) => n.recipient_id !== recipientId && recipientId !== 'u-ceo');
    localStorage.setItem(STORAGE_KEYS.NOTIFS, JSON.stringify(remaining));
  }

  // ============================================================
  // CURRENT USER SESSION
  // ============================================================
  static getCurrentUser(): User | null {
    if (!this.isBrowser) return null;
    const session = sessionStorage.getItem(STORAGE_KEYS.CURRENT_USER);
    if (session) return JSON.parse(session);
    const stored = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
    return stored ? JSON.parse(stored) : null;
  }

  static setCurrentUser(user: User, remember = true) {
    if (!this.isBrowser) return;
    const payload = JSON.stringify(user);
    if (remember) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, payload);
      sessionStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    } else {
      sessionStorage.setItem(STORAGE_KEYS.CURRENT_USER, payload);
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    }
  }

  static clearCurrentUser() {
    if (!this.isBrowser) return;
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    sessionStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    this.clearAuthToken();
    this.clearPasswordSetupToken();
  }

  static getAuthToken(): string | null {
    if (!this.isBrowser) return null;
    return sessionStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
  }

  static setAuthToken(token: string, remember = true) {
    if (!this.isBrowser) return;
    if (remember) {
      localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
      sessionStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
    } else {
      sessionStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
      localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
    }
  }

  static clearAuthToken() {
    if (!this.isBrowser) return;
    localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
    sessionStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
  }

  static getPasswordSetupToken(): string | null {
    if (!this.isBrowser) return null;
    return sessionStorage.getItem(STORAGE_KEYS.SETUP_TOKEN);
  }

  static setPasswordSetupToken(token: string) {
    if (!this.isBrowser) return;
    sessionStorage.setItem(STORAGE_KEYS.SETUP_TOKEN, token);
  }

  static clearPasswordSetupToken() {
    if (!this.isBrowser) return;
    sessionStorage.removeItem(STORAGE_KEYS.SETUP_TOKEN);
  }

  // ============================================================
  // LEADS
  // ============================================================
  static getLeads(): Lead[] {
    if (!this.isBrowser) return [];
    const stored = localStorage.getItem(STORAGE_KEYS.LEADS);
    return stored ? JSON.parse(stored) : [];
  }

  static getLeadById(id: string): Lead | undefined {
    return this.getLeads().find(l => l.id === id || l.lead_number === id);
  }

  static saveLeads(leads: Lead[]) {
    if (this.isBrowser) localStorage.setItem(STORAGE_KEYS.LEADS, JSON.stringify(leads));
  }

  static upsertLead(lead: Lead): Lead {
    const leads = this.getLeads();
    const index = leads.findIndex((item) => item.id === lead.id || item.lead_number === lead.lead_number);
    if (index === -1) leads.unshift(lead);
    else leads[index] = { ...leads[index], ...lead };
    this.saveLeads(leads);
    return lead;
  }

  static generateLeadNumber(): string {
    const leads = this.getLeads();
    const count = leads.length + 1;
    return `LD-2026-${String(count).padStart(4, '0')}`;
  }

  static createLead(leadData: Omit<Lead, 'id' | 'lead_number' | 'created_at' | 'updated_at'>): Lead {
    const leads = this.getLeads();
    const newLead: Lead = {
      ...leadData,
      id: `lead-${Date.now()}`,
      lead_number: this.generateLeadNumber(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    leads.unshift(newLead);
    this.saveLeads(leads);
    this.addLeadStatusHistory({
      lead_id: newLead.id,
      old_status: 'DRAFT',
      new_status: newLead.status,
      changed_by: newLead.created_by,
      changed_by_id: newLead.created_by_id,
      reason: 'Initial Lead creation',
    });
    return newLead;
  }

  static updateLead(id: string, updates: Partial<Lead>, currentUserId: string, currentUserName: string): Lead {
    const leads = this.getLeads();
    const index = leads.findIndex(l => l.id === id);
    if (index === -1) throw new Error('Lead not found');
    const oldLead = leads[index];
    const updatedLead: Lead = { ...oldLead, ...updates, updated_at: new Date().toISOString() };
    if (updates.status && updates.status !== oldLead.status) {
      this.addLeadStatusHistory({
        lead_id: id,
        old_status: oldLead.status,
        new_status: updates.status,
        changed_by: currentUserName,
        changed_by_id: currentUserId,
        reason: updates.pm_return_reason || 'Status updated',
      });
    }
    leads[index] = updatedLead;
    this.saveLeads(leads);
    return updatedLead;
  }

  // ============================================================
  // LEAD ENGINEERING VIEW (field-level permission filter)
  // Returns only the engineering-safe fields — no contact, no commercial.
  // ============================================================
  static getLeadEngineeringView(leadId: string): LeadEngineeringView | null {
    const lead = this.getLeadById(leadId);
    if (!lead) return null;
    const docs = this.getLeadDocuments(leadId).filter(d =>
      ['Customer Drawing', 'Technical Specification', 'Layout', 'Images', 'Videos',
        'Existing Machine Photos', 'Sample Information', 'RFQ', 'Other'].includes(d.category)
    );
    return {
      lead_id: lead.id,
      lead_number: lead.lead_number,
      title: lead.title,
      customer_name: lead.customer_name,
      priority: lead.priority,
      business_vertical: lead.business_vertical,
      requirement_summary: lead.requirement_summary,
      detailed_requirement: lead.detailed_requirement,
      application: lead.application,
      industry_process: lead.industry_process,
      current_process: lead.current_process,
      expected_automation: lead.expected_automation,
      customer_objective: lead.customer_objective,
      expected_project_timeline: lead.expected_project_timeline,
      customer_target_date: lead.customer_target_date,
      production_quantity: lead.production_quantity,
      production_rate: lead.production_rate,
      cycle_time: lead.cycle_time,
      shift_pattern: lead.shift_pattern,
      operating_hours: lead.operating_hours,
      existing_equipment: lead.existing_equipment,
      existing_automation: lead.existing_automation,
      integration_requirements: lead.integration_requirements,
      technical_requirements: lead.technical_requirements,
      machine_dimensions: lead.machine_dimensions,
      payload: lead.payload,
      accuracy_requirement: lead.accuracy_requirement,
      environment_conditions: lead.environment_conditions,
      technical_specifications: lead.technical_specifications,
      technical_assumptions: lead.technical_assumptions,
      customer_dependencies: lead.customer_dependencies,
      documents: docs,
    };
  }

  // ============================================================
  // LEAD ACTIVITIES / COMMENTS / HISTORY / DOCUMENTS
  // ============================================================
  static getLeadActivities(leadId: string): LeadActivity[] {
    if (!this.isBrowser) return [];
    const stored = localStorage.getItem(STORAGE_KEYS.LEAD_ACTIVITIES);
    const all: LeadActivity[] = stored ? JSON.parse(stored) : [];
    return all.filter(a => a.lead_id === leadId);
  }

  static addLeadActivity(activity: Omit<LeadActivity, 'id' | 'created_at'>): LeadActivity {
    if (!this.isBrowser) throw new Error('Browser runtime required');
    const stored = localStorage.getItem(STORAGE_KEYS.LEAD_ACTIVITIES);
    const all: LeadActivity[] = stored ? JSON.parse(stored) : [];
    const newAct: LeadActivity = { ...activity, id: `act-${Date.now()}`, created_at: new Date().toISOString() };
    all.unshift(newAct);
    localStorage.setItem(STORAGE_KEYS.LEAD_ACTIVITIES, JSON.stringify(all));
    return newAct;
  }

  static getLeadComments(leadId: string): LeadComment[] {
    if (!this.isBrowser) return [];
    const stored = localStorage.getItem(STORAGE_KEYS.LEAD_COMMENTS);
    const all: LeadComment[] = stored ? JSON.parse(stored) : [];
    return all.filter(c => c.lead_id === leadId);
  }

  static addLeadComment(comment: Omit<LeadComment, 'id' | 'created_at'>): LeadComment {
    if (!this.isBrowser) throw new Error('Browser runtime required');
    const stored = localStorage.getItem(STORAGE_KEYS.LEAD_COMMENTS);
    const all: LeadComment[] = stored ? JSON.parse(stored) : [];
    const newComm: LeadComment = { ...comment, id: `comm-${Date.now()}`, created_at: new Date().toISOString() };
    all.unshift(newComm);
    localStorage.setItem(STORAGE_KEYS.LEAD_COMMENTS, JSON.stringify(all));
    return newComm;
  }

  static getLeadStatusHistory(leadId: string): LeadStatusHistory[] {
    if (!this.isBrowser) return [];
    const stored = localStorage.getItem(STORAGE_KEYS.LEAD_STATUS_HISTORY);
    const all: LeadStatusHistory[] = stored ? JSON.parse(stored) : [];
    return all.filter(h => h.lead_id === leadId);
  }

  static addLeadStatusHistory(history: Omit<LeadStatusHistory, 'id' | 'created_at'>): LeadStatusHistory {
    if (!this.isBrowser) throw new Error('Browser runtime required');
    const stored = localStorage.getItem(STORAGE_KEYS.LEAD_STATUS_HISTORY);
    const all: LeadStatusHistory[] = stored ? JSON.parse(stored) : [];
    const newHist: LeadStatusHistory = { ...history, id: `hist-${Date.now()}`, created_at: new Date().toISOString() };
    all.unshift(newHist);
    localStorage.setItem(STORAGE_KEYS.LEAD_STATUS_HISTORY, JSON.stringify(all));
    return newHist;
  }

  static getLeadDocuments(leadId: string): LeadDocument[] {
    if (!this.isBrowser) return [];
    const stored = localStorage.getItem(STORAGE_KEYS.LEAD_DOCUMENTS);
    const all: LeadDocument[] = stored ? JSON.parse(stored) : [];
    return all.filter(d => d.lead_id === leadId);
  }

  static addLeadDocument(doc: Omit<LeadDocument, 'id' | 'upload_date'>): LeadDocument {
    if (!this.isBrowser) throw new Error('Browser runtime required');
    const stored = localStorage.getItem(STORAGE_KEYS.LEAD_DOCUMENTS);
    const all: LeadDocument[] = stored ? JSON.parse(stored) : [];
    const newDoc: LeadDocument = { ...doc, id: `doc-${Date.now()}`, upload_date: new Date().toISOString() };
    all.unshift(newDoc);
    localStorage.setItem(STORAGE_KEYS.LEAD_DOCUMENTS, JSON.stringify(all));
    return newDoc;
  }

  static replaceLeadDocuments(leadId: string, documents: LeadDocument[]) {
    if (!this.isBrowser) return;
    const stored = localStorage.getItem(STORAGE_KEYS.LEAD_DOCUMENTS);
    const all: LeadDocument[] = stored ? JSON.parse(stored) : [];
    const others = all.filter((item) => item.lead_id !== leadId);
    localStorage.setItem(STORAGE_KEYS.LEAD_DOCUMENTS, JSON.stringify([...documents, ...others]));
  }

  static removeLeadDocument(leadId: string, documentId: string) {
    if (!this.isBrowser) return;
    const stored = localStorage.getItem(STORAGE_KEYS.LEAD_DOCUMENTS);
    const all: LeadDocument[] = stored ? JSON.parse(stored) : [];
    localStorage.setItem(
      STORAGE_KEYS.LEAD_DOCUMENTS,
      JSON.stringify(all.filter((item) => !(item.id === documentId && item.lead_id === leadId)))
    );
  }

  // ============================================================
  // FEASIBILITY TEAM ASSIGNMENTS
  // One Lead → Many FeasibilityTeamAssignments
  // ============================================================
  static getFeasibilityTeamAssignments(): FeasibilityTeamAssignment[] {
    if (!this.isBrowser) return [];
    const stored = localStorage.getItem(STORAGE_KEYS.FEASIBILITY_TEAM_ASSIGNMENTS);
    return stored ? JSON.parse(stored) : [];
  }

  static getFeasibilityTeamAssignmentById(id: string): FeasibilityTeamAssignment | undefined {
    return this.getFeasibilityTeamAssignments().find(fa => fa.id === id);
  }

  /** Get all team assignments for a specific Lead */
  static getFeasibilityTeamAssignmentsByLeadId(leadId: string): FeasibilityTeamAssignment[] {
    return this.getFeasibilityTeamAssignments().filter(fa => fa.lead_id === leadId);
  }

  /** Check if a team is already assigned to a Lead (deduplication guard) */
  static isTeamAlreadyAssignedToLead(leadId: string, teamId: string): boolean {
    return this.getFeasibilityTeamAssignments().some(
      fa => fa.lead_id === leadId && fa.team_id === teamId && fa.status !== 'CANCELLED'
    );
  }

  /** Get all assignments where this TL is the team lead, or that belong to their team */
  static getFeasibilityTeamAssignmentsForTeamLead(teamLeadId: string, teamId?: string): FeasibilityTeamAssignment[] {
    return this.getFeasibilityTeamAssignments().filter(
      (fa) => fa.team_lead_id === teamLeadId || Boolean(teamId && fa.team_id === teamId)
    );
  }

  /** Get all assignments for a team */
  static getFeasibilityTeamAssignmentsByTeamId(teamId: string): FeasibilityTeamAssignment[] {
    return this.getFeasibilityTeamAssignments().filter(fa => fa.team_id === teamId);
  }

  static saveFeasibilityTeamAssignments(assignments: FeasibilityTeamAssignment[]) {
    if (this.isBrowser)
      localStorage.setItem(STORAGE_KEYS.FEASIBILITY_TEAM_ASSIGNMENTS, JSON.stringify(assignments));
  }

  static createFeasibilityTeamAssignment(
    data: Omit<FeasibilityTeamAssignment, 'id' | 'created_at' | 'updated_at'>
  ): FeasibilityTeamAssignment {
    const list = this.getFeasibilityTeamAssignments();
    const newAssignment: FeasibilityTeamAssignment = {
      ...data,
      id: `fta-${Date.now()}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    list.unshift(newAssignment);
    this.saveFeasibilityTeamAssignments(list);
    return newAssignment;
  }

  static updateFeasibilityTeamAssignment(
    id: string,
    updates: Partial<FeasibilityTeamAssignment>
  ): FeasibilityTeamAssignment {
    const list = this.getFeasibilityTeamAssignments();
    const index = list.findIndex(fa => fa.id === id);
    if (index === -1) throw new Error('FeasibilityTeamAssignment not found');
    const updated = { ...list[index], ...updates, updated_at: new Date().toISOString() };
    list[index] = updated;
    this.saveFeasibilityTeamAssignments(list);
    return updated;
  }

  // ============================================================
  // FEASIBILITY EMPLOYEE ALLOCATIONS
  // One FeasibilityTeamAssignment → Many FeasibilityEmployeeAllocations
  // ============================================================
  static getFeasibilityEmployeeAllocations(): FeasibilityEmployeeAllocation[] {
    if (!this.isBrowser) return [];
    const stored = localStorage.getItem(STORAGE_KEYS.FEASIBILITY_EMPLOYEE_ALLOCATIONS);
    return stored ? JSON.parse(stored) : [];
  }

  static getFeasibilityAllocationsByAssignmentId(assignmentId: string): FeasibilityEmployeeAllocation[] {
    return this.getFeasibilityEmployeeAllocations().filter(
      al => al.feasibility_team_assignment_id === assignmentId
    );
  }

  static getFeasibilityAllocationsByEmployeeId(employeeId: string): FeasibilityEmployeeAllocation[] {
    return this.getFeasibilityEmployeeAllocations().filter(al => al.employee_id === employeeId);
  }

  static getFeasibilityAllocationsByLeadId(leadId: string): FeasibilityEmployeeAllocation[] {
    return this.getFeasibilityEmployeeAllocations().filter(al => al.lead_id === leadId);
  }

  static saveFeasibilityEmployeeAllocations(allocations: FeasibilityEmployeeAllocation[]) {
    if (this.isBrowser)
      localStorage.setItem(STORAGE_KEYS.FEASIBILITY_EMPLOYEE_ALLOCATIONS, JSON.stringify(allocations));
  }

  static addFeasibilityEmployeeAllocation(
    data: Omit<FeasibilityEmployeeAllocation, 'id' | 'created_at' | 'updated_at'>
  ): FeasibilityEmployeeAllocation {
    const list = this.getFeasibilityEmployeeAllocations();
    const newAlloc: FeasibilityEmployeeAllocation = {
      ...data,
      id: `fea-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    list.unshift(newAlloc);
    this.saveFeasibilityEmployeeAllocations(list);
    return newAlloc;
  }

  static updateFeasibilityEmployeeAllocation(
    id: string,
    updates: Partial<FeasibilityEmployeeAllocation>
  ): FeasibilityEmployeeAllocation {
    const list = this.getFeasibilityEmployeeAllocations();
    const index = list.findIndex(al => al.id === id);
    if (index === -1) throw new Error('Allocation not found');
    const updated = { ...list[index], ...updates, updated_at: new Date().toISOString() };
    list[index] = updated;
    this.saveFeasibilityEmployeeAllocations(list);
    return updated;
  }

  // ============================================================
  // FEASIBILITY SUGGESTIONS
  // ============================================================
  static getFeasibilitySuggestions(): FeasibilitySuggestion[] {
    if (!this.isBrowser) return [];
    const stored = localStorage.getItem(STORAGE_KEYS.FEASIBILITY_SUGGESTIONS);
    return stored ? JSON.parse(stored) : [];
  }

  static getFeasibilitySuggestionsByAssignmentId(assignmentId: string): FeasibilitySuggestion[] {
    return this.getFeasibilitySuggestions().filter(s => s.feasibility_team_assignment_id === assignmentId);
  }

  static saveFeasibilitySuggestions(suggestions: FeasibilitySuggestion[]) {
    if (this.isBrowser)
      localStorage.setItem(STORAGE_KEYS.FEASIBILITY_SUGGESTIONS, JSON.stringify(suggestions));
  }

  static addFeasibilitySuggestion(data: Omit<FeasibilitySuggestion, 'id' | 'created_at'>): FeasibilitySuggestion {
    const list = this.getFeasibilitySuggestions();
    const newSugg: FeasibilitySuggestion = { ...data, id: `fs-${Date.now()}`, created_at: new Date().toISOString() };
    list.unshift(newSugg);
    this.saveFeasibilitySuggestions(list);
    return newSugg;
  }

  static resolveFeasibilitySuggestion(
    id: string,
    status: 'APPROVED' | 'REJECTED' | 'MODIFIED',
    pmResponse: string
  ): FeasibilitySuggestion {
    const list = this.getFeasibilitySuggestions();
    const index = list.findIndex(s => s.id === id);
    if (index === -1) throw new Error('Suggestion not found');
    const updated = { ...list[index], status, pm_response: pmResponse, resolved_at: new Date().toISOString() };
    list[index] = updated;
    this.saveFeasibilitySuggestions(list);
    return updated;
  }

  // ============================================================
  // TASKS (linked to Lead + FeasibilityTeamAssignment)
  // ============================================================
  static getTasks(): Task[] {
    if (!this.isBrowser) return [];
    const stored = localStorage.getItem(STORAGE_KEYS.TASKS);
    return stored ? JSON.parse(stored) : [];
  }

  static getTasksByLeadId(leadId: string): Task[] {
    return this.getTasks().filter(t => t.lead_id === leadId);
  }

  static getTasksByAssignmentId(assignmentId: string): Task[] {
    return this.getTasks().filter(t => t.feasibility_team_assignment_id === assignmentId);
  }

  static getTasksByEmployeeId(employeeId: string): Task[] {
    return this.getTasks().filter(t => t.assigned_to_id === employeeId);
  }

  static saveTasks(tasks: Task[]) {
    if (this.isBrowser) localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));
  }

  static createTask(data: Omit<Task, 'id' | 'created_at' | 'updated_at'>): Task {
    const tasks = this.getTasks();
    const newTask: Task = { ...data, id: `task-${Date.now()}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    tasks.unshift(newTask);
    this.saveTasks(tasks);
    return newTask;
  }

  static updateTask(id: string, updates: Partial<Task>): Task {
    const tasks = this.getTasks();
    const index = tasks.findIndex(t => t.id === id);
    if (index === -1) throw new Error('Task not found');
    const updated = { ...tasks[index], ...updates, updated_at: new Date().toISOString() };
    tasks[index] = updated;
    this.saveTasks(tasks);
    return updated;
  }

  // ============================================================
  // PERMISSION CHECK HELPERS
  // ============================================================

  /**
   * Check if a given user has access to a Lead's engineering-safe view.
   * Granted when: PM, CEO, BH, ED have full access.
   * Team Leads: must have an active team assignment for this lead.
   * Employees: must have an allocation for this lead.
   */
  static canUserAccessLead(userId: string, leadId: string): boolean {
    const user = this.getUsers().find(u => u.id === userId);
    if (!user) return false;
    const fullAccessRoles = ['CEO', 'CTO', 'SYSTEM_ADMIN', 'PROJECT_MANAGER', 'BUSINESS_HEAD', 'ENG_DIRECTOR'];
    if (fullAccessRoles.includes(user.role_code)) return true;
    // Sales owner
    const lead = this.getLeadById(leadId);
    if (lead && (lead.created_by_id === userId || lead.sales_owner_id === userId)) return true;
    // Team Lead: must have an assignment for this lead
    const assignments = this.getFeasibilityTeamAssignmentsByLeadId(leadId);
    if (assignments.some(a => a.team_lead_id === userId)) return true;
    // Employee: must have an allocation for this lead
    const allocations = this.getFeasibilityAllocationsByLeadId(leadId);
    if (allocations.some(al => al.employee_id === userId)) return true;
    return false;
  }
}
