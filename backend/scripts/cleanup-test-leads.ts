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

const apply = process.argv.includes('--apply');
const client = new pg.Client({
  connectionString: connectionStringWithoutSslMode(env.databaseUrl),
  ssl: env.databaseSsl ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 10000,
});

function officialSequence(value: string): number | null {
  const match = String(value || '')
    .trim()
    .toUpperCase()
    .match(/^(?:LEAD|LD)-(\d+)$/);
  if (!match) return null;
  return Number(match[1]);
}

await client.connect();
await client.query('BEGIN');

try {
  const leads = await client.query<{ record_key: string; lead_number: string }>(
    `SELECT record_key, lead_number FROM leads`
  );
  const keepIds = new Set<string>();
  const keepBySeq = new Map<number, string>();
  const removeLeadKeys: string[] = [];

  for (const row of leads.rows) {
    const seq = officialSequence(row.lead_number) ?? officialSequence(row.record_key);
    if (seq != null && seq >= 1 && seq <= 8 && !keepBySeq.has(seq)) {
      keepBySeq.set(seq, row.record_key);
      keepIds.add(row.record_key);
      continue;
    }
    removeLeadKeys.push(row.record_key);
  }

  console.log(`leads in table: ${leads.rowCount}`);
  console.log(`keeping: ${[...keepBySeq.entries()].sort((a, b) => a[0] - b[0]).map(([seq, id]) => `${seq}:${id}`).join(', ')}`);
  console.log(`removing extra leads: ${removeLeadKeys.length ? removeLeadKeys.join(', ') : '(none)'}`);

  if (removeLeadKeys.length) {
    await client.query(`DELETE FROM leads WHERE record_key = ANY($1::text[])`, [removeLeadKeys]);
  }

  const childLeadIdTables = [
    'feasibility_team_assignments',
    'feasibility_employee_allocations',
    'lead_documents',
    'lead_comments',
    'lead_activities',
    'lead_status_history',
    'tasks',
    'daily_updates',
    'projects',
    'stage_transitions',
  ];

  for (const table of childLeadIdTables) {
    const result = await client.query(
      `DELETE FROM ${table}
       WHERE COALESCE(lead_id, '') <> ''
         AND lead_id NOT IN (SELECT record_key FROM leads)
       RETURNING record_key`
    );
    console.log(`${table}: deleted ${result.rowCount} orphan lead_id rows`);
  }

  const entityTables = ['entity_documents', 'notifications', 'assignment_history', 'audits'];
  for (const table of entityTables) {
    const result = await client.query(
      `DELETE FROM ${table}
       WHERE (
            entity_id LIKE 'lead-%'
         OR entity_id ILIKE 'lead-%'
         OR entity_id ILIKE 'ld-%'
       )
         AND entity_id NOT IN (SELECT record_key FROM leads)
         AND entity_id NOT IN (SELECT lead_number FROM leads)
       RETURNING record_key`
    );
    console.log(`${table}: deleted ${result.rowCount} orphan entity_id rows`);
  }

  const deliveries = await client.query(
    `DELETE FROM notification_deliveries
     WHERE notification_id IS NOT NULL
       AND notification_id <> ''
       AND notification_id NOT IN (SELECT record_key FROM notifications)
     RETURNING record_key`
  );
  console.log(`notification_deliveries: deleted ${deliveries.rowCount} rows for missing notifications`);

  const emails = await client.query(
    `DELETE FROM outbound_emails
     WHERE notification_id IS NOT NULL
       AND notification_id <> ''
       AND notification_id NOT IN (SELECT record_key FROM notifications)
     RETURNING record_key`
  );
  console.log(`outbound_emails: deleted ${emails.rowCount} rows for missing notifications`);

  const remaining = await client.query<{ lead_number: string; record_key: string }>(
    `SELECT lead_number, record_key FROM leads ORDER BY lead_number`
  );
  const remainingAssignments = await client.query(`SELECT COUNT(*)::int AS count FROM feasibility_team_assignments`);
  console.log(`remaining leads: ${remaining.rowCount}`);
  for (const row of remaining.rows) console.log(`KEEP ${row.lead_number}\t${row.record_key}`);
  console.log(`remaining assignments: ${remainingAssignments.rows[0].count}`);

  if (remaining.rowCount !== 8) {
    throw new Error(`Expected 8 original leads, found ${remaining.rowCount}`);
  }
  const numbers = remaining.rows.map((row) => String(row.lead_number).toUpperCase()).sort();
  const expected = ['LD-001', 'LD-002', 'LD-003', 'LD-004', 'LD-005', 'LD-006', 'LD-007', 'LD-008'];
  if (numbers.join(',') !== expected.join(',')) {
    throw new Error(`Lead numbers are ${numbers.join(', ')} (expected ${expected.join(', ')})`);
  }

  if (apply) {
    await client.query('COMMIT');
    console.log('cleanup committed');
  } else {
    await client.query('ROLLBACK');
    console.log('dry-run rolled back; re-run with --apply to commit');
  }
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
