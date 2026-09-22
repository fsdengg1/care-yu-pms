import 'dotenv/config';
import pg from 'pg';

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

await c.connect();
const r = await c.query(`
  SELECT id, email, name, role_code, status
  FROM users
  WHERE role_code IN (
    'BUSINESS_HEAD','PROJECT_MANAGER','PROCUREMENT','EMPLOYEE',
    'PROJECT_ENGINEER','TEAM_LEAD','SALES','ENG_DIRECTOR'
  )
  OR email ILIKE '%business%'
  OR email ILIKE '%robot%'
  OR email ILIKE '%procure%'
  ORDER BY role_code, email
  LIMIT 100
`);
console.log(JSON.stringify(r.rows, null, 2));
await c.end();
