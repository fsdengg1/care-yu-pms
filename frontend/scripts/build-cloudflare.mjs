import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outDir = path.join(root, '.cloudflare-out');
const nextServerApp = path.join(root, '.next', 'server', 'app');
const nextStatic = path.join(root, '.next', 'static');
const publicDir = path.join(root, 'public');

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

copyDir(nextStatic, path.join(outDir, '_next', 'static'));
copyDir(publicDir, outDir);

function processHtmlDir(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destName = entry.isDirectory() ? entry.name : entry.name.replace(/\.html$/, '');
    if (destName === 'favicon.ico') continue;
    if (entry.isDirectory()) {
      processHtmlDir(srcPath, path.join(destDir, entry.name));
    } else if (entry.name === 'index.html') {
      fs.copyFileSync(srcPath, path.join(destDir, 'index.html'));
    } else if (entry.name.endsWith('.html')) {
      const pageDir = path.join(destDir, destName);
      fs.mkdirSync(pageDir, { recursive: true });
      fs.copyFileSync(srcPath, path.join(pageDir, 'index.html'));
    }
  }
}

processHtmlDir(nextServerApp, outDir);

const mediaDir = path.join(nextStatic, 'media');
if (fs.existsSync(mediaDir)) {
  const favicon = fs.readdirSync(mediaDir).find((name) => name.startsWith('favicon') && name.endsWith('.ico'));
  if (favicon) {
    fs.copyFileSync(path.join(mediaDir, favicon), path.join(outDir, 'favicon.ico'));
  }
}

if (!fs.existsSync(path.join(outDir, 'login', 'index.html'))) {
  console.warn('[build-cloudflare] WARNING: login/index.html missing!');
}

const apiOrigin = (
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.CLOUDFLARE_API_ORIGIN ||
  'https://careyu-backend-api.aicareyuautomation.workers.dev'
).replace(/\/$/, '');

const redirects = [
  `/api/*  ${apiOrigin}/api/:splat  200`,
  '/_next/static/*  /_next/static/:splat  200',
  '/assets/*  /assets/:splat  200',
  '/projects/:id/activity  /projects/active/index.html  200',
  '/projects/:id  /projects/active/index.html  200',
  '/daily-updates/:id  /daily-updates/index.html  200',
  '/pre-sales/leads/:id  /pre-sales/leads/index.html  200',
  '/dashboard/ceo/escalations/:id  /dashboard/ceo/escalations/index.html  200',
  '/*  /login/index.html  200',
].join('\n') + '\n';
fs.writeFileSync(path.join(outDir, '_redirects'), redirects, 'utf8');

const headers = [
  '/_next/static/*',
  '  Cache-Control: public, max-age=31536000, immutable',
  '',
  '/_next/static/chunks/*.js',
  '  Content-Type: application/javascript; charset=UTF-8',
  '  X-Content-Type-Options: nosniff',
  '',
  '/_next/static/chunks/*.css',
  '  Content-Type: text/css; charset=UTF-8',
  '',
  '/_next/static/css/*',
  '  Content-Type: text/css; charset=UTF-8',
  '',
  '/_next/static/media/*',
  '  Cache-Control: public, max-age=31536000, immutable',
  '  Access-Control-Allow-Origin: *',
].join('\n') + '\n';
fs.writeFileSync(path.join(outDir, '_headers'), headers, 'utf8');

const countHtml = (dir) => {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) n += countHtml(path.join(dir, e.name));
    else if (e.name === 'index.html') n++;
  }
  return n;
};
console.log('[build-cloudflare] Packaged', countHtml(outDir), 'pages into directory/index.html structure');
console.log('[build-cloudflare] Successfully packaged frontend for Cloudflare Pages into .cloudflare-out');
