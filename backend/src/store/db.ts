import fs from 'node:fs';
import path from 'node:path';
import {
  AuditLog,
  AssignmentHistory,
  ChatMessage,
  Conversation,
  ConversationParticipant,
  DailyUpdate,
  EntityDocument,
  Escalation,
  FeasibilityEmployeeAllocation,
  FeasibilityTeamAssignment,
  ForumComment,
  ForumLiveMessage,
  ForumPost,
  ForumReaction,
  ForumTag,
  Lead,
  LeadActivity,
  LeadComment,
  LeadDocument,
  LeaveRequest,
  LeadStatusHistory,
  NotificationDelivery,
  NotificationItem,
  OutboundEmail,
  PendingSignup,
  ProcurementRequest,
  Project,
  ProjectPhase,
  Role,
  StageTransition,
  Task,
  Team,
  User,
} from '../types.js';
import { INITIAL_ROLES, INITIAL_TEAMS, INITIAL_USERS } from '../data/seed.js';
import {
  COLLECTION_NAMES,
  CollectionName,
  closePool,
  ensureSchema,
  loadAllCollections,
  loadAssignmentsForLead,
  loadLeadRowById,
  loadSelectedCollections,
  pingDatabase,
  saveAllCollections,
} from './postgres.js';
import { isSmokeTestAccount } from '../lib/smokeTestAccounts.js';

interface DbShape {
  users: User[];
  roles: Role[];
  teams: Team[];
  leads: Lead[];
  projects: Project[];
  escalations: Escalation[];
  procurementRequests: ProcurementRequest[];
  audits: AuditLog[];
  notifications: NotificationItem[];
  tasks: Task[];
  dailyUpdates: DailyUpdate[];
  leaveRequests: LeaveRequest[];
  leadDocuments: LeadDocument[];
  leadComments: LeadComment[];
  leadActivities: LeadActivity[];
  leadStatusHistory: LeadStatusHistory[];
  feasibilityTeamAssignments: FeasibilityTeamAssignment[];
  feasibilityEmployeeAllocations: FeasibilityEmployeeAllocation[];
  projectPhases: ProjectPhase[];
  conversations: Conversation[];
  conversationParticipants: ConversationParticipant[];
  chatMessages: ChatMessage[];
  entityDocuments: EntityDocument[];
  stageTransitions: StageTransition[];
  outboundEmails: OutboundEmail[];
  forumPosts: ForumPost[];
  forumComments: ForumComment[];
  forumReactions: ForumReaction[];
  forumTags: ForumTag[];
  forumLiveMessages: ForumLiveMessage[];
  assignmentHistory: AssignmentHistory[];
  notificationDeliveries: NotificationDelivery[];
  pendingSignups: PendingSignup[];
  systemMeta: SystemMetaRecord[];
}

interface SystemMetaRecord {
  id: string;
  demoOperationalPurgedAt?: string;
  usersLeadershipPrunedAt?: string;
  payloadType?: string;
  payload?: unknown;
}

const LIVE_META_ID = 'pms-live';
const LEADERSHIP_PRUNE_META_ID = 'users-keep-leadership-v1';

const OPERATIONAL_COLLECTION_KEYS = [
  'leads',
  'projects',
  'escalations',
  'procurementRequests',
  'audits',
  'notifications',
  'tasks',
  'dailyUpdates',
  'leaveRequests',
  'leadDocuments',
  'leadComments',
  'leadActivities',
  'leadStatusHistory',
  'feasibilityTeamAssignments',
  'feasibilityEmployeeAllocations',
  'projectPhases',
  'conversations',
  'conversationParticipants',
  'chatMessages',
  'entityDocuments',
  'stageTransitions',
  'outboundEmails',
  'forumPosts',
  'forumComments',
  'forumReactions',
  'forumTags',
  'forumLiveMessages',
  'assignmentHistory',
  'notificationDeliveries',
] as const;

const localDbPath = path.join(process.cwd(), 'data', 'db.json');

let cache: DbShape | null = null;
let writeChain: Promise<void> = Promise.resolve();
let persistPaused = false;
let initialized = false;
let mutex: Promise<void> = Promise.resolve();
const dirtyCollections = new Set<CollectionName>();
const dirtyRecordKeys = new Map<CollectionName, Set<string>>();

type DirtySnapshot = {
  collections: CollectionName[];
  recordKeys: Map<CollectionName, Set<string>>;
};

let workerWaitUntil: ((promise: Promise<unknown>) => void) | null = null;

export function setWorkerWaitUntil(handler: ((promise: Promise<unknown>) => void) | null) {
  workerWaitUntil = handler;
}

function markDirty(...names: CollectionName[]) {
  for (const name of names) dirtyCollections.add(name);
}

function markDirtyRecords(name: CollectionName, ...ids: string[]) {
  dirtyCollections.add(name);
  if (!ids.length) return;
  const bucket = dirtyRecordKeys.get(name) ?? new Set<string>();
  for (const id of ids) {
    if (id) bucket.add(id);
  }
  dirtyRecordKeys.set(name, bucket);
}

function takeDirty(): DirtySnapshot {
  const collections = [...dirtyCollections];
  dirtyCollections.clear();
  const recordKeys = new Map(dirtyRecordKeys);
  dirtyRecordKeys.clear();
  return { collections, recordKeys };
}

function clearDirtyState() {
  dirtyCollections.clear();
  dirtyRecordKeys.clear();
}

function snapshotDb(db: DbShape): DbShape {
  const snap: Record<string, unknown> = {};
  for (const key of Object.keys(db) as (keyof DbShape)[]) {
    const value = db[key];
    snap[key as string] = Array.isArray(value) ? value.slice() : structuredClone(value);
  }
  return snap as unknown as DbShape;
}

function isDemoOperationalPurged(parsed: Partial<DbShape>): boolean {
  return (parsed.systemMeta ?? []).some((item) => item.id === LIVE_META_ID && Boolean(item.demoOperationalPurgedAt));
}

function hasOperationalRecords(parsed: Partial<DbShape>): boolean {
  return OPERATIONAL_COLLECTION_KEYS.some((key) => {
    const value = parsed[key];
    return Array.isArray(value) && value.length > 0;
  });
}

function withPurgedOperationalData(parsed: Partial<DbShape>): Partial<DbShape> {
  const next: Partial<DbShape> = { ...parsed };
  for (const key of OPERATIONAL_COLLECTION_KEYS) {
    next[key] = [];
  }
  next.systemMeta = [
    ...(parsed.systemMeta ?? []).filter((item) => item.id !== LIVE_META_ID),
    { id: LIVE_META_ID, demoOperationalPurgedAt: new Date().toISOString() },
  ];
  return next;
}

