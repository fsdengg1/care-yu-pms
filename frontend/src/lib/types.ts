// ============================================================
// CARE YU AUTOMATION — PROJECT HUB
// Types — v6 (Phase 3A Architecture Correction)
// Lead is the parent. Multi-team feasibility per Lead.
// ============================================================

export interface User {
  id: string;
  employee_id: string;
  name: string;
  email: string;
  phone: string;
  role_id: string;
  role_code: string;
  role_name: string;
  team_id?: string;
  team_name?: string;
  team_lead_id?: string;
  team_lead_name?: string;
  reporting_manager_id?: string;
  reporting_manager_name?: string;
  status: 'ACTIVE' | 'INACTIVE';
  account_status?:
    | 'INVITED'
    | 'INVITATION_VERIFIED'
    | 'PASSWORD_SETUP_REQUIRED'
    | 'ACTIVE'
    | 'DISABLED'
    | 'INVITATION_EXPIRED';
  has_password?: boolean;
  email_verified?: boolean;
  password_changed_at?: string;
  password_created_at?: string;
  notification_preferences?: NotificationPreferences;
  created_at: string;
  updated_at: string;
}

export type NotificationPreferenceCategory = 'assignment' | 'forward' | 'reminder' | 'approval';

export interface NotificationPreferences {
  email_enabled: boolean;
  in_app_enabled: boolean;
  assignment: boolean;
  forward: boolean;
  reminder: boolean;
  approval: boolean;
}

export interface Role {
  id: string;
  code: string;
  name: string;
  description: string;
  permissions: string[];
}

export interface Team {
  id: string;
  code: string;
  name: string;
  description: string;
  team_lead_id?: string;
  team_lead_name?: string;
  member_count: number;
  status: 'ACTIVE' | 'INACTIVE';
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string;
  user_name: string;
  user_role: string;
  entity_type: 'USER' | 'TEAM' | 'ROLE' | 'LEAD' | 'FEASIBILITY' | 'TASK' | 'SYSTEM' | 'AUTH' | 'PROJECT' | 'ESCALATION' | 'DAILY_UPDATE' | 'CONVERSATION' | 'DOCUMENT' | 'ANNOUNCEMENT' | 'FORUM';
  entity_id: string;
  entity_name?: string;
  action: string;
  description: string;
  assigned_to?: string;
  assigned_to_id?: string;
  assigned_to_name?: string;
  old_value?: string;
  new_value?: string;
  created_at: string;
}

export type ChatMessageType =
  | 'TEXT'
  | 'LINK'
  | 'IMAGE'
  | 'DOCUMENT'
  | 'PDF'
  | 'EXCEL'
  | 'WORD'
  | 'POWERPOINT'
  | 'NOTE'
  | 'FILE';

export interface NotificationItem {
  id: string;
  recipient_id: string;
  type:
    | 'TASK_ASSIGNED'
    | 'SUGGESTION_ADDED'
    | 'STATUS_CHANGED'
    | 'SYSTEM'
    | 'BLOCKER'
    | 'NEW_LEAD_TO_PM'
    | 'LEAD_RETURNED_TO_SALES'
    | 'LEAD_RESUBMITTED_TO_PM'
    | 'LEAD_ACCEPTED_FOR_FEASIBILITY'
    | 'CUSTOMER_INFORMATION_ADDED'
    | 'DOCUMENT_ADDED'
    | 'FEASIBILITY_ASSIGNED_TO_TEAM_LEAD'
    | 'TEAM_LEAD_ALLOCATED_EMPLOYEE'
    | 'TEAM_LEAD_SUGGESTION'
    | 'TEAM_LEAD_CLARIFICATION_REQUEST'
    | 'CRITICAL_DIRECT_ASSIGNMENT_TO_EMPLOYEE'
    | 'CRITICAL_ASSIGNMENT_TEAM_LEAD_NOTICE'
    | 'FEASIBILITY_READY_TO_START'
    | 'FEASIBILITY_SUBMITTED_TO_PM'
    | 'FEASIBILITY_RETURNED_TO_TEAM'
    | 'COSTING_ASSIGNED'
    | 'COSTING_RETURNED'
    | 'COSTING_SUBMITTED_TO_PM'
    | 'QUOTATION_READY'
    | 'LEAD_CONVERTED'
    | 'DAILY_UPDATE_BLOCKED'
    | 'DAILY_UPDATE_SUBMITTED'
    | 'NO_RECENT_UPDATE'
    | 'CRITICAL_ESCALATION'
    | 'PROJECT_AT_RISK'
    | 'PROJECT_COMPLETED'
    | 'CHAT_MESSAGE'
    | 'DIRECT_MESSAGE'
    | 'GROUP_MESSAGE'
    | 'ANNOUNCEMENT'
    | 'STAGE_COMPLETED'
    | 'FORUM_POST'
    | 'FORUM_REPLY'
    | 'FORUM_MENTION'
    | 'FORUM_REACTION'
    | 'FORUM_PINNED'
    | 'LEAD_ASSIGNED'
    | 'LEAD_FORWARDED'
    | 'LEAD_ACCEPTED'
    | 'TASK_FORWARDED'
    | 'ACTION_REQUIRED'
    | 'DAILY_REMINDER'
    | 'ESCALATION'
    | 'APPROVAL_REQUIRED'
    | 'CLIENT_PROPOSAL'
    | 'CLIENT_LEAD_EMAIL'
    | 'CLIENT_PROJECT_UPDATE'
    | 'CLIENT_COMMUNICATION';
  title: string;
  message: string;
  entity_type: string;
  entity_id: string;
  sender_id?: string;
  message_type?: ChatMessageType;
  message_id?: string;
  action_url?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  event_key?: string;
  email_status?: 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED' | 'NOT_SENT';
  email_sent_at?: string;
  acted_at?: string;
  read_status: boolean;
  read_at?: string;
  is_cleared?: boolean;
  cleared_at?: string;
  created_at: string;
  email_channel?: EmailChannel;
  email_policy?: EmailPolicy;
  email_dispatch?: EmailDispatchStatus;
  notification_status?: NotificationLifecycleStatus;
  viewed_at?: string;
  completed_at?: string;
  overdue_at?: string;
  reminder_due_at?: string;
  stage_name?: string;
  email_payload?: NotificationEmailPayload;
  notification_history?: NotificationHistoryEntry[];
  recipient_name?: string;
  recipient_email?: string;
  sender_name?: string;
  can_send_email?: boolean;
}

