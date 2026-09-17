import '../src/config/env.js';
import pg from 'pg';
import { env } from '../src/config/env.js';

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

const client = new pg.Client({
  connectionString: connectionStringWithoutSslMode(env.databaseUrl),
  ssl: env.databaseSsl ? { rejectUnauthorized: false } : false,
});

await client.connect();

const keep = await client.query<{ record_key: string; lead_number: string }>(
  `SELECT record_key, lead_number FROM leads`
);
console.log('keep leads', keep.rows.map((row) => `${row.lead_number}:${row.record_key}`).join(', '));

const tables = [
  { table: 'feasibility_team_assignments', column: 'lead_id' },
  { table: 'feasibility_employee_allocations', column: 'lead_id' },
  { table: 'lead_documents', column: 'lead_id' },
  { table: 'lead_comments', column: 'lead_id' },
  { table: 'lead_activities', column: 'lead_id' },
  { table: 'lead_status_history', column: 'lead_id' },
  { table: 'tasks', column: 'lead_id' },
  { table: 'daily_updates', column: 'lead_id' },
  { table: 'projects', column: 'lead_id' },
  { table: 'stage_transitions', column: 'lead_id' },
];

for (const item of tables) {
  const exists = await client.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE COALESCE(${item.column}, '') <> '' AND ${item.column} NOT IN (SELECT record_key FROM leads))::int AS orphans
     FROM ${item.table}`
  );
  console.log(`${item.table}: total=${exists.rows[0].total} orphans=${exists.rows[0].orphans}`);
}

const entityTables = [
  { table: 'entity_documents', column: 'entity_id' },
  { table: 'notifications', column: 'entity_id' },
  { table: 'assignment_history', column: 'entity_id' },
  { table: 'audits', column: 'entity_id' },
];
for (const item of entityTables) {
  const exists = await client.query(
    `SELECT COUNT(*)::int AS orphans
     FROM ${item.table}
     WHERE COALESCE(${item.column}, '') LIKE 'lead-%'
       AND ${item.column} NOT IN (SELECT record_key FROM leads)`
  );
  console.log(`${item.table} lead-orphans=${exists.rows[0].orphans}`);
}

await client.end();