function prepareLiveOperationalData(parsed: Partial<DbShape>): Partial<DbShape> {
  if (isDemoOperationalPurged(parsed)) return parsed;
  if (hasOperationalRecords(parsed)) {
    console.info('[store] Purging demo/sample operational collections for live production');
  }
  return withPurgedOperationalData(parsed);
}

function mergeById<T extends { id: string }>(stored: T[] | undefined, seed: T[]): T[] {
  const current = stored ?? [];
  const known = new Set(current.map((item) => item.id));
  return [...current, ...seed.filter((item) => !known.has(item.id))];
}

const SEED_USER_IDS = new Set(INITIAL_USERS.map((user) => user.id));

const RETIRED_DEMO_USER_IDS = new Set([
  'u-ceo',
  'u-bh',
  'u-ed',
  'u-robotlead1',
  'u-emp-sw',
  'u-emp-sw-2',
  'u-emp-sw-3',
  'u-emp-vis-1',
  'u-emp-vis-2',
  'u-emp-rob-1',
  'u-emp-rob-2',
  'u-emp-rob-3',
  'u-emp-rob-4',
  'u-tl-proc',
  'u-emp-proc-1',
  'u-emp-proc-2',
  'u-tl-exec',
  'u-emp-exec-1',
  'u-emp-exec-2',
  'u-emp-exec-3',
  'u-emp-exec-4',
  'u-emp-exec-5',
]);

const RETIRED_DEMO_EMAILS = new Set([
  'bernard.hamilton@careyu.com',
  'shradha.patil@careyu.com',
  'sabarigiri.t@careyu.com',
  'karthik@careyu.com',
  'deepak@careyu.com',
  'meena@careyu.com',
  'sanjay@careyu.com',
  'lakshmi@careyu.com',
  'rahul@careyu.com',
  'divya@careyu.com',
  'vikram@careyu.com',
  'nisha@careyu.com',
  'suresh@careyu.com',
  'anitha@careyu.com',
  'manoj@careyu.com',
  'ramesh@careyu.com',
  'gopal@careyu.com',
  'sita@careyu.com',
  'farhan@careyu.com',
  'kavya@careyu.com',
  'imran@careyu.com',
  'aakash@careyu.com',
]);

function isIncompleteSignupAccount(user: User): boolean {
  if (SEED_USER_IDS.has(user.id)) return false;
  if (user.password_hash) return false;
  const status = user.account_status;
  if (
    status === 'INVITED' ||
    status === 'INVITATION_VERIFIED' ||
    status === 'PASSWORD_SETUP_REQUIRED' ||
    status === 'INVITATION_EXPIRED'
  ) {
    return true;
  }
  return Boolean(user.invitation_code_hash);
}

function stripIncompleteSignupUsers(users: User[]): User[] {
  return users.filter((user) => !isIncompleteSignupAccount(user));
}

function mergeUsers(stored: User[] | undefined, seed: User[]): User[] {
  const current = stored ?? [];
  const ids = new Set(current.map((user) => user.id));
  const emails = new Set(current.map((user) => user.email.trim().toLowerCase()));
  const roles = new Set(current.map((user) => user.role_code));
  const extra = seed.filter((item) => {
    if (ids.has(item.id) || emails.has(item.email.trim().toLowerCase())) return false;
    if (['CEO', 'BUSINESS_HEAD', 'ENG_DIRECTOR'].includes(item.role_code) && roles.has(item.role_code)) {
      return false;
    }
    return true;
  });
  const namedRoster = new Set(['u-ceo', 'u-bh', 'u-ed']);
  const merged = [...current, ...extra].map((user) => {
    const fromSeed = seed.find((item) => item.id === user.id);
    const withVerified: User = {
      ...user,
      email_verified: user.email_verified ?? true,
    };
    if (!fromSeed || !namedRoster.has(user.id)) return withVerified;
    return {
      ...withVerified,
      name: user.name || fromSeed.name,
      role_name: user.role_name || fromSeed.role_name,
      role_code: user.role_code || fromSeed.role_code,
      email: user.email || fromSeed.email,
    };
  });
  const withoutDemo = stripIncompleteSignupUsers(merged)
    .filter((user) => !isSmokeTestAccount(user))
    .filter((user) => !RETIRED_DEMO_USER_IDS.has(user.id))
    .filter((user) => !RETIRED_DEMO_EMAILS.has(user.email.trim().toLowerCase()));
  return applyCanonicalPeople(withoutDemo);
}

type CanonicalPerson = {
  id: string;
  name: string;
  email: string;
  aliases: string[];
  role_id: string;
  role_code: string;
  role_name: string;
  team_id?: string;
  team_name: string;
  team_lead_id?: string;
  team_lead_name?: string;
  reporting_manager_id: string;
  /** Keep the live signup row (by email) instead of the seed id. */
  preferLiveEmail?: boolean;
  /** Project Manager stays in management, not a team-member node. */
  clearTeamId?: boolean;
};

const CANONICAL_PEOPLE: CanonicalPerson[] = [];

function applyCanonicalPeople(users: User[]): User[] {
  const remove = new Set<string>();
  let list = users;

  for (const canon of CANONICAL_PEOPLE) {
    const emails = new Set([canon.email, ...canon.aliases].map((value) => value.trim().toLowerCase()));
    const byId = list.find((user) => user.id === canon.id && !remove.has(user.id));
    const emailMatches = list.filter(
      (user) => emails.has(user.email.trim().toLowerCase()) && !remove.has(user.id)
    );
    const liveEmail = list.find(
      (user) => user.email.trim().toLowerCase() === canon.email && !remove.has(user.id)
    );
    const byEmail = liveEmail || emailMatches[0];

    let keepId: string | undefined;
    if (canon.preferLiveEmail && byEmail) {
      keepId = byEmail.id;
    } else {
      keepId = byId?.id || byEmail?.id;
    }
    if (!keepId) continue;
    for (const extra of emailMatches) {
      if (extra.id !== keepId) remove.add(extra.id);
    }
    if (byId && byId.id !== keepId) remove.add(byId.id);

    const kept = list.find((user) => user.id === keepId);
    const donor = emailMatches.find((user) => user.password_hash) || kept;
    if (!kept) continue;

    list = list.map((user) => {
      if (user.id !== keepId) return user;
      const next: User = {
        ...user,
        name: canon.name,
        email: canon.email,
        role_id: canon.role_id,
        role_code: canon.role_code,
        role_name: canon.role_name,
        team_name: canon.team_name,
        reporting_manager_id: user.reporting_manager_id || canon.reporting_manager_id,
        password_hash: donor?.password_hash || user.password_hash,
        password_created_at: donor?.password_created_at || user.password_created_at,
      };
      if (canon.clearTeamId) {
        delete next.team_id;
        delete next.team_lead_id;
        delete next.team_lead_name;
      } else {
        next.team_id = canon.team_id;
        if (canon.team_lead_id) {
          next.team_lead_id = canon.team_lead_id;
          next.team_lead_name = canon.team_lead_name;
        } else {
          delete next.team_lead_id;
          delete next.team_lead_name;
        }
      }
      return next;
    });
  }

  return list.filter((user) => !remove.has(user.id));
}