export type EmailChannel = 'INTERNAL' | 'CLIENT';
export type EmailPolicy = 'IMMEDIATE' | 'DEFERRED';
export type EmailDispatchStatus = 'NOT_SENT' | 'MANUALLY_SENT' | 'AUTOMATICALLY_SENT' | 'FAILED' | 'SKIPPED';
export type NotificationLifecycleStatus =
  | 'NOT_SENT'
  | 'MANUALLY_SENT'
  | 'AUTOMATICALLY_SENT'
  | 'VIEWED'
  | 'COMPLETED'
  | 'OVERDUE';

export interface NotificationEmailPayload {
  subject: string;
  html: string;
  text: string;
  type: string;
}

export interface NotificationHistoryEntry {
  status: NotificationLifecycleStatus;
  reason: string;
  actor_id?: string;
  actor_name?: string;
  created_at: string;
}

export type ResponsibilityEntityType = 'LEAD' | 'TASK' | 'PROJECT';

export interface AssignmentHistory {
  id: string;
  entity_type: ResponsibilityEntityType;
  entity_id: string;
  previous_responsible_user_id?: string;
  previous_responsible_user_name?: string;
  new_responsible_user_id: string;
  new_responsible_user_name: string;
  assigned_by_id: string;
  assigned_by_name: string;
  assigned_at: string;
  reason?: string;
  accepted_at?: string;
  accepted_by_id?: string;
}

export type EmailDeliveryStatus = 'PENDING' | 'SENT' | 'FAILED';

export interface NotificationDelivery {
  id: string;
  notification_id: string;
  event_key: string;
  recipient_user_id: string;
  recipient_email: string;
  subject: string;
  email_type: string;
  status: EmailDeliveryStatus;
  transaction_id?: string;
  sent_at?: string;
  failure_reason?: string;
  retry_count: number;
  created_at: string;
  updated_at: string;
  email_channel?: EmailChannel;
  dispatch_mode?: 'MANUAL' | 'AUTOMATIC' | 'IMMEDIATE' | 'DEFERRED';
}

export type LeadStatus =
  | 'DRAFT'
  | 'SUBMITTED_TO_PM'
  | 'UNDER_PM_REVIEW'
  | 'RETURNED_TO_SALES'
  | 'ADDITIONAL_INFORMATION_REQUIRED'
  | 'RESUBMITTED_TO_PM'
  | 'ACCEPTED_FOR_FEASIBILITY'
  | 'FEASIBILITY_IN_PROGRESS'
    | 'FEASIBILITY_SUBMITTED'
    | 'FEASIBILITY_RETURNED'
    | 'FEASIBILITY_REJECTED'
    | 'COSTING_IN_PROGRESS'
    | 'COSTING_SUBMITTED'
    | 'COSTING_RETURNED'
    | 'COSTING_REJECTED'
  | 'QUOTATION'
  | 'NEGOTIATION'
  | 'ORDER_CONVERTED'
  | 'WON'
  | 'LOST'
  | 'ON_HOLD'
  | 'CANCELLED';

export type PipelineStage =
  | 'PROJECT_INPUT'
  | 'PM_REVIEW'
  | 'FEASIBILITY'
  | 'COSTING'
  | 'QUOTATION'
  | 'NEGOTIATION'
  | 'CONVERTED'
  | 'REJECTED'
  | 'CANCELLED';

export type CustomerType =
  | 'Automotive'
  | 'Manufacturing'
  | 'Warehouse / Logistics'
  | 'FMCG'
  | 'Electronics'
  | 'Pharmaceutical'
  | 'Other';

export type BusinessVertical = 'Business Head' | 'Engineering Director';

export type PriorityLevel = 'Low' | 'Medium' | 'High' | 'Critical';

export interface LeadCustomField {
  id: string;
  name: string;
  value: string;
}

export interface LeadDocument {
  id: string;
  lead_id: string;
  file_name: string;
  file_type: string;
  file_size: string;
  uploaded_by: string;
  uploaded_by_id: string;
  upload_date: string;
  category:
    | 'Customer Drawing'
    | 'Technical Specification'
    | 'Layout'
    | 'Images'
    | 'Videos'
    | 'Existing Machine Photos'
    | 'Sample Information'
    | 'RFQ'
    | 'Customer Email / Document'
    | 'Required Document'
    | 'Feasibility Document'
    | 'Quotation'
    | 'Vendor Quotation'
    | 'Costing Support'
    | 'Negotiation Support'
    | 'Additional Input'
    | 'Other';
  file_url?: string;
  mime_type?: string;
  upload_status?: 'UPLOADED' | 'FAILED';
}

export interface LeadActivity {
  id: string;
  lead_id: string;
  activity_type:
    | 'Customer Call'
    | 'Customer Meeting'
    | 'Customer Email'
    | 'Customer Visit'
    | 'Customer Document Received'
    | 'Technical Discussion'
    | 'Commercial Discussion'
    | 'Other';
  activity_date: string;
  contact_person: string;
  subject: string;
  description: string;
  attachment_id?: string;
  created_by: string;
  created_by_id: string;
  created_at: string;
}

