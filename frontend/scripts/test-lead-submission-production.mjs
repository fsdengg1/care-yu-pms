/**
 * Production smoke test: login + lead API reachability.
 * Usage: node scripts/test-lead-submission-production.mjs
 * Env: TEST_BASE_URL, TEST_EMAIL, TEST_PASSWORD
 */
import { chromium } from 'playwright';

const BASE = process.env.TEST_BASE_URL || 'https://careyu-frontend.pages.dev';
const API = 'https://careyu-backend-api.aicareyuautomation.workers.dev';
const EMAIL = process.env.TEST_EMAIL || 'fsdengg1@careyu.ai';
const PASSWORD = process.env.TEST_PASSWORD || 'Careyu@123';

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[PAGE ERROR] ${e.message}`));

  console.log('Logging in...');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.fill('#work-email', EMAIL);
  await page.fill('#password', PASSWORD);

  const loginReq = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/auth/login')) loginReq.push(r.url());
  });
  await page.click('button[type="submit"]');
  await page.waitForTimeout(8000);

  console.log('Login API URL:', loginReq[0] || '(none)');
  console.log('After login URL:', page.url());

  const token = await page.evaluate(() => localStorage.getItem('cya_auth_token_v6') || localStorage.getItem('cya_auth_token'));
  console.log('Auth token stored:', Boolean(token));

  if (!token) {
    console.log('Login failed — cannot test lead submission');
    logs.slice(0, 20).forEach((l) => console.log(l));
    await browser.close();
    process.exit(1);
  }

  console.log('Opening lead create page...');
  await page.goto(`${BASE}/pre-sales/leads/create`, { waitUntil: 'networkidle', timeout: 90000 });
  const bodyText = await page.locator('body').innerText();
  console.log('Create page has Submit to PM:', bodyText.includes('Submit to PM'));
  console.log('Create page loading state:', bodyText.includes('Loading lead form'));

  const apiProbe = await page.evaluate(async (apiBase) => {
    const r = await fetch(`${apiBase}/api/leads`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('cya_auth_token_v6') || localStorage.getItem('cya_auth_token') || ''}` },
    });
    const t = r.headers.get('content-type') || '';
    return { status: r.status, type: t, ok: r.ok, sample: t.includes('json') ? Object.keys(await r.json()) : (await r.text()).slice(0, 100) };
  }, API);
  console.log('Direct leads API probe:', JSON.stringify(apiProbe, null, 2));

  const sameOriginProbe = await page.evaluate(async () => {
    const r = await fetch('/api/leads', {
      headers: { Authorization: `Bearer ${localStorage.getItem('cya_auth_token_v6') || localStorage.getItem('cya_auth_token') || ''}` },
    });
    const t = r.headers.get('content-type') || '';
    return { status: r.status, type: t, sample: t.includes('json') ? 'json' : (await r.text()).slice(0, 80) };
  });
  console.log('Same-origin /api/leads probe:', JSON.stringify(sameOriginProbe, null, 2));

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
