import { Lead } from './types';

function firstName(value?: string) {
  const name = (value || '').trim();
  if (!name) return '';
  return name.split(/\s+/)[0];
}

function submittedTo(target: string, purpose = 'Review') {
  return `Submitted to ${target} for ${purpose}`;
}

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

export function workflowActionLabel(lead: WorkflowActionLead): string {
  const owner = firstName(lead.current_owner_name || lead.responsible_user_name);
  const pm = firstName(lead.pm_name) || 'PM';
  const qStatus = lead.quotation?.workflow_status;
  const status = lead.status;

  if (qStatus === 'REVISION_REQUESTED') return 'Returned for Clarification';
  if (qStatus === 'REVISION_IN_PROGRESS') return 'Clarification Submitted';
  if (qStatus === 'SUBMITTED_TO_CUSTOMER' || qStatus === 'CUSTOMER_REVIEW' || status === 'NEGOTIATION') {
    return 'Submitted to Customer';
  }
  if (status === 'QUOTATION' || qStatus === 'PENDING_INTERNAL' || qStatus === 'DRAFT') {
    const who = owner || firstName(lead.created_by) || firstName(lead.sales_owner) || 'Business Head';
    return submittedTo(who);
  }

  if (status === 'SUBMITTED_TO_PM' || status === 'UNDER_PM_REVIEW' || status === 'RESUBMITTED_TO_PM') {
    return submittedTo(lead.pm_name ? pm : 'PM');
  }
  if (status === 'RETURNED_TO_SALES' || status === 'ADDITIONAL_INFORMATION_REQUIRED') {
    return 'Returned for Clarification';
  }
  if (status === 'ACCEPTED_FOR_FEASIBILITY') {
    if (lead.assigned_team_lead_name) return submittedTo(firstName(lead.assigned_team_lead_name) || 'Team Lead');
    if (lead.assigned_team_name || (lead.assigned_team_names || []).length) return 'Submitted to Feasibility Team';
    return 'Approved';
  }
  if (status === 'FEASIBILITY_IN_PROGRESS') {
    return 'Submitted to Feasibility Team';
  }
  if (status === 'FEASIBILITY_SUBMITTED') {
    const clarification =
      lead.previous_status === 'FEASIBILITY_RETURNED' || Boolean(lead.feasibility_study?.pm_return_reason);
    return clarification ? `Clarification Submitted to ${pm}` : submittedTo(lead.pm_name ? pm : 'PM');
  }
  if (status === 'FEASIBILITY_RETURNED') return 'Returned for Clarification';
  if (status === 'COSTING_IN_PROGRESS') return 'Submitted to Procurement Review';
  if (status === 'COSTING_SUBMITTED') return submittedTo(owner || (lead.pm_name ? pm : 'PM'));
  if (status === 'COSTING_RETURNED') return 'Returned for Clarification';
  if (status === 'ORDER_CONVERTED' || status === 'WON') return 'Approved';
  if (status === 'FEASIBILITY_REJECTED' || status === 'COSTING_REJECTED' || status === 'CANCELLED') return 'Rejected';

  return status.replace(/_/g, ' ');
}