export interface LeadComment {
  id: string;
  lead_id: string;
  author_id: string;
  author_name: string;
  author_role: string;
  comment: string;
  comment_type:
    | 'PM Review'
    | 'Information Request'
    | 'Sales Response'
    | 'Internal Comment'
    | 'General';
  created_at: string;
}

export interface LeadStatusHistory {
  id: string;
  lead_id: string;
  old_status: LeadStatus;
  new_status: LeadStatus;
  changed_by: string;
  changed_by_id: string;
  changed_by_role?: string;
  reason?: string;
  created_at: string;
}

export interface Lead {
  id: string;
  lead_number: string;
  title: string;
  customer_name: string;
  customer_type: CustomerType;
  business_vertical: BusinessVertical;
  created_by: string;
  created_by_id: string;
  created_by_role: string;
  sales_owner: string;
  sales_owner_id: string;
  lead_date: string;
  expected_decision_date?: string;
  priority: PriorityLevel;
  status: LeadStatus;

  // Customer Contact — RESTRICTED (Sales/PM only)
  customer_contact: string;
  customer_designation?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_location?: string;
  plant_location?: string;

  // Requirement — visible to Engineering teams
  requirement_summary: string;
  detailed_requirement: string;
  application: string;
  industry_process?: string;
  current_process?: string;
  expected_automation?: string;
  customer_objective?: string;
  expected_project_timeline?: string;
  customer_target_date?: string;

  // Technical Inputs — visible to Engineering teams
  production_quantity?: string;
  production_rate?: string;
  cycle_time?: string;
  shift_pattern?: string;
  operating_hours?: string;
  existing_equipment?: string;
  existing_automation?: string;
  integration_requirements?: string;
  technical_requirements?: string;
  machine_dimensions?: string;
  payload?: string;
  accuracy_requirement?: string;
  environment_conditions?: string;
  technical_specifications?: string;
  technical_assumptions?: string;
  customer_dependencies?: string;

  // Commercial — RESTRICTED (PM/Sales/CEO only)
  customer_budget?: string;
  estimated_opportunity_value?: string;
  expected_value?: number;
  pipeline_stage?: PipelineStage;
  currency: string;
  expected_po_date?: string;
  commercial_remarks?: string;

  pm_return_reason?: string;
  pm_review_notes?: string;
  additional_notes?: string;
  required_documents?: string;
  competitor_information?: string;
  customer_challenge?: string;
  required_solution?: string;
  project_description?: string;
  custom_fields?: LeadCustomField[];
  submitted_by?: string;
  submitted_by_id?: string;

  assigned_team_id?: string;
  assigned_team_name?: string;
  assigned_team_ids?: string[];
  assigned_team_names?: string[];
  assigned_team_lead_id?: string;
  assigned_team_lead_name?: string;
  assignment_path?: 'TEAM_LEAD' | 'DIRECT_MEMBER';
  assigned_member_id?: string;
  assigned_member_name?: string;
  pm_id?: string;
  pm_name?: string;
  project_id?: string;
  converted_at?: string;

  feasibility_return_reason?: string;
  costing_return_reason?: string;

  visit_requirement?: VisitRequirement;
  visit_status?: VisitStatus;
  visit_site_name?: string;
  visit_site_address?: string;
  visit_city?: string;
  visit_state?: string;
  visit_country?: string;
  visit_contact_name?: string;
  visit_contact_phone?: string;
  visit_contact_email?: string;
  visit_preferred_date?: string;
  visit_preferred_time?: string;
  visit_remarks?: string;
  visit_visitor_name?: string;
  visit_visitor_designation?: string;
  visit_visitor_count?: string;
  visit_purpose?: string;
  visit_special_requirements?: string;
  visit_office_address?: string;
  visit_assigned_user_ids?: string[];
  visit_assigned_user_names?: string[];
  visit_assigned_by?: string;
  visit_assigned_by_id?: string;
  visit_assigned_at?: string;
  visit_scheduled_date?: string;
  visit_scheduled_time?: string;
  visit_activity?: VisitActivity[];
  quotation_revisions?: QuotationRevision[];

  feasibility_study?: FeasibilityStudy;
  costing?: CostingRecord;
  quotation?: QuotationRecord;
  negotiation_history?: NegotiationEntry[];

  created_at: string;
  updated_at: string;
  submitted_at?: string;
  reviewed_at?: string;
  accepted_at?: string;
  accepted_by_id?: string;
  accepted_by_name?: string;
  responsible_user_id?: string;
  responsible_user_name?: string;
  responsible_role_code?: string;
  current_owner_id?: string;
  current_owner_name?: string;
  cancelled_at?: string;
  cancelled_by_id?: string;
  cancelled_by_name?: string;
  cancel_reason?: string;
  assigned_by_id?: string;
  assigned_by_name?: string;
  assigned_at?: string;
  forwarded_by_id?: string;
  forwarded_by_name?: string;
  forwarded_at?: string;
  pending_action?: boolean;
  last_action_at?: string;
  reminder_count?: number;
  last_reminder_at?: string;
  next_reminder_at?: string;
  escalated_at?: string;
  escalated_to_user_id?: string;
  previous_status?: LeadStatus;
  previous_action?: string;
  next_action?: string;
  action_required?: string;
  due_date?: string;
  approval_pending?: boolean;
}

export type WorkflowRecordStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'RETURNED' | 'REJECTED';

export type FeasibilityReviewAction = 'ACCEPT' | 'REJECT' | 'SEND_BACK';

export interface FeasibilityReviewRecord {
  id: string;
  action: FeasibilityReviewAction;
  reason?: string;
  reviewed_by: string;
  reviewed_by_id: string;
  reviewed_at: string;
}

