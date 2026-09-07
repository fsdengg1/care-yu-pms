import { env } from '../config/env.js';
import { store } from '../store/db.js';
import { User } from '../types.js';
import { hashPassword, verifyPassword } from './password.js';
import { personGivenKey } from './people.js';
import { projectManagerEmail } from './projectManagerAccount.js';
import { robotLeadEmail } from './robotLead.js';

export const ENGINEERING_DIRECTOR_EMAIL = 'sabarigiri@careyu.ai';
export const FSD_ENGG1_EMAIL = 'fsdengg1@careyu.ai';

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

type DirectoryPlacement = {
  role_id: string;
  role_code: string;
  role_name: string;
  team_id?: string;
  team_name?: string;
  clearTeam?: boolean;
};

const ROLE_BY_CODE: Record<string, { role_id: string; role_name: string }> = {
  CEO: { role_id: 'r-ceo', role_name: 'CEO' },
  CTO: { role_id: 'r-cto', role_name: 'CTO' },
  BUSINESS_HEAD: { role_id: 'r-bh', role_name: 'Business Head' },
  ENG_DIRECTOR: { role_id: 'r-ed', role_name: 'Engineering Director' },
  PROJECT_MANAGER: { role_id: 'r-pm', role_name: 'Project Manager' },
  TEAM_LEAD: { role_id: 'r-tl', role_name: 'Team Lead' },
  EMPLOYEE: { role_id: 'r-emp', role_name: 'Team Member' },
  PROCUREMENT: { role_id: 'r-proc', role_name: 'Procurement / Costing' },
  EXECUTION: { role_id: 'r-exec', role_name: 'Execution' },
};

const SOFTWARE_TEAM = { team_id: 't-sw', team_name: 'Software Team' };
const VISION_TEAM = { team_id: 't-vision', team_name: 'Vision Team' };
const ROBOTICS_TEAM = { team_id: 't-robotics', team_name: 'Robotics & Automation Solution Team' };
const PROCUREMENT_TEAM = { team_id: 't-procurement', team_name: 'Procurement / Costing Team' };
const EXECUTION_TEAM = { team_id: 't-execution', team_name: 'Execution Team' };

const SANJAY_EMAIL = 'sanjay@careyu.ai';
const ARAVIND_EMAIL = 'aravind@careyu.ai';
const RAJA_EMAIL = 'raja@careyu.ai';
const KABITHA_EMAIL = 'kabitha@careyu.ai';
const ARUN_EMAIL = 'arun@careyu.ai';
/** Live Software Team Lead login (seeded historically as fsdlead1). */
const ARUN_LIVE_EMAIL = 'fsdlead1@careyu.ai';
const REMOVED_DIRECTORY_NAMES = ['sanjay', 'aravind'] as const;

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function nameHaystack(name: string) {
  return normalize(name).replace(/[^a-z]/g, '');
}

function emailLocal(email: string) {
  return email.split('@')[0] || '';
}

function role(code: keyof typeof ROLE_BY_CODE, extra: Omit<DirectoryPlacement, 'role_id' | 'role_code' | 'role_name'> = {}): DirectoryPlacement {
  return { ...ROLE_BY_CODE[code], role_code: code, ...extra };
}

