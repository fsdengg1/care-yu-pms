import { NextFunction, Response } from 'express';
import { AuthedRequest } from '../middleware/auth.js';
import { User } from '../types.js';

const ROLE_PERMISSIONS: Record<string, string[]> = {
  CEO: [
    'view:dashboard:ceo',
    'view:leads',
    'view:projects',
    'view:teams',
    'view:escalations',
    'view:audit',
    'view:notifications',
    'view:daily-updates',
    'decide:ceo_escalation',
    'create:announcement',
  ],
  CTO: ['view:leads', 'edit:lead', 'view:projects', 'view:teams', 'view:audit', 'view:notifications', 'view:daily-updates', 'manage:users', 'create:announcement'],
  BUSINESS_HEAD: [
    'create:lead',
    'edit:lead',
    'view:leads',
    'view:notifications',
    'view:daily-updates',
    'view:projects',
    'create:quotation',
    'convert:lead',
    'view:escalations',
    'escalate:issue',
    'create:announcement',
  ],
  ENG_DIRECTOR: [
    'create:lead',
    'edit:lead',
    'view:leads',
    'create:task',
    'create:feasibility',
    'view:notifications',
    'view:daily-updates',
    'view:projects',
    'create:quotation',
    'convert:lead',
    'view:escalations',
    'escalate:issue',
  ],
  SALES: ['edit:lead', 'view:leads', 'view:notifications', 'create:quotation', 'convert:lead'],
  PROJECT_MANAGER: [
    'view:leads',
    'edit:lead',
    'assign:lead',
    'create:task',
    'create:feasibility',
    'review:lead',
    'approve:feasibility',
    'approve:costing',
    'view:projects',
    'view:notifications',
    'view:audit',
    'view:daily-updates',
    'view:escalations',
    'escalate:issue',
    'manage:project',
    'manage:users',
  ],
  PROJECT_ENGINEER: ['view:leads', 'edit:lead', 'create:task', 'view:projects', 'view:notifications', 'submit:daily-update', 'view:daily-updates'],
  TEAM_LEAD: ['view:leads', 'edit:lead', 'create:task', 'assign:task', 'create:feasibility', 'view:notifications', 'submit:daily-update', 'view:daily-updates', 'view:projects', 'view:escalations', 'escalate:issue'],
  EMPLOYEE: ['view:leads', 'submit:daily-update', 'create:feasibility', 'view:notifications', 'view:daily-updates', 'view:projects'],
  EXECUTION: ['view:leads', 'submit:daily-update', 'view:notifications', 'view:daily-updates', 'view:projects'],
  PROCUREMENT: ['view:leads', 'view:projects', 'create:costing', 'view:notifications', 'submit:daily-update', 'view:daily-updates'],
  SYSTEM_ADMIN: ['*'],
};

export function hasPermission(user: User | undefined, permission: string): boolean {
  if (!user) return false;
  const granted = ROLE_PERMISSIONS[user.role_code] ?? [];
  return granted.includes('*') || granted.includes(permission);
}

export function requirePermission(...permissions: string[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const allowed = permissions.some((permission) => hasPermission(req.user, permission));
    if (!allowed) {
      return res.status(403).json({
        message: 'Forbidden. This action is not permitted for your role.',
      });
    }
    return next();
  };
}

/** Role-gated Team Dashboard. SYSTEM_ADMIN wildcard does not grant this. */
export const TEAM_DASHBOARD_ROLES = new Set([
  'CEO',
  'CTO',
  'BUSINESS_HEAD',
  'ENG_DIRECTOR',
  'ENGG_DIRECTOR',
  'PROJECT_MANAGER',
]);

export function canAccessTeamDashboard(user: User | undefined): boolean {
  return Boolean(user && TEAM_DASHBOARD_ROLES.has(user.role_code));
}

export function requireTeamDashboardAccess(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!canAccessTeamDashboard(req.user)) {
    return res.status(403).json({
      message: 'Forbidden. Team Dashboard is not available for your role.',
    });
  }
  return next();
}
