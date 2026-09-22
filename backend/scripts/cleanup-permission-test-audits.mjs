import pg from 'pg';
import dns from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dns.setDefaultResultOrder('ipv4first');
const parsed = dotenv.parse(fs.readFileSync(new URL('../.env', import.meta.url)));
const url = (parsed.DATABASE_URL || '').replace(/^['"]|['"]$/g, '');
const u = new URL(url);
u.searchParams.delete('sslmode');
const pool = new pg.Pool({
  connectionString: u.toString(),
  ssl: { rejectUnauthorized: false },
  max: 1,
  connectionTimeoutMillis: 10000,
});

const KEYS = [
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
];

const apply = process.argv.includes('--apply');
const backupDir = path.resolve('data/backups');
fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(backupDir, `backup_permission_test_audits_${stamp}.json`);

const client = await pool.connect();
try {
  const selected = await client.query(
    `SELECT record_key, user_name, action, entity_type, entity_id, description, created_at
     FROM audits
     WHERE record_key = ANY($1::text[])
        OR description ILIKE '%Permission Test Group%'
        OR entity_id = 'conv-1788433476694-sgxu'
     ORDER BY created_at`,
    [KEYS]
  );
  fs.writeFileSync(backupPath, JSON.stringify({ created_at: new Date().toISOString(), rows: selected.rows }, null, 2));
  console.log('BACKUP', backupPath);
  console.log('MATCHED', selected.rows.length);
  console.log(JSON.stringify(selected.rows, null, 2));
  if (!apply) {
    console.log('DRY_RUN. Re-run with --apply to delete only these confirmed permission-test audit rows.');
  } else {
    const deleted = await client.query(
      `DELETE FROM audits
       WHERE record_key = ANY($1::text[])
          OR description ILIKE '%Permission Test Group%'
          OR entity_id = 'conv-1788433476694-sgxu'
       RETURNING record_key, action`,
      [KEYS]
    );
    console.log('DELETED', deleted.rows.length, deleted.rows);
  }
} finally {
  client.release();
  await pool.end();
}
