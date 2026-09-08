'use client';

import { User, Lead } from './types';

export interface NavItem {
  name: string;
  href: string;
  iconName: string;
  badge?: string;
  allowedRoles?: string[];
  category: 'main' | 'pre_sales' | 'projects' | 'team_work' | 'system';
}

export const NAVIGATION_ITEMS: NavItem[] = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    iconName: 'LayoutDashboard',
    category: 'main'
  },
  {
    name: 'Executive Overview',
    href: '/executive-overview',
    iconName: 'BarChart3',
    category: 'main',
    allowedRoles: ['CEO', 'CTO', 'BUSINESS_HEAD', 'ENG_DIRECTOR', 'PROJECT_MANAGER', 'SYSTEM_ADMIN']
  },
  {
    name: 'Leads & Pipeline',
    href: '/pre-sales/leads',
    iconName: 'Building2',
    category: 'pre_sales'
  },
  {
    name: 'Feasibility Studies',
    href: '/pre-sales/feasibility',
    iconName: 'Scan',
    category: 'pre_sales'
  },
  {
    name: 'Solution & Costing',
    href: '/pre-sales/costing',
    iconName: 'Calculator',
    category: 'pre_sales'
  },
  {
    name: 'Active Projects',
    href: '/projects/active',
    iconName: 'Bot',
    category: 'projects',
    allowedRoles: ['CEO', 'CTO', 'BUSINESS_HEAD', 'ENG_DIRECTOR', 'PROJECT_MANAGER', 'PROJECT_ENGINEER', 'TEAM_LEAD', 'EMPLOYEE', 'EXECUTION', 'SYSTEM_ADMIN']
  },
  {
    name: 'Project Gantt & Planning',
    href: '/projects/planning',
    iconName: 'GanttChartSquare',
    category: 'projects',
    allowedRoles: ['CEO', 'CTO', 'BUSINESS_HEAD', 'ENG_DIRECTOR', 'PROJECT_MANAGER', 'TEAM_LEAD', 'EMPLOYEE', 'PROJECT_ENGINEER', 'EXECUTION', 'SALES', 'PROCUREMENT', 'SYSTEM_ADMIN']
  },
  {
    name: 'My Assigned Work',
    href: '/my-work',
    iconName: 'CheckSquare',
    category: 'team_work'
  },
  {
    name: 'Messages',
    href: '/messages',
    iconName: 'MessageSquare',
    category: 'team_work'
  },
  {
    name: 'CEO Chat',
    href: '/ceo-chat',
    iconName: 'MessageSquare',
    category: 'team_work',
    allowedRoles: ['CEO']
  },
  {
    name: 'Daily Work Updates',
    href: '/daily-updates',
    iconName: 'FileText',
    category: 'team_work'
  },
  {
    name: 'Email Reports',
    href: '/email-reports',
    iconName: 'Mail',
    category: 'team_work',
    allowedRoles: ['CEO', 'CTO', 'BUSINESS_HEAD', 'ENG_DIRECTOR', 'PROJECT_MANAGER', 'PROJECT_ENGINEER', 'TEAM_LEAD', 'SYSTEM_ADMIN']
  },
  {
    name: 'Escalations',
    href: '/dashboard/ceo/escalations',
    iconName: 'ShieldAlert',
    category: 'team_work',
    allowedRoles: ['CEO', 'CTO', 'BUSINESS_HEAD', 'ENG_DIRECTOR', 'PROJECT_MANAGER', 'TEAM_LEAD', 'SYSTEM_ADMIN']
  },
  {
    name: 'Functional Teams',
    href: '/teams',
    iconName: 'Users',
    category: 'team_work'
  },
  {
    name: 'Procurement Requests',
    href: '/procurement',
    iconName: 'ShoppingCart',
    category: 'team_work',
    allowedRoles: ['CEO', 'CTO', 'PROJECT_MANAGER', 'PROCUREMENT', 'SYSTEM_ADMIN']
  },
  {
    name: 'Organization Management',
    href: '/org',
    iconName: 'Network',
    category: 'system'
  },
  {
    name: 'Settings',
    href: '/settings',
    iconName: 'Settings',
    category: 'system'
  },
  {
    name: 'User Management',
    href: '/users',
    iconName: 'UserCheck',
    category: 'system',
    allowedRoles: ['CEO', 'CTO', 'PROJECT_MANAGER', 'SYSTEM_ADMIN']
  },
  {
    name: 'Roles & Permissions',
    href: '/roles',
    iconName: 'ShieldAlert',
    category: 'system',
    allowedRoles: ['CEO', 'CTO', 'SYSTEM_ADMIN']
  },
  {
    name: 'Audit Trail',
    href: '/audit-logs',
    iconName: 'History',
    category: 'system',
    allowedRoles: ['CEO', 'CTO', 'PROJECT_MANAGER', 'SYSTEM_ADMIN']
  }
];

