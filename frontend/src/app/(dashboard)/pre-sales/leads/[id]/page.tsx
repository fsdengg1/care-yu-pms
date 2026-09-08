'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { StorageService } from '@/lib/storage';
import { LeadApi } from '@/lib/leadApi';
import LeadCyclePanels from '@/components/leads/LeadCyclePanels';
import CreateLeadTaskForm from '@/components/work/CreateLeadTaskForm';
import LeadTasksPanel from '@/components/work/LeadTasksPanel';
import ConfirmDialog from '@/components/work/ConfirmDialog';
import EntityDocumentUpload from '@/components/documents/EntityDocumentUpload';
import WorkflowStatusBanner, { WorkflowActionFeedback } from '@/components/leads/WorkflowStatusBanner';
import SmartEmailNotificationPanel from '@/components/notifications/SmartEmailNotificationPanel';
import { NotificationsApi } from '@/lib/notificationsApi';
import { TasksApi } from '@/lib/tasksApi';
import { formatInrCompact, WORKFLOW_ACTION_SUCCESS, workflowActionFromQuery, workflowStatusPresentation } from '@/lib/format';
import { projectStageFlowSummary } from '@/lib/projectStageFlow';
import { canCreateLead, canCreateLeadTask } from '@/lib/rbac';
import {
  Lead, LeadActivity, LeadComment, LeadDocument, LeadStatusHistory,
  FeasibilityTeamAssignment, FeasibilityEmployeeAllocation, Team, User, PriorityLevel, AssignmentType, AssignmentHistory, EntityDocument, Task
} from '@/lib/types';
import { resolveLeadIdFromLocation, leadDetailHref } from '@/lib/leadRoutes';
import {
    ArrowLeft, CheckCircle2, AlertTriangle, Send, Plus, X,
  Check, RotateCcw, Paperclip, Scan, ShieldAlert, Users, ChevronRight,
  Info, Zap
} from 'lucide-react';

type TabKey = 'overview' | 'customer' | 'requirement' | 'technical' | 'commercial' | 'feasibility' | 'costing' | 'documents' | 'communication' | 'timeline' | 'review';