function mergeRoles(stored: Role[] | undefined, seed: Role[]): Role[] {
  return mergeById(stored, seed).map((role) => {
    const fromSeed = seed.find((item) => item.id === role.id);
    return fromSeed ? { ...role, ...fromSeed } : role;
  });
}

function alignStoredLead(lead: Lead): Lead {
  if (lead.status === 'WON') {
    return { ...lead, status: 'ORDER_CONVERTED', pipeline_stage: 'CONVERTED' };
  }
  if (lead.status === 'FEASIBILITY_IN_PROGRESS' && lead.pipeline_stage === 'COSTING') {
    return { ...lead, status: 'COSTING_IN_PROGRESS' };
  }
  if (lead.status === 'FEASIBILITY_IN_PROGRESS' && lead.pipeline_stage === 'QUOTATION') {
    return { ...lead, status: 'QUOTATION' };
  }
  if (lead.status === 'FEASIBILITY_IN_PROGRESS' && lead.pipeline_stage === 'NEGOTIATION') {
    return { ...lead, status: 'NEGOTIATION' };
  }
  const qStatus = lead.quotation?.workflow_status;
  if (
    (qStatus === 'SUBMITTED_TO_CUSTOMER' || qStatus === 'CUSTOMER_REVIEW') &&
    (lead.status === 'QUOTATION' || lead.status === 'FEASIBILITY_IN_PROGRESS')
  ) {
    return { ...lead, status: 'NEGOTIATION', pipeline_stage: 'NEGOTIATION' };
  }
  return lead;
}

function normalizeLeads(stored: Lead[] | undefined): Lead[] {
  return (stored ?? []).map(alignStoredLead);
}

function mergeTeams(stored: Team[] | undefined, seed: Team[]): Team[] {
  const base = stored?.length ? stored : seed;
  return mergeById(base, seed).map((team) => {
    const fromSeed = seed.find((item) => item.id === team.id);
    if (!fromSeed) return team;
    return {
      ...team,
      name: fromSeed.name,
      code: fromSeed.code,
      description: fromSeed.description,
      team_lead_id: team.team_lead_id,
      team_lead_name: team.team_lead_name || 'Not Assigned',
    };
  });
}

function refreshTeamCounts(db: DbShape): DbShape {
  db.teams = db.teams.map((team) => ({
    ...team,
    member_count: db.users.filter((user) => user.team_id === team.id && user.status === 'ACTIVE').length,
  }));
  return db;
}

export function isLeadershipKeepUser(user: User): boolean {
  const email = user.email.trim().toLowerCase();
  const name = user.name.trim().toLowerCase();
  if (user.role_code === 'CEO' || user.id === 'u-ceo') return true;
  if (user.id === 'u-bh' || email.includes('shradha') || name.includes('shradha') || name.includes('sharadha')) return true;
  if (
    user.role_code === 'ENG_DIRECTOR' ||
    user.id === 'u-ed' ||
    email.startsWith('engg.director@') ||
    name.includes('sabagiri') ||
    name.includes('sabarigiri')
  ) {
    return true;
  }
  return false;
}

function isLeadershipPruned(parsed: Partial<DbShape>): boolean {
  return (parsed.systemMeta ?? []).some(
    (item) => item.id === LEADERSHIP_PRUNE_META_ID && Boolean(item.usersLeadershipPrunedAt)
  );
}

export function pruneUsersToLeadership(db: DbShape): { db: DbShape; removed: User[] } {
  const removed = db.users.filter((user) => !isLeadershipKeepUser(user));
  const kept = db.users.filter(isLeadershipKeepUser);
  const keepIds = new Set(kept.map((user) => user.id));
  db.users = kept;
  db.pendingSignups = [];
  db.teams = db.teams.map((team) =>
    team.team_lead_id && !keepIds.has(team.team_lead_id)
      ? { ...team, team_lead_id: undefined, team_lead_name: 'Not Assigned' }
      : team
  );
  const withoutFlag = (db.systemMeta ?? []).filter((item) => item.id !== LEADERSHIP_PRUNE_META_ID);
  db.systemMeta = [
    ...withoutFlag,
    { id: LEADERSHIP_PRUNE_META_ID, usersLeadershipPrunedAt: new Date().toISOString() },
  ];
  return { db: refreshTeamCounts(db), removed };
}

function emptyDb(): DbShape {
  return {
    users: [],
    roles: [],
    teams: [],
    leads: [],
    projects: [],
    escalations: [],
    procurementRequests: [],
    audits: [],
    notifications: [],
    tasks: [],
    dailyUpdates: [],
    leaveRequests: [],
    leadDocuments: [],
    leadComments: [],
    leadActivities: [],
    leadStatusHistory: [],
    feasibilityTeamAssignments: [],
    feasibilityEmployeeAllocations: [],
    projectPhases: [],
    conversations: [],
    conversationParticipants: [],
    chatMessages: [],
    entityDocuments: [],
    stageTransitions: [],
    outboundEmails: [],
    forumPosts: [],
    forumComments: [],
    forumReactions: [],
    forumTags: [],
    forumLiveMessages: [],
    assignmentHistory: [],
    notificationDeliveries: [],
    pendingSignups: [],
    systemMeta: [],
  };
}

function readLocalDbFile(): Partial<DbShape> | null {
  try {
    if (!fs.existsSync(localDbPath)) return null;
    return JSON.parse(fs.readFileSync(localDbPath, 'utf8')) as Partial<DbShape>;
  } catch {
    return null;
  }
}

function collectionsHaveData(parsed: Partial<DbShape> | Record<CollectionName, unknown[]>): boolean {
  return COLLECTION_NAMES.some((name) => {
    const value = (parsed as Record<string, unknown[]>)[name];
    return Array.isArray(value) && value.length > 0;
  });
}

const TEST_ARTIFACT_PATTERNS = [
  'RackVision UI review',
  'Website Development',
  'Prepare shuttle feasibility calculation based on LD-001 requirement.',
  'Prepare Monthly Management Report',
  'Complete UI Design',
  'Team-only update',
  'Company holiday',
  'requirement.pdf',
  'task-1788433476698-lkvk',
  'Should be blocked.',
  'Moderator note on locked thread.',
  'Idempotency probe',
  'Permission Test Group',
  'conv-1788433476694-sgxu',
];