export interface FeasibilityStudy {
  technical_feasibility: string;
  required_resources: string;
  proposed_solution: string;
  major_constraints: string;
  estimated_timeline: string;
  technical_assumptions: string;
  required_equipment: string;
  team_remarks: string;
  documents: string[];
  status: WorkflowRecordStatus;
  submitted_by?: string;
  submitted_by_id?: string;
  submitted_at?: string;
  started_at?: string;
  started_by?: string;
  started_by_id?: string;
  pm_approved_by?: string;
  pm_approved_at?: string;
  pm_return_reason?: string;
  review_action?: FeasibilityReviewAction;
  reviewed_by?: string;
  reviewed_by_id?: string;
  reviewed_at?: string;
  rejection_reason?: string;
  send_back_reason?: string;
  review_history?: FeasibilityReviewRecord[];
}

export interface CostingRecord {
  bom_components: string;
  vendor_requirements: string;
  vendor_quotations: string;
  component_costs: number;
  procurement_costs: number;
  engineering_costs: number;
  software_costs: number;
  installation_costs: number;
  other_costs: number;
  total_estimated_cost: number;
  commercial_assumptions: string;
  documents: string[];
  status: WorkflowRecordStatus;
  submitted_by?: string;
  submitted_by_id?: string;
  submitted_at?: string;
  pm_approved_by?: string;
  pm_approved_at?: string;
  pm_return_reason?: string;
}

export type VisitRequirement = 'NONE' | 'CUSTOMER_SITE' | 'CAREYU_OFFICE';

export type VisitStatus =
  | 'NOT_REQUIRED'
  | 'PENDING_PM_ASSIGNMENT'
  | 'TEAM_ASSIGNED'
  | 'SCHEDULED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'RESCHEDULED';

export interface VisitActivity {
  id: string;
  at: string;
  actor: string;
  actor_id: string;
  action: string;
  detail: string;
}

export type QuotationWorkflowStatus =
  | 'DRAFT'
  | 'PENDING_INTERNAL'
  | 'SUBMITTED_TO_CUSTOMER'
  | 'CUSTOMER_REVIEW'
  | 'REVISION_REQUESTED'
  | 'REVISION_IN_PROGRESS';

export type QuotationSubmissionMethod = 'EMAIL' | 'WHATSAPP' | 'EMAIL_AND_WHATSAPP' | 'OTHER';

export interface QuotationRecord {
  quotation_value: number;
  commercial_terms: string;
  validity: string;
  payment_terms: string;
  delivery_terms: string;
  document_name?: string;
  sent_at?: string;
  sent_by?: string;
  sent_by_id?: string;
  revised_value?: number;
  revision?: number;
  revision_label?: string;
  revision_id?: string;
  workflow_status?: QuotationWorkflowStatus;
  submission_method?: QuotationSubmissionMethod;
  submission_remarks?: string;
  submitted_to_customer_at?: string;
  submitted_to_customer_by?: string;
  submitted_to_customer_by_id?: string;
  revision_reason?: string;
  created_at?: string;
  created_by?: string;
  created_by_id?: string;
}

export interface QuotationRevision {
  id: string;
  revision: number;
  revision_label: string;
  quotation: QuotationRecord;
  created_at: string;
  created_by?: string;
  created_by_id?: string;
  status: QuotationWorkflowStatus;
  submitted_at?: string;
  submitted_by?: string;
  submitted_by_id?: string;
  submission_method?: QuotationSubmissionMethod;
  remarks?: string;
  reason?: string;
}

export interface NegotiationEntry {
  id: string;
  customer_feedback: string;
  notes: string;
  revised_value?: number;
  customer_requests: string;
  commercial_changes: string;
  follow_up_date?: string;
  document_name?: string;
  action: 'UPDATE' | 'REVISED_QUOTATION' | 'CONVERT' | 'LOST' | 'COMPLETE';
  created_by: string;
  created_by_id: string;
  created_at: string;
}

export type MyWorkCategory =
  | 'CREATE'
  | 'DRAFT'
  | 'RETURNED'
  | 'PM_REVIEW'
  | 'ASSIGN'
  | 'FEASIBILITY'
  | 'FEASIBILITY_APPROVAL'
  | 'COSTING'
  | 'COSTING_APPROVAL'
  | 'QUOTATION'
  | 'NEGOTIATION'
  | 'EXECUTION'
  | 'TASK'
  | 'TASK_REVIEW'
  | 'ESCALATION';

export interface MyWorkItem {
  lead_id: string;
  lead_number: string;
  title: string;
  customer_name: string;
  status: string;
  pipeline_stage: string;
  category: MyWorkCategory;
  summary: string;
  href: string;
  priority: PriorityLevel;
  due_date?: string;
  action_required?: string;
  current_owner?: string;
  assigned_by?: string;
  approval_pending?: boolean;
}

export interface LeadWorkflowPayload {
  lead: Lead;
  documents: LeadDocument[];
  comments: LeadComment[];
  activities: LeadActivity[];
  history: LeadStatusHistory[];
  assignments: FeasibilityTeamAssignment[];
  allocations: FeasibilityEmployeeAllocation[];
  teams: Team[];
  users: User[];
  assignment?: FeasibilityTeamAssignment;
  project?: Project;
  additionalDocuments?: EntityDocument[];
  assignmentHistory?: AssignmentHistory[];
  tasks?: Task[];
}

// ============================================================
// ENGINEERING INPUT PACKAGE
// Filtered view of Lead for Team Leads / Team Members.
// Does NOT include: customer contact, communication, commercial.
// ============================================================
export interface LeadEngineeringView {
  lead_id: string;
  lead_number: string;
  title: string;
  customer_name: string; // Customer name shown; NOT contact person
  priority: PriorityLevel;
  business_vertical: BusinessVertical;

  // Requirement
  requirement_summary: string;
  detailed_requirement: string;
  application: string;
  industry_process?: string;
  current_process?: string;
  expected_automation?: string;
  customer_objective?: string;
  expected_project_timeline?: string;
  customer_target_date?: string;

