import dns from 'node:dns';
import pg from 'pg';
import { env } from '../config/env.js';
import { User } from '../types.js';

if (typeof dns?.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

const { Pool, Client } = pg;

let pool: pg.Pool | null = null;

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
  'pendingSignups',
  'systemMeta',
];

function createWorkerClientPool(): pg.Pool {
  const config: pg.ClientConfig = {
    connectionString: env.databaseUrl,
    ssl: false,
  };

  const fake = {
    async query(text: string | { text: string; values?: unknown[] }, values?: unknown[]) {
      const client = new Client(config);
      await client.connect();
      try {
        if (typeof text === 'string') return await client.query(text, values);
        return await client.query(text);
      } finally {
        await client.end().catch(() => undefined);
      }
    },
    async connect() {
      const client = new Client(config);
      await client.connect();
      (client as pg.PoolClient).release = (() => {
        void client.end().catch(() => undefined);
      }) as pg.PoolClient['release'];
      return client;
    },
    async end() {
      return;
    },
    on() {
      return fake;
    },
  };

  return fake as unknown as pg.Pool;
}

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
    const worker = process.env.CLOUDFLARE_WORKER === '1';
    const hyperdrive = process.env.HYPERDRIVE_ACTIVE === '1';
    if (worker && hyperdrive) {
      pool = createWorkerClientPool();
    } else {
      pool = new Pool({
        connectionString: hyperdrive ? env.databaseUrl : connectionStringWithoutSslMode(env.databaseUrl),
        ssl: hyperdrive ? false : env.databaseSsl ? { rejectUnauthorized: false } : false,
        max: worker ? 1 : 2,
        connectionTimeoutMillis: worker ? 15000 : 60000,
        idleTimeoutMillis: worker ? 5000 : 30000,
        allowExitOnIdle: Boolean(worker),
      });
      pool.on('error', (err) => {
        console.warn('[pg-pool] Background client error, resetting pool:', err.message);
        pool = null;
      });
    }
  }
  return pool;
}

async function workerSchemaReady(): Promise<boolean> {
  if (process.env.CLOUDFLARE_WORKER !== '1') return false;
  const client = await getPool().connect();
  try {
    const result = await client.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);
    return Number(result.rows[0]?.count || 0) >= 20;
  } finally {
    client.release();
  }
}

export async function ensureSchema(): Promise<void> {
  if (process.env.CLOUDFLARE_WORKER === '1') {
    console.info('[store] Worker fast-path: skipping schema migration on login/boot');
    return;
  }
  if (await workerSchemaReady()) {
    console.info('[store] Worker fast-path: schema already present, skipping migration');
    return;
  }

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
      UPDATE daily_updates
      SET
        period = CASE
          WHEN lower(COALESCE(period, '')) IN ('evening', 'morning') THEN lower(period)
          WHEN upper(COALESCE(update_type, '')) = 'EVENING' THEN 'evening'
          WHEN upper(COALESCE(update_type, '')) = 'MORNING' THEN 'morning'
          WHEN EXTRACT(HOUR FROM timezone('Asia/Kolkata', COALESCE(created_at, submitted_at, now()))) >= 17 THEN 'evening'
          ELSE 'morning'
        END,
        update_type = CASE
          WHEN upper(COALESCE(update_type, '')) IN ('EVENING', 'MORNING') THEN upper(update_type)
          WHEN lower(COALESCE(period, '')) = 'morning' THEN 'MORNING'
          WHEN EXTRACT(HOUR FROM timezone('Asia/Kolkata', COALESCE(created_at, submitted_at, now()))) >= 17 THEN 'EVENING'
          ELSE 'MORNING'
        END
      WHERE period IS NULL OR period = '' OR update_type IS NULL OR update_type = '';
      DELETE FROM daily_updates
      WHERE record_key IN (
        SELECT record_key FROM (
          SELECT record_key,
            ROW_NUMBER() OVER (
              PARTITION BY
                COALESCE(NULLIF(task_id, ''), assignment_id, ''),
                COALESCE(user_id, ''),
                COALESCE(work_date, ''),
                COALESCE(period, '')
              ORDER BY
                COALESCE(updated_at, submitted_at, created_at) DESC NULLS LAST,
                record_key DESC
            ) AS rn
          FROM daily_updates
        ) ranked
        WHERE rn > 1
      );
      CREATE UNIQUE INDEX IF NOT EXISTS daily_updates_task_user_date_period_uidx
        ON daily_updates (
          COALESCE(NULLIF(task_id, ''), assignment_id, ''),
          COALESCE(user_id, ''),
          COALESCE(work_date, ''),
          COALESCE(period, '')
        );
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS delay_reason TEXT;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS fs_review_history JSONB;
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

  const { loadRelationalRows } = await import('./relationalStore.js');
  const { loadUsersTable } = await import('./usersTable.js');
  const pool = getPool();
  const names = COLLECTION_NAMES.filter((name) => name !== 'users');
  const worker = process.env.CLOUDFLARE_WORKER === '1';
  if (!worker) {
    const client = await pool.connect();
    try {
      const { loadRelationalCollections } = await import('./relationalStore.js');
      const relational = await loadRelationalCollections(client);
      for (const name of COLLECTION_NAMES) {
        if (name === 'users') continue;
        const rows = relational[name];
        if (Array.isArray(rows)) out[name] = rows;
      }
      out.users = await loadUsersTable(client);
      return out;
    } finally {
      client.release();
    }
  }

  const concurrency = 5;
  for (let index = 0; index < names.length; index += concurrency) {
    const batch = names.slice(index, index + concurrency);
    const rows = await Promise.all(batch.map((name) => loadRelationalRows(pool, name)));
    batch.forEach((name, offset) => {
      out[name] = rows[offset];
    });
  }
  out.users = await loadUsersTable();
  return out;
}