/** Confirmed live artifacts from backend/scripts/verify-permissions.ts on 2026-09-03 11:04:36Z. */
const PERMISSION_TEST_AUDIT_KEYS = new Set([
  'log-1788433476677-jnrl',
  'log-1788433476692-dr5m',
  'log-1788433476694-0lw9',
  'log-1788433476694-7172',
  'log-1788433476694-o1cf',
  'log-1788433476694-zo8o',
  'log-1788433476694-7qe8',
  'log-1788433476695-hxwx',
  'log-1788433476695-vfq7',
  'log-1788433476695-lqb2',
  'log-1788433476695-po8r',
]);

export function sanitizeAudits(audits: AuditLog[], users: User[], pendingSignups: PendingSignup[] = []): AuditLog[] {
  const validUserIds = new Set([
    ...users.map((u) => u.id),
    ...pendingSignups.map((p) => p.id),
  ]);

  return (audits || []).filter((log) => {
    if (!log || !log.user_id || !log.action || !log.description) return false;
    if (PERMISSION_TEST_AUDIT_KEYS.has(log.id)) return false;
    const text = `${log.description || ''} ${log.entity_name || ''} ${log.entity_id || ''}`;
    if (TEST_ARTIFACT_PATTERNS.some((pattern) => text.includes(pattern))) {
      return false;
    }
    if (!validUserIds.has(log.user_id)) {
      return false;
    }
    return true;
  });
}

function buildMergedDb(parsed: Partial<DbShape>): DbShape {
  const mergedUsers = mergeUsers(parsed.users, []);
  const pending = (parsed.pendingSignups ?? []).filter((item) => !isSmokeTestAccount(item));
  return refreshTeamCounts({
    users: mergedUsers,
    roles: mergeRoles(parsed.roles, INITIAL_ROLES),
    teams: mergeTeams(parsed.teams, INITIAL_TEAMS),
    leads: normalizeLeads(parsed.leads),
    projects: parsed.projects ?? [],
    escalations: parsed.escalations ?? [],
    procurementRequests: parsed.procurementRequests ?? [],
    audits: sanitizeAudits(parsed.audits ?? [], mergedUsers, pending),
    notifications: [],
    tasks: parsed.tasks ?? [],
    dailyUpdates: parsed.dailyUpdates ?? [],
    leaveRequests: parsed.leaveRequests ?? [],
    leadDocuments: parsed.leadDocuments ?? [],
    leadComments: parsed.leadComments ?? [],
    leadActivities: parsed.leadActivities ?? [],
    leadStatusHistory: parsed.leadStatusHistory ?? [],
    feasibilityTeamAssignments: parsed.feasibilityTeamAssignments ?? [],
    feasibilityEmployeeAllocations: parsed.feasibilityEmployeeAllocations ?? [],
    projectPhases: parsed.projectPhases ?? [],
    conversations: parsed.conversations ?? [],
    conversationParticipants: parsed.conversationParticipants ?? [],
    chatMessages: parsed.chatMessages ?? [],
    entityDocuments: parsed.entityDocuments ?? [],
    stageTransitions: parsed.stageTransitions ?? [],
    outboundEmails: parsed.outboundEmails ?? [],
    forumPosts: parsed.forumPosts ?? [],
    forumComments: parsed.forumComments ?? [],
    forumReactions: parsed.forumReactions ?? [],
    forumTags: parsed.forumTags ?? [],
    forumLiveMessages: parsed.forumLiveMessages ?? [],
    assignmentHistory: parsed.assignmentHistory ?? [],
    notificationDeliveries: parsed.notificationDeliveries ?? [],
    pendingSignups: pending,
    systemMeta: parsed.systemMeta?.length
      ? parsed.systemMeta
      : [{ id: LIVE_META_ID, demoOperationalPurgedAt: new Date().toISOString() }],
  });
}

function toCollections(db: DbShape): Record<CollectionName, unknown[]> {
  const out = {} as Record<CollectionName, unknown[]>;
  for (const name of COLLECTION_NAMES) {
    out[name] = (db[name] as unknown[]) ?? [];
  }
  return out;
}

function countRecords(db: DbShape): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const name of COLLECTION_NAMES) {
    counts[name] = db[name]?.length ?? 0;
  }
  return counts;
}

async function persistDb(
  db: DbShape,
  names?: CollectionName[],
  recordKeys?: Map<CollectionName, Set<string>>
): Promise<void> {
  if (names) {
    if (!names.length) return;
    await saveAllCollections(toCollections(db), names, recordKeys);
    return;
  }
  await saveAllCollections(toCollections(db), undefined, recordKeys);
}

function schedulePersist(db: DbShape, dirty: DirtySnapshot, options?: { background?: boolean }): Promise<void> {
  const names = [...dirty.collections];
  const recordKeys = new Map(dirty.recordKeys);
  // Capture dirty collection payloads immediately. Previously persistDb() started in
  // parallel with the prior write, so an older tasks flush could finish last and
  // wipe newer Morning Stats edits from Postgres while snapshots still looked correct.
  const base = toCollections(db);
  const captured: Partial<Record<CollectionName, unknown[]>> = {};
  for (const name of names) {
    const rows = base[name] || [];
    captured[name] = rows.map((row) => (row && typeof row === 'object' ? structuredClone(row) : row));
  }

  const run = async () => {
    const payload = { ...toCollections(loadDb()), ...captured } as Record<CollectionName, unknown[]>;
    await saveAllCollections(payload, names, recordKeys);
  };

  const promise = writeChain.then(run, run);
  writeChain = promise.catch((error) => {
    console.error('[store] Failed to persist to Postgres:', error);
  });
  // Always extend the Worker lifetime for pending Postgres writes. Without this,
  // fire-and-forget saves from saveDb()/enqueuePersist() can be dropped when the
  // isolate freezes after the HTTP response — causing approve/assign to look
  // successful in-memory while GET reloads the old SUBMITTED_TO_PM row.
  if (workerWaitUntil) {
    workerWaitUntil(promise);
  }
  if (options?.background && workerWaitUntil) {
    return promise;
  }
  return promise;
}

function enqueuePersist(db: DbShape): void {
  const dirty = takeDirty();
  if (!dirty.collections.length) return;
  schedulePersist(db, dirty);
}

function loadDb(): DbShape {
  if (!cache) {
    throw new Error('Store not initialized. Call initStore() before handling requests.');
  }
  return cache;
}

function saveDb(db: DbShape) {
  cache = db;
  if (!persistPaused) enqueuePersist(db);
}

