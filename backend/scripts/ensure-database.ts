import 'dotenv/config';
import pg from 'pg';

async function main() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL is required');

  const target = new URL(raw);
  const dbName = decodeURIComponent(target.pathname.replace(/^\//, '') || 'PMS');

  const admin = new URL(raw);
  admin.searchParams.delete('sslmode');
  admin.pathname = '/defaultdb';

  const pool = new pg.Pool({
    connectionString: admin.toString(),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  const client = await pool.connect();
  try {
    const dbs = await client.query(
      `SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY 1`
    );
    console.log('databases:', dbs.rows.map((row) => row.datname).join(', '));

    const exists = dbs.rows.some((row) => row.datname === dbName);
    if (!exists) {
      await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
      console.log(`created database ${dbName}`);
    } else {
      console.log(`database ${dbName} already exists`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
