import dns from 'node:dns';
import pg from 'pg';
import { env } from '../config/env.js';
import { User } from '../types.js';

if (typeof dns?.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

const { Pool } = pg;

export type CollectionName =
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
  | 'systemMeta';

export const COLLECTION_NAMES: CollectionName[] = [
  'users',
  'roles',
  'teams',
  'leads',
  'projects',
  'escalations',
  'procurementRequests',
  'audits',
  'notifications',
  'tasks',
  'dailyUpdates',
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
  'pendingSignups',
  'systemMeta',
];

let pool: pg.Pool | null = null;

function connectionStringWithoutSslMode(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('sslmode');
    parsed.searchParams.delete('ssl');
    return parsed.toString();
  } catch {
    return url.replace(/([?&])sslmode=[^&]*/gi, '$1').replace(/[?&]$/, '');
  }
}

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: connectionStringWithoutSslMode(env.databaseUrl),
      // Managed Postgres (Aiven) uses a provider CA; for app use we accept TLS without pinning the CA file.
      ssl: env.databaseSsl ? { rejectUnauthorized: false } : false,
      max: 3,
      connectionTimeoutMillis: 60000,
      idleTimeoutMillis: 30000,
    });
  }
  return pool;
}

export async function ensureSchema(): Promise<void> {
  const { USERS_TABLE_DDL } = await import('./usersTable.js');
  const { RELATIONAL_TABLES, RELATIONAL_TABLE_NAMES, buildCreateTableSql, addMissingColumnSql, migrateJsonCollectionsIfNeeded } = await import(
    './relationalStore.js'
  );
  try {
    const parsedUrl = new URL(env.databaseUrl);
    const dbName = decodeURIComponent(parsedUrl.pathname.replace(/^\//, '') || '');
    console.info(`[store] Applying schema on ${parsedUrl.hostname}:${parsedUrl.port}/${dbName}`);
  } catch {
    // URL parse failure is non-fatal; connection attempt below will surface a real error.
  }
  const client = await getPool().connect();
  try {
    await client.query(`SET search_path TO public`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS store_collections (
        name TEXT PRIMARY KEY,
        data JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(USERS_TABLE_DDL);
    for (const def of RELATIONAL_TABLES) {
      await client.query(buildCreateTableSql(def));
      await client.query(addMissingColumnSql(def));
    }
    await client.query(`
      COMMENT ON TABLE store_collections IS 'Legacy JSON backup. Live data is stored in relational tables (roles, teams, leads, ...).';
      COMMENT ON TABLE users IS 'CareYu PMS user accounts';
      COMMENT ON TABLE roles IS 'CareYu PMS roles';
      COMMENT ON TABLE teams IS 'CareYu PMS teams';
      COMMENT ON TABLE leads IS 'CareYu PMS leads';
      COMMENT ON VIEW user_directory IS 'Directory projection of users';
    `);
    try {
      await client.query(`ALTER SCHEMA public OWNER TO CURRENT_USER`);
      await client.query(`
        GRANT USAGE, CREATE ON SCHEMA public TO CURRENT_USER;
        GRANT ALL ON ALL TABLES IN SCHEMA public TO CURRENT_USER;
        GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO CURRENT_USER;
        GRANT USAGE ON SCHEMA public TO PUBLIC;
        REVOKE SELECT ON ALL TABLES IN SCHEMA public FROM PUBLIC;
      `);
    } catch (error) {
      console.warn(
        '[store] Schema grants/owner update skipped:',
        error instanceof Error ? error.message : error
      );
    }

    const jsonRows = await client.query<{ name: string; data: unknown }>(`SELECT name, data FROM store_collections`);
    const jsonCollections = {} as Record<CollectionName, unknown[]>;
    for (const name of COLLECTION_NAMES) jsonCollections[name] = [];
    for (const row of jsonRows.rows) {
      if ((COLLECTION_NAMES as string[]).includes(row.name)) {
        jsonCollections[row.name as CollectionName] = Array.isArray(row.data) ? row.data : [];
      }
    }
    const migrated = await migrateJsonCollectionsIfNeeded(client, jsonCollections);
    if (migrated) {
      await client.query(`UPDATE store_collections SET data = '[]'::jsonb, updated_at = NOW()`);
      console.info('[store] Migrated store_collections JSON into relational tables');
    }

    await client.query(`
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS source TEXT;
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_by_id TEXT;
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_by_name TEXT;
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS intake_form JSONB;
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS assigned_by_id TEXT;
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS assigned_by_name TEXT;
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_action TEXT;
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_action_by_id TEXT;
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_action_by_name TEXT;
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_action_at TIMESTAMPTZ;
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS monitor_status TEXT;
      ALTER TABLE escalations ADD COLUMN IF NOT EXISTS history JSONB;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_team_ids TEXT[];
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_team_names TEXT[];
      ALTER TABLE audits ADD COLUMN IF NOT EXISTS assigned_to TEXT;
      ALTER TABLE audits ADD COLUMN IF NOT EXISTS assigned_to_id TEXT;
      ALTER TABLE audits ADD COLUMN IF NOT EXISTS assigned_to_name TEXT;
      ALTER TABLE daily_updates ADD COLUMN IF NOT EXISTS period TEXT;
      ALTER TABLE daily_updates ADD COLUMN IF NOT EXISTS update_type TEXT;
    `);
    const tables = await client.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    const names = tables.rows.map((row) => row.table_name);
    const missing = ['store_collections', 'users', ...RELATIONAL_TABLE_NAMES].filter((name) => !names.includes(name));
    if (missing.length) {
      throw new Error(`PMS public schema is missing required tables: ${missing.join(', ')}`);
    }
    console.info(`[store] PMS public tables ready: ${names.join(', ')}`);
  } finally {
    client.release();
  }
}

export async function loadAllCollections(): Promise<Record<CollectionName, unknown[]>> {
  const out = {} as Record<CollectionName, unknown[]>;
  for (const name of COLLECTION_NAMES) {
    out[name] = [];
  }

  const { loadRelationalCollections } = await import('./relationalStore.js');
  const relational = await loadRelationalCollections(getPool());
  for (const name of COLLECTION_NAMES) {
    if (name === 'users') continue;
    const rows = relational[name];
    if (Array.isArray(rows)) out[name] = rows;
  }

  const { loadUsersTable } = await import('./usersTable.js');
  out.users = await loadUsersTable();
  return out;
}

export async function saveAllCollections(
  collections: Record<CollectionName, unknown[]>,
  only?: CollectionName[]
): Promise<void> {
  const selected = only?.length ? new Set(only) : null;
  const client = await getPool().connect();
  try {
    const { saveRelationalCollections } = await import('./relationalStore.js');
    if (!selected || selected.has('users')) {
      const { saveUsersTable } = await import('./usersTable.js');
      await saveUsersTable((collections.users as User[]) ?? []);
    }
    await client.query('BEGIN');
    await saveRelationalCollections(client, collections, only);
    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // No transaction was open if users-table save failed first.
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function pingDatabase(): Promise<void> {
  const timeoutMs = 30000;
  const attempts = 5;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await Promise.race([
        getPool().query('SELECT 1'),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Database connection timed out after ${timeoutMs / 1000}s. Check DATABASE_URL, SSL, and network access.`));
          }, timeoutMs);
        }),
      ]);
      return;
    } catch (error) {
      lastError = error;
      console.error(
        `[store] Database ping failed (attempt ${attempt}/${attempts})`,
        error instanceof Error ? error.message : error
      );
      await closePool();
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Database connection failed.');
}