const CEO_HIDDEN_HREFS = new Set([
  '/my-work',
  '/users',
  '/roles',
]);

export function isCeoViewOnly(user: User | null | undefined): boolean {
  return user?.role_code === 'CEO';
}

export function canAccessExecutiveOverview(user: User | null | undefined): boolean {
  if (!user) return false;
  return ['CEO', 'BUSINESS_HEAD', 'ENG_DIRECTOR', 'CTO', 'PROJECT_MANAGER', 'SYSTEM_ADMIN'].includes(user.role_code);
}

export function canCreateLead(user: User | null | undefined): boolean {
  if (!user) return false;
  return user.role_code === 'BUSINESS_HEAD' || user.role_code === 'ENG_DIRECTOR';
}

export function canAccessGanttPlanning(user: User | null | undefined): boolean {
  if (!user) return false;
  return [
    'PROJECT_MANAGER',
    'TEAM_LEAD',
    'BUSINESS_HEAD',
    'ENG_DIRECTOR',
    'CEO',
    'CTO',
    'SYSTEM_ADMIN',
    'EMPLOYEE',
    'PROJECT_ENGINEER',
    'EXECUTION',
    'SALES',
    'PROCUREMENT',
  ].includes(user.role_code);
}

export function canOpenProjectGantt(
  user: User | null | undefined,
  project?: { pm_id?: string; team_lead_id?: string; assigned_member_id?: string; team_ids?: string[] } | null
): boolean {
  if (!canAccessGanttPlanning(user) || !user) return false;
  if (['CEO', 'CTO', 'BUSINESS_HEAD', 'ENG_DIRECTOR', 'SYSTEM_ADMIN', 'SALES', 'PROCUREMENT'].includes(user.role_code)) return true;
  if (user.role_code === 'PROJECT_MANAGER') return !project || project.pm_id === user.id;
  if (user.role_code === 'TEAM_LEAD') {
    if (!project) return true;
    return project.team_lead_id === user.id || Boolean(user.team_id && (project.team_ids || []).includes(user.team_id));
  }
  if (['EMPLOYEE', 'PROJECT_ENGINEER', 'EXECUTION'].includes(user.role_code)) {
    if (!project) return true;
    return (
      project.assigned_member_id === user.id ||
      Boolean(user.team_id && (project.team_ids || []).includes(user.team_id))
    );
  }
  return false;
}

export function canEditProjectGantt(
  user: User | null | undefined,
  project?: { pm_id?: string; intake_status?: string } | null
): boolean {
  if (!user) return false;
  if (project && ['DRAFT', 'SUBMITTED_TO_PM', 'RETURNED_TO_CREATOR'].includes(project.intake_status || '')) return false;
  if (user.role_code === 'SYSTEM_ADMIN') return true;
  return user.role_code === 'PROJECT_MANAGER' && Boolean(!project || project.pm_id === user.id);
}

export function canCreateAnnouncement(user: User | null | undefined): boolean {
  if (!user) return false;
  return ['CEO', 'CTO', 'BUSINESS_HEAD', 'SYSTEM_ADMIN'].includes(user.role_code);
}

export function canModerateForum(user: User | null | undefined): boolean {
  if (!user) return false;
  return ['TEAM_LEAD', 'PROJECT_MANAGER', 'SYSTEM_ADMIN', 'CEO', 'CTO'].includes(user.role_code);
}

export function canCreateWorkTask(user: User | null | undefined): boolean {
  if (!user) return false;
  return ['PROJECT_MANAGER', 'ENG_DIRECTOR', 'TEAM_LEAD', 'SYSTEM_ADMIN'].includes(user.role_code);
}

export function canCreateLeadTask(user: User | null | undefined): boolean {
  if (!user) return false;
  return ['PROJECT_MANAGER', 'ENG_DIRECTOR', 'TEAM_LEAD', 'SYSTEM_ADMIN'].includes(user.role_code);
}

