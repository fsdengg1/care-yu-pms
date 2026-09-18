import { store } from '../store/db.js';
import {
  CeoDashboardPayload,
  CriticalIssue,
  Lead,
  PipelineStage,
  Project,
} from '../types.js';
import { buildExecutiveDailyWork } from './dailyUpdates.js';
import { persistRefreshedProjects, syncConvertedLeadsToProjects } from './projects.js';

const CLOSED_STAGES: PipelineStage[] = ['CONVERTED', 'REJECTED', 'CANCELLED'];

export function resolvePipelineStage(lead: Lead): PipelineStage {
  const qStatus = lead.quotation?.workflow_status;
  if (lead.status === 'ORDER_CONVERTED' || lead.status === 'WON') return 'CONVERTED';
  if (lead.status === 'LOST') return 'REJECTED';
  if (lead.status === 'CANCELLED') return 'CANCELLED';
  if (
    lead.status === 'NEGOTIATION' ||
    qStatus === 'SUBMITTED_TO_CUSTOMER' ||
    qStatus === 'CUSTOMER_REVIEW'
  ) {
    return 'NEGOTIATION';
  }
  if (lead.pipeline_stage) return lead.pipeline_stage;
  switch (lead.status) {
    case 'DRAFT':
      return 'PROJECT_INPUT';
    case 'SUBMITTED_TO_PM':
    case 'UNDER_PM_REVIEW':
    case 'RETURNED_TO_SALES':
    case 'ADDITIONAL_INFORMATION_REQUIRED':
    case 'RESUBMITTED_TO_PM':
      return 'PM_REVIEW';
    case 'ACCEPTED_FOR_FEASIBILITY':
    case 'FEASIBILITY_IN_PROGRESS':
    case 'FEASIBILITY_SUBMITTED':
    case 'FEASIBILITY_RETURNED':
      return 'FEASIBILITY';
    case 'COSTING_IN_PROGRESS':
    case 'COSTING_SUBMITTED':
    case 'COSTING_RETURNED':
      return 'COSTING';
    case 'QUOTATION':
      return 'QUOTATION';
    default:
      return 'PROJECT_INPUT';
  }
}

export function leadValue(lead: Lead): number {
  if (typeof lead.expected_value === 'number' && Number.isFinite(lead.expected_value)) {
    return lead.expected_value;
  }
  const raw = String(lead.estimated_opportunity_value ?? '').replace(/[₹,\s]/g, '');
  const lakh = raw.match(/^(\d+(?:\.\d+)?)L$/i);
  if (lakh) return Math.round(Number(lakh[1]) * 100000);
  const cr = raw.match(/^(\d+(?:\.\d+)?)Cr$/i);
  if (cr) return Math.round(Number(cr[1]) * 10000000);
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : 0;
}

function relativeHrefForEscalation(id: string) {
  return `/dashboard/ceo/escalations/${id}`;
}