export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const leadId = resolveLeadIdFromLocation(params.id, pathname, searchParams.get('id'));

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [lead, setLead] = useState<Lead | null>(null);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [comments, setComments] = useState<LeadComment[]>([]);
  const [documents, setDocuments] = useState<LeadDocument[]>([]);
  const [additionalDocuments, setAdditionalDocuments] = useState<EntityDocument[]>([]);
  const [history, setHistory] = useState<LeadStatusHistory[]>([]);
  const [teamAssignments, setTeamAssignments] = useState<FeasibilityTeamAssignment[]>([]);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [leadTasks, setLeadTasks] = useState<Task[]>([]);
  const [showCreateLeadTask, setShowCreateLeadTask] = useState(false);
  const [editingLeadTask, setEditingLeadTask] = useState<Task | null>(null);
  const [deletingLeadTask, setDeletingLeadTask] = useState<Task | null>(null);
  const [leadTaskBusy, setLeadTaskBusy] = useState<string | null>(null);
  const [leadTaskNotice, setLeadTaskNotice] = useState<string | null>(null);
  const [assignmentHistory, setAssignmentHistory] = useState<AssignmentHistory[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [workflowFeedback, setWorkflowFeedback] = useState<WorkflowActionFeedback | null>(null);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [forwardUserId, setForwardUserId] = useState('');
  const [forwardReason, setForwardReason] = useState('');

  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // PM Return Modal
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [pmReturnReason, setPmReturnReason] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // +ADD TEAM Modal state
  const [showAddTeamModal, setShowAddTeamModal] = useState(false);
  const [addTeamForm, setAddTeamForm] = useState({
    teamIds: [] as string[],
    assignmentType: 'NORMAL' as AssignmentType,
    priority: 'High' as PriorityLevel,
    dueDate: '',
    pmInstructions: '',
    expectedOutput: '',
    criticalReason: '',
    employeeId: '',
    bypassConfirmed: false,
  });
  const [addTeamError, setAddTeamError] = useState<string | null>(null);

  // Customer Communication Modal
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [clientSubject, setClientSubject] = useState('');
  const [clientMessage, setClientMessage] = useState('');
  const [clientBusy, setClientBusy] = useState(false);
  const [clientNotice, setClientNotice] = useState('');
  const [activityForm, setActivityForm] = useState({ activity_type: 'Customer Call' as const, contact_person: '', subject: '', description: '' });

  // Document Upload Modal
  const [showDocModal, setShowDocModal] = useState(false);
  const [docForm, setDocForm] = useState({ file_name: '', category: 'Technical Specification' as const });

  // Resubmit
  const [resubmitTechInput, setResubmitTechInput] = useState('');

  // TL Actions on a selected assignment
  const [showTLAllocateModal, setShowTLAllocateModal] = useState(false);
  const [showSuggestModal, setShowSuggestModal] = useState(false);
  const [showClarifyModal, setShowClarifyModal] = useState(false);
  const [activeAssignment, setActiveAssignment] = useState<FeasibilityTeamAssignment | null>(null);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [responsibilities, setResponsibilities] = useState<Record<string, string>>({});
  const [suggestionType, setSuggestionType] = useState<string>('Workload conflict');
  const [suggestionComment, setSuggestionComment] = useState('');
  const [clarificationComment, setClarificationComment] = useState('');

  const loadData = useCallback(async () => {
    if (!leadId) {
      setLoadError('Lead not found. The link may be invalid or expired.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    const payload = await LeadApi.get(leadId);
    if (payload) {
      setLead(payload.lead);
      setActivities(payload.activities || StorageService.getLeadActivities(payload.lead.id));
      setComments(payload.comments || StorageService.getLeadComments(payload.lead.id));
      setDocuments(payload.documents || StorageService.getLeadDocuments(payload.lead.id));
      setAdditionalDocuments(payload.additionalDocuments || []);
      setHistory(payload.history || StorageService.getLeadStatusHistory(payload.lead.id));
      setTeamAssignments(payload.assignments?.length ? payload.assignments : StorageService.getFeasibilityTeamAssignmentsByLeadId(payload.lead.id));
      setResubmitTechInput(payload.lead.technical_specifications || '');
      setAllTeams(payload.teams?.length ? payload.teams : StorageService.getTeams());
      setAllUsers(payload.users?.length ? payload.users : StorageService.getUsers());
      setAssignmentHistory(payload.assignmentHistory || []);
      setLeadTasks(payload.tasks || []);
      setLoading(false);
      return;
    }
    setAllTeams(StorageService.getTeams());
    setAllUsers(StorageService.getUsers());
    setLoadError('Unable to load this lead. It may have been removed or you may not have access.');
    setLoading(false);
  }, [leadId]);

  useEffect(() => {
    const u = StorageService.getCurrentUser();
    setCurrentUser(u);
    if (!u) {
      router.replace('/login');
      return;
    }
    void loadData();
    const tab = new URLSearchParams(window.location.search).get('tab');
    const action = workflowActionFromQuery(new URLSearchParams(window.location.search).get('action'));
    if (action && leadId) {
      setWorkflowFeedback({ kind: action, message: WORKFLOW_ACTION_SUCCESS[action] });
      window.history.replaceState({}, '', leadDetailHref(leadId));
    }
    if (
      tab === 'overview' ||
      tab === 'customer' ||
      tab === 'requirement' ||
      tab === 'technical' ||
      tab === 'commercial' ||
      tab === 'feasibility' ||
      tab === 'costing' ||
      tab === 'documents' ||
      tab === 'communication' ||
      tab === 'timeline' ||
      tab === 'review'
    ) {
      setActiveTab(tab);
    }
  }, [leadId, loadData, router]);

  if (!currentUser) {
    return <div className="p-12 text-center text-slate-400 text-xs">Loading Lead Details…</div>;
  }

  if (loadError) {
    return (
      <div className="p-12 text-center space-y-4">
        <p className="text-rose-300 text-sm">{loadError}</p>
        <Link href="/pre-sales/leads" className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 text-xs font-medium">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Leads
        </Link>
      </div>
    );
  }

  if (loading || !lead) {
    return <div className="p-12 text-center text-slate-400 text-xs">Loading Lead Details…</div>;
  }

  const isCEO = currentUser.role_code === 'CEO';
  const isAdmin = currentUser.role_code === 'SYSTEM_ADMIN';
  const isPM = currentUser.role_code === 'PROJECT_MANAGER' || isAdmin;
  const canCreateLeadWork = canCreateLeadTask(currentUser);
  const leadTaskPeople = allUsers
    .filter((user) => user.status === 'ACTIVE')
    .map((user) => ({
      id: user.id,
      name: user.name,
      displayName: user.name,
      email: user.email || '',
      role_name: user.role_name,
    }));
  const currentStageLabel = projectStageFlowSummary(lead).stageLabel;
  const isTL = currentUser.role_code === 'TEAM_LEAD';
  const isBH = currentUser.role_code === 'BUSINESS_HEAD';
  const isSalesOwner = lead.created_by_id === currentUser.id || lead.sales_owner_id === currentUser.id
    || (currentUser.role_code === 'BUSINESS_HEAD' && lead.business_vertical === 'Business Head')
    || (currentUser.role_code === 'ENG_DIRECTOR' && lead.business_vertical === 'Engineering Director');
  const canEditLeadForm = canCreateLead(currentUser);
  const canViewRestricted = isPM || isSalesOwner || isCEO || isAdmin || isBH;

  // TL can access this lead only if assigned
  const myTLAssignment = isTL
    ? teamAssignments.find(a => a.team_lead_id === currentUser.id && a.status !== 'CANCELLED')
    : null;

  // Employee can access if allocated
  const myAlloc = (!isPM && !isTL && !isSalesOwner && !isCEO)
    ? StorageService.getFeasibilityAllocationsByLeadId(leadId).find(al => al.employee_id === currentUser.id)
    : null;

  const isResponsible =
    lead.current_owner_id === currentUser.id ||
    lead.responsible_user_id === currentUser.id ||
    currentUser.role_code === 'SYSTEM_ADMIN' ||
    (!lead.responsible_user_id && !lead.current_owner_id && isPM && ['SUBMITTED_TO_PM', 'UNDER_PM_REVIEW', 'RESUBMITTED_TO_PM'].includes(lead.status));
  const canPmDecide = isResponsible && ['SUBMITTED_TO_PM', 'UNDER_PM_REVIEW', 'RESUBMITTED_TO_PM'].includes(lead.status);
  const canForward = isResponsible && !['DRAFT', 'ORDER_CONVERTED', 'LOST', 'CANCELLED'].includes(lead.status);

  const handleWorkflowUpdated = async (feedback?: WorkflowActionFeedback) => {
    if (feedback) {
      setActionError(null);
      setWorkflowFeedback(feedback);
    }
    await loadData();
  };

  const handleForwardLead = async () => {
    if (!forwardUserId) return;
    setActionError(null);
    setActionBusy(true);
    const result = await LeadApi.forward(lead.id, { responsible_user_id: forwardUserId, reason: forwardReason });
    setActionBusy(false);
    if (result && 'lead' in result) {
      setShowForwardModal(false);
      setForwardUserId('');
      setForwardReason('');
      await loadData();
      return;
    }
    setActionError((result && 'message' in result && result.message) || 'Unable to forward this lead.');
  };

  const handlePMReturnToSales = async () => {
    if (!pmReturnReason.trim()) {
      setActionError('A return reason is required.');
      return;
    }
    setActionError(null);
    setActionBusy(true);
    const result = await LeadApi.pmReview(lead.id, { action: 'return', reason: pmReturnReason.trim() });
    setActionBusy(false);
    if (!result.ok) {
      setActionError(result.message || 'Unable to send this lead back.');
      return;
    }
    setShowReturnModal(false);
    setPmReturnReason('');
    setWorkflowFeedback(null);
    await loadData();
  };

  const handleSalesResubmit = async () => {
    const previousStatus = lead.status;
    const submitted = await LeadApi.submit(lead.id, { technical_specifications: resubmitTechInput });
    if (!submitted.ok) {
      setActionError(submitted.message);
      return;
    }
    setActionError(null);
    setWorkflowFeedback({ kind: 'submit', message: WORKFLOW_ACTION_SUCCESS.submit, previousStatus });
    loadData();
  };

  const handlePMCancel = async () => {
    if (!cancelReason.trim()) return;
    setActionError(null);
    setActionBusy(true);
    const previousStatus = lead.status;
    const result = await LeadApi.cancel(lead.id, cancelReason.trim());
    setActionBusy(false);
    if (result && 'lead' in result) {
      setShowCancelModal(false);
      setCancelReason('');
      setWorkflowFeedback({ kind: 'reject', message: WORKFLOW_ACTION_SUCCESS.reject, previousStatus });
      await loadData();
      return;
    }
    setActionError((result && 'message' in result && result.message) || 'Unable to cancel this lead.');
  };

  // ---- +ADD TEAM ----
  const selectedAddTeams = allTeams.filter((t) => addTeamForm.teamIds.includes(t.id));
  const selectedAddTeam = selectedAddTeams[0];
  const tlForSelectedTeam = allUsers.find(u => u.id === selectedAddTeam?.team_lead_id);
  const employeesForSelectedTeam = allUsers.filter(u => selectedAddTeam && u.team_id === selectedAddTeam.id);
  const alreadyAssignedSelected = addTeamForm.teamIds.filter((id) =>
    teamAssignments.some((a) => a.team_id === id && a.status !== 'CANCELLED') ||
    StorageService.isTeamAlreadyAssignedToLead(lead.id, id)
  );

  const handleAddTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddTeamError(null);
    if (!addTeamForm.teamIds.length) { setAddTeamError('Please select at least one team.'); return; }
    if (alreadyAssignedSelected.length) {
      setAddTeamError('One or more selected teams are already assigned to this Lead.');
      return;
    }
    if (!addTeamForm.dueDate) { setAddTeamError('Due date is required.'); return; }
    if (!addTeamForm.pmInstructions.trim()) { setAddTeamError('PM Instructions are required.'); return; }
    const isCritical = addTeamForm.assignmentType === 'CRITICAL_DIRECT';
    if (isCritical && addTeamForm.teamIds.length > 1) {
      setAddTeamError('Critical Direct can only be used with one team. Select a single team, or use Normal assignment for multiple teams.');
      return;
    }
    if (isCritical) {
      if (!addTeamForm.employeeId) { setAddTeamError('Select employee for Critical Direct.'); return; }
      if (!addTeamForm.criticalReason.trim()) { setAddTeamError('Critical Reason is mandatory.'); return; }
      if (!addTeamForm.bypassConfirmed) { setAddTeamError('Confirm bypass of Team Lead allocation.'); return; }
    }

    if (!isCritical) {
      const result = await LeadApi.pmReview(lead.id, {
        action: 'approve_assign',
        team_ids: addTeamForm.teamIds,
        notes: addTeamForm.pmInstructions,
      });
      if (!result.ok) {
        setAddTeamError(result.message || 'Unable to assign teams.');
        return;
      }
      setShowAddTeamModal(false);
      setAddTeamForm({ teamIds: [], assignmentType: 'NORMAL', priority: 'High', dueDate: '', pmInstructions: '', expectedOutput: '', criticalReason: '', employeeId: '', bypassConfirmed: false });
      await loadData();
      return;
    }

    const newAssignment = StorageService.createFeasibilityTeamAssignment({
      lead_id: lead.id,
      team_id: selectedAddTeam!.id,
      team_name: selectedAddTeam!.name,
      team_lead_id: selectedAddTeam!.team_lead_id,
      team_lead_name: selectedAddTeam!.team_lead_name || tlForSelectedTeam?.name,
      assignment_type: addTeamForm.assignmentType,
      priority: addTeamForm.priority,
      due_date: addTeamForm.dueDate,
      pm_instructions: addTeamForm.pmInstructions,
      expected_output: addTeamForm.expectedOutput || undefined,
      critical_reason: addTeamForm.criticalReason,
      status: 'CRITICAL_DIRECT_ASSIGNED',
      created_by: currentUser.name,
      created_by_id: currentUser.id,
    });

    const emp = allUsers.find(u => u.id === addTeamForm.employeeId);
    if (emp) {
      StorageService.addFeasibilityEmployeeAllocation({
        feasibility_team_assignment_id: newAssignment.id,
        lead_id: lead.id,
        team_id: selectedAddTeam!.id,
        team_lead_id: selectedAddTeam?.team_lead_id,
        employee_id: emp.id,
        employee_name: emp.name,
        responsibility: `[CRITICAL DIRECT] ${addTeamForm.pmInstructions}`,
        approval_status: 'BYPASSED_CRITICAL',
        allocated_by: currentUser.name,
        allocated_at: new Date().toISOString(),
      });
      StorageService.sendNotification({ recipient_id: emp.id, type: 'CRITICAL_DIRECT_ASSIGNMENT_TO_EMPLOYEE', title: `🔴 CRITICAL DIRECT: ${lead.lead_number}`, message: `PM ${currentUser.name} assigned feasibility work on "${lead.title}" (${lead.customer_name}) directly to you. Reason: ${addTeamForm.criticalReason}. Start immediately.`, entity_type: 'FEASIBILITY', entity_id: newAssignment.id });
    }
    if (selectedAddTeam?.team_lead_id) {
      StorageService.sendNotification({ recipient_id: selectedAddTeam.team_lead_id, type: 'CRITICAL_ASSIGNMENT_TEAM_LEAD_NOTICE', title: `🔴 Critical Notice: ${lead.lead_number} → ${selectedAddTeam.name}`, message: `PM ${currentUser.name} directly assigned feasibility for "${lead.title}" to ${emp?.name}. No approval required from you.`, entity_type: 'FEASIBILITY', entity_id: newAssignment.id });
    }
    StorageService.logAudit({ user_id: currentUser.id, user_name: currentUser.name, user_role: currentUser.role_name, entity_type: 'FEASIBILITY', entity_id: newAssignment.id, action: 'CRITICAL_DIRECT_ASSIGNMENT_CREATED', description: `[CRITICAL DIRECT] PM ${currentUser.name} assigned ${lead.lead_number} (${selectedAddTeam?.name}) directly to ${allUsers.find(u => u.id === addTeamForm.employeeId)?.name}. Reason: "${addTeamForm.criticalReason}".` });

    if (lead.status === 'ACCEPTED_FOR_FEASIBILITY') {
      StorageService.updateLead(lead.id, { status: 'FEASIBILITY_IN_PROGRESS' }, currentUser.id, currentUser.name);
    }

    setShowAddTeamModal(false);
    setAddTeamForm({ teamIds: [], assignmentType: 'NORMAL', priority: 'High', dueDate: '', pmInstructions: '', expectedOutput: '', criticalReason: '', employeeId: '', bypassConfirmed: false });
    loadData();
  };

  // ---- TL Actions ----
  const handleTLAllocate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAssignment || selectedEmployees.length === 0) return;
    selectedEmployees.forEach(empId => {
      const emp = allUsers.find(u => u.id === empId);
      if (!emp) return;
      StorageService.addFeasibilityEmployeeAllocation({
        feasibility_team_assignment_id: activeAssignment.id,
        lead_id: lead.id,
        team_id: activeAssignment.team_id,
        team_lead_id: currentUser.id,
        employee_id: emp.id,
        employee_name: emp.name,
        responsibility: responsibilities[empId] || `Feasibility analysis for ${lead.title}`,
        approval_status: 'APPROVED',
        allocated_by: currentUser.name,
        allocated_at: new Date().toISOString(),
      });
      StorageService.sendNotification({ recipient_id: emp.id, type: 'TEAM_LEAD_ALLOCATED_EMPLOYEE', title: `Feasibility Allocated: ${lead.lead_number}`, message: `Team Lead ${currentUser.name} allocated feasibility work on "${lead.title}" to you. Ready to start.`, entity_type: 'FEASIBILITY', entity_id: activeAssignment.id });
    });
    StorageService.updateFeasibilityTeamAssignment(activeAssignment.id, { status: 'ALLOCATED_TO_TEAM_MEMBER' });
    StorageService.logAudit({ user_id: currentUser.id, user_name: currentUser.name, user_role: currentUser.role_name, entity_type: 'FEASIBILITY', entity_id: activeAssignment.id, action: 'TL_APPROVED_AND_ALLOCATED', description: `TL ${currentUser.name} approved & allocated ${selectedEmployees.length} member(s) for ${lead.lead_number} / ${activeAssignment.team_name}.` });
    setShowTLAllocateModal(false); setSelectedEmployees([]); setResponsibilities({}); loadData();
  };

  const handleTLSuggest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAssignment || !suggestionComment.trim()) return;
    StorageService.addFeasibilitySuggestion({ feasibility_team_assignment_id: activeAssignment.id, lead_id: lead.id, created_by: currentUser.name, created_by_id: currentUser.id, suggestion_type: suggestionType as any, comment: suggestionComment, status: 'PENDING' });
    StorageService.updateFeasibilityTeamAssignment(activeAssignment.id, { status: 'CHANGE_SUGGESTED' });
    const pmUser = allUsers.find(u => u.role_code === 'PROJECT_MANAGER');
    StorageService.sendNotification({ recipient_id: pmUser?.id || 'u-pm', type: 'TEAM_LEAD_SUGGESTION', title: `TL Suggestion from ${currentUser.name}`, message: `${currentUser.name} suggested change for ${lead.lead_number} (${activeAssignment.team_name}): "${suggestionComment}"`, entity_type: 'FEASIBILITY', entity_id: activeAssignment.id });
    StorageService.logAudit({ user_id: currentUser.id, user_name: currentUser.name, user_role: currentUser.role_name, entity_type: 'FEASIBILITY', entity_id: activeAssignment.id, action: 'TL_SUGGESTED_CHANGE', description: `${currentUser.name} suggested: ${suggestionType} — "${suggestionComment}"` });
    setShowSuggestModal(false); setSuggestionComment(''); loadData();
  };

  const handleTLClarify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAssignment || !clarificationComment.trim()) return;
    StorageService.updateFeasibilityTeamAssignment(activeAssignment.id, { status: 'CLARIFICATION_REQUIRED' });
    const pmUser = allUsers.find(u => u.role_code === 'PROJECT_MANAGER');
    StorageService.sendNotification({ recipient_id: pmUser?.id || 'u-pm', type: 'TEAM_LEAD_CLARIFICATION_REQUEST', title: `Clarification from ${currentUser.name}`, message: `${currentUser.name} needs clarification for ${lead.lead_number}: "${clarificationComment}"`, entity_type: 'FEASIBILITY', entity_id: activeAssignment.id });
    StorageService.logAudit({ user_id: currentUser.id, user_name: currentUser.name, user_role: currentUser.role_name, entity_type: 'FEASIBILITY', entity_id: activeAssignment.id, action: 'TL_REQUESTED_CLARIFICATION', description: `${currentUser.name}: "${clarificationComment}"` });
    setShowClarifyModal(false); setClarificationComment(''); loadData();
  };

  const handleAddActivity = (e: React.FormEvent) => {
    e.preventDefault();
    StorageService.addLeadActivity({ lead_id: lead.id, activity_type: activityForm.activity_type, activity_date: new Date().toISOString(), contact_person: activityForm.contact_person || lead.customer_contact, subject: activityForm.subject, description: activityForm.description, created_by: currentUser.name, created_by_id: currentUser.id });
    setShowActivityModal(false); setActivityForm({ activity_type: 'Customer Call', contact_person: '', subject: '', description: '' }); loadData();
  };

  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    await LeadApi.addDocument(lead.id, { file_name: docForm.file_name, category: docForm.category });
    setShowDocModal(false); setDocForm({ file_name: '', category: 'Technical Specification' }); loadData();
  };

  const openLeadDocument = async (doc: LeadDocument) => {
    const result = await LeadApi.documentFile(lead.id, doc.id);
    const url = (result && 'document' in result && result.document.file_url) || doc.file_url;
    if (!url) {
      setActionError('File is not available for preview.');
      return;
    }
    const link = document.createElement('a');
    link.href = url;
    link.download = doc.file_name;
    link.target = '_blank';
    link.rel = 'noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const statusColor = (s: string) => {
    if (s === 'PENDING_TEAM_LEAD_REVIEW') return 'text-amber-300 bg-amber-950 border-amber-800';
    if (s === 'ALLOCATED_TO_TEAM_MEMBER' || s === 'READY_TO_START') return 'text-emerald-300 bg-emerald-950 border-emerald-800';
    if (s === 'IN_PROGRESS') return 'text-cyan-300 bg-cyan-950 border-cyan-800';
    if (s === 'COMPLETED') return 'text-slate-300 bg-slate-800 border-slate-700';
    if (s === 'CRITICAL_DIRECT_ASSIGNED') return 'text-rose-300 bg-rose-950 border-rose-800';
    if (s === 'CHANGE_SUGGESTED' || s === 'CLARIFICATION_REQUIRED') return 'text-orange-300 bg-orange-950 border-orange-800';
    return 'text-slate-300 bg-slate-800 border-slate-700';
  };

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'customer', label: 'Customer Contact' },
    { key: 'requirement', label: 'Requirement' },
    { key: 'technical', label: 'Technical Inputs' },
    { key: 'commercial', label: 'Commercial' },
    { key: 'feasibility', label: `Feasibility Teams (${teamAssignments.length})` },
    { key: 'costing', label: 'Solution & Costing' },
    { key: 'documents', label: `Documents (${documents.length + additionalDocuments.length})` },
    { key: 'communication', label: `Customer Comm. (${activities.length})` },
    { key: 'timeline', label: 'Activity Timeline' },
    { key: 'review', label: 'PM Review' },
  ];
  const leadStage = workflowStatusPresentation(lead.status, lead);

  return (
    <div className="space-y-5 max-w-6xl mx-auto pb-16 text-xs">
      {/* Header */}
      <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/pre-sales/leads')} className="p-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-cyan-400 font-bold text-sm">{lead.lead_number}</span>
                <span className="text-slate-500">•</span>
                <span className="text-slate-300 font-medium">{lead.business_vertical} Vertical</span>
              </div>
              <h1 className="text-xl font-bold text-slate-100 mt-0.5">{lead.title}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canForward && (
              <button
                type="button"
                onClick={() => setShowForwardModal(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-cyan-700 px-3 py-1.5 text-xs font-bold text-cyan-300 hover:bg-cyan-950"
              >
                Forward / Assign
              </button>
            )}
            {isCEO && (
              <span className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-300">
                View only
              </span>
            )}
            <span className={`px-3 py-1 rounded text-xs font-bold border ${leadStage.badgeClass}${workflowFeedback ? ' ring-2 ring-cyan-400' : ''}`}>{leadStage.label}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-6 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400">
          <div>Current Stage: <span className="font-bold text-violet-300">{currentStageLabel}</span></div>
          <div>Customer: <span className="font-bold text-slate-200">{lead.customer_name}</span></div>
          <div>Sales Owner: <span className="font-medium text-slate-300">{lead.sales_owner}</span></div>
          <div>Priority: <span className="font-semibold text-amber-400">{lead.priority}</span></div>
          <div>Created: <span className="font-mono text-slate-300">{new Date(lead.created_at).toLocaleDateString()}</span></div>
          {teamAssignments.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">Teams:</span>
              {teamAssignments.filter(a => a.status !== 'CANCELLED').map(a => (
                <span key={a.id} className="px-1.5 py-0.5 rounded text-[10px] bg-cyan-950 text-cyan-400 border border-cyan-900 font-semibold">{a.team_name}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      <WorkflowStatusBanner status={lead.status} lead={lead} feedback={workflowFeedback} error={actionError} showStage={false} />

      <SmartEmailNotificationPanel entityType="LEAD" entityId={lead.id} />

      <LeadTasksPanel
        tasks={leadTasks}
        currentUser={currentUser}
        busyId={leadTaskBusy}
        onEdit={(task) => {
          setEditingLeadTask(task);
          setShowCreateLeadTask(true);
        }}
        onDelete={(task) => setDeletingLeadTask(task)}
      />
      {leadTaskNotice && (
        <div className="rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-200">{leadTaskNotice}</div>
      )}

      <CreateLeadTaskForm
        open={showCreateLeadTask}
        lead={lead}
        people={leadTaskPeople}
        currentUserId={currentUser.id}
        editing={editingLeadTask}
        onClose={() => {
          setShowCreateLeadTask(false);
          setEditingLeadTask(null);
        }}
        onCreated={(message) => {
          setLeadTaskNotice(message);
          void loadData();
        }}
      />

      {deletingLeadTask && (
        <ConfirmDialog
          title="Delete this lead task?"
          body={`"${deletingLeadTask.description || deletingLeadTask.title}" will be removed from this lead, My Assigned Work, and Daily Work Updates.`}
          busy={leadTaskBusy === deletingLeadTask.id}
          onCancel={() => setDeletingLeadTask(null)}
          onConfirm={async () => {
            const id = deletingLeadTask.id;
            setLeadTaskBusy(id);
            const result = await TasksApi.bulkDelete([id]);
            setLeadTaskBusy(null);
            setDeletingLeadTask(null);
            if (!result.ok) {
              setActionError(result.message || 'Unable to delete this lead task.');
              return;
            }
            setLeadTaskNotice('Lead task deleted.');
            await loadData();
          }}
        />
      )}

      {/* Accepted-for-feasibility banner — PM action prompt */}
      {lead.status === 'ACCEPTED_FOR_FEASIBILITY' && isPM && (
        <div className="p-4 bg-emerald-950/40 border border-emerald-800/80 rounded-xl flex items-center justify-between gap-3">
          <div>
            <div className="font-bold text-emerald-400 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> LEAD ACCEPTED FOR FEASIBILITY</div>
            <p className="text-slate-300 mt-0.5">Open the <strong>Feasibility Teams</strong> tab to assign teams using the + ADD TEAM button.</p>
          </div>
          <button onClick={() => setActiveTab('feasibility')} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg text-xs flex items-center gap-2 shrink-0">
            <Scan className="w-4 h-4" /> Go to Feasibility Teams
          </button>
        </div>
      )}

      {/* Returned to Sales banner */}
      {(lead.status === 'RETURNED_TO_SALES' || lead.status === 'ADDITIONAL_INFORMATION_REQUIRED') && (
        <div className="p-4 bg-amber-950/50 border border-amber-800/80 rounded-xl space-y-3">
          <div className="flex items-center gap-2 text-amber-300 font-bold text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-400" /> ACTION REQUIRED — RETURNED BY PM
          </div>
          <div className="text-slate-200 text-xs bg-slate-950/70 p-3 rounded border border-amber-900/60 font-mono">
            PM Request: &quot;{lead.pm_return_reason || 'Please provide additional information'}&quot;
          </div>
          {isSalesOwner && canEditLeadForm && (
            <div className="space-y-2 pt-1">
              <textarea rows={2} value={resubmitTechInput} onChange={e => setResubmitTechInput(e.target.value)} placeholder="Update requested technical inputs…" className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded text-slate-100" />
              <div className="flex justify-end gap-2">
                <Link href={`/pre-sales/leads/create?id=${lead.id}`} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg">Edit Draft</Link>
                <button onClick={handleSalesResubmit} className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded-lg flex items-center gap-2">
                  <Send className="w-4 h-4" /> Resubmit to PM
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {lead.status === 'DRAFT' && isSalesOwner && canEditLeadForm && (
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between gap-3">
          <div>
            <div className="font-bold text-slate-100">Draft — not yet submitted</div>
            <p className="text-slate-400">Edit the Pre-Sales Lead Form, then submit to PM. It will leave draft status.</p>
          </div>
          <div className="flex gap-2">
            <Link href={`/pre-sales/leads/create?id=${lead.id}`} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg">Edit Draft</Link>
            <button onClick={handleSalesResubmit} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg flex items-center gap-2">
              <Send className="w-4 h-4" /> Submit to PM
            </button>
          </div>
        </div>
      )}

      <LeadCyclePanels lead={lead} currentUser={currentUser} teams={allTeams} users={allUsers} assignments={teamAssignments} onUpdated={handleWorkflowUpdated} />

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-800 overflow-x-auto pb-0.5">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} className={`px-3 py-2 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${activeTab === t.key ? 'border-cyan-500 text-cyan-300 bg-cyan-950/20' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* === TAB: OVERVIEW === */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-5">
            <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 space-y-3">
              <h3 className="font-bold text-slate-100 text-sm border-b border-slate-800 pb-2">Requirement Summary</h3>
              <p className="text-slate-300 leading-relaxed font-medium">{lead.requirement_summary}</p>
              {lead.additional_notes && (
                <div className="pt-2 border-t border-slate-800/80">
                  <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Additional Notes</span>
                  <p className="text-slate-400 whitespace-pre-wrap mt-1">{lead.additional_notes}</p>
                </div>
              )}
              {(lead.custom_fields || []).filter((field) => field.name || field.value).length > 0 && (
                <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                  <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Additional Fields</span>
                  {(lead.custom_fields || []).map((field) => (
                    <div key={field.id} className="flex justify-between gap-3 text-slate-300">
                      <span className="text-slate-400">{field.name || 'Untitled field'}</span>
                      <span className="font-medium text-slate-200">{field.value || '—'}</span>
                    </div>
                  ))}
                </div>
              )}
              {(lead.competitor_information || lead.customer_challenge || lead.required_solution) && (
                <div className="pt-2 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-3 gap-3">
                  {lead.required_solution && (
                    <div>
                      <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Required Solution</span>
                      <p className="text-slate-300 mt-1">{lead.required_solution}</p>
                    </div>
                  )}
                  {lead.customer_challenge && (
                    <div>
                      <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Customer Challenge</span>
                      <p className="text-slate-300 mt-1">{lead.customer_challenge}</p>
                    </div>
                  )}
                  {lead.competitor_information && (
                    <div>
                      <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Competitor Information</span>
                      <p className="text-slate-300 mt-1">{lead.competitor_information}</p>
                    </div>
                  )}
                </div>
              )}
              <div className="pt-2 border-t border-slate-800/80">
                <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Detailed Description</span>
                <p className="text-slate-400 whitespace-pre-wrap mt-1 leading-relaxed">{lead.detailed_requirement}</p>
              </div>
            </div>
            <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 space-y-2">
              <h3 className="font-bold text-slate-100 text-sm border-b border-slate-800 pb-2">Application & Industry</h3>
              <div className="grid grid-cols-2 gap-4">
                <div><span className="text-[11px] text-slate-500 uppercase font-semibold">Application</span><div className="text-slate-200 font-semibold mt-0.5">{lead.application}</div></div>
                <div><span className="text-[11px] text-slate-500 uppercase font-semibold">Industry / Process</span><div className="text-slate-200 mt-0.5">{lead.industry_process || 'Not specified'}</div></div>
              </div>
            </div>
          </div>
          <div className="space-y-5">
            {canPmDecide && (
              <div className="bg-blue-950/40 p-5 rounded-xl border border-blue-800/80 space-y-4">
                <div className="font-bold text-blue-300 text-sm border-b border-blue-800/60 pb-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-cyan-400" /> Action Required
                </div>
                <div className="space-y-2 pt-1">
                  <p className="text-xs text-slate-300">If the details are complete, use <strong>Accept &amp; Assign Team</strong> above. Feasibility starts as soon as a team is assigned.</p>
                  {isPM && (
                    <button onClick={() => setShowReturnModal(true)} className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded-lg flex items-center justify-center gap-2">
                      <RotateCcw className="w-4 h-4" /> Return to Sales
                    </button>
                  )}
                  {isPM && (
                    <button onClick={() => setShowCancelModal(true)} className="w-full py-2.5 bg-rose-700 hover:bg-rose-600 text-white font-bold rounded-lg flex items-center justify-center gap-2">
                      Cancel / Reject
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowForwardModal(true)}
                    className="w-full py-2.5 border border-cyan-700 text-cyan-300 font-bold rounded-lg"
                  >
                    Forward to next person
                  </button>
                </div>
              </div>
            )}
            <div className="space-y-3">
              <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 space-y-2">
                <h4 className="font-bold text-slate-200 text-xs border-b border-slate-800 pb-2">Lead Info</h4>
                <div className="space-y-1.5 text-slate-300">
                  <div>Vertical: <span className="font-semibold text-cyan-400">{lead.business_vertical}</span></div>
                  <div>Sales Owner: <span className="font-medium text-slate-200">{lead.sales_owner}</span></div>
                  <div>Priority: <span className="font-semibold text-amber-400">{lead.priority}</span></div>
                </div>
              </div>
              {canCreateLeadWork && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingLeadTask(null);
                    setShowCreateLeadTask(true);
                  }}
                  className="w-full inline-flex items-center justify-center gap-1 rounded-lg bg-cyan-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-cyan-500"
                >
                  <Plus className="h-3.5 w-3.5" /> Create Task
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* === TAB: CUSTOMER === */}
      {activeTab === 'customer' && (
        <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 space-y-4">
          {!canViewRestricted ? (
            <div className="p-6 text-center text-amber-400 font-bold text-xs"><AlertTriangle className="w-5 h-5 mx-auto mb-2" /> Customer contact information is restricted to Sales and PM.</div>
          ) : (
            <>
              <h3 className="font-bold text-slate-100 text-sm border-b border-slate-800 pb-2">Customer Contact & Location</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-slate-300">
                <div>Contact: <span className="font-bold text-slate-100">{lead.customer_contact}</span></div>
                <div>Designation: <span className="font-medium">{lead.customer_designation || 'N/A'}</span></div>
                <div>Email: <span className="font-medium text-cyan-400">{lead.customer_email || 'N/A'}</span></div>
                <div>Phone: <span className="font-medium">{lead.customer_phone || 'N/A'}</span></div>
                <div>Office: <span className="font-medium">{lead.customer_location || 'N/A'}</span></div>
                <div>Plant: <span className="font-medium">{lead.plant_location || 'N/A'}</span></div>
              </div>
            </>
          )}
        </div>
      )}

      {/* === TAB: REQUIREMENT === */}
      {activeTab === 'requirement' && (
        <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 space-y-4">
          <h3 className="font-bold text-slate-100 text-sm border-b border-slate-800 pb-2">Requirement Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-slate-300">
            {[['Summary', lead.requirement_summary], ['Detailed Requirement', lead.detailed_requirement], ['Application', lead.application], ['Industry / Process', lead.industry_process], ['Current Process', lead.current_process], ['Expected Automation', lead.expected_automation], ['Customer Objective', lead.customer_objective], ['Expected Timeline', lead.expected_project_timeline], ['Customer Target Date', lead.customer_target_date]].map(([label, val]) => val ? (
              <div key={label as string}>
                <span className="text-[11px] text-slate-500 uppercase font-semibold">{label as string}</span>
                <div className="text-slate-200 mt-0.5 whitespace-pre-wrap">{val as string}</div>
              </div>
            ) : null)}
          </div>
        </div>
      )}

      {/* === TAB: TECHNICAL === */}
      {activeTab === 'technical' && (
        <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 space-y-4">
          <h3 className="font-bold text-slate-100 text-sm border-b border-slate-800 pb-2">Technical Inputs</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-slate-300">
            {[['Production Qty', lead.production_quantity], ['Production Rate', lead.production_rate], ['Cycle Time', lead.cycle_time], ['Shift Pattern', lead.shift_pattern], ['Operating Hours', lead.operating_hours], ['Existing Equipment', lead.existing_equipment], ['Integration Req.', lead.integration_requirements], ['Technical Req.', lead.technical_requirements], ['Machine Dimensions', lead.machine_dimensions], ['Payload', lead.payload], ['Accuracy Req.', lead.accuracy_requirement], ['Environment', lead.environment_conditions]].map(([label, val]) => (
              <div key={label as string}><span className="text-[10px] text-slate-500 uppercase font-semibold">{label as string}</span><div className="text-slate-200 mt-0.5 font-medium">{(val as string) || '—'}</div></div>
            ))}
          </div>
          <div className="pt-3 border-t border-slate-800">
            <span className="text-[11px] text-slate-500 uppercase font-semibold">Technical Specifications</span>
            <div className="mt-1 bg-slate-950 p-3 rounded border border-slate-800 text-slate-300 whitespace-pre-wrap font-mono">{lead.technical_specifications || 'None added.'}</div>
          </div>
        </div>
      )}

      {/* === TAB: COMMERCIAL (PM/Sales only) === */}
      {activeTab === 'commercial' && (
        <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 space-y-4">
          {!canViewRestricted ? (
            <div className="p-6 text-center text-amber-400 font-bold text-xs"><AlertTriangle className="w-5 h-5 mx-auto mb-2" /> Commercial information is restricted to Sales and PM.</div>
          ) : (
            <>
              <h3 className="font-bold text-slate-100 text-sm border-b border-slate-800 pb-2">Commercial Overview</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-slate-300">
                <div>Budget: <span className="font-bold text-slate-100">{lead.customer_budget || 'Not specified'}</span></div>
                <div>Est. Value: <span className="font-bold text-emerald-400">{lead.estimated_opportunity_value || 'Not specified'}</span></div>
                <div>Expected PO Date: <span className="font-medium text-slate-200">{lead.expected_po_date || 'Not specified'}</span></div>
              </div>
            </>
          )}
        </div>
      )}

      {/* === TAB: FEASIBILITY TEAMS (core Phase 3A) === */}
      {activeTab === 'feasibility' && (
        <div className="space-y-5">
          {/* PM consolidated view */}
          {(isPM || isSalesOwner || isCEO) && (
            <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 className="font-bold text-slate-100 text-sm">Feasibility Teams — Multi-Team Assignment</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">{teamAssignments.filter(a => a.status !== 'CANCELLED').length} team(s) currently assigned to {lead.lead_number}</p>
                </div>
                {isPM && (lead.status === 'ACCEPTED_FOR_FEASIBILITY' || lead.status === 'FEASIBILITY_IN_PROGRESS') && (
                    <button onClick={() => setShowAddTeamModal(true)} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg flex items-center gap-2 text-xs shadow-md" data-demo="add-team">
                    <Plus className="w-3.5 h-3.5" /> ADD TEAM
                  </button>
                )}
              </div>

              {teamAssignments.length === 0 ? (
                <div className="p-10 text-center space-y-3">
                  <Scan className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-slate-400">No teams assigned yet.</p>
                  {isPM && (lead.status === 'ACCEPTED_FOR_FEASIBILITY' || lead.status === 'FEASIBILITY_IN_PROGRESS') && (
                    <button onClick={() => setShowAddTeamModal(true)} className="mx-auto px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg flex items-center gap-2 text-xs shadow-md" data-demo="add-first-team">
                      <Plus className="w-3.5 h-3.5" /> ADD FIRST TEAM
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {teamAssignments.map(ta => {
                    const allocs = StorageService.getFeasibilityAllocationsByAssignmentId(ta.id);
                    const isCritical = ta.assignment_type === 'CRITICAL_DIRECT';
                    return (
                      <div key={ta.id} className={`p-4 rounded-xl border space-y-3 ${isCritical ? 'bg-rose-950/20 border-rose-900' : 'bg-slate-950/60 border-slate-800'}`}>
                        <div className="flex items-center justify-between">
                          <div className="font-bold text-slate-100 text-sm flex items-center gap-2">
                            {isCritical && <ShieldAlert className="w-4 h-4 text-rose-400" />}
                            {ta.team_name}
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${statusColor(ta.status)}`}>{ta.status}</span>
                        </div>
                        <div className="text-slate-300 space-y-1">
                          <div>TL: <span className="font-semibold text-cyan-400">{ta.team_lead_name || 'Unassigned'}</span></div>
                          <div>Priority: <span className="font-medium text-amber-400">{ta.priority}</span> • Due: <span className="font-mono">{ta.due_date}</span></div>
                          <div>Employees: <span className="font-bold text-slate-100">{allocs.length}</span></div>
                          {isCritical && <div className="text-rose-300 text-[11px]">Critical Reason: &quot;{ta.critical_reason}&quot;</div>}
                        </div>
                        <div className="text-[11px] text-slate-400 bg-slate-900 p-2 rounded border border-slate-800 font-mono">PM: &quot;{ta.pm_instructions}&quot;</div>
                        {allocs.length > 0 && (
                          <div className="space-y-1 pt-1 border-t border-slate-800/80">
                            {allocs.map(al => (
                              <div key={al.id} className="flex items-center justify-between text-[11px]">
                                <span className="font-medium text-slate-200">{al.employee_name}</span>
                                <span className="text-slate-400 truncate ml-2 max-w-[150px]">{al.responsibility}</span>
                                <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold border ${al.approval_status === 'APPROVED' ? 'text-emerald-300 bg-emerald-950 border-emerald-800' : al.approval_status === 'BYPASSED_CRITICAL' ? 'text-rose-300 bg-rose-950 border-rose-800' : 'text-slate-300 bg-slate-800 border-slate-700'}`}>{al.approval_status}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* TL actions inline for relevant team */}
                        {isTL && myTLAssignment?.id === ta.id && (ta.status === 'PENDING_TEAM_LEAD_REVIEW' || ta.status === 'CLARIFICATION_REQUIRED') && (
                          <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
                            <button onClick={() => { setActiveAssignment(ta); setShowTLAllocateModal(true); }} className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded text-[11px]">Accept & Allocate</button>
                            <button onClick={() => { setActiveAssignment(ta); setShowSuggestModal(true); }} className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded text-[11px]">Suggest Change</button>
                            <button onClick={() => { setActiveAssignment(ta); setShowClarifyModal(true); }} className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px]">Clarify</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TL Engineering Input Package */}
          {isTL && myTLAssignment && (() => {
            const engView = StorageService.getLeadEngineeringView(lead.id);
            if (!engView) return null;
            return (
              <div className="space-y-4">
                <div className="p-3 bg-indigo-950/40 border border-indigo-800/80 rounded-xl text-indigo-300 text-xs font-semibold flex items-center gap-2">
                  <Info className="w-4 h-4" /> ENGINEERING INPUT PACKAGE — Read-only view. Customer contact and commercial data are not shown.
                </div>
                <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 space-y-3">
                  <h3 className="font-bold text-slate-100 text-sm border-b border-slate-800 pb-2">Lead Context — {engView.lead_number}</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-slate-300">
                    <div>Customer: <span className="font-bold text-slate-100">{engView.customer_name}</span></div>
                    <div>Application: <span className="font-medium text-slate-100">{engView.application}</span></div>
                    <div>Priority: <span className="font-semibold text-amber-400">{engView.priority}</span></div>
                    <div>Cycle Time: <span className="font-medium text-slate-100">{engView.cycle_time || '—'}</span></div>
                    <div>Production Rate: <span className="font-medium text-slate-100">{engView.production_rate || '—'}</span></div>
                    <div>Accuracy Req: <span className="font-medium text-slate-100">{engView.accuracy_requirement || '—'}</span></div>
                  </div>
                  <div className="mt-2 text-slate-400 text-[11px]">{engView.requirement_summary}</div>
                </div>
                <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 space-y-3">
                  <h3 className="font-bold text-slate-100 text-sm border-b border-slate-800 pb-2">My Team Assignment</h3>
                  <div className="grid grid-cols-2 gap-3 text-slate-300">
                    <div>Team: <span className="font-bold text-cyan-400">{myTLAssignment.team_name}</span></div>
                    <div>Type: <span className={`font-bold ${myTLAssignment.assignment_type === 'CRITICAL_DIRECT' ? 'text-rose-400' : 'text-cyan-400'}`}>{myTLAssignment.assignment_type}</span></div>
                    <div>Priority: <span className="font-semibold text-amber-400">{myTLAssignment.priority}</span></div>
                    <div>Due Date: <span className="font-mono text-slate-200">{myTLAssignment.due_date}</span></div>
                    <div className="col-span-2">PM Instructions: <span className="font-mono text-slate-100">{myTLAssignment.pm_instructions}</span></div>
                  </div>
                  {(myTLAssignment.status === 'PENDING_TEAM_LEAD_REVIEW') && (
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
                      <button onClick={() => { setActiveAssignment(myTLAssignment); setShowTLAllocateModal(true); }} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded text-xs">Accept & Allocate Members</button>
                      <button onClick={() => { setActiveAssignment(myTLAssignment); setShowSuggestModal(true); }} className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded text-xs">Suggest Change</button>
                      <button onClick={() => { setActiveAssignment(myTLAssignment); setShowClarifyModal(true); }} className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs">Request Clarification</button>
                    </div>
                  )}
                </div>
                {engView.documents.length > 0 && (
                  <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 space-y-2">
                    <h4 className="font-bold text-slate-100 text-xs border-b border-slate-800 pb-2">Engineering Documents ({engView.documents.length})</h4>
                    {engView.documents.map(d => (
                      <div key={d.id} className="flex items-center gap-2 py-1.5 border-b border-slate-800/60 last:border-0">
                        <Paperclip className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span className="font-medium text-slate-200">{d.file_name}</span>
                        <span className="text-slate-500">({d.category})</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800">
                  <EntityDocumentUpload
                    title="Lead documents & images"
                    entityType="ADDITIONAL_INPUT"
                    listEntityTypes={['ADDITIONAL_INPUT', 'LEAD']}
                    entityId={lead.id}
                    canEdit={false}
                    ensureEntity={async () => lead.id}
                  />
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {activeTab === 'costing' && (
        <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 space-y-4">
          <h3 className="font-bold text-slate-100 text-sm border-b border-slate-800 pb-2">Solution & Costing</h3>
          {lead.costing ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-slate-300">
                <div>Status: <span className="font-bold text-slate-100">{lead.costing.status}</span></div>
                <div>Total: <span className="font-bold text-emerald-400">{formatInrCompact(lead.costing.total_estimated_cost)}</span></div>
                <div>Stage: <span className={`rounded border px-2 py-0.5 font-bold ${workflowStatusPresentation(lead.status, lead).badgeClass}`}>{workflowStatusPresentation(lead.status, lead).label}</span></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-slate-300">
                <div>BOM / components: <span className="text-slate-100">{lead.costing.bom_components || '—'}</span></div>
                <div>Vendor requirements: <span className="text-slate-100">{lead.costing.vendor_requirements || '—'}</span></div>
                <div>Component costs: <span className="text-slate-100">{formatInrCompact(lead.costing.component_costs)}</span></div>
                <div>Procurement costs: <span className="text-slate-100">{formatInrCompact(lead.costing.procurement_costs)}</span></div>
                <div>Engineering costs: <span className="text-slate-100">{formatInrCompact(lead.costing.engineering_costs)}</span></div>
                <div>Software costs: <span className="text-slate-100">{formatInrCompact(lead.costing.software_costs)}</span></div>
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-slate-500">
              Costing is not started yet. It appears after feasibility is approved. Use the Solution &amp; Costing panel above this lead when the opportunity reaches costing.
            </div>
          )}
        </div>
      )}

      {/* === TAB: DOCUMENTS === */}
      {activeTab === 'documents' && (
        <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 space-y-4">
          <EntityDocumentUpload
            title="Documents"
            entityType="ADDITIONAL_INPUT"
            listEntityTypes={['ADDITIONAL_INPUT', 'LEAD']}
            entityId={lead.id}
            canEdit={Boolean(isPM || isSalesOwner)}
            ensureEntity={async () => lead.id}
          />
          {documents.length > 0 && (
            <div className="divide-y divide-slate-800/60">
              {documents.map((d) => (
                <div key={d.id} className="py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Paperclip className="w-4 h-4 text-cyan-400" />
                    <div>
                      <div className="font-bold text-slate-200">{d.file_name}</div>
                      <div className="text-[11px] text-slate-400">{d.category} • {d.file_size} • {d.uploaded_by}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void openLeadDocument(d)}
                      className="text-[11px] font-semibold text-cyan-400 hover:text-cyan-300"
                    >
                      View / Download
                    </button>
                    <span className="text-[11px] text-slate-500 font-mono">{new Date(d.upload_date).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* === TAB: CUSTOMER COMMUNICATION (Sales/PM only) === */}
      {activeTab === 'communication' && (
        <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 space-y-4">
          {!canViewRestricted ? (
            <div className="p-6 text-center text-amber-400 font-bold text-xs"><AlertTriangle className="w-5 h-5 mx-auto mb-2" /> Customer communication history is restricted to Sales and PM.</div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-bold text-slate-100 text-sm">Customer Activity Log ({activities.length})</h3>
                {(isPM || isSalesOwner) && (
                  <button onClick={() => setShowActivityModal(true)} className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded text-xs flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5" /> Add Activity
                  </button>
                )}
              </div>
              {(isPM || isSalesOwner) && (
                <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Client / customer email</div>
                  <p className="text-[11px] text-slate-400">
                    This sends to {lead.customer_email || 'the customer'} and is kept separate from internal PMS notifications.
                  </p>
                  <input
                    value={clientSubject}
                    onChange={(e) => setClientSubject(e.target.value)}
                    placeholder="Subject"
                    className="w-full rounded border border-slate-800 bg-slate-900 p-2 text-slate-100"
                  />
                  <textarea
                    rows={3}
                    value={clientMessage}
                    onChange={(e) => setClientMessage(e.target.value)}
                    placeholder="Message to the customer"
                    className="w-full rounded border border-slate-800 bg-slate-900 p-2 text-slate-100"
                  />
                  {clientNotice && <div className="text-xs text-emerald-300">{clientNotice}</div>}
                  <button
                    type="button"
                    disabled={clientBusy || !clientSubject.trim() || !clientMessage.trim() || !lead.customer_email}
                    onClick={async () => {
                      setClientBusy(true);
                      setClientNotice('');
                      const result = await NotificationsApi.sendClientEmail({
                        entityType: 'LEAD',
                        entityId: lead.id,
                        subject: clientSubject.trim(),
                        message: clientMessage.trim(),
                        type: 'CLIENT_LEAD_EMAIL',
                      });
                      setClientBusy(false);
                      if (!result.ok) {
                        setActionError(result.message);
                        return;
                      }
                      setClientSubject('');
                      setClientMessage('');
                      setClientNotice('Customer email sent. It appears under Client emails in Notifications.');
                    }}
                    className="flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-amber-500 disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" /> Send customer email
                  </button>
                </div>
              )}
              {activities.length === 0 ? <div className="p-8 text-center text-slate-500">No activities logged yet.</div> : (
                <div className="space-y-3">
                  {activities.map(a => (
                    <div key={a.id} className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-lg space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-cyan-300">{a.activity_type}: {a.subject}</span>
                        <span className="text-[11px] text-slate-500 font-mono">{new Date(a.activity_date).toLocaleString()}</span>
                      </div>
                      <div className="text-slate-400">Contact: {a.contact_person} • By: {a.created_by}</div>
                      <p className="text-slate-200 mt-1 whitespace-pre-wrap">{a.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* === TAB: TIMELINE === */}
      {activeTab === 'timeline' && (
        <div className="space-y-4">
        <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 space-y-4">
          <h3 className="font-bold text-slate-100 text-sm border-b border-slate-800 pb-3">Assignment History</h3>
            {assignmentHistory.length === 0 ? (
              <p className="text-xs text-slate-500">No responsibility transfers recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {assignmentHistory.map((item) => (
                  <div key={item.id} className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg">
                    <div className="font-semibold text-slate-200">
                      {item.assigned_by_name} assigned to {item.new_responsible_user_name}
                    </div>
                    {item.previous_responsible_user_name && (
                      <div className="text-[11px] text-slate-400 mt-0.5">Previous: {item.previous_responsible_user_name}</div>
                    )}
                    {item.reason && <div className="text-[11px] text-slate-500 italic mt-0.5">{item.reason}</div>}
                    <div className="text-[11px] text-slate-500 font-mono mt-1">{new Date(item.assigned_at).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 space-y-4">
          <h3 className="font-bold text-slate-100 text-sm border-b border-slate-800 pb-3">Visit & Quotation Activity</h3>
          {!(lead.visit_activity || []).length && !(lead.quotation_revisions || []).length ? (
            <p className="text-xs text-slate-500">Visit assignments and quotation submissions will appear here.</p>
          ) : (
            <div className="space-y-3">
              {(lead.visit_activity || []).map((item) => (
                <div key={item.id} className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg">
                  <div className="font-semibold text-slate-200">{item.detail}</div>
                  <div className="text-[11px] text-slate-500">{item.actor} · {new Date(item.at).toLocaleString()}</div>
                </div>
              ))}
              {(lead.quotation_revisions || []).map((item) => (
                <div key={item.id} className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg">
                  <div className="font-semibold text-slate-200">{lead.lead_number} {item.revision_label} — {item.status.replace(/_/g, ' ')}</div>
                  {item.reason && <div className="text-[11px] text-slate-400">{item.reason}</div>}
                  <div className="text-[11px] text-slate-500">{item.created_by || item.submitted_by} · {new Date(item.created_at).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
          </div>
          <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 space-y-4">
          <h3 className="font-bold text-slate-100 text-sm border-b border-slate-800 pb-3">Status Transition History</h3>
          <div className="space-y-3">
            {history.map(h => (
              <div key={h.id} className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-200">{h.changed_by}</span>: <span className="font-mono text-amber-400">{h.old_status}</span> → <span className="font-mono text-cyan-400">{h.new_status}</span>
                  {h.reason && <div className="text-slate-400 italic text-[11px] mt-0.5">&quot;{h.reason}&quot;</div>}
                </div>
                <span className="text-[11px] text-slate-500 font-mono">{new Date(h.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
        </div>
      )}

      {/* === TAB: PM REVIEW === */}
      {activeTab === 'review' && (
        <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 space-y-4">
          <h3 className="font-bold text-slate-100 text-sm border-b border-slate-800 pb-3">PM Input Completeness Checklist</h3>
          <div className="space-y-2">
            {[['Customer Information', true], ['Contact Person', !!lead.customer_contact], ['Requirement Summary', !!lead.requirement_summary], ['Detailed Requirement', !!lead.detailed_requirement], ['Application / Use Case', !!lead.application], ['Technical Cycle Time', !!lead.cycle_time], ['Documents', documents.length + additionalDocuments.length > 0]].map(([label, ok]) => (
              <div key={label as string} className="p-2.5 bg-slate-950 border border-slate-800 rounded flex justify-between items-center">
                <span className="text-slate-300">{label as string}</span>
                <span className={`font-bold flex items-center gap-1 ${ok ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {ok ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                  {ok ? 'Complete' : 'Optional / Pending'}
                </span>
              </div>
            ))}
          </div>
          <EntityDocumentUpload
            title="Submitted documents & images"
            entityType="ADDITIONAL_INPUT"
            listEntityTypes={['ADDITIONAL_INPUT', 'LEAD']}
            entityId={lead.id}
            canEdit={false}
            ensureEntity={async () => lead.id}
          />
        </div>
      )}

      {/* ============================================================ */}
      {/* MODALS                                                         */}
      {/* ============================================================ */}

      {/* PM Return Modal */}
      {showReturnModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 text-sm flex items-center gap-2"><RotateCcw className="w-4 h-4 text-amber-400" /> Return Lead to Sales</h3>
              <button onClick={() => setShowReturnModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <textarea rows={4} value={pmReturnReason} onChange={e => setPmReturnReason(e.target.value)} placeholder="Specify exact missing details…" className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded text-slate-100" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowReturnModal(false)} className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded">Cancel</button>
              <button type="button" disabled={!pmReturnReason.trim() || actionBusy} onClick={() => void handlePMReturnToSales()} className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded disabled:opacity-50">Return to Sales</button>
            </div>
          </div>
        </div>
      )}

      {showCancelModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 text-sm">Cancel / Reject Lead</h3>
              <button onClick={() => setShowCancelModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <textarea rows={4} value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="Rejection reason is required…" className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded text-slate-100" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCancelModal(false)} className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded">Back</button>
              <button disabled={!cancelReason.trim() || actionBusy} onClick={() => void handlePMCancel()} className="px-4 py-1.5 bg-rose-700 hover:bg-rose-600 text-white font-bold rounded disabled:opacity-50">Cancel Lead</button>
            </div>
          </div>
        </div>
      )}

      {showForwardModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 text-sm">Forward Lead</h3>
              <button type="button" onClick={() => setShowForwardModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <p className="text-xs text-slate-400">The selected employee becomes the current responsible person and receives email plus in-app notification.</p>
            <select
              value={forwardUserId}
              onChange={(e) => setForwardUserId(e.target.value)}
              className="w-full rounded border border-slate-800 bg-slate-950 p-2.5 text-sm text-slate-100"
            >
              <option value="">Select employee</option>
              {allUsers
                .filter((item) => item.id !== lead.responsible_user_id && item.status === 'ACTIVE')
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.role_name}
                  </option>
                ))}
            </select>
            <textarea
              rows={3}
              value={forwardReason}
              onChange={(e) => setForwardReason(e.target.value)}
              placeholder="Reason (optional)"
              className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded text-slate-100 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowForwardModal(false)} className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded">Cancel</button>
              <button
                type="button"
                disabled={!forwardUserId || actionBusy}
                onClick={() => void handleForwardLead()}
                className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded disabled:opacity-60"
              >
                Forward
              </button>
            </div>
          </div>
        </div>
      )}

      {/* +ADD TEAM Modal */}
      {showAddTeamModal && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl shadow-2xl p-6 space-y-5 my-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 text-sm flex items-center gap-2"><Scan className="w-4 h-4 text-cyan-400" /> Add Team to {lead.lead_number} Feasibility</h3>
              <button onClick={() => setShowAddTeamModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>

            {addTeamError && (
              <div className="p-3 bg-rose-950/80 border border-rose-800 rounded text-rose-300 text-xs">{addTeamError}</div>
            )}

            <form onSubmit={handleAddTeam} className="space-y-4">
              {/* Assignment Type */}
              <div className="grid grid-cols-2 gap-3">
                <div onClick={() => setAddTeamForm(f => ({ ...f, assignmentType: 'NORMAL' }))} className={`p-3 rounded-xl border cursor-pointer transition-all ${addTeamForm.assignmentType === 'NORMAL' ? 'bg-cyan-950/40 border-cyan-500 ring-1 ring-cyan-500/50' : 'bg-slate-950/60 border-slate-800'}`}>
                  <div className="font-bold text-cyan-300 text-xs flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Normal — Assign to Team Lead</div>
                  <p className="text-slate-500 text-[11px] mt-1">PM → TL → Employees (standard hierarchy)</p>
                </div>
                <div onClick={() => setAddTeamForm(f => ({ ...f, assignmentType: 'CRITICAL_DIRECT' }))} className={`p-3 rounded-xl border cursor-pointer transition-all ${addTeamForm.assignmentType === 'CRITICAL_DIRECT' ? 'bg-rose-950/40 border-rose-500 ring-1 ring-rose-500/50' : 'bg-slate-950/60 border-slate-800'}`}>
                  <div className="font-bold text-rose-300 text-xs flex items-center gap-1.5"><ShieldAlert className="w-3.5 h-3.5 text-rose-400" /> Critical Direct — Exception</div>
                  <p className="text-slate-500 text-[11px] mt-1">Bypass TL — employee starts immediately</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Select Team(s) *</label>
                  <div id="demo-team-select" className="max-h-40 space-y-1 overflow-y-auto rounded border border-slate-800 bg-slate-950 p-2">
                    {allTeams.map((t) => {
                      const assigned = teamAssignments.some((a) => a.team_id === t.id && a.status !== 'CANCELLED');
                      const checked = addTeamForm.teamIds.includes(t.id);
                      return (
                        <label key={t.id} className={`flex cursor-pointer items-center gap-2 rounded p-1.5 ${assigned ? 'opacity-50' : 'hover:bg-slate-900'}`}>
                          <input
                            type="checkbox"
                            disabled={assigned}
                            checked={checked}
                            onChange={() =>
                              setAddTeamForm((f) => ({
                                ...f,
                                employeeId: '',
                                teamIds: checked ? f.teamIds.filter((id) => id !== t.id) : [...f.teamIds, t.id],
                              }))
                            }
                            className="h-4 w-4 rounded accent-cyan-500"
                          />
                          <span className="text-slate-100">{t.name}</span>
                          <span className="text-slate-500">· {t.team_lead_name || 'No TL'}</span>
                        </label>
                      );
                    })}
                  </div>
                  {alreadyAssignedSelected.length > 0 && <p className="text-amber-400 text-[11px] mt-1">⚠ One or more selected teams are already assigned.</p>}
                  {addTeamForm.teamIds.length > 1 && addTeamForm.assignmentType === 'CRITICAL_DIRECT' && (
                    <p className="text-amber-400 text-[11px] mt-1">Critical Direct requires a single team. Switch to Normal to assign multiple teams.</p>
                  )}
                </div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Designated Team Lead(s) (Auto)</label>
                  <div className="min-h-[42px] w-full rounded border border-slate-800 bg-slate-950 p-2 text-cyan-300 font-bold">
                    {selectedAddTeams.length
                      ? selectedAddTeams.map((t) => `${t.name}: ${t.team_lead_name || allUsers.find((u) => u.id === t.team_lead_id)?.name || 'Not Assigned'}`).join(' · ')
                      : 'Select teams to see Team Leads'}
                  </div>
                </div>
              </div>

              {addTeamForm.assignmentType === 'CRITICAL_DIRECT' && (
                <div className="p-3 bg-rose-950/30 border border-rose-900/60 rounded-xl space-y-2">
                  <label className="block text-rose-300 font-bold text-xs">Select Employee for Critical Direct *</label>
                  <select value={addTeamForm.employeeId} onChange={e => setAddTeamForm(f => ({ ...f, employeeId: e.target.value }))} className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-100">
                    <option value="">Choose employee from {selectedAddTeam?.name || 'selected team'}…</option>
                    {employeesForSelectedTeam.map(e => <option key={e.id} value={e.id}>{e.name} — {e.role_name}</option>)}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Priority *</label>
                  <select value={addTeamForm.priority} onChange={e => setAddTeamForm(f => ({ ...f, priority: e.target.value as PriorityLevel }))} className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-200">
                    {['Low', 'Medium', 'High', 'Critical'].map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Due Date *</label>
                  <input id="demo-due-date" type="date" value={addTeamForm.dueDate} onChange={e => setAddTeamForm(f => ({ ...f, dueDate: e.target.value }))} className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-100" />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">PM Instructions *</label>
                <textarea rows={2} value={addTeamForm.pmInstructions} onChange={e => setAddTeamForm(f => ({ ...f, pmInstructions: e.target.value }))} placeholder="Scope of feasibility evaluation for this team…" className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded text-slate-100" />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Expected Output / Deliverable</label>
                <input type="text" value={addTeamForm.expectedOutput} onChange={e => setAddTeamForm(f => ({ ...f, expectedOutput: e.target.value }))} placeholder="e.g. Optical FOV & Lighting Feasibility Report" className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-200" />
              </div>

              {addTeamForm.assignmentType === 'CRITICAL_DIRECT' && (
                <div className="p-4 bg-rose-950/50 border border-rose-800 rounded-xl space-y-3">
                  <div className="text-rose-300 font-bold text-xs flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-rose-400" /> CRITICAL DIRECT — Mandatory Details</div>
                  <textarea rows={2} value={addTeamForm.criticalReason} onChange={e => setAddTeamForm(f => ({ ...f, criticalReason: e.target.value }))} placeholder="Customer deadline / urgent feasibility / escalation reason…" className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded text-slate-100 focus:border-rose-500" />
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={addTeamForm.bypassConfirmed} onChange={e => setAddTeamForm(f => ({ ...f, bypassConfirmed: e.target.checked }))} className="w-4 h-4 accent-rose-600 rounded" />
                    <span className="text-rose-300 font-semibold text-xs">I understand this bypasses normal Team Lead allocation.</span>
                  </label>
                </div>
              )}

              <div className="flex justify-end gap-2 border-t border-slate-800 pt-3">
                <button type="button" onClick={() => setShowAddTeamModal(false)} className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded">Cancel</button>
                <button type="submit" className={`px-5 py-2 font-bold text-white rounded-lg flex items-center gap-2 ${addTeamForm.assignmentType === 'CRITICAL_DIRECT' ? 'bg-rose-600 hover:bg-rose-500' : 'bg-cyan-600 hover:bg-cyan-500'}`}>
                  {addTeamForm.assignmentType === 'CRITICAL_DIRECT' ? <><ShieldAlert className="w-4 h-4" /> Dispatch Critical</> : <><Send className="w-4 h-4" /> Assign to Team Lead</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TL Allocate Modal */}
      {showTLAllocateModal && activeAssignment && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 text-sm">Accept & Allocate — {activeAssignment.team_name}</h3>
              <button onClick={() => setShowTLAllocateModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <form onSubmit={handleTLAllocate} className="space-y-3">
              <div className="text-slate-300 text-xs">Lead: <span className="font-bold text-slate-100">{lead.lead_number} — {lead.title}</span></div>
              <label className="block text-slate-300 font-semibold text-xs mb-1">Select Team Member(s) *</label>
              {allUsers.filter(u => u.team_id === activeAssignment.team_id).length === 0 ? (
                <div className="p-4 bg-slate-950 border border-slate-800 rounded text-slate-400 text-center text-xs">No additional team members. Assign work to yourself or add engineers in User Management.</div>
              ) : (
                <div className="space-y-2 max-h-36 overflow-y-auto bg-slate-950 p-2 border border-slate-800 rounded">
                  {allUsers.filter(u => u.team_id === activeAssignment.team_id).map(m => (
                    <label key={m.id} className="flex items-center gap-2 p-1.5 hover:bg-slate-900 rounded cursor-pointer">
                      <input type="checkbox" checked={selectedEmployees.includes(m.id)} onChange={e => setSelectedEmployees(e.target.checked ? [...selectedEmployees, m.id] : selectedEmployees.filter(id => id !== m.id))} className="w-4 h-4 accent-cyan-500 rounded" />
                      <span className="font-medium text-slate-200 text-xs">{m.name} — {m.role_name}</span>
                    </label>
                  ))}
                </div>
              )}
              {selectedEmployees.map(empId => (
                <div key={empId}>
                  <label className="block text-slate-400 text-xs mb-1">Responsibility for {allUsers.find(u => u.id === empId)?.name}</label>
                  <input type="text" value={responsibilities[empId] || ''} onChange={e => setResponsibilities({ ...responsibilities, [empId]: e.target.value })} placeholder="e.g. Camera & lens FOV feasibility analysis" className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-200 text-xs" />
                </div>
              ))}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button type="button" onClick={() => setShowTLAllocateModal(false)} className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded text-xs">Cancel</button>
                <button type="submit" disabled={selectedEmployees.length === 0} className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded text-xs">Approve & Allocate</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TL Suggest Change Modal */}
      {showSuggestModal && activeAssignment && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 text-sm">Suggest Change to PM</h3>
              <button onClick={() => setShowSuggestModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <form onSubmit={handleTLSuggest} className="space-y-3">
              <select value={suggestionType} onChange={e => setSuggestionType(e.target.value)} className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-200 text-xs">
                {['Different employee required', 'Different team required', 'Due date needs change', 'Resource unavailable', 'Skill mismatch', 'Workload conflict', 'Requirement unclear', 'Other'].map(t => <option key={t}>{t}</option>)}
              </select>
              <textarea rows={3} required value={suggestionComment} onChange={e => setSuggestionComment(e.target.value)} placeholder="Specify change reason…" className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded text-slate-100 text-xs" />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowSuggestModal(false)} className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded text-xs">Cancel</button>
                <button type="submit" className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded text-xs">Submit Suggestion</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TL Clarification Modal */}
      {showClarifyModal && activeAssignment && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 text-sm">Request Clarification from PM</h3>
              <button onClick={() => setShowClarifyModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <form onSubmit={handleTLClarify} className="space-y-3">
              <textarea rows={3} required value={clarificationComment} onChange={e => setClarificationComment(e.target.value)} placeholder="What additional information is needed before allocation?" className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded text-slate-100 text-xs" />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowClarifyModal(false)} className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded text-xs">Cancel</button>
                <button type="submit" className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded text-xs">Send Request</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Activity Modal */}
      {showActivityModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 text-sm">Add Customer Activity Log</h3>
              <button onClick={() => setShowActivityModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <form onSubmit={handleAddActivity} className="space-y-3">
              <select value={activityForm.activity_type} onChange={e => setActivityForm({ ...activityForm, activity_type: e.target.value as any })} className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-200 text-xs">
                {['Customer Call', 'Customer Meeting', 'Customer Email', 'Customer Visit', 'Technical Discussion'].map(t => <option key={t}>{t}</option>)}
              </select>
              <input type="text" required value={activityForm.subject} onChange={e => setActivityForm({ ...activityForm, subject: e.target.value })} placeholder="Subject / Topic *" className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-200 text-xs" />
              <textarea rows={3} required value={activityForm.description} onChange={e => setActivityForm({ ...activityForm, description: e.target.value })} placeholder="Notes / Discussion details…" className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded text-slate-200 text-xs" />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowActivityModal(false)} className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded text-xs">Cancel</button>
                <button type="submit" className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded text-xs">Save Activity</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload Document Modal */}
      {showDocModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 text-sm">Upload Document</h3>
              <button onClick={() => setShowDocModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <form onSubmit={handleAddDocument} className="space-y-3">
              <input type="text" required value={docForm.file_name} onChange={e => setDocForm({ ...docForm, file_name: e.target.value })} placeholder="File Name *" className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-200 text-xs" />
              <select value={docForm.category} onChange={e => setDocForm({ ...docForm, category: e.target.value as any })} className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-200 text-xs">
                {['Customer Drawing', 'Technical Specification', 'Layout', 'Images', 'Videos', 'Existing Machine Photos', 'Sample Information', 'RFQ', 'Customer Email / Document', 'Other'].map(c => <option key={c}>{c}</option>)}
              </select>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowDocModal(false)} className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded text-xs">Cancel</button>
                <button type="submit" className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded text-xs">Upload & Attach</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