export function canEditDailySheet(user: User | null | undefined): boolean {
  if (!user) return false;
  return ['PROJECT_MANAGER', 'ENG_DIRECTOR', 'SYSTEM_ADMIN'].includes(user.role_code);
}

/** Any signed-in user can add their own daily work task / subtask. */
export function canAddDailyWorkTask(user: User | null | undefined): boolean {
  return Boolean(user);
}

export function canPerformPmOperations(user: User | null | undefined): boolean {
  if (!user) return false;
  return ['PROJECT_MANAGER', 'SYSTEM_ADMIN'].includes(user.role_code);
}

export function canPrepareFeasibility(user: User | null | undefined): boolean {
  if (!user) return false;
  return ['TEAM_LEAD', 'EMPLOYEE', 'PROJECT_ENGINEER', 'EXECUTION', 'SYSTEM_ADMIN'].includes(user.role_code);
}

export function userIsOnLeadTeam(user: User | null | undefined, lead: Lead | null | undefined): boolean {
  if (!user || !lead) return false;
  if (lead.assigned_team_lead_id === user.id || lead.assigned_member_id === user.id) return true;
  if ((lead.visit_assigned_user_ids || []).includes(user.id)) return true;
  return Boolean(
    user.team_id &&
      (user.team_id === lead.assigned_team_id || (lead.assigned_team_ids || []).includes(user.team_id))
  );
}

export function canPrepareCosting(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.role_code === 'PROCUREMENT' || user.role_code === 'SYSTEM_ADMIN') return true;
  const hay = `${user.team_name || ''} ${user.role_name || ''}`.toLowerCase();
  return hay.includes('procurement') || hay.includes('costing');
}

export function canSubmitDailyUpdate(user: User | null | undefined): boolean {
  if (!user) return false;
  return ['EMPLOYEE', 'TEAM_LEAD', 'PROCUREMENT', 'EXECUTION', 'PROJECT_ENGINEER', 'SYSTEM_ADMIN'].includes(user.role_code);
}

export function canReviewDailyUpdates(user: User | null | undefined): boolean {
  if (!user) return false;
  return ['TEAM_LEAD', 'PROJECT_MANAGER', 'BUSINESS_HEAD', 'ENG_DIRECTOR', 'CEO', 'CTO', 'SYSTEM_ADMIN'].includes(user.role_code);
}

export function canHandleCommercial(user: User | null | undefined): boolean {
  if (!user) return false;
  return ['BUSINESS_HEAD', 'ENG_DIRECTOR', 'SALES', 'SYSTEM_ADMIN'].includes(user.role_code);
}

export function canHandleLeadCommercial(user: User | null | undefined, lead: Lead | null | undefined): boolean {
  if (!user || !lead) return false;
  if (user.role_code === 'SYSTEM_ADMIN') return true;
  if (!['BUSINESS_HEAD', 'ENG_DIRECTOR'].includes(user.role_code)) return false;
  return lead.created_by_id === user.id;
}

export function canPrepareQuotation(user: User | null | undefined, lead: Lead | null | undefined): boolean {
  if (!canHandleLeadCommercial(user, lead) || !lead) return false;
  if (!lead.status) return false;
  return ['QUOTATION', 'NEGOTIATION', 'ORDER_CONVERTED'].includes(lead.status);
}

export function hasPermission(user: User, requiredPermission: string): boolean {
  if (user.role_code === 'SYSTEM_ADMIN') return true;
  if (user.role_code === 'CEO') {
    return [
      'view:financials',
      'view:all_projects',
      'view:audit_logs',
      'view:pipeline',
      'decide:ceo_escalation',
    ].includes(requiredPermission);
  }
  if (user.role_code === 'CTO') return true;
  return true;
}

export function filterNavForUser(user: User): NavItem[] {
  return NAVIGATION_ITEMS.filter((item) => {
    if (isCeoViewOnly(user) && CEO_HIDDEN_HREFS.has(item.href)) return false;
    if (!item.allowedRoles || item.allowedRoles.length === 0) return true;
    return item.allowedRoles.includes(user.role_code);
  });
}

export const CEO_NAV_CATEGORY_LABELS: Record<NavItem['category'], string> = {
  main: 'Overview',
  pre_sales: 'Pre-Sales Visibility',
  projects: 'Project Visibility',
  team_work: 'Execution & Workload',
  system: 'Governance',
};