export function resolveDirectoryRole(emailRaw: string, nameRaw = ''): DirectoryPlacement | null {
  const email = normalize(emailRaw);
  const name = nameHaystack(nameRaw);
  const local = emailLocal(email);
  const pmEmail = projectManagerEmail();
  const robotEmail = robotLeadEmail();

  if (email === FSD_ENGG1_EMAIL || local === 'fsdengg1') {
    return role('EMPLOYEE', SOFTWARE_TEAM);
  }
  if (email === 'ceo@careyu.ai' || name.includes('bernard')) {
    return role('CEO', { clearTeam: true });
  }
  if (
    email === 'businesshead@careyu.ai' ||
    email.startsWith('businesshead@') ||
    name.includes('shradha') ||
    name.includes('sharadha')
  ) {
    return role('BUSINESS_HEAD', { clearTeam: true });
  }
  if (
    email === ENGINEERING_DIRECTOR_EMAIL ||
    email === 'engg.director@careyu.ai' ||
    email.startsWith('sabarigiri@') ||
    email.startsWith('sabirigiri@') ||
    email.startsWith('engg.director@') ||
    name.includes('sabarigiri') ||
    name.includes('sabirigiri') ||
    name.includes('sabagiri')
  ) {
    return role('ENG_DIRECTOR', { clearTeam: true });
  }
  if (email === pmEmail || name === 'arivan') {
    return role('PROJECT_MANAGER', { clearTeam: true });
  }
  if (email === robotEmail || local === 'aakash' || personGivenKey(nameRaw) === 'aakash') {
    return role('TEAM_LEAD', ROBOTICS_TEAM);
  }
  if (
    email === ARUN_EMAIL ||
    email === ARUN_LIVE_EMAIL ||
    local === 'fsdlead1' ||
    (name.startsWith('arun') && !name.includes('arivan') && !name.includes('aravind')) ||
    (local.startsWith('arun') && !local.startsWith('arivan') && !local.startsWith('aravind'))
  ) {
    return role('TEAM_LEAD', SOFTWARE_TEAM);
  }
  if (name.includes('kabitha') || local.includes('kabitha') || email === KABITHA_EMAIL || personGivenKey(nameRaw) === 'kabitha') {
    return role('EMPLOYEE', SOFTWARE_TEAM);
  }
  if (name.includes('vani') || local.includes('vani')) {
    return role('TEAM_LEAD', VISION_TEAM);
  }
  if (name.includes('sanjay') || local.includes('sanjay') || email === SANJAY_EMAIL || personGivenKey(nameRaw) === 'sanjay') {
    return role('PROCUREMENT', PROCUREMENT_TEAM);
  }
  if (name.includes('aravind') || local.includes('aravind') || email === ARAVIND_EMAIL || personGivenKey(nameRaw) === 'aravind') {
    return role('EXECUTION', EXECUTION_TEAM);
  }
  if (email === RAJA_EMAIL || email === 'cto@careyu.ai' || local === 'raja' || local === 'cto' || personGivenKey(nameRaw) === 'raja' || personGivenKey(nameRaw) === 'posu' || name.includes('posu') || name.includes('ilaya')) {
    return role('CTO', { clearTeam: true });
  }
  return null;
}

function withRole(user: User, placement: DirectoryPlacement): User {
  const catalog = store.getRoles().find((item) => item.code === placement.role_code);
  return {
    ...user,
    role_id: catalog?.id || placement.role_id,
    role_code: placement.role_code,
    role_name: catalog?.name || placement.role_name,
  };
}

export function applyDirectoryPlacement(user: User): User {
  const placement = resolveDirectoryRole(user.email, user.name);
  if (!placement) return user;

  let next = withRole(user, placement);
  if (placement.clearTeam) {
    next = { ...next };
    delete next.team_id;
    delete next.team_name;
    delete next.team_lead_id;
    delete next.team_lead_name;
    return next;
  }
  if (placement.team_id) {
    const team = store.getTeams().find((item) => item.id === placement.team_id);
    next = {
      ...next,
      team_id: placement.team_id,
      team_name: team?.name || placement.team_name,
    };
  }
  return next;
}

function leadForTeam(teamId: string, users: User[]): User | undefined {
  const members = users.filter((user) => user.team_id === teamId && user.status === 'ACTIVE');
  return members.find((user) => user.role_code === 'TEAM_LEAD') || members[0];
}

const FUNCTIONAL_TEAM_ROLES = new Set(['TEAM_LEAD', 'EMPLOYEE', 'PROJECT_ENGINEER', 'PROCUREMENT', 'EXECUTION']);