  // Technical Inputs
  production_quantity?: string;
  production_rate?: string;
  cycle_time?: string;
  shift_pattern?: string;
  operating_hours?: string;
  existing_equipment?: string;
  existing_automation?: string;
  integration_requirements?: string;
  technical_requirements?: string;
  machine_dimensions?: string;
  payload?: string;
  accuracy_requirement?: string;
  environment_conditions?: string;
  technical_specifications?: string;
  technical_assumptions?: string;
  customer_dependencies?: string;

  // Permitted documents (all engineering-type docs)
  documents: LeadDocument[];
}

// ============================================================
// PHASE 3A — FEASIBILITY TEAM ASSIGNMENT
// One Lead → Many FeasibilityTeamAssignments
// ============================================================

export type AssignmentType = 'NORMAL' | 'CRITICAL_DIRECT';

export type FeasibilityTeamAssignmentStatus =
  | 'PENDING_TEAM_LEAD_REVIEW'
  | 'CHANGE_SUGGESTED'
  | 'CLARIFICATION_REQUIRED'
  | 'ALLOCATED_TO_TEAM_MEMBER'
  | 'READY_TO_START'
  | 'IN_PROGRESS'
  | 'SUBMITTED_TO_PM'
  | 'PM_REVIEW'
  | 'COMPLETED'
  | 'ON_HOLD'
  | 'CANCELLED'
  | 'CRITICAL_DIRECT_ASSIGNED';

export type AllocationApprovalStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'CHANGE_REQUESTED'
  | 'BYPASSED_CRITICAL';

/**
 * FeasibilityTeamAssignment — one entry per team per Lead.
 * A Lead can have many of these (one per team).
 * lead_id is the foreign key — Lead is the parent.
 */
export interface FeasibilityTeamAssignment {
  id: string;
  lead_id: string;                   // FK → Lead (Lead is the parent)
  team_id: string;
  team_name: string;
  team_lead_id?: string;
  team_lead_name?: string;
  assignment_type: AssignmentType;
  priority: PriorityLevel;
  due_date: string;
  pm_instructions: string;
  expected_output?: string;
  critical_reason?: string;
  status: FeasibilityTeamAssignmentStatus;
  created_by: string;
  created_by_id: string;
  created_at: string;
  updated_at: string;
}

/**
 * FeasibilityEmployeeAllocation — one entry per employee per team assignment.
 * A FeasibilityTeamAssignment can have many of these.
 */
