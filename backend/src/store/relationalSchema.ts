export type SqlType = 'text' | 'boolean' | 'integer' | 'numeric' | 'timestamptz' | 'text[]' | 'jsonb';

export type FieldDef = {
  column: string;
  key: string;
  type: SqlType;
};

export type RelationalCollection = Exclude<
  | 'users'
  | 'roles'
  | 'teams'
  | 'leads'
  | 'projects'
  | 'escalations'
  | 'procurementRequests'
  | 'audits'
  | 'notifications'
  | 'tasks'
  | 'dailyUpdates'
  | 'leaveRequests'
  | 'leadDocuments'
  | 'leadComments'
  | 'leadActivities'
  | 'leadStatusHistory'
  | 'feasibilityTeamAssignments'
  | 'feasibilityEmployeeAllocations'
  | 'projectPhases'
  | 'conversations'
  | 'conversationParticipants'
  | 'chatMessages'
  | 'entityDocuments'
  | 'stageTransitions'
  | 'outboundEmails'
  | 'forumPosts'
  | 'forumComments'
  | 'forumReactions'
  | 'forumTags'
  | 'forumLiveMessages'
  | 'assignmentHistory'
  | 'notificationDeliveries'
  | 'pendingSignups'
  | 'systemMeta',
  'users'
>;

export type TableDef = {
  collection: RelationalCollection;
  table: string;
  fields: FieldDef[];
};

function f(column: string, type: SqlType = 'text', key = column): FieldDef {
  return { column, key, type };
}

function text(...columns: string[]): FieldDef[] {
  return columns.map((column) => f(column));
}

function ts(...columns: string[]): FieldDef[] {
  return columns.map((column) => f(column, 'timestamptz'));
}

