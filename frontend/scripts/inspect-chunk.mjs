import fs from 'node:fs';
import path from 'node:path';
const dir = '.cloudflare-out/_next/static/chunks';
for (const file of fs.readdirSync(dir)) {
  const s = fs.readFileSync(path.join(dir, file), 'utf8');
  if (s.includes('leads/detail')) console.log('FOUND in', file);
  if (s.includes('encodeURIComponent') && s.includes('pre-sales')) console.log('encode+pre-sales in', file);
}