/** Run mutations in memory only, then restore the previous store. Never writes to Postgres. */
export async function runWithoutPersisting<T>(fn: () => T | Promise<T>): Promise<T> {
  await writeChain;
  const snapshot = snapshotDb(loadDb());
  persistPaused = true;
  try {
    return await fn();
  } finally {
    cache = snapshot;
    clearDirtyState();
    persistPaused = false;
  }
}

export async function transact<T>(fn: () => T | Promise<T>): Promise<T> {
  const run = mutex.then(async () => {
    await writeChain;
    const snapshot = snapshotDb(loadDb());
    persistPaused = true;
    try {
      const result = await fn();
      persistPaused = false;
      const dirty = takeDirty();
      if (dirty.collections.length) {
        // Always await Postgres durability before returning. waitUntil-only background
        // flushes were dropped across Worker isolates, so approve/assign looked successful
        // then GET reloaded the previous SUBMITTED_TO_PM row.
        await schedulePersist(loadDb(), dirty);
      }
      return result;
    } catch (error) {
      cache = snapshot;
      clearDirtyState();
      persistPaused = false;
      throw error;
    } finally {
      persistPaused = false;
    }
  });
  mutex = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function rowTimestamp(row: { updated_at?: string; created_at?: string } | undefined): number {
  if (!row) return 0;
  return Date.parse(row.updated_at || row.created_at || '') || 0;
}

const LEAD_STATUS_RANK: Record<string, number> = {
  DRAFT: 0,
  SUBMITTED_TO_PM: 1,
  UNDER_PM_REVIEW: 1,
  RESUBMITTED_TO_PM: 1,
  RETURNED_TO_SALES: 1,
  ADDITIONAL_INFORMATION_REQUIRED: 1,
  ACCEPTED_FOR_FEASIBILITY: 2,
  FEASIBILITY_IN_PROGRESS: 3,
  FEASIBILITY_RETURNED: 3,
  FEASIBILITY_SUBMITTED: 4,
  FEASIBILITY_REJECTED: 4,
  COSTING_IN_PROGRESS: 5,
  COSTING_SUBMITTED: 6,
  COSTING_RETURNED: 5,
  QUOTATION: 7,
  NEGOTIATION: 8,
  ORDER_CONVERTED: 9,
  WON: 9,
  LOST: 9,
  CANCELLED: 9,
};

function preferLeadRow(local: Lead | undefined, remote: Lead | undefined): Lead | undefined {
  if (!remote) return local;
  if (!local) return remote;
  const localRank = LEAD_STATUS_RANK[local.status] ?? 0;
  const remoteRank = LEAD_STATUS_RANK[remote.status] ?? 0;
  if (localRank !== remoteRank) return localRank > remoteRank ? local : remote;
  return rowTimestamp(local) >= rowTimestamp(remote) ? local : remote;
}

function mergeRowsById<T extends { id?: string; updated_at?: string; created_at?: string }>(
  remoteRows: T[],
  localRows: T[]
): T[] {
  const byId = new Map<string, T>();
  for (const row of remoteRows) {
    if (row?.id) byId.set(String(row.id), row);
  }
  for (const row of localRows) {
    if (!row?.id) continue;
    const id = String(row.id);
    const existing = byId.get(id);
    if (!existing || rowTimestamp(row) >= rowTimestamp(existing)) {
      byId.set(id, row);
    }
  }
  return [...byId.values()];
}

const collectionReloadInflight = new Map<string, Promise<void>>();
const collectionReloadAt = new Map<CollectionName, number>();

function collectionReloadTtlMs() {
  return process.env.CLOUDFLARE_WORKER === '1' ? 12000 : 2500;
}

function staleCollections(names: CollectionName[]): CollectionName[] {
  const now = Date.now();
  const ttl = collectionReloadTtlMs();
  return names.filter((name) => now - (collectionReloadAt.get(name) || 0) >= ttl);
}

function markCollectionsFresh(names: CollectionName[], at = Date.now()) {
  for (const name of names) collectionReloadAt.set(name, at);
}

/** Pull selected collections from Postgres into the in-memory cache (after pending writes). */
/** Replace in-memory collections from Postgres without merging stale isolate rows. */
export async function replaceCollectionsFromPostgres(names: CollectionName[]): Promise<void> {
  if (!cache) {
    throw new Error('Store not initialized. Call initStore() before handling requests.');
  }
  if (!names.length) return;
  const stale = staleCollections(names);
  if (!stale.length) return;
  const key = [...stale].sort().join(',');
  const existing = collectionReloadInflight.get(key);
  if (existing) {
    await existing;
    return;
  }
  const run = (async () => {
    await writeChain;
    try {
      const remote = await loadSelectedCollections(stale);
      const db = loadDb();
      for (const name of stale) {
        const rows = remote[name];
        if (!Array.isArray(rows)) continue;
        (db as unknown as Record<string, unknown[]>)[name] = rows;
      }
      cache = db;
      markCollectionsFresh(stale);
    } catch (error) {
      console.error('[store] Failed to reload collections from Postgres; serving cached data:', error);
      if (!cache) throw error;
    } finally {
      collectionReloadInflight.delete(key);
    }
  })();
  collectionReloadInflight.set(key, run);
  await run;
}

export async function refreshCollectionsFromPostgres(names?: CollectionName[]): Promise<void> {
  if (!cache) {
    throw new Error('Store not initialized. Call initStore() before handling requests.');
  }
  if (names && !names.length) return;
  const selected = names?.length ? names : [...COLLECTION_NAMES];
  const stale = staleCollections(selected);
  if (!stale.length) return;
  await writeChain;
  const remote = await loadSelectedCollections(stale);
  const db = loadDb();
  for (const name of stale) {
    const remoteRows = (remote[name] || []) as Array<{ id?: string; updated_at?: string; created_at?: string; status?: string }>;
    const localRows = ((db[name] as Array<{ id?: string; updated_at?: string; created_at?: string; status?: string }> | undefined) || []);
    if (name === 'leads') {
      const byId = new Map<string, Lead>();
      for (const row of remoteRows as Lead[]) {
        if (row?.id) byId.set(String(row.id), row);
      }
      for (const row of localRows as Lead[]) {
        if (!row?.id) continue;
        const preferred = preferLeadRow(row, byId.get(String(row.id)));
        if (preferred) byId.set(String(row.id), preferred);
      }
      db.leads = [...byId.values()];
      continue;
    }
    (db as unknown as Record<string, unknown>)[name] = mergeRowsById(remoteRows, localRows);
  }
  if (stale.includes('teams')) {
    refreshTeamCounts(db);
  }
  cache = db;
  markCollectionsFresh(stale);
}

function matchLead(id: string): Lead | undefined {
  return loadDb().leads.find((item) => item.id === id || item.lead_number === id);
}

function upsertCachedLead(lead: Lead) {
  const db = loadDb();
  const leads = db.leads ?? [];
  const index = leads.findIndex((item) => item.id === lead.id || item.lead_number === lead.lead_number);
  if (index === -1) leads.unshift(lead);
  else leads[index] = { ...leads[index], ...lead };
  db.leads = leads;
  cache = db;
}

function upsertCachedAssignments(leadId: string, incoming: FeasibilityTeamAssignment[]) {
  const db = loadDb();
  const current = db.feasibilityTeamAssignments ?? [];
  const retained = current.filter((item) => item.lead_id !== leadId);
  const forLead = current.filter((item) => item.lead_id === leadId);
  db.feasibilityTeamAssignments = [...mergeRowsById(incoming, forLead), ...retained];
  cache = db;
}

/**
 * Load one lead (and its feasibility assignments) from Postgres into this isolate.
 * Other Worker isolates only see assign/approve after this merge.
 */
export async function ensureLeadLoaded(id: string, attempts = 8): Promise<Lead | undefined> {
  await writeChain;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const direct = await loadLeadRowById(id);
    if (direct?.id) {
      const asLead = direct as unknown as Lead;
      const preferred = preferLeadRow(matchLead(asLead.id) || matchLead(id), asLead);
      if (preferred) upsertCachedLead(preferred);
      const assignmentRows = (await loadAssignmentsForLead(String(direct.id))) as unknown as FeasibilityTeamAssignment[];
      upsertCachedAssignments(String(direct.id), assignmentRows);
      const found = matchLead(String(direct.id)) || matchLead(id);
      if (found) return found;
    }
    await refreshCollectionsFromPostgres(['leads', 'feasibilityTeamAssignments']);
    const found = matchLead(id);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, Math.min(2000, 400 * (attempt + 1))));
  }
  return matchLead(id);
}

