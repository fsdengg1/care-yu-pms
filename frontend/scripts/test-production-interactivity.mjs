import { chromium } from 'playwright';

const BASE = process.env.TEST_BASE_URL || 'https://careyu-frontend.pages.dev';
const API = process.env.TEST_API_URL || 'https://careyu-backend-api.aicareyuautomation.workers.dev';

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage();
  const requests = [];
  page.on('request', (req) => {
    if (req.url().includes('/api/')) requests.push({ method: req.method(), url: req.url() });
  });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => logs.push(`[PAGE ERROR] ${err.message}`));

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 60000 });

  const proxyProbe = await page.evaluate(async () => {
    try {
      const r = await fetch('/api/health');
      const t = r.headers.get('content-type') || '';
      return { status: r.status, contentType: t, body: t.includes('json') ? await r.json() : await r.text().slice(0, 150) };
    } catch (e) {
      return { error: String(e) };
    }
  });
  console.log('Same-origin /api/health:', JSON.stringify(proxyProbe, null, 2));

  const directProbe = await page.evaluate(async (apiBase) => {
    try {
      const r = await fetch(`${apiBase}/api/health`);
      const t = r.headers.get('content-type') || '';
      return { status: r.status, contentType: t, body: t.includes('json') ? await r.json() : await r.text().slice(0, 150) };
    } catch (e) {
      return { error: String(e) };
    }
  }, API);
  console.log('Direct backend /api/health:', JSON.stringify(directProbe, null, 2));

  await page.fill('#work-email', 'robottech@careyu.ai');
  await page.fill('#password', 'wrong-password-xyz');
  requests.length = 0;
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4000);

  console.log('Login API requests:', JSON.stringify(requests, null, 2));
  const html = await page.content();
  const hasFormError = html.includes('auth-error') || html.includes('Invalid') || html.includes('Unable to sign in');
  console.log('Has error UI after bad login:', hasFormError);
  const visible = await page.locator('body').innerText();
  console.log('Visible text snippet:', visible.slice(0, 500).replace(/\s+/g, ' '));

  if (logs.length) {
    console.log('\nConsole:');
    logs.forEach((l) => console.log(l));
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
