import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const distDir = path.join(root, 'dist');
const outDir = path.join(root, '.cloudflare-out');
const publicDir = path.join(root, 'public');

if (!fs.existsSync(distDir)) {
  console.error('[build-cloudflare] ERROR: dist/ not found. Run vite build first.');
  process.exit(1);
}

if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true, force: true });
}
fs.mkdirSync(outDir, { recursive: true });

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

copyDir(distDir, outDir);
copyDir(publicDir, outDir);

const apiOrigin = (
  process.env.VITE_API_URL ||
  process.env.CLOUDFLARE_API_ORIGIN ||
  'https://careyu-backend-api.aicareyuautomation.workers.dev'
).replace(/\/$/, '');

const redirects = [
  `/api/*  ${apiOrigin}/api/:splat  200`,
  '/assets/*  /assets/:splat  200',
  '/*  /index.html  200',
].join('\n') + '\n';
fs.writeFileSync(path.join(outDir, '_redirects'), redirects, 'utf8');

const headers = [
  '/*',
  '  Referrer-Policy: same-origin',
  '  X-Content-Type-Options: nosniff',
  '',
  '/assets/*',
  '  Cache-Control: public, max-age=31536000, immutable',
  '',
  '/assets/*.js',
  '  Content-Type: application/javascript; charset=UTF-8',
  '',
  '/assets/*.css',
  '  Content-Type: text/css; charset=UTF-8',
].join('\n') + '\n';
fs.writeFileSync(path.join(outDir, '_headers'), headers, 'utf8');

console.log('[build-cloudflare] Packaged Vite SPA into .cloudflare-out');
console.log('[build-cloudflare] Successfully packaged frontend for Cloudflare Pages');