export const RELATIONAL_TABLES: TableDef[] = [
  {
    collection: 'roles',
    table: 'roles',
    fields: [...text('code', 'name', 'description'), f('permissions', 'text[]')],
  },
  {
    collection: 'teams',
    table: 'teams',
    fields: [
      ...text('code', 'name', 'description', 'team_lead_id', 'team_lead_name', 'status'),
      f('member_count', 'integer'),
      f('created_at', 'timestamptz'),
    ],
  },
  {
    collection: 'pendingSignups',
    table: 'pending_signups',
    fields: [
      ...text(
        'employee_id',
        'name',
        'email',
        'role_id',
        'role_code',
        'role_name',
        'reporting_manager_id',
        'reporting_manager_name',
        'invitation_code_hash'
      ),
      ...ts('invitation_created_at', 'invitation_expires_at', 'invitation_verified_at', 'created_at', 'updated_at'),
    ],
  },
  {
    collection: 'systemMeta',
    table: 'system_meta',
    fields: [
      ...ts('demo_operational_purged_at', 'users_leadership_pruned_at').map((field, index) =>
        index === 0
          ? { ...field, key: 'demoOperationalPurgedAt' }
          : { ...field, key: 'usersLeadershipPrunedAt' }
      ),
      f('payload_type', 'text', 'payloadType'),
      f('payload', 'jsonb'),
    ],
  },
  {
    collection: 'audits',
    table: 'audits',
    fields: [
      ...text('user_id', 'user_name', 'user_role', 'entity_type', 'entity_id', 'entity_name', 'action', 'description', 'assigned_to', 'assigned_to_id', 'assigned_to_name', 'old_value', 'new_value'),
      f('created_at', 'timestamptz'),
    ],
  },
  {
    collection: 'notifications',
    table: 'notifications',
    fields: [
      ...text(
        'recipient_id',
        'type',
        'title',
        'message',
        'entity_type',
        'entity_id',
        'sender_id',
        'message_type',
        'message_id',
        'action_url',
        'priority',
        'event_key',
        'email_status',
        'email_channel',
        'email_policy',
        'email_dispatch',
        'notification_status',
        'stage_name'
      ),
      f('read_status', 'boolean'),
      f('email_payload', 'jsonb'),
      f('notification_history', 'jsonb'),
      ...ts(
        'email_sent_at',
        'acted_at',
        'read_at',
        'viewed_at',
        'completed_at',
        'overdue_at',
        'reminder_due_at',
        'created_at'
      ),
    ],
  },
  {
    collection: 'notificationDeliveries',
    table: 'notification_deliveries',
    fields: [
      ...text(
        'notification_id',
        'event_key',
        'recipient_user_id',
        'recipient_email',
        'subject',
        'email_type',
        'status',
        'transaction_id',
        'failure_reason',
        'email_channel',
        'dispatch_mode'
      ),
      f('retry_count', 'integer'),
      ...ts('sent_at', 'created_at', 'updated_at'),
    ],
  },
  {
    collection: 'assignmentHistory',
    table: 'assignment_history',
    fields: [
      ...text(
        'entity_type',
        'entity_id',
        'previous_responsible_user_id',
        'previous_responsible_user_name',
        'new_responsible_user_id',
        'new_responsible_user_name',
        'assigned_by_id',
        'assigned_by_name',
        'reason',
        'accepted_by_id'
      ),
      ...ts('assigned_at', 'accepted_at'),
    ],
  },
  {
    collection: 'leadDocuments',
    table: 'lead_documents',
    fields: [
      ...text(
        'lead_id',
        'file_name',
        'file_type',
        'file_size',
        'uploaded_by',
        'uploaded_by_id',
        'category',
        'file_url',
        'mime_type',
        'upload_status'
      ),
      f('upload_date', 'timestamptz'),
    ],
  },
  {
    collection: 'leadComments',
    table: 'lead_comments',
    fields: [
      ...text('lead_id', 'author_id', 'author_name', 'author_role', 'comment', 'comment_type'),
      f('created_at', 'timestamptz'),
    ],
  },
  {
    collection: 'leadActivities',
    table: 'lead_activities',
    fields: [
      ...text(
        'lead_id',
        'activity_type',
        'contact_person',
        'subject',
        'description',
        'attachment_id',
        'created_by',
        'created_by_id'
      ),
      ...ts('activity_date', 'created_at'),
    ],
  },
  {
    collection: 'leadStatusHistory',
    table: 'lead_status_history',
    fields: [
      ...text('lead_id', 'old_status', 'new_status', 'changed_by', 'changed_by_id', 'changed_by_role', 'reason'),
      f('created_at', 'timestamptz'),
    ],
  },
  {
    collection: 'feasibilityTeamAssignments',
    table: 'feasibility_team_assignments',
    fields: [
      ...text(
        'lead_id',
        'team_id',
        'team_name',
        'team_lead_id',
        'team_lead_name',
        'assignment_type',
        'priority',
        'due_date',
        'pm_instructions',
        'expected_output',
        'critical_reason',
        'status',
        'created_by',
        'created_by_id'
      ),
      ...ts('created_at', 'updated_at'),
    ],
  },
  {
    collection: 'feasibilityEmployeeAllocations',
    table: 'feasibility_employee_allocations',
    fields: [
      ...text(
        'feasibility_team_assignment_id',
        'lead_id',
        'team_id',
        'team_lead_id',
        'employee_id',
        'employee_name',
        'responsibility',
        'approval_status',
        'allocated_by'
      ),
      ...ts('allocated_at', 'started_at', 'completed_at', 'created_at', 'updated_at'),
    ],
  },
  {
    collection: 'projectPhases',
    table: 'project_phases',
    fields: [
      ...text('project_id', 'name', 'start_date', 'due_date', 'remarks'),
      f('sort_order', 'integer'),
      ...ts('created_at', 'updated_at'),
    ],
  },
  {
    collection: 'procurementRequests',
    table: 'procurement_requests',
    fields: [
      ...text('request', 'project_id', 'project_name', 'customer_name', 'status', 'impact', 'owner_name', 'owner_team'),
      ...ts('created_at', 'updated_at'),
    ],
  },
  {
    collection: 'escalations',
    table: 'escalations',
    fields: [
      ...text(
        'code',
        'project_id',
        'project_name',
        'customer_name',
        'issue',
        'impact',
        'summary',
        'severity',
        'status',
        'raised_by_id',
        'raised_by_name',
        'raised_by_role',
        'team_id',
        'team_name',
        'previous_actions',
        'current_level',
        'decision_required',
        'ceo_decision',
        'resolution'
      ),
      f('history', 'jsonb'),
      ...ts('resolved_at', 'created_at', 'updated_at'),
    ],
  },
  {
    collection: 'conversations',
    table: 'conversations',
    fields: [
      ...text('type', 'name', 'description', 'pair_key', 'merged_into', 'created_by', 'created_by_id', 'project_id', 'audience'),
      f('team_ids', 'text[]'),
      ...ts('deleted_at', 'created_at', 'updated_at'),
    ],
  },
  {
    collection: 'conversationParticipants',
    table: 'conversation_participants',
    fields: [...text('conversation_id', 'user_id', 'role'), ...ts('joined_at', 'left_at', 'last_read_at')],
  },
  {
    collection: 'chatMessages',
    table: 'chat_messages',
    fields: [
      ...text(
        'conversation_id',
        'conversation_type',
        'sender_id',
        'sender_name',
        'message',
        'message_type',
        'attachment_id',
        'file_name',
        'file_size',
        'mime_type',
        'link_url'
      ),
      ...ts('created_at', 'updated_at', 'deleted_at'),
    ],
  },
  {
    collection: 'entityDocuments',
    table: 'entity_documents',
    fields: [
      ...text(
        'file_name',
        'original_file_name',
        'file_type',
        'file_size',
        'file_url',
        'mime_type',
        'uploaded_by',
        'uploaded_by_id',
        'entity_type',
        'entity_id'
      ),
      ...ts('uploaded_at', 'created_at', 'updated_at'),
    ],
  },
  {
    collection: 'stageTransitions',
    table: 'stage_transitions',
    fields: [
      ...text(
        'project_id',
        'lead_id',
        'stage_id',
        'stage_name',
        'from_status',
        'to_status',
        'from_user_id',
        'from_user_name',
        'to_user_id',
        'to_user_name',
        'notification_id',
        'notification_type',
        'status'
      ),
      ...ts('sent_at', 'created_at'),
    ],
  },
  {
    collection: 'outboundEmails',
    table: 'outbound_emails',
    fields: [
      ...text(
        'to_user_id',
        'to_email',
        'to_name',
        'subject',
        'body',
        'status',
        'notification_id',
        'email_type',
        'transaction_id',
        'email_channel'
      ),
      f('created_at', 'timestamptz'),
    ],
  },
  {
    collection: 'forumTags',
    table: 'forum_tags',
    fields: [...text('name'), f('created_at', 'timestamptz')],
  },
  {
    collection: 'forumPosts',
    table: 'forum_posts',
    fields: [
      ...text('title', 'body', 'body_text', 'category', 'thread_kind', 'author_id', 'author_name', 'author_role'),
      f('tags', 'text[]'),
      f('pinned', 'boolean'),
      f('locked', 'boolean'),
      ...ts('deleted_at', 'created_at', 'updated_at'),
    ],
  },
  {
    collection: 'forumComments',
    table: 'forum_comments',
    fields: [
      ...text('post_id', 'parent_id', 'author_id', 'author_name', 'author_role', 'body', 'body_text'),
      ...ts('deleted_at', 'created_at', 'updated_at'),
    ],
  },
  {
    collection: 'forumReactions',
    table: 'forum_reactions',
    fields: [...text('target_type', 'target_id', 'user_id', 'kind'), f('created_at', 'timestamptz')],
  },
  {
    collection: 'forumLiveMessages',
    table: 'forum_live_messages',
    fields: [...text('author_id', 'author_name', 'author_role', 'body'), f('created_at', 'timestamptz')],
  },
  {
    collection: 'projects',
    table: 'projects',
    fields: [
      ...text(
        'code',
        'name',
        'customer_name',
        'pm_id',
        'pm_name',
        'team_lead_id',
        'team_lead_name',
        'health',
        'status',
        'issue',
        'lead_id',
        'lead_number',
        'start_date',
        'target_completion',
        'current_phase',
        'intake_status',
        'assignment_path',
        'assigned_member_id',
        'assigned_member_name',
        'assigned_by_id',
        'assigned_by_name',
        'created_by_id',
        'created_by_name',
        'source',
        'intake_comment',
        'last_action',
        'last_action_by_id',
        'last_action_by_name',
        'monitor_status'
      ),
      f('team_ids', 'text[]'),
      f('progress', 'integer'),
      f('value', 'numeric'),
      f('progress_locked_by_pm', 'boolean'),
      f('plan_initialized', 'boolean'),
      f('remarks', 'jsonb'),
      f('intake_form', 'jsonb'),
      ...ts('last_update_at', 'tl_accepted_at', 'tl_reviewed_at', 'pm_approved_at', 'assigned_at', 'last_action_at', 'created_at', 'updated_at'),
    ],
  },
  {
    collection: 'tasks',
    table: 'tasks',
    fields: [
      ...text(
        'lead_id',
        'lead_name',
        'lead_stage_at_creation',
        'customer_name',
        'project_id',
        'feasibility_team_assignment_id',
        'employee_allocation_id',
        'title',
        'description',
        'status',
        'priority',
        'due_date',
        'assigned_to',
        'assigned_to_id',
        'created_by',
        'created_by_id',
        'blocked_reason',
        'phase_id',
        'parent_task_id',
        'team_id',
        'team_name',
        'start_date',
        'depends_on_id',
        'remarks',
        'task_type',
        'assigned_by',
        'assigned_by_id',
        'review_status',
        'responsible_user_id',
        'responsible_user_name',
        'escalated_to_user_id',
        'project_name',
        'acceptance_status',
        'requested_by_id',
        'requested_by_name',
        'requested_from_task_id'
      ),
      f('depends_on_ids', 'text[]'),
      f('progress_percent', 'integer'),
      f('duration_days', 'integer'),
      f('is_milestone', 'boolean'),
      f('is_additional', 'boolean'),
      f('pending_action', 'boolean'),
      f('progress_manual_override', 'boolean'),
      f('sheet_hidden', 'boolean'),
      f('delay_reason', 'text'),
      f('reminder_count', 'integer'),
      f('comments', 'jsonb'),
      ...ts(
        'last_update_at',
        'last_action_at',
        'last_reminder_at',
        'next_reminder_at',
        'escalated_at',
        'completed_at',
        'created_at',
        'updated_at'
      ),
    ],
  },
  {
    collection: 'dailyUpdates',
    table: 'daily_updates',
    fields: [
      ...text(
        'user_id',
        'user_name',
        'user_role',
        'team_id',
        'team_name',
        'assignment_id',
        'assignment_source',
        'task_id',
        'lead_id',
        'lead_number',
        'project_id',
        'project_code',
        'project_name',
        'customer_name',
        'task_title',
        'work_date',
        'work_completed',
        'work_status',
        'blocker',
        'dependency',
        'support_required',
        'next_plan',
        'submission_status',
        'summary'
      ),
      f('attachments', 'text[]'),
      f('progress_percent', 'integer'),
      f('hours_worked', 'numeric'),
      f('period', 'text'),
      f('update_type', 'text'),
      f('pm_comments', 'jsonb'),
      ...ts('submitted_at', 'created_at', 'updated_at'),
    ],
  },
  {
    collection: 'leaveRequests',
    table: 'leave_requests',
    fields: [
      ...text(
        'user_id',
        'user_name',
        'kind',
        'leave_type',
        'from_date',
        'to_date',
        'day_portion',
        'from_time',
        'to_time',
        'reason',
        'attachment_url',
        'status',
        'approver_id',
        'approver_name',
        'decided_by_id',
        'decided_by_name',
        'decision_comment'
      ),
      ...ts('decided_at', 'created_at', 'updated_at'),
    ],
  },
  {
    collection: 'leads',
    table: 'leads',
    fields: [
      ...text(
        'lead_number',
        'title',
        'customer_name',
        'customer_type',
        'business_vertical',
        'created_by',
        'created_by_id',
        'created_by_role',
        'sales_owner',
        'sales_owner_id',
        'lead_date',
        'expected_decision_date',
        'priority',
        'status',
        'customer_contact',
        'customer_designation',
        'customer_email',
        'customer_phone',
        'customer_location',
        'plant_location',
        'requirement_summary',
        'detailed_requirement',
        'application',
        'industry_process',
        'current_process',
        'expected_automation',
        'customer_objective',
        'expected_project_timeline',
        'customer_target_date',
        'production_quantity',
        'production_rate',
        'cycle_time',
        'shift_pattern',
        'operating_hours',
        'existing_equipment',
        'existing_automation',
        'integration_requirements',
        'technical_requirements',
        'machine_dimensions',
        'payload',
        'accuracy_requirement',
        'environment_conditions',
        'technical_specifications',
        'technical_assumptions',
        'customer_dependencies',
        'customer_budget',
        'estimated_opportunity_value',
        'pipeline_stage',
        'currency',
        'expected_po_date',
        'commercial_remarks',
        'pm_return_reason',
        'pm_review_notes',
        'additional_notes',
        'required_documents',
        'competitor_information',
        'customer_challenge',
        'required_solution',
        'project_description',
        'submitted_by',
        'submitted_by_id',
        'assigned_team_id',
        'assigned_team_name',
        'assigned_team_lead_id',
        'assigned_team_lead_name',
        'assignment_path',
        'assigned_member_id',
        'assigned_member_name',
        'pm_id',
        'pm_name',
        'project_id',
        'feasibility_return_reason',
        'costing_return_reason',
        'accepted_by_id',
        'accepted_by_name',
        'responsible_user_id',
        'responsible_user_name',
        'responsible_role_code',
        'current_owner_id',
        'current_owner_name',
        'cancelled_by_id',
        'cancelled_by_name',
        'cancel_reason',
        'assigned_by_id',
        'assigned_by_name',
        'forwarded_by_id',
        'forwarded_by_name',
        'escalated_to_user_id',
        'previous_status',
        'previous_action',
        'next_action',
        'action_required',
        'due_date'
      ),
      f('expected_value', 'numeric'),
      f('pending_action', 'boolean'),
      f('approval_pending', 'boolean'),
      f('reminder_count', 'integer'),
      f('custom_fields', 'jsonb'),
      f('negotiation_history', 'jsonb'),
      f('assigned_team_ids', 'text[]'),
      f('assigned_team_names', 'text[]'),
      f('fs_technical_feasibility', 'text', 'feasibility_study.technical_feasibility'),
      f('fs_required_resources', 'text', 'feasibility_study.required_resources'),
      f('fs_proposed_solution', 'text', 'feasibility_study.proposed_solution'),
      f('fs_major_constraints', 'text', 'feasibility_study.major_constraints'),
      f('fs_estimated_timeline', 'text', 'feasibility_study.estimated_timeline'),
      f('fs_technical_assumptions', 'text', 'feasibility_study.technical_assumptions'),
      f('fs_required_equipment', 'text', 'feasibility_study.required_equipment'),
      f('fs_team_remarks', 'text', 'feasibility_study.team_remarks'),
      f('fs_documents', 'text[]', 'feasibility_study.documents'),
      f('fs_status', 'text', 'feasibility_study.status'),
      f('fs_submitted_by', 'text', 'feasibility_study.submitted_by'),
      f('fs_submitted_by_id', 'text', 'feasibility_study.submitted_by_id'),
      f('fs_submitted_at', 'timestamptz', 'feasibility_study.submitted_at'),
      f('fs_started_at', 'timestamptz', 'feasibility_study.started_at'),
      f('fs_started_by', 'text', 'feasibility_study.started_by'),
      f('fs_started_by_id', 'text', 'feasibility_study.started_by_id'),
      f('fs_pm_approved_by', 'text', 'feasibility_study.pm_approved_by'),
      f('fs_pm_approved_at', 'timestamptz', 'feasibility_study.pm_approved_at'),
      f('fs_pm_return_reason', 'text', 'feasibility_study.pm_return_reason'),
      f('fs_review_history', 'jsonb', 'feasibility_study.review_history'),
      f('costing_bom_components', 'text', 'costing.bom_components'),
      f('costing_vendor_requirements', 'text', 'costing.vendor_requirements'),
      f('costing_vendor_quotations', 'text', 'costing.vendor_quotations'),
      f('costing_component_costs', 'numeric', 'costing.component_costs'),
      f('costing_procurement_costs', 'numeric', 'costing.procurement_costs'),
      f('costing_engineering_costs', 'numeric', 'costing.engineering_costs'),
      f('costing_software_costs', 'numeric', 'costing.software_costs'),
      f('costing_installation_costs', 'numeric', 'costing.installation_costs'),
      f('costing_other_costs', 'numeric', 'costing.other_costs'),
      f('costing_total_estimated_cost', 'numeric', 'costing.total_estimated_cost'),
      f('costing_commercial_assumptions', 'text', 'costing.commercial_assumptions'),
      f('costing_documents', 'text[]', 'costing.documents'),
      f('costing_status', 'text', 'costing.status'),
      f('costing_submitted_by', 'text', 'costing.submitted_by'),
      f('costing_submitted_by_id', 'text', 'costing.submitted_by_id'),
      f('costing_submitted_at', 'timestamptz', 'costing.submitted_at'),
      f('costing_pm_approved_by', 'text', 'costing.pm_approved_by'),
      f('costing_pm_approved_at', 'timestamptz', 'costing.pm_approved_at'),
      f('costing_pm_return_reason', 'text', 'costing.pm_return_reason'),
      f('quotation_value', 'numeric', 'quotation.quotation_value'),
      f('quotation_commercial_terms', 'text', 'quotation.commercial_terms'),
      f('quotation_validity', 'text', 'quotation.validity'),
      f('quotation_payment_terms', 'text', 'quotation.payment_terms'),
      f('quotation_delivery_terms', 'text', 'quotation.delivery_terms'),
      f('quotation_document_name', 'text', 'quotation.document_name'),
      f('quotation_sent_at', 'timestamptz', 'quotation.sent_at'),
      f('quotation_sent_by', 'text', 'quotation.sent_by'),
      f('quotation_sent_by_id', 'text', 'quotation.sent_by_id'),
      f('quotation_revised_value', 'numeric', 'quotation.revised_value'),
      f('quotation_revision', 'integer', 'quotation.revision'),
      f('quotation_revision_label', 'text', 'quotation.revision_label'),
      f('quotation_revision_id', 'text', 'quotation.revision_id'),
      f('quotation_workflow_status', 'text', 'quotation.workflow_status'),
      f('quotation_submission_method', 'text', 'quotation.submission_method'),
      f('quotation_submission_remarks', 'text', 'quotation.submission_remarks'),
      f('quotation_submitted_to_customer_at', 'timestamptz', 'quotation.submitted_to_customer_at'),
      f('quotation_submitted_to_customer_by', 'text', 'quotation.submitted_to_customer_by'),
      f('quotation_submitted_to_customer_by_id', 'text', 'quotation.submitted_to_customer_by_id'),
      f('quotation_revision_reason', 'text', 'quotation.revision_reason'),
      f('quotation_created_at', 'timestamptz', 'quotation.created_at'),
      f('quotation_created_by', 'text', 'quotation.created_by'),
      f('quotation_created_by_id', 'text', 'quotation.created_by_id'),
      f('quotation_revisions', 'jsonb'),
      ...text(
        'visit_requirement',
        'visit_status',
        'visit_site_name',
        'visit_site_address',
        'visit_city',
        'visit_state',
        'visit_country',
        'visit_contact_name',
        'visit_contact_phone',
        'visit_contact_email',
        'visit_preferred_date',
        'visit_preferred_time',
        'visit_remarks',
        'visit_visitor_name',
        'visit_visitor_designation',
        'visit_visitor_count',
        'visit_purpose',
        'visit_special_requirements',
        'visit_office_address',
        'visit_assigned_by',
        'visit_assigned_by_id',
        'visit_scheduled_date',
        'visit_scheduled_time'
      ),
      f('visit_assigned_at', 'timestamptz'),
      f('visit_assigned_user_ids', 'text[]'),
      f('visit_assigned_user_names', 'text[]'),
      f('visit_activity', 'jsonb'),
      ...ts(
        'converted_at',
        'created_at',
        'updated_at',
        'submitted_at',
        'reviewed_at',
        'accepted_at',
        'cancelled_at',
        'assigned_at',
        'forwarded_at',
        'last_action_at',
        'last_reminder_at',
        'next_reminder_at',
        'escalated_at'
      ),
    ],
  },
];

export const RELATIONAL_TABLE_NAMES = RELATIONAL_TABLES.map((item) => item.table);
