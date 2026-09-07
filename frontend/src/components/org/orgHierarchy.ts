import { Role, Team, User } from '@/lib/types';

export type OrgNodeKind = 'person' | 'team';

export interface OrgNode {
  id: string;
  kind: OrgNodeKind;
  title: string;
  subtitle: string;
  userId?: string;
  teamId?: string;
  roleCode?: string;
  reportingContextId?: string;
  access: string;
  children: OrgNode[];
}

export const ACCESS_SCOPES: Record<string, string> = {
  CEO: 'Monitor All Dashboards',
  CTO: 'Monitor Software Team Only',
  BUSINESS_HEAD: 'Monitor PM + 5 Teams',
  ENG_DIRECTOR: 'Monitor PM + 5 Teams',
  PROJECT_MANAGER: 'Monitor & Manage 5 Teams',
  TEAM_LEAD: 'Assigned team',
  EMPLOYEE: 'Own assigned work',
};

export const MANAGEMENT_ROLES = new Set([
  'CEO',
  'CTO',
  'BUSINESS_HEAD',
  'ENG_DIRECTOR',
  'PROJECT_MANAGER',
]);

const FUNCTIONAL_TEAM_ROLES = new Set([
  'TEAM_LEAD',
  'EMPLOYEE',
  'PROJECT_ENGINEER',
  'PROCUREMENT',
  'EXECUTION',
]);

export function resolveReportingManagerId(roleCode: string, users: User[], hasTeam = false): string | undefined {
  const active = users.filter((user) => user.status === 'ACTIVE');
  const ceo = active.find((user) => user.role_code === 'CEO');
  const businessHead = active.find((user) => user.role_code === 'BUSINESS_HEAD');
  const pm = active.find((user) => user.role_code === 'PROJECT_MANAGER');
  if (roleCode === 'CEO') return undefined;
  if (roleCode === 'BUSINESS_HEAD' || roleCode === 'ENG_DIRECTOR' || roleCode === 'CTO') return ceo?.id;
  if (roleCode === 'PROJECT_MANAGER') return businessHead?.id || ceo?.id;
  if (hasTeam || FUNCTIONAL_TEAM_ROLES.has(roleCode)) return pm?.id;
  return pm?.id || ceo?.id;
}

export const ORG_ADMIN_ROLES = new Set([
  'CEO',
  'CTO',
  'PROJECT_MANAGER',
  'SYSTEM_ADMIN',
]);

export function namesLikelySame(a: string, b: string): boolean {
  const left = a.trim().toLowerCase().replace(/\s+/g, ' ');
  const right = b.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!left || !right) return false;
  if (left === right) return true;
  const firstLeft = left.split(' ')[0];
  const firstRight = right.split(' ')[0];
  if (firstLeft === firstRight) return true;
  const compact = (value: string) => value.replace(/[aeiou]/g, '');
  return firstLeft.length >= 4 && firstRight.length >= 4 && compact(firstLeft) === compact(firstRight);
}

/** Signup/team-member copies of CEO, BH, ED, etc. must not appear again at the bottom of org views. */
export function isLeadershipShadowAccount(user: User, directory: User[]): boolean {
  if (MANAGEMENT_ROLES.has(user.role_code) || user.role_code === 'SYSTEM_ADMIN') return false;
  return directory.some((other) => {
    if (other.id === user.id || !MANAGEMENT_ROLES.has(other.role_code)) return false;
    if (namesLikelySame(user.name, other.name)) return true;
    const emailA = user.email.split('@')[0]?.toLowerCase() || '';
    const emailB = other.email.split('@')[0]?.toLowerCase() || '';
    return Boolean(emailA && emailB && (emailA === emailB || emailA.includes(emailB) || emailB.includes(emailA)));
  });
}

export function isDisplayedTeamMember(user: User, team: Team, users: User[]): boolean {
  if (user.status === 'INACTIVE' || user.role_code === 'SYSTEM_ADMIN') return false;
  if (MANAGEMENT_ROLES.has(user.role_code) || isLeadershipShadowAccount(user, users)) return false;
  if (user.team_id === team.id) return true;
  return Boolean(team.team_lead_id && !user.team_id && user.reporting_manager_id === team.team_lead_id);
}