const WORKER_BOOT_COLLECTIONS: CollectionName[] = [
  'users',
  'roles',
  'teams',
  'pendingSignups',
  'systemMeta',
];

export async function hydrateRemainingWorkerCollections(): Promise<void> {
  if (process.env.CLOUDFLARE_WORKER !== '1') return;
  const rest = COLLECTION_NAMES.filter((name) => !WORKER_BOOT_COLLECTIONS.includes(name));
  await replaceCollectionsFromPostgres(rest);
}

export async function initStore(options?: { forceImportLocal?: boolean }): Promise<{
  source: 'postgres' | 'local-db.json' | 'seed';
  counts: Record<string, number>;
}> {
  await pingDatabase();
  await ensureSchema();

  const worker = process.env.CLOUDFLARE_WORKER === '1';
  const fromPostgres = worker
    ? { ...emptyDb(), ...(await loadSelectedCollections(WORKER_BOOT_COLLECTIONS)) }
    : await loadAllCollections();
  const postgresHasData = collectionsHaveData(fromPostgres);
  const localFile = readLocalDbFile();
  const localHasData = Boolean(localFile && collectionsHaveData(localFile));

  let source: 'postgres' | 'local-db.json' | 'seed' = 'seed';
  let parsed: Partial<DbShape> = emptyDb();

  if (options?.forceImportLocal && localHasData && localFile) {
    parsed = localFile;
    source = 'local-db.json';
  } else if (postgresHasData) {
    parsed = fromPostgres as Partial<DbShape>;
    source = 'postgres';
  } else if (localHasData && localFile) {
    parsed = localFile;
    source = 'local-db.json';
  } else {
    parsed = {
      users: [],
      roles: INITIAL_ROLES,
      teams: INITIAL_TEAMS,
    };
    source = 'seed';
  }

  parsed = prepareLiveOperationalData(parsed);
  console.info('[store] Live production mode enabled (operational demo seed is not merged)');

  const merged = buildMergedDb(parsed);
  const removedIncomplete = (parsed.users ?? []).filter(isIncompleteSignupAccount).length;
  if (removedIncomplete) {
    console.info('[store] Removed incomplete signup accounts from users', { removed: removedIncomplete });
  }

  if (!isLeadershipPruned(merged)) {
    const withoutFlag = (merged.systemMeta ?? []).filter((item) => item.id !== LEADERSHIP_PRUNE_META_ID);
    merged.systemMeta = [
      ...withoutFlag,
      { id: LEADERSHIP_PRUNE_META_ID, usersLeadershipPrunedAt: new Date().toISOString() },
    ];
  }

  cache = merged;
  markCollectionsFresh(worker ? WORKER_BOOT_COLLECTIONS : [...COLLECTION_NAMES]);
  if (worker) {
    console.info('[store] Worker boot loaded auth collections only');
  }
  const loadedFromPostgres = source === 'postgres' && postgresHasData;
  if (loadedFromPostgres) {
    console.info('[store] Loaded existing Postgres data without full rewrite');
  } else {
    await persistDb(merged);
  }
  initialized = true;

  return { source, counts: countRecords(loadDb()) };
}

export async function flushStore(): Promise<void> {
  await writeChain;
  collectionReloadAt.clear();
}

/** Lead workflow collections that must stay consistent across Worker isolates. */
export const LEAD_SYNC_COLLECTIONS: CollectionName[] = [
  'leads',
  'feasibilityTeamAssignments',
  'feasibilityEmployeeAllocations',
  'leadDocuments',
  'leadComments',
  'leadActivities',
  'leadStatusHistory',
  'assignmentHistory',
  'entityDocuments',
  'tasks',
  'notifications',
];

export async function shutdownStore(): Promise<void> {
  await flushStore();
  await closePool();
  initialized = false;
  cache = null;
}

export function isStoreInitialized(): boolean {
  return initialized;
}