export async function loadSelectedCollections(names: CollectionName[]): Promise<Partial<Record<CollectionName, unknown[]>>> {
  const out: Partial<Record<CollectionName, unknown[]>> = {};
  if (!names.length) return out;
  const { loadRelationalRows } = await import('./relationalStore.js');
  const { loadUsersTable } = await import('./usersTable.js');
  const pool = getPool();
  const client = await pool.connect();
  try {
    for (const name of names) {
      if (name === 'users') continue;
      out[name] = await loadRelationalRows(client, name);
    }
    if (names.includes('users')) {
      out.users = await loadUsersTable(client);
    }
  } finally {
    client.release();
  }
  return out;
}

export async function loadLeadRowById(id: string): Promise<Record<string, unknown> | undefined> {
  const { loadRelationalRows } = await import('./relationalStore.js');
  const rows = await loadRelationalRows(getPool(), 'leads', 'record_key = $1 OR lead_number = $1', [id]);
  return rows[0];
}

export async function loadAssignmentsForLead(leadId: string): Promise<Record<string, unknown>[]> {
  const { loadRelationalRows } = await import('./relationalStore.js');
  return loadRelationalRows(getPool(), 'feasibilityTeamAssignments', 'lead_id = $1', [leadId]);
}

export async function saveAllCollections(
  collections: Record<CollectionName, unknown[]>,
  only?: CollectionName[],
  recordKeys?: Map<CollectionName, Set<string>>
): Promise<void> {
  const selected = only?.length ? new Set(only) : null;
  const client = await getPool().connect();
  try {
    const { saveRelationalCollections } = await import('./relationalStore.js');
    if (!selected || selected.has('users')) {
      const { saveUsersTable } = await import('./usersTable.js');
      const users = (collections.users as User[]) ?? [];
      const userKeys = recordKeys?.get('users');
      const touchedUsers = userKeys?.size ? users.filter((user) => userKeys.has(user.id)) : users;
      if (touchedUsers.length) {
        await saveUsersTable(touchedUsers, { partial: Boolean(userKeys?.size) });
      }
    }
    await client.query('BEGIN');
    await saveRelationalCollections(client, collections, only, recordKeys);
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
  const current = pool;
  pool = null;
  if (current) {
    try {
      if (!(current as any).ending && !(current as any).ended) {
        await current.end();
      }
    } catch (e) {
      console.warn('[store] closePool error ignored:', e instanceof Error ? e.message : e);
    }
  }
}

async function pingWithCurrentConfig(timeoutMs: number, attempts: number): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const p = getPool();
      await Promise.race([
        p.query('SELECT 1'),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Database connection timed out after ${timeoutMs / 1000}s.`));
          }, timeoutMs);
        }),
      ]);
      console.info('[store] Database ping successful');
      return;
    } catch (error) {
      lastError = error;
      console.error(
        `[store] Database ping failed (attempt ${attempt}/${attempts}):`,
        error instanceof Error ? `${error.name}: ${error.message}` : error
      );
      await closePool();
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function pingDatabase(): Promise<void> {
  const worker = process.env.CLOUDFLARE_WORKER === '1';
  // Worker cold start already opens Postgres for schema/data load. A separate ping
  // costs another Hyperdrive connection and pushes login/daily-status into 503s.
  if (worker) return;
  await pingWithCurrentConfig(20000, 3);
}