export interface FeasibilityEmployeeAllocation {
  id: string;
  feasibility_team_assignment_id: string;  // FK → FeasibilityTeamAssignment
  lead_id: string;                          // Denormalised for convenience
  team_id: string;
  team_lead_id?: string;
  employee_id: string;
  employee_name: string;
  responsibility: string;
  approval_status: AllocationApprovalStatus;
  allocated_by: string;
  allocated_at: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

/**
 * FeasibilitySuggestion — Team Lead suggestions/clarification requests to PM.
 */
export interface FeasibilitySuggestion {
  id: string;
  feasibility_team_assignment_id: string;
  lead_id: string;
  created_by: string;
  created_by_id: string;
  suggestion_type:
    | 'Different employee required'
    | 'Different team required'
    | 'Due date needs change'
    | 'Resource unavailable'
    | 'Skill mismatch'
    | 'Workload conflict'
    | 'Requirement unclear'
    | 'Other';
  comment: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'MODIFIED';
  pm_response?: string;
  created_at: string;
  resolved_at?: string;
}

/**
 * Task — linked to Lead + FeasibilityTeamAssignment + EmployeeAllocation.
 * Feasibility tasks are never orphaned from a Lead.
 */
export type GanttStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED' | 'DELAYED';

export interface ProjectPhase {
  id: string;
  project_id: string;
  name: string;
  sort_order: number;
  start_date?: string;
  due_date?: string;
  remarks?: string;
  progress?: number;
  created_at: string;
  updated_at: string;
}

export type WorkTaskType = 'PROJECT_TASK' | 'NON_PROJECT_TASK' | 'LEAD_TASK';

export interface Task {
  id: string;
  lead_id: string;
  lead_name?: string;
  lead_stage_at_creation?: string;
  customer_name?: string;
  project_id?: string;
  project_name?: string;
  feasibility_team_assignment_id?: string;
  employee_allocation_id?: string;
  title: string;
  description?: string;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED' | 'WAITING' | 'HOLD' | 'CANCELLED';
  priority: PriorityLevel;
  due_date?: string;
  assigned_to: string;
  assigned_to_id: string;
  created_by: string;
  created_by_id: string;
  progress_percent?: number;
  last_update_at?: string;
  blocked_reason?: string;
  phase_id?: string;
  parent_task_id?: string;
  team_id?: string;
  team_name?: string;
  start_date?: string;
  duration_days?: number;
  depends_on_id?: string;
  depends_on_ids?: string[];
  is_additional?: boolean;
  is_milestone?: boolean;
  remarks?: string;
  task_type?: WorkTaskType;
  assigned_by?: string;
  assigned_by_id?: string;
  review_status?: 'NONE' | 'PENDING_TL_REVIEW' | 'CORRECTION_REQUIRED' | 'COMPLETED';
  comments?: TaskComment[];
  responsible_user_id?: string;
  responsible_user_name?: string;
  pending_action?: boolean;
  last_action_at?: string;
  reminder_count?: number;
  last_reminder_at?: string;
  next_reminder_at?: string;
  escalated_at?: string;
  escalated_to_user_id?: string;
  acceptance_status?: 'REQUESTED' | 'ACCEPTED' | 'REJECTED';
  requested_by_id?: string;
  requested_by_name?: string;
  requested_from_task_id?: string;
  progress_manual_override?: boolean;
  sheet_hidden?: boolean;
  delay_reason?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface TaskComment {
  id: string;
  user_id: string;
  user_name: string;
  comment: string;
  created_at: string;
}

export interface GanttTask extends Task {
  phase_name?: string;
  depends_on_title?: string;
  parent_title?: string;
  gantt_status: GanttStatus;
  latest_update_id?: string;
  latest_update_at?: string;
  latest_blocker?: string;
}

export interface PlanningAssignee {
  id: string;
  name: string;
  role_code: string;
  role_name: string;
  team_id?: string;
  team_name?: string;
}

export type GanttProjectRole = 'PROJECT_MANAGER' | 'TEAM_LEAD' | 'TEAM_MEMBER' | 'BUSINESS_HEAD' | 'ENG_DIRECTOR' | 'CEO' | 'CTO' | 'SYSTEM_ADMIN' | 'NONE';

export interface PlanningProjectSummary {
  id: string;
  code: string;
  name: string;
  customer_name: string;
  pm_id: string;
  pm_name: string;
  team_lead_id?: string;
  team_lead_name?: string;
  progress: number;
  health: ProjectHealth;
  status: ProjectStatus;
  plan_initialized?: boolean;
  start_date?: string;
  target_completion?: string;
  canManage: boolean;
  canViewGantt: boolean;
  canEditGantt: boolean;
  canManageGantt: boolean;
  projectRole: GanttProjectRole;
  taskCount: number;
  delayedCount: number;
  blockedCount: number;
  milestoneCount: number;
}

export interface PlanningPlanPayload {
  project: Project;
  canManage: boolean;
  canViewGantt: boolean;
  canEditGantt: boolean;
  canManageGantt: boolean;
  projectRole: GanttProjectRole;
  phases: ProjectPhase[];
  tasks: GanttTask[];
  teams: Array<{ id: string; name: string; team_lead_id?: string; team_lead_name?: string }>;
  assignees: PlanningAssignee[];
  delayed: GanttTask[];
  blocked: GanttTask[];
}

export interface DashboardMetrics {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  atRiskProjects: number;
  totalLeads: number;
  preSalesPipelineValue: string;
  totalEmployees: number;
  totalTeams: number;
  pendingProcurements: number;
  pendingTLFeedback: number;
}

export type ProjectHealth = 'ON_TRACK' | 'AT_RISK' | 'CRITICAL';
export type ProjectStatus = 'ACTIVE' | 'ON_HOLD' | 'HANDOVER' | 'COMPLETED' | 'CANCELLED';
export type ProjectIntakeStatus =
  | 'DRAFT'
  | 'SUBMITTED_TO_PM'
  | 'RETURNED_TO_CREATOR'
  | 'AWAITING_ASSIGNMENT'
  | 'PENDING_TL_REVIEW'
  | 'ACCEPTED'
  | 'RETURNED'
  | 'IN_EXECUTION';
export type ProjectAssignmentPath = 'TEAM_LEAD' | 'DIRECT_MEMBER';
export type ProjectMonitorStatus = 'ON_TRACK' | 'ISSUE_IDENTIFIED';

export interface ProjectRemark {
  id: string;
  user_id: string;
  user_name: string;
  user_role: string;
  comment: string;
  created_at: string;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  customer_name: string;
  pm_id: string;
  pm_name: string;
  team_lead_id?: string;
  team_lead_name?: string;
  progress: number;
  health: ProjectHealth;
  status: ProjectStatus;
  issue?: string;
  lead_id?: string;
  lead_number?: string;
  team_ids?: string[];
  value?: number;
  start_date?: string;
  target_completion?: string;
  current_phase?: string;
  last_update_at?: string;
  progress_locked_by_pm?: boolean;
  plan_initialized?: boolean;
  remarks?: ProjectRemark[];
  intake_status?: ProjectIntakeStatus;
  assignment_path?: ProjectAssignmentPath;
  assigned_member_id?: string;
  assigned_member_name?: string;
  assigned_by_id?: string;
  assigned_by_name?: string;
  assigned_at?: string;
  intake_comment?: string;
  tl_accepted_at?: string;
  tl_reviewed_at?: string;
  pm_approved_at?: string;
  last_action?: string;
  last_action_by_id?: string;
  last_action_by_name?: string;
  last_action_at?: string;
  monitor_status?: ProjectMonitorStatus;
  created_at: string;
  updated_at: string;
  source?: 'LEAD_CONVERSION' | 'DIRECT_CREATE';
  created_by_id?: string;
  created_by_name?: string;
  intake_form?: Record<string, unknown>;
}

export type ProcurementRequestStatus = 'DELAYED' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED';

export interface ProcurementRequest {
  id: string;
  request: string;
  project_id: string;
  project_name: string;
  customer_name: string;
  status: ProcurementRequestStatus;
  impact: string;
  owner_name: string;
  owner_team: string;
  created_at: string;
  updated_at: string;
}

export type EscalationSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type EscalationStatus = 'OPEN' | 'IN_REVIEW' | 'RESOLVED';
export type EscalationLevel = 'TEAM_LEAD' | 'PROJECT_MANAGER' | 'BUSINESS_HEAD' | 'ENG_DIRECTOR' | 'CEO';

export interface EscalationEvent {
  id: string;
  level: EscalationLevel;
  action: 'RAISED' | 'PROMOTED' | 'RESOLVED';
  actor_id: string;
  actor_name: string;
  comments?: string;
  at: string;
}

export interface ProjectWorkflowSnapshot {
  step: number;
  stage: string;
  status: string;
  last_action?: string;
  last_action_label?: string;
  last_action_by?: string;
  last_action_at?: string;
  intake_status: ProjectIntakeStatus;
  assignment_path?: ProjectAssignmentPath;
  monitor_status?: ProjectMonitorStatus;
  escalation_level?: EscalationLevel;
  escalation_resolved?: boolean;
}

export interface Escalation {
  id: string;
  code: string;
  project_id?: string;
  project_name: string;
  customer_name: string;
  issue: string;
  impact: string;
  summary: string;
  severity: EscalationSeverity;
  status: EscalationStatus;
  raised_by_id: string;
  raised_by_name: string;
  raised_by_role: string;
  team_id?: string;
  team_name?: string;
  previous_actions: string;
  current_level: EscalationLevel;
  history?: EscalationEvent[];
  decision_required?: string;
  ceo_decision?: string;
  resolution?: string;
  can_act?: boolean;
  can_promote?: boolean;
  resolved_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CriticalIssue {
  id: string;
  kind: 'CRITICAL_ISSUE' | 'PROJECT_AT_RISK' | 'PROCUREMENT_DELAY';
  title: string;
  customer: string;
  project: string;
  summary: string;
  escalatedBy?: string;
  escalatedAt?: string;
  href: string;
}

export interface CeoDashboardPayload {
  pipeline: {
    value: number;
    activeLeads: number;
    awaitingApproval: number;
    inProgress: number;
    negotiation: number;
    stages: {
      projectInput: number;
      pmReview: number;
      feasibility: number;
      costing: number;
      quotation: number;
      negotiation: number;
      converted: number;
    };
  };
  projects: {
    total: number;
    onTrack: number;
    atRisk: number;
    critical: number;
    needAttention: number;
    items: Project[];
  };
  teams: {
    total: number;
    members: number;
    blockedTeams: number;
    breakdown: Array<{
      id: string;
      code: string;
      name: string;
      members: number;
      hasBlocker: boolean;
    }>;
  };
  projectManager: {
    id: string;
    name: string;
    activeProjects: number;
    pendingReviews: number;
    escalations: number;
  };
  criticalIssues: CriticalIssue[];
  escalations: Escalation[];
  recentActivity: AuditLog[];
  dailyWork?: {
    projectsWithRecentProgress: number;
    projectsWithNoRecentUpdate: number;
    blockedTasks: number;
    majorBlockers: Array<{ project: string; customer: string; summary: string; href: string }>;
    teamActivity: number;
  };
}

export type DailyWorkStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED';
export type DailyUpdateSubmissionStatus = 'DRAFT' | 'SUBMITTED';
export type WorkAssignmentSource = 'TASK' | 'FEASIBILITY_ALLOCATION' | 'FEASIBILITY_ASSIGNMENT' | 'LEAD' | 'PROJECT';

export interface DailyUpdateComment {
  id: string;
  user_id: string;
  user_name: string;
  comment: string;
  created_at: string;
}

export interface DailyUpdate {
  id: string;
  user_id: string;
  user_name: string;
  user_role?: string;
  team_id?: string;
  team_name?: string;
  assignment_id: string;
  assignment_source: WorkAssignmentSource;
  task_id?: string;
  lead_id?: string;
  lead_number?: string;
  project_id?: string;
  project_code?: string;
  project_name: string;
  customer_name: string;
  task_title: string;
  work_date: string;
  work_completed: string;
  progress_percent: number;
  hours_worked: number;
  work_status: DailyWorkStatus;
  blocker?: string;
  dependency?: string;
  support_required?: string;
  next_plan: string;
  attachments: string[];
  submission_status: DailyUpdateSubmissionStatus;
  submitted_at?: string;
  summary?: string;
  period?: 'morning' | 'evening';
  update_type?: 'MORNING' | 'EVENING';
  pm_comments?: DailyUpdateComment[];
  created_at: string;
  updated_at: string;
}

export interface WorkAssignment {
  id: string;
  source: WorkAssignmentSource;
  task_id?: string;
  lead_id?: string;
  lead_number?: string;
  lead_name?: string;
  lead_stage_at_creation?: string;
  project_id?: string;
  project_code?: string;
  project_name: string;
  customer_name: string;
  task_title: string;
  workflow_stage: string;
  due_date?: string;
  priority: PriorityLevel;
  current_status: string;
  last_update_at?: string;
  assigned_to_id: string;
  assigned_to: string;
  progress_percent: number;
  blocked: boolean;
  blocker?: string;
  task_type?: WorkTaskType;
  start_date?: string;
  review_status?: 'NONE' | 'PENDING_TL_REVIEW' | 'CORRECTION_REQUIRED' | 'COMPLETED';
  description?: string;
  assigned_by?: string;
  assigned_by_id?: string;
  created_by?: string;
  created_by_id?: string;
  team_lead_name?: string;
  depends_on_title?: string;
  remarks?: string;
  next_plan?: string;
  dependency?: string;
  acceptance_status?: 'REQUESTED' | 'ACCEPTED' | 'REJECTED';
  requested_by_id?: string;
  requested_by_name?: string;
  parent_task_id?: string;
  parent_task_title?: string;
  requested_from_task_id?: string;
}

export interface ProjectActivityItem {
  id: string;
  at: string;
  kind: 'DAILY_UPDATE' | 'AUDIT' | 'ESCALATION' | 'ASSIGNMENT' | 'PM_COMMENT';
  title: string;
  detail: string;
  actor?: string;
  status?: string;
  href?: string;
}

export interface ProjectTeamView {
  id: string;
  name: string;
  team_lead_id?: string;
  team_lead_name?: string;
  members: Array<{ id: string; name: string; role_name: string; open_tasks: number }>;
  workload: { total: number; open: number };
}

export interface ProjectDetailPayload {
  project: Project;
  lead: {
    id: string;
    lead_number: string;
    title: string;
    status: string;
    pipeline_stage?: string;
    expected_value?: number;
  } | null;
  canManage: boolean;
  actions?: {
    canAssign: boolean;
    canPmReview?: boolean;
    canIntake: boolean;
    canTlReview: boolean;
    canEscalate: boolean;
    canHandover: boolean;
    canComplete: boolean;
    canBreakdown: boolean;
    canMonitor: boolean;
    intake_status: ProjectIntakeStatus;
  };
  assignableUsers?: Array<{ id: string; name: string; role_code: string; role_name: string; team_id?: string; team_name?: string; open_tasks?: number }>;
  assignableTeams?: Array<{
    id: string;
    name: string;
    team_lead_id?: string;
    team_lead_name?: string;
    members: Array<{ id: string; name: string; role_code: string; role_name: string; team_id?: string; team_name?: string; open_tasks?: number }>;
  }>;
  workflow?: ProjectWorkflowSnapshot;
  tasks?: Task[];
  dailyUpdates?: DailyUpdate[];
  currentStatus: {
    phase: string;
    current_task: string;
    current_owner: string;
    current_blocker?: string;
    last_update?: string;
    next_milestone?: { name: string; date?: string; owner?: string; delayed?: boolean };
  };
  teams: ProjectTeamView[];
  progress: number;
  dailyWork: {
    latestEmployee?: DailyUpdate;
    latestTeamLead?: DailyUpdate;
    latestPmRemark?: ProjectRemark;
    recentBlockers: DailyUpdate[];
    recentCompleted: DailyUpdate[];
  };
  delayedMilestones: Array<{ name: string; date?: string; owner?: string }>;
  escalations: Escalation[];
  activity: ProjectActivityItem[];
}

export interface DailyUpdateSummary {
  submittedToday: number;
  pendingToday: number;
  blocked: number;
  completed: number;
  projectsNeedingAttention: number;
  staleAssignments: number;
  updatesToday: DailyUpdate[];
  blockedUpdates: DailyUpdate[];
  staleItems: WorkAssignment[];
  pendingItems: WorkAssignment[];
  projectsWithRecentProgress?: number;
  projectsWithNoRecentUpdate?: number;
  blockedTasks?: number;
  majorBlockers?: Array<{ project: string; customer: string; summary: string; href: string }>;
  teamActivity?: number;
}

export type ConversationType = 'DIRECT' | 'GROUP' | 'ANNOUNCEMENT';

export interface Conversation {
  id: string;
  type: ConversationType;
  name?: string;
  description?: string;
  pair_key?: string;
  merged_into?: string;
  deleted_at?: string;
  created_by: string;
  created_by_id: string;
  project_id?: string;
  audience?: 'ALL' | 'PROJECT' | 'TEAMS';
  team_ids?: string[];
  created_at: string;
  updated_at: string;
}

export interface ConversationParticipant {
  id: string;
  conversation_id: string;
  user_id: string;
  role: 'ADMIN' | 'MEMBER';
  joined_at: string;
  left_at?: string;
  last_read_at?: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  conversation_type?: ConversationType;
  sender_id: string;
  sender_name: string;
  message: string;
  message_type: ChatMessageType;
  attachment_id?: string;
  file_name?: string;
  file_size?: string;
  mime_type?: string;
  link_url?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface EntityDocument {
  id: string;
  file_name: string;
  original_file_name: string;
  file_type: string;
  file_size: string;
  file_url?: string;
  mime_type?: string;
  uploaded_by: string;
  uploaded_by_id: string;
  uploaded_at: string;
  entity_type: 'LEAD' | 'PROJECT' | 'TASK' | 'ADDITIONAL_INPUT' | 'FEASIBILITY' | 'CONVERSATION' | 'FORUM_POST' | 'FORUM_COMMENT';
  entity_id: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationSummary extends Conversation {
  unread_count: number;
  last_message?: string;
  last_message_at?: string;
  last_message_type?: ChatMessageType;
  member_count?: number;
  other_user_id?: string;
  other_user_name?: string;
  other_user_role?: string;
  participant_names?: string[];
}

export type ForumCategory =
  | 'GENERAL'
  | 'ANNOUNCEMENT'
  | 'PROJECT_DISCUSSION'
  | 'TECHNICAL'
  | 'SUPPORT'
  | 'FEEDBACK'
  | 'IDEAS'
  | 'OTHER';

export type ForumReactionKind = 'LIKE' | 'LOVE' | 'CHECK' | 'CLAP' | 'CELEBRATE';

export type ForumThreadKind = 'DISCUSSION' | 'QUESTION' | 'IDEA';

export interface ForumTag {
  id: string;
  name: string;
  created_at: string;
}

export interface ForumPost {
  id: string;
  title: string;
  body: string;
  body_text: string;
  category: ForumCategory;
  tags: string[];
  thread_kind?: ForumThreadKind;
  author_id: string;
  author_name: string;
  author_role: string;
  pinned: boolean;
  locked: boolean;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ForumComment {
  id: string;
  post_id: string;
  parent_id?: string;
  author_id: string;
  author_name: string;
  author_role: string;
  body: string;
  body_text: string;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ForumReaction {
  id: string;
  target_type: 'POST' | 'COMMENT';
  target_id: string;
  user_id: string;
  kind: ForumReactionKind;
  created_at: string;
}

export interface ForumPostSummary extends ForumPost {
  comment_count: number;
  attachment_count: number;
  attachment_types: string[];
  reaction_counts: Partial<Record<ForumReactionKind, number>>;
  my_reactions: ForumReactionKind[];
  participant_count: number;
  last_reply_at?: string;
  last_reply_author?: string;
  last_reply_preview?: string;
}

export interface ForumPostDetail extends ForumPostSummary {
  attachments: EntityDocument[];
}

export interface ForumCommentView extends ForumComment {
  attachments: EntityDocument[];
  reaction_counts: Partial<Record<ForumReactionKind, number>>;
  my_reactions: ForumReactionKind[];
}

export interface ForumLiveMessage {
  id: string;
  author_id: string;
  author_name: string;
  author_role: string;
  body: string;
  created_at: string;
}

export interface PresenceUser {
  id: string;
  name: string;
  role_name: string;
  team_name?: string;
  last_seen_at: string;
}
