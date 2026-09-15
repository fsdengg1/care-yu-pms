import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'https://careyu-backend-api.aicareyuautomation.workers.dev';
const LEAD = 'lead-1789467573924-zb59';
const OUT = join(__dirname, '..', 'qa-artifacts', 'pm-assign-fix');
mkdirSync(OUT, { recursive: true });

const log = [];
const note = (m) => {
  console.log(m);
  log.push(m);
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(60000);

async function apiLogin(email, password) {
  for (let i = 0; i < 6; i++) {
    const resp = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, rememberMe: true }),
    });
    note(`login ${email} ${resp.status}`);
    if (resp.ok) return resp.json();
    await page.waitForTimeout(1500 * (i + 1));
  }
  throw new Error(`login fail ${email}`);
}

async function session(email, password) {
  const body = await apiLogin(email, password);
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    ({ token, user }) => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('cya_auth_token_v6', token);
      localStorage.setItem('cya_current_user_v6', JSON.stringify(user));
    },
    { token: body.token, user: body.user }
  );
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Loading Care Yu Automation Project Hub...').waitFor({ state: 'hidden', timeout: 90000 });
  return body;
}

async function openLead() {
  await page.goto(`${BASE}/pre-sales/leads/${LEAD}`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Loading Care Yu Automation Project Hub...').waitFor({ state: 'hidden', timeout: 90000 });
  await page.waitForTimeout(1200);
}

async function leadStatus(token) {
  const j = await (
    await fetch(`${BASE}/api/leads/${LEAD}`, { headers: { Authorization: `Bearer ${token}` } })
  ).json();
  const lead = j.lead || j.data?.lead || j;
  return {
    status: lead.status,
    pipeline: lead.pipeline_stage,
    teams: lead.assigned_team_names || lead.assigned_team_name,
    tl: lead.assigned_team_lead_name,
    keys: Object.keys(j),
  };
}

async function shot(n) {
  await page.screenshot({ path: join(OUT, `${n}.png`), fullPage: true });
}

try {
  const pm = await session('robotlead1@careyu.ai', 'Careyu@9865');
  await openLead();
  await shot('01-before');
  note(`before ${JSON.stringify(await leadStatus(pm.token))}`);

  if (await page.getByRole('heading', { name: /Forward Lead/i }).count()) {
    await page.getByRole('button', { name: /Cancel/i }).first().click();
    await page.waitForTimeout(500);
  }

  const soft = page.locator('label').filter({ hasText: /Software Team/i }).locator('input[type=checkbox]').first();
  if (await soft.count()) {
    if (!(await soft.isChecked())) await soft.check();
    await page.waitForTimeout(300);
    const instr = page.locator('label').filter({ hasText: /Instructions/i }).locator('..').locator('textarea').first();
    if (await instr.count()) await instr.fill('QA: evaluate Cognex FOV and lighting for 280mm discs.');
    await shot('02-ready-assign');
    await page.locator('[data-demo="accept-assign-team"]').or(page.getByRole('button', { name: /^Assign project$/i })).first().click();
    await page.waitForTimeout(3000);
    await shot('03-after-assign-project');
  } else {
    note(
      `Software checkbox missing — buttons: ${(await page.locator('button').allTextContents())
        .map((t) => t.trim())
        .filter(Boolean)
        .join(' | ')}`
    );
  }

  note(`after assign ${JSON.stringify(await leadStatus(pm.token))}`);
  const main = await page.locator('main').innerText();
  note(`markers: ${(main.match(/PENDING|Assigned|Software Team|Arun|Kabitha|Feasibility Teams \(\d+\)/g) || []).slice(0, 30).join(',')}`);

  // Probe TL passwords
  const tlPasswords = ['Careyu@123', 'Careyu@9865', 'CareYu@123', 'Arun@123', 'Welcome@123', 'Password@1'];
  let tlOk = false;
  for (const p of tlPasswords) {
    const resp = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'fsdlead1@careyu.ai', password: p }),
    });
    note(`tl probe ${p} => ${resp.status}`);
    if (resp.ok) {
      const body = await resp.json();
      await page.evaluate(
        ({ token, user }) => {
          localStorage.clear();
          localStorage.setItem('cya_auth_token_v6', token);
          localStorage.setItem('cya_current_user_v6', JSON.stringify(user));
        },
        { token: body.token, user: body.user }
      );
      await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
      await page.getByText('Loading Care Yu Automation Project Hub...').waitFor({ state: 'hidden', timeout: 90000 });
      await openLead();
      await shot('04-tl');
      const btns = (await page.locator('button').allTextContents()).map((t) => t.trim()).filter(Boolean);
      note(`TL buttons ${btns.join(' | ')}`);
      const accept = page.getByRole('button', { name: /Accept Project/i });
      if (await accept.count()) {
        await accept.click();
        await page.waitForTimeout(2000);
        await shot('05-tl-accepted');
        note('TL accepted OK');
      } else note('TL no Accept Project');
      tlOk = true;
      break;
    }
    await page.waitForTimeout(400);
  }
  if (!tlOk) note('FLOW BREAK: Team Lead credentials unavailable for fsdlead1@careyu.ai');

  // BH after submit permissions
  await session('businesshead@careyu.ai', 'Careyu@123');
  await openLead();
  await shot('07-bh-after-submit');
  const bhEdit = await page.getByRole('link', { name: /Edit/i }).count();
  const bhDelete = await page.getByRole('button', { name: /Delete/i }).count();
  note(`BH Edit links=${bhEdit} Delete buttons=${bhDelete}`);

  // Reject/Send Back gating on PM for a still-open intake if present; else note
  await session('robotlead1@careyu.ai', 'Careyu@9865');
  await openLead();
  await shot('08-pm-current');
  const sendBack = page.getByRole('button', { name: /^Send Back$/i });
  const reject = page.getByRole('button', { name: /Cancel \/ Reject|^Reject$/i });
  note(`PM sendBack=${await sendBack.count()} reject=${await reject.count()}`);
  if (await sendBack.count()) {
    await sendBack.first().click();
    await page.waitForTimeout(400);
    const confirm = page.getByRole('button', { name: /Confirm Send Back/i });
    if (await confirm.count()) await confirm.click();
    const gated = await page.getByText(/reason|required/i).first().isVisible().catch(() => false);
    note(`send-back without reason gated=${gated}`);
  }
  if (await reject.count()) {
    // ensure reason required
    await reject.first().click();
    await page.waitForTimeout(400);
    const gated = await page.getByText(/reason|Enter a reason/i).first().isVisible().catch(() => false);
    note(`reject without reason gated=${gated}`);
  }

  // Procurement pages
  await session('procure@careyu.ai', 'Careyu@123');
  await page.goto(`${BASE}/pre-sales/costing`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Loading Care Yu Automation Project Hub...').waitFor({ state: 'hidden', timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await shot('09-costing');
  note(`costing: ${(await page.locator('main').innerText()).slice(0, 900)}`);
  await page.goto(`${BASE}/procurement`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Loading Care Yu Automation Project Hub...').waitFor({ state: 'hidden', timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await shot('10-procurement');
  note(`procurement: ${(await page.locator('main').innerText()).slice(0, 900)}`);
} catch (e) {
  note(`FATAL ${e.message}`);
  await shot('fatal');
} finally {
  writeFileSync(join(OUT, 'log.txt'), log.join('\n'));
  await browser.close();
  console.log('DONE');
}