export function buildCeoDashboard(): CeoDashboardPayload {
  syncConvertedLeadsToProjects();
  const leads = store.getLeads();
  const projects = persistRefreshedProjects();
  const teams = store.getTeams();
  const users = store.getUsers();
  const escalations = store.getEscalations();
  const audits = store.getAudits();
  const pm = users.find((user) => user.role_code === 'PROJECT_MANAGER');

  const stages = {
    projectInput: 0,
    pmReview: 0,
    feasibility: 0,
    costing: 0,
    quotation: 0,
    negotiation: 0,
    converted: 0,
  };

  let pipelineValue = 0;
  let activeLeads = 0;

  for (const lead of leads) {
    const stage = resolvePipelineStage(lead);
    if (stage === 'PROJECT_INPUT') stages.projectInput += 1;
    if (stage === 'PM_REVIEW') stages.pmReview += 1;
    if (stage === 'FEASIBILITY') stages.feasibility += 1;
    if (stage === 'COSTING') stages.costing += 1;
    if (stage === 'QUOTATION') stages.quotation += 1;
    if (stage === 'NEGOTIATION') stages.negotiation += 1;
    if (stage === 'CONVERTED') stages.converted += 1;

    if (!CLOSED_STAGES.includes(stage) && lead.status !== 'LOST' && lead.status !== 'ON_HOLD') {
      activeLeads += 1;
      pipelineValue += leadValue(lead);
    }
  }

  const awaitingApproval = stages.pmReview + stages.costing;
  const inProgress = stages.projectInput + stages.feasibility + stages.quotation;
  const activeProjects = projects.filter((project) => project.status === 'ACTIVE');
  const onTrack = activeProjects.filter((project) => project.health === 'ON_TRACK').length;
  const atRisk = activeProjects.filter((project) => project.health === 'AT_RISK').length;
  const critical = activeProjects.filter((project) => project.health === 'CRITICAL').length;
  const needAttention = atRisk + critical;

  const openEscalations = escalations
    .filter((item) => item.status === 'OPEN')
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

  const blockedTeamIds = new Set(
    openEscalations.map((item) => item.team_id).filter((id): id is string => Boolean(id))
  );

  const functionalTeams = teams.filter((team) => team.status === 'ACTIVE');
  const breakdown = functionalTeams.map((team) => {
    const members = users.filter((user) => user.team_id === team.id && user.status === 'ACTIVE').length;
    return {
      id: team.id,
      code: team.code,
      name: team.name.replace(/ Team$/, ''),
      members,
      hasBlocker: blockedTeamIds.has(team.id),
    };
  });

  const criticalIssues: CriticalIssue[] = [];
  for (const escalation of openEscalations) {
    criticalIssues.push({
      id: escalation.id,
      kind: escalation.severity === 'CRITICAL' ? 'CRITICAL_ISSUE' : 'PROJECT_AT_RISK',
      title: escalation.severity === 'CRITICAL' ? 'Critical Issue' : 'Project At Risk',
      customer: escalation.customer_name,
      project: escalation.project_name,
      summary: escalation.summary || escalation.issue,
      escalatedBy: escalation.raised_by_role,
      escalatedAt: escalation.created_at,
      href: relativeHrefForEscalation(escalation.id),
    });
  }

  const escalationProjectIds = new Set(openEscalations.map((item) => item.project_id));
  for (const project of activeProjects) {
    if (project.health === 'AT_RISK' && !escalationProjectIds.has(project.id)) {
      criticalIssues.push({
        id: project.id,
        kind: project.issue?.toLowerCase().includes('procurement') ? 'PROCUREMENT_DELAY' : 'PROJECT_AT_RISK',
        title: project.issue?.toLowerCase().includes('procurement') ? 'Procurement delay' : 'Project At Risk',
        customer: project.customer_name,
        project: project.name,
        summary: project.issue || 'Delivery risk identified',
        href: '/projects/active',
      });
    }
  }

  return {
    pipeline: {
      value: pipelineValue,
      activeLeads,
      awaitingApproval,
      inProgress,
      negotiation: stages.negotiation,
      stages,
    },
    projects: {
      total: activeProjects.length,
      onTrack,
      atRisk,
      critical,
      needAttention,
      items: activeProjects,
    },
    teams: {
      total: functionalTeams.length,
      members: breakdown.reduce((sum, team) => sum + team.members, 0),
      blockedTeams: breakdown.filter((team) => team.hasBlocker).length,
      breakdown,
    },
    projectManager: {
      id: pm?.id ?? 'u-pm',
      name: pm?.name ?? 'Project Manager',
      activeProjects: activeProjects.length,
      pendingReviews: stages.pmReview,
      escalations: openEscalations.length,
    },
    criticalIssues,
    escalations: openEscalations,
    recentActivity: [...audits].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)).slice(0, 8),
    dailyWork: buildExecutiveDailyWork(),
  };
}

export function summarizeProjects(projects: Project[]) {
  const active = projects.filter((project) => project.status === 'ACTIVE');
  return {
    total: active.length,
    onTrack: active.filter((project) => project.health === 'ON_TRACK').length,
    atRisk: active.filter((project) => project.health === 'AT_RISK').length,
    critical: active.filter((project) => project.health === 'CRITICAL').length,
    needAttention: active.filter((project) => project.health === 'AT_RISK' || project.health === 'CRITICAL').length,
  };
}
