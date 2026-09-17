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
const leads = await client.query(
  `SELECT record_key, lead_number, title, customer_name, status, assigned_team_name, created_at
   FROM leads
   ORDER BY lead_number NULLS LAST, created_at`
);
console.log(`leads total: ${leads.rowCount}`);
for (const row of leads.rows) {
  console.log(
    [row.lead_number || '(no-number)', row.record_key, row.status, row.customer_name || '—', row.title || '—', row.assigned_team_name || '', row.created_at || ''].join('\t')
  );
}

const assignments = await client.query(
  `SELECT record_key, lead_id, team_name, status, team_lead_name FROM feasibility_team_assignments ORDER BY created_at`
);
console.log(`assignments: ${assignments.rowCount}`);
for (const row of assignments.rows) {
  console.log(['FTA', row.record_key, row.lead_id, row.team_name, row.status, row.team_lead_name || ''].join('\t'));
}

const taskLeads = await client.query(`SELECT COUNT(*)::int AS count FROM tasks WHERE COALESCE(lead_id, '') <> ''`);
console.log(`tasks with lead_id: ${taskLeads.rows[0].count}`);
const projects = await client.query(`SELECT COUNT(*)::int AS count FROM projects`);
console.log(`projects: ${projects.rows[0].count}`);
await client.end();