export const ROLE_LABELS: Record<string, string> = {
  CEO: 'CEO',
  CTO: 'CTO',
  BUSINESS_HEAD: 'Business Head',
  ENG_DIRECTOR: 'Engineering Director',
  PROJECT_MANAGER: 'Project Manager',
  TEAM_LEAD: 'Team Lead',
  EMPLOYEE: 'Team Member',
};

export function getDepartment(user: User): string {
  switch (user.role_code) {
    case 'CEO':
      return 'Executive Leadership';
    case 'CTO':
      return 'Technology';
    case 'BUSINESS_HEAD':
      return 'Business Development';
    case 'ENG_DIRECTOR':
      return 'Engineering';
    case 'PROJECT_MANAGER':
      return 'Project Management';
    case 'SYSTEM_ADMIN':
      return 'Platform Administration';
    default:
      return user.team_name || 'Unassigned';
  }
}

export function getAccessScope(
  roleCode: string,
  teamName?: string,
  context?: { teamCount?: number; hasProjectManager?: boolean }
): string {
  const teamCount = context?.teamCount;
  const hasPm = context?.hasProjectManager;

  if (roleCode === 'TEAM_LEAD' && teamName) return `${teamName} — assigned team visibility`;
  if (roleCode === 'EMPLOYEE') return 'Own assigned work';
  if (roleCode === 'PROJECT_MANAGER' && typeof teamCount === 'number') {
    return `Monitor & Manage ${teamCount} Team${teamCount === 1 ? '' : 's'}`;
  }
  if ((roleCode === 'BUSINESS_HEAD' || roleCode === 'ENG_DIRECTOR') && typeof teamCount === 'number') {
    return hasPm
      ? `Monitor PM + ${teamCount} Team${teamCount === 1 ? '' : 's'}`
      : `Monitor ${teamCount} Team${teamCount === 1 ? '' : 's'}`;
  }
  if (roleCode === 'CTO' && teamName) return `Monitor ${teamName} Only`;
  return ACCESS_SCOPES[roleCode] || 'Role-based operational access';
}

export function formatAccessCaption(scope: string): string {
  return `(Access: ${scope.replace(/^Monitor(?: & Manage)? /, '')})`;
}

const TEAM_CHART_ORDER = ['SOFTWARE', 'VISION', 'ROBOTICS', 'PROCUREMENT', 'EXECUTION'];
const CEO_REPORT_ORDER = ['CTO', 'BUSINESS_HEAD', 'ENG_DIRECTOR'];

export function chartDisplayName(user: User): string {
  const name = user.name.trim();
  if (user.role_code === 'CEO' && /bernard/i.test(name)) return 'Bernard Hamilton';
  if (user.role_code === 'CTO') {
    if (/^raja$/i.test(name) || user.email?.toLowerCase() === 'raja@careyu.ai') return 'Raja';
    if (!/ilaya/i.test(name)) return 'IlayaRaja';
  }
  if (user.role_code === 'BUSINESS_HEAD' && /shradha|sharadha/i.test(name)) return 'Sharadha Patil';
  return name;
}

function sortTeams(teams: Team[]): Team[] {
  return [...teams].sort((a, b) => {
    const left = TEAM_CHART_ORDER.indexOf(a.code);
    const right = TEAM_CHART_ORDER.indexOf(b.code);
    return (left === -1 ? 99 : left) - (right === -1 ? 99 : right) || a.name.localeCompare(b.name);
  });
}

function roleRank(roleCode: string, roles: Role[]): number {
  const index = roles.findIndex((role) => role.code === roleCode);
  return index === -1 ? 999 : index;
}

function countTeamNodes(node: OrgNode): number {
  return node.children.reduce((sum, child) => sum + (child.kind === 'team' ? 1 : countTeamNodes(child)), 0);
}

export function hasTeamDescendant(node: OrgNode): boolean {
  return node.children.some((child) => child.kind === 'team' || hasTeamDescendant(child));
}

function teamLeadOf(team: Team, users: User[]): User | undefined {
  return users.find((user) => user.id === team.team_lead_id) || users.find((user) => user.team_id === team.id && user.role_code === 'TEAM_LEAD');
}

function managerIdForTeam(_team: Team, users: User[]): string | undefined {
  return users.find((user) => user.role_code === 'PROJECT_MANAGER' && user.status !== 'INACTIVE')?.id;
}

