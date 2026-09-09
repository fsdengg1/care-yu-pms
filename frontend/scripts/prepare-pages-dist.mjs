import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const distDir = path.join(root, 'dist');

if (!fs.existsSync(distDir)) {
  console.error('[prepare-pages-dist] ERROR: dist/ not found. Run vite build first.');
  process.exit(1);
}

// Optional cache/security headers for static assets (Workers assets also serve these files).
const headers = [
  '/assets/*',
  '  Cache-Control: public, max-age=31536000, immutable',
  '',
  '/assets/*.js',
  '  Content-Type: application/javascript; charset=UTF-8',
  '',
  '/assets/*.css',
  '  Content-Type: text/css; charset=UTF-8',
].join('\n') + '\n';

fs.writeFileSync(path.join(distDir, '_headers'), headers, 'utf8');

console.log('[prepare-pages-dist] Wrote static asset _headers to dist/');