export function inferReportingManager(roleCode: string, users: User[], hasTeam = false): User | undefined {
  const ceo = users.find((item) => item.role_code === 'CEO' && item.status === 'ACTIVE');
  const businessHead = users.find((item) => item.role_code === 'BUSINESS_HEAD' && item.status === 'ACTIVE');
  const pm = users.find((item) => item.role_code === 'PROJECT_MANAGER' && item.status === 'ACTIVE');
  if (roleCode === 'CEO') return undefined;
  if (roleCode === 'BUSINESS_HEAD' || roleCode === 'ENG_DIRECTOR' || roleCode === 'CTO') return ceo;
  if (roleCode === 'PROJECT_MANAGER') return businessHead || ceo;
  if (hasTeam || FUNCTIONAL_TEAM_ROLES.has(roleCode)) return pm;
  return pm || ceo;
}

function attachLeadershipReporting(users: User[]): User[] {
  return users.map((user) => {
    if (user.role_code === 'CEO') {
      const next = { ...user };
      delete next.reporting_manager_id;
      delete next.reporting_manager_name;
      return next;
    }
    if (user.role_code === 'BUSINESS_HEAD' || user.role_code === 'ENG_DIRECTOR' || user.role_code === 'CTO') {
      const ceo = inferReportingManager(user.role_code, users);
      return { ...user, reporting_manager_id: ceo?.id, reporting_manager_name: ceo?.name };
    }
    if (user.role_code === 'PROJECT_MANAGER') {
      const boss = inferReportingManager(user.role_code, users);
      return { ...user, reporting_manager_id: boss?.id, reporting_manager_name: boss?.name };
    }
    return user;
  });
}

function attachTeamLeadFields(users: User[]): User[] {
  const pm = users.find((user) => user.role_code === 'PROJECT_MANAGER' && user.status === 'ACTIVE');

  return users.map((user) => {
    if (!user.team_id && !FUNCTIONAL_TEAM_ROLES.has(user.role_code)) return user;
    const lead = user.team_id ? leadForTeam(user.team_id, users) : undefined;
    const next: User = {
      ...user,
      ...(lead && user.id !== lead.id
        ? { team_lead_id: lead.id, team_lead_name: lead.name }
        : {}),
      ...(pm && user.id !== pm.id
        ? { reporting_manager_id: pm.id, reporting_manager_name: pm.name }
        : {}),
    };
    if (lead && user.id === lead.id) {
      delete next.team_lead_id;
      delete next.team_lead_name;
    }
    return next;
  });
}

function syncTeamRecords(users: User[]) {
  const teams = store.getTeams().map((team) => {
    const lead = leadForTeam(team.id, users);
    return {
      ...team,
      team_lead_id: lead?.id,
      team_lead_name: lead?.name || 'Not Assigned',
    };
  });
  store.saveTeams(teams);
}

async function withWorkingPassword(user: User, passwords: string | string[]): Promise<User> {
  const candidates = [...new Set((Array.isArray(passwords) ? passwords : [passwords]).map((item) => item.trim()).filter(Boolean))];
  if (user.password_hash) {
    for (const password of candidates) {
      if (await verifyPassword(password, user.password_hash)) {
        return {
          ...user,
          account_status: 'ACTIVE',
          email_verified: true,
          status: 'ACTIVE',
        };
      }
    }
  }
  const password = candidates[0];
  if (!password) return user;
  const now = new Date().toISOString();
  return {
    ...user,
    password_hash: await hashPassword(password),
    password_created_at: user.password_created_at || now,
    password_changed_at: now,
    account_status: 'ACTIVE',
    email_verified: true,
    status: 'ACTIVE',
    invitation_code_hash: undefined,
    invitation_expires_at: undefined,
    invitation_used_at: user.invitation_used_at || now,
    updated_at: now,
  };
}

