import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(here, '..', '.env');
const keys = [
  'DATABASE_URL',
  'JWT_SECRET',
  'ELASTIC_EMAIL_API_KEY',
  'ELASTIC_EMAIL_FROM_EMAIL',
  'EMAIL_FROM',
  'DEMO_PASSWORD',
  'ROBOT_LEAD_PASSWORD',
  'BUSINESSHEAD_PASSWORD',
];

function stripQuotes(value) {
  const v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

const map = {};
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!match) continue;
  const key = match[1];
  const value = stripQuotes(match[2]);
  if (keys.includes(key) && value) map[key] = value;
}

const tmp = path.join(here, '..', '.wrangler-secrets.json');
fs.writeFileSync(tmp, JSON.stringify(map));
const result = spawnSync('npx', ['wrangler', 'secret', 'bulk', tmp], {
  stdio: 'inherit',
  shell: true,
  cwd: path.join(here, '..'),
});
fs.unlinkSync(tmp);
process.exit(result.status ?? 1);
