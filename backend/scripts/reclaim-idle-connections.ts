import pg from 'pg';
import { env } from '../src/config/env.ts';

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

async function once() {
  const client = new pg.Client({
    connectionString: connectionStringWithoutSslMode(env.databaseUrl),
    ssl: env.databaseSsl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 15000,
    application_name: 'careyu-local-reclaim',
  });
  await client.connect();
  try {
    const max = await client.query('SHOW max_connections');
    const stats = await client.query(`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE state = 'idle')::int AS idle,
        count(*) FILTER (WHERE state = 'active')::int AS active
      FROM pg_stat_activity
      WHERE datname = current_database()
    `);
    const killed = await client.query(`
      SELECT pg_terminate_backend(pid) AS killed
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND usename = current_user
        AND state IN ('idle', 'idle in transaction')
        AND now() - state_change > interval '10 seconds'
        AND application_name <> 'careyu-local-reclaim'
    `);
    console.log(
      JSON.stringify(
        {
          max: max.rows[0]?.max_connections,
          stats: stats.rows[0],
          terminated: killed.rowCount,
        },
        null,
        2
      )
    );
  } finally {
    await client.end();
  }
}

async function main() {
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      await once();
      return;
    } catch (error) {
      console.error(`attempt ${attempt}/8:`, error instanceof Error ? error.message : error);
      await new Promise((resolve) => setTimeout(resolve, 4000 * attempt));
    }
  }
  process.exit(1);
}

void main();