export function knownLoginPasswords(emailRaw: string, roleCode?: string): string[] {
  const email = normalize(emailRaw);
  const passwords = new Set<string>();
  const add = (value?: string) => {
    if (value?.trim()) passwords.add(value.trim());
  };
  if (email === FSD_ENGG1_EMAIL) {
    add(env.robotLeadPassword);
    add(env.fsdEngg1Password);
    add(env.demoPassword);
  }
  if (email === 'businesshead@careyu.ai') {
    add(env.businessHeadPassword);
    add(env.demoPassword);
    add(env.robotLeadPassword);
  }
  if (
    roleCode === 'ENG_DIRECTOR' ||
    email === ENGINEERING_DIRECTOR_EMAIL ||
    email === 'engg.director@careyu.ai'
  ) {
    add(env.demoPassword);
    add(env.robotLeadPassword);
  }
  if (
    roleCode === 'CTO' ||
    email === RAJA_EMAIL ||
    email === 'cto@careyu.ai'
  ) {
    add(env.demoPassword);
    add(env.robotLeadPassword);
  }
  return [...passwords];
}

function passwordForEmail(email: string): string[] {
  const known = knownLoginPasswords(email);
  if (known.length) return known;
  return env.demoPassword ? [env.demoPassword] : [];
}

async function ensureEngineeringDirector(users: User[]): Promise<User[]> {
  const existing = users.find(
    (user) =>
      user.role_code === 'ENG_DIRECTOR' ||
      normalize(user.email) === ENGINEERING_DIRECTOR_EMAIL ||
      normalize(user.email) === 'engg.director@careyu.ai'
  );
  if (existing) {
    return users.map((user) =>
      user.id === existing.id ? withRole(user, role('ENG_DIRECTOR', { clearTeam: true })) : user
    );
  }

  const ceo = users.find((user) => user.role_code === 'CEO');
  const now = new Date().toISOString();
  const created: User = await withWorkingPassword(
    withRole(
      {
        id: newId('u'),
        employee_id: `CYA-${String(users.length + 101).padStart(3, '0')}`,
        name: 'Sabarigiri',
        email: ENGINEERING_DIRECTOR_EMAIL,
        phone: '',
        role_id: 'r-ed',
        role_code: 'ENG_DIRECTOR',
        role_name: 'Engineering Director',
        reporting_manager_id: ceo?.id,
        reporting_manager_name: ceo?.name,
        status: 'ACTIVE',
        account_status: 'ACTIVE',
        email_verified: true,
        created_at: now,
        updated_at: now,
      },
      role('ENG_DIRECTOR', { clearTeam: true })
    ),
    env.demoPassword
  );
  console.info('[auth] Engineering Director account ready', { email: created.email, name: created.name });
  return [...users, created];
}

async function ensureTeamPerson(
  users: User[],
  spec: { name: string; email: string; matchName: string; exactName?: boolean }
): Promise<User[]> {
  const existing = users.find((user) => {
    const given = personGivenKey(user.name);
    const email = normalize(user.email);
    if (email === spec.email) return true;
    if (spec.exactName) return given === spec.matchName || emailLocal(email) === spec.matchName;
    return given.includes(spec.matchName) || emailLocal(email).includes(spec.matchName);
  });
  if (existing) {
    return users.map((user) =>
      user.id === existing.id
        ? applyDirectoryPlacement({
            ...user,
            name: spec.name,
            status: 'ACTIVE',
            account_status: 'ACTIVE',
          })
        : user
    );
  }

  const pm = users.find((user) => user.role_code === 'PROJECT_MANAGER');
  const now = new Date().toISOString();
  const created = applyDirectoryPlacement({
    id: newId('u'),
    employee_id: `CYA-${String(users.length + 101).padStart(3, '0')}`,
    name: spec.name,
    email: spec.email,
    phone: '',
    role_id: 'r-emp',
    role_code: 'EMPLOYEE',
    role_name: 'Team Member',
    reporting_manager_id: pm?.id,
    reporting_manager_name: pm?.name,
    status: 'ACTIVE',
    account_status: 'ACTIVE',
    email_verified: true,
    created_at: now,
    updated_at: now,
  });
  const ready = await withWorkingPassword(created, passwordForEmail(spec.email));
  console.info('[auth] Functional team account ready', { name: ready.name, role: ready.role_code, team: ready.team_name });
  return [...users, ready];
}

