import pg from 'pg';
import dns from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dns.setDefaultResultOrder('ipv4first');
const parsed = dotenv.parse(fs.readFileSync(new URL('../.env', import.meta.url)));
const url = (parsed.DATABASE_URL || '').replace(/^['"]|['"]$/g, '');
const u = new URL(url);
u.searchParams.delete('sslmode');
const pool = new pg.Pool({
  connectionString: u.toString(),
  ssl: { rejectUnauthorized: false },
  max: 1,
  connectionTimeoutMillis: 10000,
});

const DATE = '2026-09-15';
const apply = process.argv.includes('--apply');
const IDS = {
  aakash: 'u-tl-rob',
  arivan: 'u-1787905421223-82dt',
  arun: 'u-1787905150629-ltxa',
  kabitha: 'u-1787905026592-44qp',
  vanippriya: 'u-1787905545188-oeir',
  sabarigiri: 'u-1787907120388-z0af',
  shradha: 'u-1787905275968-f9dj',
};

const KEEP = [
  {
    id: 'task-action-aakash-4-way-shuttle',
    person: 'Mr. Aakash',
    personId: IDS.aakash,
    project: '4-Way Shuttle',
    taskDescription:
      'Shuttle integration with WCS – integration activities, communication/interface validation, testing and pending issues closure',
    status: 'In Progress',
    taskStatus: 'IN_PROGRESS',
    startDate: '07-09-2026',
    startDateIso: '2026-09-07',
    deadline: '24-09-2026',
    deadlineIso: '2026-09-24',
    progressPercent: 99,
    dependencyIds: [IDS.arun, IDS.arivan],
    dependencies: 'Mr. Arun, Mr. Arivan',
  },
  {
    id: 'task-1789043981956-q8pr',
    person: 'Mr. Aakash',
    personId: IDS.aakash,
    project: 'Maini precision',
    taskDescription: 'Complete costings for solution provided.',
    status: 'In Progress',
    taskStatus: 'IN_PROGRESS',
    startDate: '08-09-2026',
    startDateIso: '2026-09-08',
    deadline: '15-09-2026',
    deadlineIso: '2026-09-15',
    progressPercent: 10,
    dependencyIds: [IDS.arivan],
    dependencies: 'Mr. Arivan',
  },
  {
    id: 'task-action-aakash-hero-mainline-system-project-installation',
    person: 'Mr. Aakash',
    personId: IDS.aakash,
    project: 'Manikaran Power',
    taskDescription: 'Solution Drawing',
    status: 'In Progress',
    taskStatus: 'IN_PROGRESS',
    startDate: '10-09-2026',
    startDateIso: '2026-09-10',
    deadline: '17-09-2026',
    deadlineIso: '2026-09-17',
    progressPercent: 10,
    dependencyIds: [IDS.arivan],
    dependencies: 'Mr. Arivan',
  },
  {
    id: 'task-action-arun-wms-asrs',
    person: 'Mr. Arun',
    personId: IDS.arun,
    project: 'WMS – ASRS',
    taskDescription:
      'Review WMS–ASRS requirements, identify pending development/integration activities, complete implementation and testing actions',
    status: 'In Progress',
    taskStatus: 'IN_PROGRESS',
    startDate: '07-09-2026',
    startDateIso: '2026-09-07',
    deadline: '—',
    deadlineIso: null,
    progressPercent: 75,
    dependencyIds: [],
    dependencies: '—',
  },
  {
    id: 'task-action-kabitha-rack-configurator',
    person: 'Mrs. Kabitha',
    personId: IDS.kabitha,
    project: 'Rack Configurator',
    taskDescription: 'Getting feedback from the Sahay Team.',
    status: 'Yet to Start',
    taskStatus: 'TODO',
    startDate: '10-09-2026',
    startDateIso: '2026-09-10',
    deadline: '21-09-2026',
    deadlineIso: '2026-09-21',
    progressPercent: 0,
    dependencyIds: [IDS.sabarigiri],
    dependencies: 'Mr. Sabarigiri',
  },
  {
    id: 'task-action-kabitha-taskforge',
    person: 'Mrs. Kabitha',
    personId: IDS.kabitha,
    project: 'Taskforge',
    taskDescription: 'Working on the Production and Installation module',
    status: 'In Progress',
    taskStatus: 'IN_PROGRESS',
    startDate: '11-09-2026',
    startDateIso: '2026-09-11',
    deadline: '21-09-2026',
    deadlineIso: '2026-09-21',
    progressPercent: 76,
    dependencyIds: [IDS.sabarigiri],
    dependencies: 'Mr. Sabarigiri',
  },
  {
    id: 'task-1789456464388-1ywy',
    person: 'Mrs. Vanippriya',
    personId: IDS.vanippriya,
    project: 'KDDL',
    taskDescription: 'Working on the KDDL Project',
    status: 'In Progress',
    taskStatus: 'IN_PROGRESS',
    startDate: '10-09-2026',
    startDateIso: '2026-09-10',
    deadline: '21-09-2026',
    deadlineIso: '2026-09-21',
    progressPercent: 10,
    dependencyIds: [IDS.arivan, IDS.shradha],
    dependencies: 'Mr. Arivan, Mrs. Shradha',
  },
];

const HIDE_IDS = [
  'task-1789040544798-fezc',
  'task-action-vanippriya-auto-annotation-software',
  'task-action-vanippriya-hero-mainline-vision-action-items',
  'task-action-vanippriya-roca-2-fittings-defect-analysis',
  'task-action-kabitha-pms-integration',
  'task-1788871464840-srri',
  'task-1788871534651-xmfr',
];

const keepIds = new Set(KEEP.map((row) => row.id));
const API_BASE = 'https://careyu-backend-api.aicareyuautomation.workers.dev';

function overlayRow(existing, spec) {
  return {
    ...(existing || {}),
    id: spec.id,
    person: spec.person,
    personId: spec.personId,
    project: spec.project,
    taskDescription: spec.taskDescription,
    status: spec.status,
    startDate: spec.startDate,
    startDateIso: spec.startDateIso,
    deadline: spec.deadline,
    deadlineIso: spec.deadlineIso || undefined,
    progressPercent: spec.progressPercent,
    morningProgressPercent: spec.progressPercent,
    eveningProgressPercent: spec.progressPercent,
    morningStatus: spec.status,
    eveningStatus: spec.status,
    dependencyIds: spec.dependencyIds,
    dependencies: spec.dependencies,
    reasonForDelay: 'No delay',
    delayReasonRequired: false,
    overdue: false,
    sheetHidden: false,
    blocked: false,
    hoursWorked: 0,
    loggedHours: '0h 00m',
    workDate: DATE,
    currentDate: '15-09-2026',
    rowKind: 'task',
    taskType: 'PROJECT_TASK',
    isLeadTask: false,
    hasSubtasks: false,
    subtasks: [],
    isAdditional: false,
    eveningSubmitted: false,
    createdById: IDS.arivan,
    createdByName: 'Arivan',
  };
}

const backupDir = path.resolve('data/backups');
fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(backupDir, `backup_sep15_last_updates_${stamp}.json`);

const client = await pool.connect();
try {
  const tasksRes = await client.query(`SELECT * FROM tasks`);
  const metaRes = await client.query(
    `SELECT record_key, payload_type, payload FROM system_meta WHERE record_key IN ($1, $2, $3)`,
    [`dss:${DATE}:morning`, `dss:${DATE}:evening`, `morning-lock:${DATE}`]
  );
  fs.writeFileSync(
    backupPath,
    JSON.stringify({
      created_at: new Date().toISOString(),
      date: DATE,
      tasks: tasksRes.rows,
      snapshots: metaRes.rows,
    })
  );
  console.log('BACKUP_WRITTEN', backupPath);

  const morning = metaRes.rows.find((row) => row.record_key === `dss:${DATE}:morning`)?.payload || {};
  const existingRows = Array.isArray(morning.rows) ? morning.rows : [];
  const byId = new Map(existingRows.map((row) => [row.id, row]));
  const nextRows = KEEP.map((spec) => overlayRow(byId.get(spec.id), spec));

  console.log(
    'RESTORE_ROWS',
    nextRows.map((row) => ({ person: row.person, project: row.project, taskDescription: row.taskDescription, status: row.status }))
  );

  if (!apply) {
    console.log('DRY_RUN only. Re-run with --apply to write tasks + morning snapshot.');
  } else {
    const now = new Date().toISOString();
    for (const spec of KEEP) {
      const title = spec.taskDescription.slice(0, 120);
      const result = await client.query(
        `UPDATE tasks
         SET title = $1,
             description = $2,
             project_name = $3,
             status = $4,
             start_date = $5,
             due_date = $6,
             progress_percent = $7,
             progress_manual_override = true,
             depends_on_ids = $8::text[],
             depends_on_id = $9,
             assigned_to_id = $10,
             assigned_to = $11,
             responsible_user_id = $10,
             responsible_user_name = $11,
             delay_reason = NULL,
             sheet_hidden = false,
             updated_at = $12::timestamptz,
             last_update_at = $12::timestamptz
         WHERE record_key = $13`,
        [
          title,
          spec.taskDescription,
          spec.project,
          spec.taskStatus,
          spec.startDateIso,
          spec.deadlineIso,
          spec.progressPercent,
          spec.dependencyIds,
          spec.dependencyIds[0] || null,
          spec.personId,
          spec.person.replace(/^Mr\. |^Mrs\. /, ''),
          now,
          spec.id,
        ]
      );
      console.log('UPDATED_TASK', spec.id, result.rowCount);
    }

    for (const id of HIDE_IDS) {
      const result = await client.query(
        `UPDATE tasks SET sheet_hidden = true, updated_at = $1::timestamptz WHERE record_key = $2`,
        [now, id]
      );
      console.log('HIDDEN_TASK', id, result.rowCount);
    }

    for (const task of tasksRes.rows) {
      const id = task.record_key;
      if (keepIds.has(id) || HIDE_IDS.includes(id)) continue;
      await client.query(
        `UPDATE tasks SET sheet_hidden = true, updated_at = $1::timestamptz WHERE record_key = $2 AND coalesce(sheet_hidden, false) = false`,
        [now, id]
      );
    }

    const snapshotPayload = {
      date: DATE,
      period: 'morning',
      captured_at: now,
      captured_by: 'restore-sep15-last-updates',
      rows: nextRows,
    };
    await client.query(
      `UPDATE system_meta SET payload_type = 'DAILY_STATUS_SNAPSHOT', payload = $1::jsonb WHERE record_key = $2`,
      [JSON.stringify(snapshotPayload), `dss:${DATE}:morning`]
    );
    console.log('UPDATED_MORNING_SNAPSHOT', nextRows.length);
  }
} finally {
  client.release();
  await pool.end();
}

async function syncProduction() {
  if (!apply) return;
  const email = parsed.DEFAULT_PROJECT_MANAGER_EMAIL || 'robotlead1@careyu.ai';
  const password = parsed.DEMO_PASSWORD || parsed.ROBOT_LEAD_PASSWORD;
  if (!password) {
    console.log('SKIP_API_SYNC no password');
    return;
  }
  const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workEmail: email, password }),
  });
  const loginJson = await loginRes.json().catch(() => ({}));
  if (!loginRes.ok || !loginJson.token) {
    console.log('API_LOGIN_FAILED', loginRes.status, loginJson.message || loginJson.error || 'no token');
    return;
  }
  const token = loginJson.token;
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const call = async (method, pathname, body) => {
    const res = await fetch(`${API_BASE}${pathname}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    console.log('API', method, pathname, res.status, json.message || json.error || 'ok');
    return { res, json };
  };

  await call('POST', '/api/daily-status/morning-lock', { action: 'unlock', date: DATE });
  for (const spec of KEEP) {
    await call('PATCH', `/api/daily-status/rows/${spec.id}?date=${DATE}`, {
      work_date: DATE,
      period: 'morning',
      title: spec.taskDescription.slice(0, 120),
      description: spec.taskDescription,
      project_name: spec.project,
      status: spec.taskStatus,
      start_date: spec.startDateIso,
      due_date: spec.deadlineIso || '',
      progress_percent: spec.progressPercent,
      depends_on_ids: spec.dependencyIds,
      delay_reason: 'No delay',
      sheet_hidden: false,
    });
  }
  for (const id of HIDE_IDS) {
    await call('PATCH', `/api/daily-status/rows/${id}?date=${DATE}`, {
      work_date: DATE,
      sheet_hidden: true,
    });
  }
  await call('POST', '/api/daily-status/snapshot', { period: 'morning', date: DATE });
  await call('POST', '/api/daily-status/morning-lock', { action: 'lock', date: DATE });
  const sheet = await call('GET', `/api/daily-status/sheet?date=${DATE}&period=morning`);
  const rows = Array.isArray(sheet.json.rows) ? sheet.json.rows.filter((row) => !row.sheetHidden) : [];
  console.log(
    'API_SHEET',
    rows.map((row) => ({ person: row.person, project: row.project, task: String(row.taskDescription || '').slice(0, 80), status: row.status }))
  );
}

await syncProduction();