export function getDirectReports(userId: string, users: User[]): User[] {
  return users
    .filter(
      (user) =>
        user.reporting_manager_id === userId &&
        user.role_code !== 'SYSTEM_ADMIN' &&
        !isLeadershipShadowAccount(user, users)
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function buildOrganizationTree(users: User[], teams: Team[], roles: Role[] = []): OrgNode[] {
  const directory = users.filter(
    (user) =>
      user.role_code !== 'SYSTEM_ADMIN' &&
      user.status === 'ACTIVE' &&
      !isLeadershipShadowAccount(user, users)
  );
  const directoryIds = new Set(directory.map((user) => user.id));
  const chartPeople = directory.filter((user) => !user.team_id);
  const activeTeams = teams.filter((team) => team.status !== 'INACTIVE');
  const hasProjectManager = directory.some((user) => user.role_code === 'PROJECT_MANAGER');
  const functionalTeamCount = activeTeams.length;
  const attachedTeams = new Set<string>();
  const visiting = new Set<string>();

  const comparePeople = (a: User, b: User) => {
    const left = CEO_REPORT_ORDER.includes(a.role_code) ? CEO_REPORT_ORDER.indexOf(a.role_code) : 99;
    const right = CEO_REPORT_ORDER.includes(b.role_code) ? CEO_REPORT_ORDER.indexOf(b.role_code) : 99;
    if (left !== right) return left - right;
    const rank = roleRank(a.role_code, roles) - roleRank(b.role_code, roles);
    return rank !== 0 ? rank : a.name.localeCompare(b.name);
  };

  function canonicalManagerId(user: User): string | undefined {
    if (user.role_code === 'CEO') return undefined;
    if (user.role_code === 'BUSINESS_HEAD' || user.role_code === 'ENG_DIRECTOR' || user.role_code === 'CTO') {
      return directory.find((item) => item.role_code === 'CEO')?.id;
    }
    if (user.role_code === 'PROJECT_MANAGER') {
      return directory.find((item) => item.role_code === 'BUSINESS_HEAD')?.id
        || directory.find((item) => item.role_code === 'CEO')?.id;
    }
    const managerId = user.reporting_manager_id;
    if (managerId && directoryIds.has(managerId)) return managerId;
    return managerId;
  }

  let roots = chartPeople
    .filter((user) => MANAGEMENT_ROLES.has(user.role_code) && !canonicalManagerId(user))
    .sort(comparePeople);
  if (roots.length === 0) {
    roots = chartPeople.filter((user) => user.role_code === 'CEO').sort(comparePeople);
  }
  if (roots.length === 0) {
    roots = chartPeople.filter((user) => MANAGEMENT_ROLES.has(user.role_code)).slice(0, 1);
  }

  function teamsReportingTo(managerId: string): Team[] {
    const manager = directory.find((user) => user.id === managerId);
    if (manager?.role_code !== 'PROJECT_MANAGER') return [];
    return sortTeams(activeTeams.filter((team) => !attachedTeams.has(team.id) && managerIdForTeam(team, directory) === managerId));
  }

  function peopleReportingTo(managerId: string): User[] {
    return chartPeople.filter((user) => canonicalManagerId(user) === managerId && user.id !== managerId).sort(comparePeople);
  }

  function makePersonLeaf(user: User): OrgNode {
    return {
      id: `person-${user.id}`,
      kind: 'person',
      title: chartDisplayName(user),
      subtitle: user.role_name,
      userId: user.id,
      roleCode: user.role_code,
      reportingContextId: user.reporting_manager_id,
      access: getAccessScope(user.role_code, user.team_name),
      children: [],
    };
  }

  function makeTeamNode(team: Team): OrgNode {
    const lead = teamLeadOf(team, directory);
    const unassignedReports = lead
      ? directory
          .filter(
            (user) =>
              !user.team_id &&
              !MANAGEMENT_ROLES.has(user.role_code) &&
              user.reporting_manager_id === lead.id
          )
          .sort(comparePeople)
          .map(makePersonLeaf)
      : [];
    return {
      id: `team-${team.id}`,
      kind: 'team',
      title: team.name,
      subtitle: unassignedReports.length
        ? `Team Lead / Members · ${unassignedReports.length} unassigned`
        : 'Team Lead / Members',
      teamId: team.id,
      reportingContextId: lead?.reporting_manager_id,
      access: `${team.name} — assigned team visibility`,
      children: unassignedReports,
    };
  }

  function buildPerson(user: User): OrgNode | null {
    if (visiting.has(user.id)) return null;
    visiting.add(user.id);

    const childPeople = peopleReportingTo(user.id)
      .map(buildPerson)
      .filter((node): node is OrgNode => Boolean(node));
    const childTeams = teamsReportingTo(user.id).map((team) => {
      attachedTeams.add(team.id);
      return makeTeamNode(team);
    });

    visiting.delete(user.id);

    const children = [...childPeople, ...childTeams];
    const descendantTeams = countTeamNodes({ id: user.id, kind: 'person', title: '', subtitle: '', access: '', children });

    return {
      id: `person-${user.id}`,
      kind: 'person',
      title: chartDisplayName(user),
      subtitle: user.role_name,
      userId: user.id,
      roleCode: user.role_code,
      reportingContextId: user.reporting_manager_id,
      access: getAccessScope(
        user.role_code,
        user.role_code === 'CTO' ? 'Software Team' : user.team_name,
        {
          teamCount: user.role_code === 'PROJECT_MANAGER' ? descendantTeams || functionalTeamCount : functionalTeamCount,
          hasProjectManager,
        }
      ),
      children,
    };
  }

  const forest = roots.map(buildPerson).filter((node): node is OrgNode => Boolean(node));

  const leftover = activeTeams.filter((team) => !attachedTeams.has(team.id));
  if (leftover.length > 0) {
    const host =
      forest
        .flatMap(function collect(node: OrgNode): OrgNode[] {
          return [node, ...node.children.filter((child) => child.kind === 'person').flatMap(collect)];
        })
        .find((node) => node.roleCode === 'PROJECT_MANAGER') || forest[0];
    sortTeams(leftover).forEach((team) => {
      attachedTeams.add(team.id);
      host?.children.push(makeTeamNode(team));
    });
  }

  return forest;
}

export function buildAccessSummary(nodes: OrgNode[]): Array<{ label: string; scope: string }> {
  const byScope = new Map<string, string[]>();
  const walk = (node: OrgNode) => {
    if (node.kind === 'person' && node.access) {
      const roles = byScope.get(node.access) ?? [];
      if (!roles.includes(node.subtitle)) roles.push(node.subtitle);
      byScope.set(node.access, roles);
    }
    node.children.forEach(walk);
  };
  nodes.forEach(walk);
  return [...byScope.entries()].map(([scope, roleNames]) => ({
    label: roleNames.join(' & '),
    scope,
  }));
}

export function filterOrganizationTree(
  nodes: OrgNode[],
  query: string,
  roleFilter: string,
  teamFilter: string,
  users: User[]
): OrgNode[] {
  const q = query.trim().toLowerCase();

  const selfMatches = (node: OrgNode): boolean => {
    const user = node.userId ? users.find((u) => u.id === node.userId) : undefined;
    const haystack = [node.title, node.subtitle, user?.email, user?.role_name, user?.role_code, user?.team_name, user?.employee_id]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const queryOk = !q || haystack.includes(q);
    const roleOk = roleFilter === 'ALL' || node.roleCode === roleFilter;
    const teamOk = teamFilter === 'ALL' || node.teamId === teamFilter || user?.team_id === teamFilter;
    if (node.kind === 'team') {
      return queryOk && (teamFilter === 'ALL' || node.teamId === teamFilter) && roleFilter === 'ALL';
    }
    return queryOk && roleOk && teamOk;
  };

  const walk = (node: OrgNode): OrgNode | null => {
    const children = node.children.map(walk).filter((child): child is OrgNode => child !== null);
    if (selfMatches(node) || children.length > 0) return { ...node, children };
    return null;
  };

  return nodes.map(walk).filter((node): node is OrgNode => node !== null);
}

export function collectExpandableIds(nodes: OrgNode[]): Set<string> {
  const ids = new Set<string>();
  const walk = (node: OrgNode) => {
    if (node.children.length > 0) ids.add(node.id);
    node.children.forEach(walk);
  };
  nodes.forEach(walk);
  return ids;
}

export function defaultExpandedIds(nodes: OrgNode[]): Set<string> {
  const ids = new Set<string>();
  const walk = (node: OrgNode) => {
    if (node.kind === 'person' && node.children.length > 0) ids.add(node.id);
    node.children.forEach(walk);
  };
  nodes.forEach(walk);
  return ids;
}