export const store = {
  getUsers(): User[] {
    return loadDb().users;
  },
  getRoles(): Role[] {
    return loadDb().roles;
  },
  getTeams(): Team[] {
    return loadDb().teams;
  },
  saveTeams(teams: Team[]) {
    const db = loadDb();
    db.teams = teams;
    refreshTeamCounts(db);
    markDirty('teams');
    saveDb(db);
  },
  getLeads(): Lead[] {
    const leads = loadDb().leads;
    return [...leads].sort((a, b) => {
      const seq = (value?: string) => {
        const match = String(value || '')
          .trim()
          .toUpperCase()
          .match(/^(?:LEAD|LD)-(\d+)$/);
        return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
      };
      const left = seq(a.lead_number);
      const right = seq(b.lead_number);
      if (left !== right) return left - right;
      return String(a.lead_number || '').localeCompare(String(b.lead_number || ''), undefined, { numeric: true });
    });
  },
  getProjects(): Project[] {
    return loadDb().projects;
  },
  getEscalations(): Escalation[] {
    return loadDb().escalations;
  },
  getProcurementRequests(): ProcurementRequest[] {
    return loadDb().procurementRequests;
  },
  getAudits(): AuditLog[] {
    return loadDb().audits;
  },
  getNotifications(): NotificationItem[] {
    return loadDb().notifications;
  },
  getTasks(): Task[] {
    return loadDb().tasks;
  },
  getDailyUpdates(): DailyUpdate[] {
    return loadDb().dailyUpdates;
  },
  getLeaveRequests(): LeaveRequest[] {
    return loadDb().leaveRequests ?? [];
  },
  findUserByEmail(email: string): User | undefined {
    const normalized = email.trim().toLowerCase();
    return this.getUsers().find((user) => user.email.toLowerCase() === normalized);
  },
  findUserById(id: string): User | undefined {
    return this.getUsers().find((user) => user.id === id);
  },
  getPendingSignups(): PendingSignup[] {
    return loadDb().pendingSignups ?? [];
  },
  findPendingSignupByEmail(email: string): PendingSignup | undefined {
    const normalized = email.trim().toLowerCase();
    return this.getPendingSignups().find((item) => item.email.toLowerCase() === normalized);
  },
  findPendingSignupById(id: string): PendingSignup | undefined {
    return this.getPendingSignups().find((item) => item.id === id);
  },
  savePendingSignup(pending: PendingSignup) {
    const db = loadDb();
    const email = pending.email.trim().toLowerCase();
    const next = (db.pendingSignups ?? []).filter(
      (item) => item.id !== pending.id && item.email.toLowerCase() !== email
    );
    next.unshift({ ...pending, email });
    db.pendingSignups = next;
    markDirty('pendingSignups');
    saveDb(db);
  },
  deletePendingSignup(id: string) {
    const db = loadDb();
    db.pendingSignups = (db.pendingSignups ?? []).filter((item) => item.id !== id);
    markDirty('pendingSignups');
    saveDb(db);
  },
  saveUsers(users: User[]) {
    const db = loadDb();
    db.users = stripIncompleteSignupUsers(users).filter((user) => !isSmokeTestAccount(user));
    refreshTeamCounts(db);
    markDirty('users', 'teams');
    saveDb(db);
  },
  saveLeads(leads: Lead[]) {
    const db = loadDb();
    db.leads = leads;
    markDirty('leads');
    saveDb(db);
  },
  saveLeadRecord(lead: Lead): Lead {
    const db = loadDb();
    const leads = db.leads ?? [];
    const index = leads.findIndex((item) => item.id === lead.id);
    const next = { ...lead, updated_at: new Date().toISOString() };
    if (index === -1) leads.unshift(next);
    else leads[index] = next;
    db.leads = leads;
    markDirtyRecords('leads', next.id);
    saveDb(db);
    return next;
  },
  saveProjects(projects: Project[]) {
    const db = loadDb();
    db.projects = projects;
    markDirty('projects');
    saveDb(db);
  },
  saveEscalations(escalations: Escalation[]) {
    const db = loadDb();
    db.escalations = escalations;
    markDirty('escalations');
    saveDb(db);
  },
  saveAudits(audits: AuditLog[]) {
    const db = loadDb();
    db.audits = audits;
    markDirty('audits');
    saveDb(db);
  },
  saveNotifications(notifications: NotificationItem[]) {
    const db = loadDb();
    db.notifications = notifications;
    markDirty('notifications');
    saveDb(db);
  },
  saveTasks(tasks: Task[]) {
    const db = loadDb();
    db.tasks = tasks;
    markDirty('tasks');
    saveDb(db);
  },
  saveDailyUpdates(dailyUpdates: DailyUpdate[]) {
    const db = loadDb();
    db.dailyUpdates = dailyUpdates;
    markDirty('dailyUpdates');
    saveDb(db);
  },
  saveLeaveRequests(leaveRequests: LeaveRequest[]) {
    const db = loadDb();
    db.leaveRequests = leaveRequests;
    markDirty('leaveRequests');
    saveDb(db);
  },
  getLeadDocuments(): LeadDocument[] {
    return loadDb().leadDocuments ?? [];
  },
  saveLeadDocuments(leadDocuments: LeadDocument[]) {
    const db = loadDb();
    db.leadDocuments = leadDocuments;
    markDirty('leadDocuments');
    saveDb(db);
  },
  getLeadComments(): LeadComment[] {
    return loadDb().leadComments ?? [];
  },
  saveLeadComments(leadComments: LeadComment[]) {
    const db = loadDb();
    db.leadComments = leadComments;
    markDirty('leadComments');
    saveDb(db);
  },
  getLeadActivities(): LeadActivity[] {
    return loadDb().leadActivities ?? [];
  },
  saveLeadActivities(leadActivities: LeadActivity[]) {
    const db = loadDb();
    db.leadActivities = leadActivities;
    markDirty('leadActivities');
    saveDb(db);
  },
  getLeadStatusHistory(): LeadStatusHistory[] {
    return loadDb().leadStatusHistory ?? [];
  },
  saveLeadStatusHistory(leadStatusHistory: LeadStatusHistory[]) {
    const db = loadDb();
    db.leadStatusHistory = leadStatusHistory;
    markDirty('leadStatusHistory');
    saveDb(db);
  },
  getFeasibilityTeamAssignments(): FeasibilityTeamAssignment[] {
    return loadDb().feasibilityTeamAssignments ?? [];
  },
  saveFeasibilityTeamAssignments(feasibilityTeamAssignments: FeasibilityTeamAssignment[]) {
    const db = loadDb();
    db.feasibilityTeamAssignments = feasibilityTeamAssignments;
    markDirtyRecords(
      'feasibilityTeamAssignments',
      ...feasibilityTeamAssignments.map((item) => item.id).filter(Boolean)
    );
    saveDb(db);
  },
  getFeasibilityEmployeeAllocations(): FeasibilityEmployeeAllocation[] {
    return loadDb().feasibilityEmployeeAllocations ?? [];
  },
  saveFeasibilityEmployeeAllocations(feasibilityEmployeeAllocations: FeasibilityEmployeeAllocation[]) {
    const db = loadDb();
    db.feasibilityEmployeeAllocations = feasibilityEmployeeAllocations;
    markDirty('feasibilityEmployeeAllocations');
    saveDb(db);
  },
  getProjectPhases(): ProjectPhase[] {
    return loadDb().projectPhases ?? [];
  },
  saveProjectPhases(projectPhases: ProjectPhase[]) {
    const db = loadDb();
    db.projectPhases = projectPhases;
    markDirty('projectPhases');
    saveDb(db);
  },
  getConversations(): Conversation[] {
    return loadDb().conversations ?? [];
  },
  saveConversations(conversations: Conversation[]) {
    const db = loadDb();
    db.conversations = conversations;
    markDirty('conversations');
    saveDb(db);
  },
  getConversationParticipants(): ConversationParticipant[] {
    return loadDb().conversationParticipants ?? [];
  },
  saveConversationParticipants(conversationParticipants: ConversationParticipant[]) {
    const db = loadDb();
    db.conversationParticipants = conversationParticipants;
    markDirty('conversationParticipants');
    saveDb(db);
  },
  getChatMessages(): ChatMessage[] {
    return loadDb().chatMessages ?? [];
  },
  saveChatMessages(chatMessages: ChatMessage[]) {
    const db = loadDb();
    db.chatMessages = chatMessages;
    markDirty('chatMessages');
    saveDb(db);
  },
  getEntityDocuments(): EntityDocument[] {
    return loadDb().entityDocuments ?? [];
  },
  saveEntityDocuments(entityDocuments: EntityDocument[]) {
    const db = loadDb();
    db.entityDocuments = entityDocuments;
    markDirty('entityDocuments');
    saveDb(db);
  },
  getStageTransitions(): StageTransition[] {
    return loadDb().stageTransitions ?? [];
  },
  saveStageTransitions(stageTransitions: StageTransition[]) {
    const db = loadDb();
    db.stageTransitions = stageTransitions;
    markDirty('stageTransitions');
    saveDb(db);
  },
  getOutboundEmails(): OutboundEmail[] {
    return loadDb().outboundEmails ?? [];
  },
  saveOutboundEmails(outboundEmails: OutboundEmail[]) {
    const db = loadDb();
    db.outboundEmails = outboundEmails;
    markDirty('outboundEmails');
    saveDb(db);
  },
  getSystemMeta() {
    return loadDb().systemMeta ?? [];
  },
  saveSystemMeta(systemMeta: Array<{
    id: string;
    demoOperationalPurgedAt?: string;
    usersLeadershipPrunedAt?: string;
    payloadType?: string;
    payload?: unknown;
  }>) {
    const db = loadDb();
    db.systemMeta = systemMeta;
    markDirty('systemMeta');
    saveDb(db);
  },
  getForumPosts(): ForumPost[] {
    return loadDb().forumPosts ?? [];
  },
  saveForumPosts(forumPosts: ForumPost[]) {
    const db = loadDb();
    db.forumPosts = forumPosts;
    markDirty('forumPosts');
    saveDb(db);
  },
  getForumComments(): ForumComment[] {
    return loadDb().forumComments ?? [];
  },
  saveForumComments(forumComments: ForumComment[]) {
    const db = loadDb();
    db.forumComments = forumComments;
    markDirty('forumComments');
    saveDb(db);
  },
  getForumReactions(): ForumReaction[] {
    return loadDb().forumReactions ?? [];
  },
  saveForumReactions(forumReactions: ForumReaction[]) {
    const db = loadDb();
    db.forumReactions = forumReactions;
    markDirty('forumReactions');
    saveDb(db);
  },
  getForumTags(): ForumTag[] {
    return loadDb().forumTags ?? [];
  },
  saveForumTags(forumTags: ForumTag[]) {
    const db = loadDb();
    db.forumTags = forumTags;
    markDirty('forumTags');
    saveDb(db);
  },
  getForumLiveMessages(): ForumLiveMessage[] {
    return loadDb().forumLiveMessages ?? [];
  },
  saveForumLiveMessages(forumLiveMessages: ForumLiveMessage[]) {
    const db = loadDb();
    db.forumLiveMessages = forumLiveMessages;
    markDirty('forumLiveMessages');
    saveDb(db);
  },
  getAssignmentHistory(): AssignmentHistory[] {
    return loadDb().assignmentHistory ?? [];
  },
  saveAssignmentHistory(assignmentHistory: AssignmentHistory[]) {
    const db = loadDb();
    db.assignmentHistory = assignmentHistory;
    markDirty('assignmentHistory');
    saveDb(db);
  },
  getNotificationDeliveries(): NotificationDelivery[] {
    return loadDb().notificationDeliveries ?? [];
  },
  saveNotificationDeliveries(notificationDeliveries: NotificationDelivery[]) {
    const db = loadDb();
    db.notificationDeliveries = notificationDeliveries;
    markDirty('notificationDeliveries');
    saveDb(db);
  },
  appendAudit(entry: Omit<AuditLog, 'id' | 'created_at'>): AuditLog {
    if (!entry || !entry.user_id || !entry.action) {
      console.warn('[store] appendAudit rejected: user_id and action are required');
      return null as unknown as AuditLog;
    }
    const user = this.findUserById(entry.user_id);
    const pending = this.findPendingSignupById(entry.user_id);
    if (!user && !pending) {
      console.warn('[store] appendAudit rejected: actor user_id does not reference an existing user', entry.user_id);
      return null as unknown as AuditLog;
    }
    const audits = this.getAudits();
    const nowMs = Date.now();
    const duplicate = audits.find(
      (log) =>
        log.user_id === entry.user_id &&
        log.action === entry.action &&
        log.entity_id === entry.entity_id &&
        log.description === entry.description &&
        nowMs - new Date(log.created_at).getTime() < 2000
    );
    if (duplicate) {
      return duplicate;
    }

    const log: AuditLog = {
      ...entry,
      id: `log-${nowMs}-${Math.random().toString(36).slice(2, 6)}`,
      created_at: new Date(nowMs).toISOString(),
    };
    audits.unshift(log);
    const db = loadDb();
    db.audits = audits;
    markDirtyRecords('audits', log.id);
    saveDb(db);
    return log;
  },
  appendNotification(entry: Omit<NotificationItem, 'id' | 'created_at' | 'read_status'>): NotificationItem {
    const notifications = this.getNotifications();
    const item: NotificationItem = {
      ...entry,
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      read_status: false,
      created_at: new Date().toISOString(),
    };
    notifications.unshift(item);
    const db = loadDb();
    db.notifications = notifications;
    markDirtyRecords('notifications', item.id);
    saveDb(db);
    return item;
  },
  appendLeadStatusHistory(entry: LeadStatusHistory): LeadStatusHistory {
    const history = this.getLeadStatusHistory();
    history.unshift(entry);
    const db = loadDb();
    db.leadStatusHistory = history;
    markDirtyRecords('leadStatusHistory', entry.id);
    saveDb(db);
    return entry;
  },
  appendAssignmentHistory(entry: AssignmentHistory): AssignmentHistory {
    const history = this.getAssignmentHistory();
    history.unshift(entry);
    const db = loadDb();
    db.assignmentHistory = history;
    markDirtyRecords('assignmentHistory', entry.id);
    saveDb(db);
    return entry;
  },
};