/** Hide Sanjay / Aravind (and name duplicates) from daily-updates people pickers. */
function deactivateRemovedDirectoryPeople(users: User[]): User[] {
  const now = new Date().toISOString();
  return users.map((user) => {
    const given = personGivenKey(user.name);
    const email = normalize(user.email);
    const local = emailLocal(email);
    // Exact given-name / email match only. Prefix checks are unsafe: e.g. "aravind"
    // must never deactivate "arun", and personGivenKey already strips surnames.
    const hit = REMOVED_DIRECTORY_NAMES.some(
      (key) => given === key || local === key || email === `${key}@careyu.ai`
    );
    if (!hit) return user;
    if (user.status === 'INACTIVE' && user.account_status === 'DISABLED') return user;
    return {
      ...user,
      status: 'INACTIVE',
      account_status: 'DISABLED',
      updated_at: now,
    };
  });
}

export async function ensureLiveDirectory() {
  const original = store.getUsers();
  let users = original.map((user) => applyDirectoryPlacement(user));

  users = await ensureEngineeringDirector(users);
  users = deactivateRemovedDirectoryPeople(users);
  users = await ensureTeamPerson(users, { name: 'Arun', email: ARUN_LIVE_EMAIL, matchName: 'arun', exactName: true });
  users = await ensureTeamPerson(users, { name: 'Aakash', email: robotLeadEmail(), matchName: 'aakash', exactName: true });
  users = await ensureTeamPerson(users, { name: 'Kabitha', email: KABITHA_EMAIL, matchName: 'kabitha', exactName: true });
  users = await ensureTeamPerson(users, { name: 'Raja', email: RAJA_EMAIL, matchName: 'raja', exactName: true });
  // FSD Engineer stays as a login/report account but is hidden from Daily Work Updates people pickers.

  const repaired: User[] = [];
  for (const user of users) {
    const email = normalize(user.email);
    const needsLoginRepair =
      email === 'businesshead@careyu.ai' ||
      email === 'fsdengg1@careyu.ai' ||
      email === ENGINEERING_DIRECTOR_EMAIL ||
      email === 'engg.director@careyu.ai' ||
      user.role_code === 'ENG_DIRECTOR' ||
      user.role_code === 'CTO';
    repaired.push(needsLoginRepair ? await withWorkingPassword(user, passwordForEmail(email)) : user);
  }

  users = attachTeamLeadFields(attachLeadershipReporting(repaired));

  const changed =
    users.length !== original.length ||
    users.some((user) => {
      const prev = original.find((item) => item.id === user.id);
      return (
        !prev ||
        prev.role_code !== user.role_code ||
        prev.role_name !== user.role_name ||
        prev.password_hash !== user.password_hash ||
        prev.email !== user.email ||
        prev.name !== user.name ||
        prev.status !== user.status ||
        prev.account_status !== user.account_status ||
        prev.team_id !== user.team_id ||
        prev.team_name !== user.team_name ||
        prev.team_lead_id !== user.team_lead_id ||
        prev.reporting_manager_id !== user.reporting_manager_id
      );
    });

  if (changed) {
    store.saveUsers(users);
    console.info('[auth] Live directory roles restored', {
      users: users.map((user) => ({
        name: user.name,
        role: user.role_code,
        status: user.status,
        team: user.team_name || null,
        manager: user.reporting_manager_name || null,
      })),
    });
  }

  syncTeamRecords(users);
}
