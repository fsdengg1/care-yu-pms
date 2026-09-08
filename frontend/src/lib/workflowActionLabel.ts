import { Lead } from './types';

export const SUBMISSION_STAGE_LABELS = {
  BUSINESS_HEAD: 'Submitted to Business Head',
  PM: 'Submitted to PM',
  VISION_TEAM: 'Submitted to Vision Team',
  ROBOTICS_TEAM: 'Submitted to Robotics Team',
  SOFTWARE_TEAM: 'Submitted to Software Team',
  IP_TEAM: 'Submitted to IP Team',
} as const;

export type WorkflowActionLead = Pick<
  Lead,
  | 'status'
  | 'pipeline_stage'
  | 'pm_name'
  | 'current_owner_name'
  | 'responsible_user_name'
  | 'created_by'
  | 'sales_owner'
  | 'assigned_team_name'
  | 'assigned_team_names'
  | 'assigned_team_lead_name'
  | 'previous_status'
  | 'quotation'
  | 'feasibility_study'
>;

function teamSubmissionLabel(lead: WorkflowActionLead): string | null {
  const teams = [lead.assigned_team_name, ...(lead.assigned_team_names || [])].filter(Boolean) as string[];
  for (const team of teams) {
    const hay = team.toLowerCase();
    if (hay.includes('vision')) return SUBMISSION_STAGE_LABELS.VISION_TEAM;
    if (hay.includes('robot')) return SUBMISSION_STAGE_LABELS.ROBOTICS_TEAM;
    if (hay.includes('software')) return SUBMISSION_STAGE_LABELS.SOFTWARE_TEAM;
    if (hay.includes('ip') || hay.includes('procurement') || hay.includes('costing')) {
      return SUBMISSION_STAGE_LABELS.IP_TEAM;
    }
  }
  return teams.length ? 'Submitted to Feasibility Team' : null;
}

/**
 * Workflow/stage labels only. Never interpolates employee names into Status.
 * Assigned person belongs in Sales Owner / current owner fields.
 */
export function workflowActionLabel(lead: WorkflowActionLead): string {
  const qStatus = lead.quotation?.workflow_status;
  const status = lead.status;

  if (qStatus === 'REVISION_REQUESTED') return 'Returned for Clarification';
  if (qStatus === 'REVISION_IN_PROGRESS') return 'Clarification Submitted';
  if (qStatus === 'SUBMITTED_TO_CUSTOMER' || qStatus === 'CUSTOMER_REVIEW' || status === 'NEGOTIATION') {
    return 'Submitted to Customer';
  }
  if (status === 'DRAFT') return 'Draft';
  if (status === 'QUOTATION' || qStatus === 'PENDING_INTERNAL' || qStatus === 'DRAFT') {
    return SUBMISSION_STAGE_LABELS.BUSINESS_HEAD;
  }
  if (status === 'SUBMITTED_TO_PM' || status === 'UNDER_PM_REVIEW' || status === 'RESUBMITTED_TO_PM') {
    return SUBMISSION_STAGE_LABELS.PM;
  }
  if (status === 'RETURNED_TO_SALES' || status === 'ADDITIONAL_INFORMATION_REQUIRED') {
    return 'Returned for Clarification';
  }
  if (status === 'ACCEPTED_FOR_FEASIBILITY' || status === 'FEASIBILITY_IN_PROGRESS') {
    return teamSubmissionLabel(lead) || (lead.assigned_team_lead_name ? 'Submitted to Feasibility Team' : 'Approved');
  }
  if (status === 'FEASIBILITY_SUBMITTED') {
    const clarification =
      lead.previous_status === 'FEASIBILITY_RETURNED' || Boolean(lead.feasibility_study?.pm_return_reason);
    return clarification ? 'Clarification Submitted' : SUBMISSION_STAGE_LABELS.PM;
  }
  if (status === 'FEASIBILITY_RETURNED') return 'Returned for Clarification';
  if (status === 'COSTING_IN_PROGRESS') return SUBMISSION_STAGE_LABELS.IP_TEAM;
  if (status === 'COSTING_SUBMITTED') return SUBMISSION_STAGE_LABELS.PM;
  if (status === 'COSTING_RETURNED') return 'Returned for Clarification';
  if (status === 'ORDER_CONVERTED' || status === 'WON') return 'Approved';
  if (status === 'FEASIBILITY_REJECTED' || status === 'COSTING_REJECTED' || status === 'CANCELLED') return 'Rejected';
  if (status === 'LOST') return 'Lost';
  if (status === 'ON_HOLD') return 'On Hold';

  return status.replace(/_/g, ' ');
}
