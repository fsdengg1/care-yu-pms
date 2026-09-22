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

function norm(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function sameText(a, b) {
  const compact = (value) =>
    norm(value)
      .replace(/[.,;:]+$/g, '')
      .replace(/\s+/g, ' ');
  return compact(a) === compact(b);
}

function formatLoggedHours(hours) {
  const value = Math.max(0, Number(hours) || 0);
  const whole = Math.floor(value);
  const mins = Math.min(59, Math.round((value - whole) * 60));
  return `${whole}h ${String(mins).padStart(2, '0')}m`;
}

function isHoursShell(update, masterText) {
  const text = String(update?.work_completed || '').trim();
  if (!text) return true;
  const summary = String(update?.summary || '');
  if (!/via Daily Work Updates/i.test(summary)) return false;
  return norm(text) === norm(masterText);
}

const DATE = '2026-09-04';
const apply = process.argv.includes('--apply');
const backupDir = path.resolve('data/backups');
fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(backupDir, `backup_sep4_evening_restore_${stamp}.json`);

const client = await pool.connect();
try {
  const tasksRes = await client.query(`SELECT * FROM tasks`);
  const updatesRes = await client.query(`SELECT * FROM daily_updates WHERE work_date = $1`, [DATE]);
  const metaRes = await client.query(
    `SELECT record_key, payload_type, payload FROM system_meta WHERE record_key IN ($1, $2)`,
    [`dss:${DATE}:morning`, `dss:${DATE}:evening`]
  );
  const backup = {
    created_at: new Date().toISOString(),
    date: DATE,
    tasks: tasksRes.rows,
    daily_updates: updatesRes.rows,
    snapshots: metaRes.rows,
  };
  fs.writeFileSync(backupPath, JSON.stringify(backup));
  console.log('BACKUP_WRITTEN', backupPath);

  const morning = metaRes.rows.find((row) => row.record_key === `dss:${DATE}:morning`)?.payload;
  const eveningExisting = metaRes.rows.find((row) => row.record_key === `dss:${DATE}:evening`)?.payload;
  const morningRows = Array.isArray(morning?.rows) ? morning.rows : [];
  console.log('MORNING_ROWS', morningRows.length, 'EXISTING_EVENING', Boolean(eveningExisting));

  const plan = [];
  const eveningRows = [];
  const extraMorningRows = [];
  const knownIds = new Set();

  for (const morningRow of morningRows) {
    const task = tasksRes.rows.find((row) => row.record_key === morningRow.id);
    const master = String(morningRow.taskDescription || task?.description || task?.title || '').trim();
    const currentDesc = String(task?.description || '').trim();
    const eveningUpdates = updatesRes.rows.filter(
      (row) =>
        (row.task_id === morningRow.id || row.assignment_id === morningRow.id) &&
        (row.period === 'evening' || row.update_type === 'EVENING')
    );
    const latestEvening = eveningUpdates
      .slice()
      .sort((a, b) => String(b.updated_at || b.submitted_at || '').localeCompare(String(a.updated_at || a.submitted_at || '')))[0];
    const genuine = eveningUpdates.find((row) => !isHoursShell(row, master) && String(row.work_completed || '').trim());
    const descLooksEvening =
      Boolean(currentDesc) && Boolean(master) && !sameText(currentDesc, master);
    const genuineDistinct =
      genuine?.work_completed?.trim() && !sameText(genuine.work_completed, master)
        ? genuine.work_completed.trim()
        : '';

    const recoveredText = genuineDistinct || (descLooksEvening ? currentDesc : '');

    const hours = Math.max(0, Number(latestEvening?.hours_worked) || Number(morningRow.hoursWorked) || 0);
    const status = latestEvening?.work_status
      ? latestEvening.work_status === 'COMPLETED'
        ? 'Completed'
        : latestEvening.work_status === 'BLOCKED'
          ? 'Waiting'
          : latestEvening.work_status === 'HOLD'
            ? 'Hold'
            : latestEvening.work_status === 'NOT_STARTED'
              ? 'Yet to Start'
              : 'In Progress'
      : morningRow.status;

    const eveningRow = {
      ...morningRow,
      taskDescription: recoveredText || '',
      currentUpdate: recoveredText || '',
      status,
      hoursWorked: hours,
      loggedHours: formatLoggedHours(hours),
      progressPercent:
        latestEvening?.progress_percent != null
          ? Number(latestEvening.progress_percent)
          : morningRow.progressPercent,
      reasonForDelay: latestEvening?.blocker || morningRow.reasonForDelay,
      workDate: DATE,
      latestUpdateAt: latestEvening?.updated_at || latestEvening?.submitted_at || morningRow.latestUpdateAt,
    };
    eveningRows.push(eveningRow);
    knownIds.add(morningRow.id);

    plan.push({
      task_id: morningRow.id,
      person: morningRow.person,
      personId: morningRow.personId || task?.assigned_to_id,
      project: morningRow.project,
      master,
      current_task_description: currentDesc,
      hours,
      status,
      genuine_evening: genuineDistinct || null,
      latest_evening_id: latestEvening?.record_key || null,
      latest_evening_text: latestEvening?.work_completed || null,
      recover_evening: recoveredText || null,
      restore_description: descLooksEvening,
    });
  }

  const extraTaskIds = [
    ...new Set(
      updatesRes.rows
        .map((row) => row.task_id || row.assignment_id)
        .filter((id) => id && !knownIds.has(id))
    ),
  ];
  for (const taskId of extraTaskIds) {
    const task = tasksRes.rows.find((row) => row.record_key === taskId);
    if (!task) continue;
    const eveningUpdates = updatesRes.rows.filter(
      (row) =>
        (row.task_id === taskId || row.assignment_id === taskId) &&
        (row.period === 'evening' || row.update_type === 'EVENING')
    );
    const morningUpdates = updatesRes.rows.filter(
      (row) =>
        (row.task_id === taskId || row.assignment_id === taskId) &&
        (row.period === 'morning' || row.update_type === 'MORNING')
    );
    if (!eveningUpdates.length && !morningUpdates.length) continue;
    const latestEvening = eveningUpdates
      .slice()
      .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))[0];
    const latestMorning = morningUpdates
      .slice()
      .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))[0];
    const template = morningRows[0] || {};
    const master = String(task.description || task.title || '').trim();
    const recoveredText = String(latestEvening?.work_completed || '').trim();
    const hours = Math.max(0, Number(latestEvening?.hours_worked) || 0);
    const personId = task.assigned_to_id || latestEvening?.user_id || latestMorning?.user_id;
    const person = latestEvening?.user_name || latestMorning?.user_name || task.assigned_to_name || '';
    const extraMorning = {
      ...template,
      id: taskId,
      personId,
      person: person.startsWith('Mr.') || person.startsWith('Mrs.') ? person : person,
      project: task.project_name || latestEvening?.project_name || latestMorning?.project_name || '—',
      taskDescription: master,
      currentUpdate: '',
      hoursWorked: Math.max(0, Number(latestMorning?.hours_worked) || 0),
      loggedHours: formatLoggedHours(Number(latestMorning?.hours_worked) || 0),
      workDate: DATE,
    };
    extraMorningRows.push(extraMorning);
    eveningRows.push({
      ...extraMorning,
      taskDescription: recoveredText && !sameText(recoveredText, master) ? recoveredText : '',
      currentUpdate: recoveredText && !sameText(recoveredText, master) ? recoveredText : '',
      hoursWorked: hours,
      loggedHours: formatLoggedHours(hours),
      latestUpdateAt: latestEvening?.updated_at || latestMorning?.updated_at,
    });
    plan.push({
      task_id: taskId,
      person,
      personId,
      project: extraMorning.project,
      master,
      current_task_description: master,
      hours,
      status: extraMorning.status,
      genuine_evening: recoveredText && !sameText(recoveredText, master) ? recoveredText : null,
      latest_evening_id: latestEvening?.record_key || null,
      latest_evening_text: latestEvening?.work_completed || null,
      recover_evening: recoveredText && !sameText(recoveredText, master) ? recoveredText : null,
      restore_description: false,
      extra_row: true,
    });
  }

  console.log('RECOVERY_PLAN', JSON.stringify(plan, null, 2));
  console.log('EVENING_ROW_COUNT', eveningRows.length);
  console.log('WITH_EVENING_TEXT', plan.filter((item) => item.recover_evening).length);
  console.log('DESC_OVERWRITTEN', plan.filter((item) => item.restore_description).length);

  if (!apply) {
    console.log('DRY_RUN only. Re-run with --apply to persist evening snapshot and recovered updates.');
  } else {
    const now = new Date().toISOString();

    for (const item of plan) {
      if (item.restore_description && item.master) {
        const title = item.master.slice(0, 120);
        await client.query(`UPDATE tasks SET description = $1, title = $2, updated_at = $3::timestamptz WHERE record_key = $4`, [
          item.master,
          title,
          now,
          item.task_id,
        ]);
        console.log('RESTORED_DESCRIPTION', item.task_id);
      }

      if (!item.recover_evening) continue;
      if (item.genuine_evening && norm(item.genuine_evening) === norm(item.recover_evening)) continue;

      if (item.latest_evening_id) {
        await client.query(
          `UPDATE daily_updates
           SET work_completed = $1,
               update_type = 'EVENING',
               period = 'evening',
               summary = $1,
               submission_status = 'SUBMITTED',
               updated_at = $2::timestamptz
           WHERE record_key = $3`,
          [item.recover_evening, now, item.latest_evening_id]
        );
        console.log('UPDATED_EVENING', item.latest_evening_id, item.task_id);
      } else {
        const recordKey = `upd-restore-${DATE}-${item.task_id}-evening`;
        const user = await client.query(`SELECT user_key, name, role, team_id, team_name FROM users WHERE user_key = $1`, [
          item.personId,
        ]);
        const urow = user.rows[0] || {};
        await client.query(
          `INSERT INTO daily_updates (
             record_key, user_id, user_name, user_role, team_id, team_name,
             assignment_id, assignment_source, task_id, project_name, customer_name,
             task_title, work_date, work_completed, work_status, next_plan,
             submission_status, summary, attachments, progress_percent, hours_worked,
             period, update_type, submitted_at, created_at, updated_at
           ) VALUES (
             $1,$2,$3,$4,$5,$6,
             $7,'TASK',$7,$8,'',
             $9,$10,$11,'IN_PROGRESS','—',
             'SUBMITTED',$11,ARRAY[]::text[],0,$12,
             'evening','EVENING',$13::timestamptz,$13::timestamptz,$13::timestamptz
           )
           ON CONFLICT (record_key) DO UPDATE SET
             work_completed = EXCLUDED.work_completed,
             update_type = 'EVENING',
             period = 'evening',
             summary = EXCLUDED.summary,
             hours_worked = EXCLUDED.hours_worked,
             updated_at = EXCLUDED.updated_at`,
          [
            recordKey,
            item.personId,
            urow.name || item.person,
            urow.role || '',
            urow.team_id || null,
            urow.team_name || null,
            item.task_id,
            item.project || '—',
            (item.master || '').slice(0, 120),
            DATE,
            item.recover_evening,
            item.hours || 0,
            now,
          ]
        );
        console.log('INSERTED_EVENING', recordKey);
      }
    }

    const snapshotPayload = {
      date: DATE,
      period: 'evening',
      captured_at: now,
      captured_by: 'restore-sep4-evening',
      rows: eveningRows,
    };
    const existingSnap = await client.query(`SELECT record_key FROM system_meta WHERE record_key = $1`, [`dss:${DATE}:evening`]);
    if (existingSnap.rows.length) {
      await client.query(`UPDATE system_meta SET payload_type = 'DAILY_STATUS_SNAPSHOT', payload = $1::jsonb WHERE record_key = $2`, [
        JSON.stringify(snapshotPayload),
        `dss:${DATE}:evening`,
      ]);
      console.log('UPDATED_EVENING_SNAPSHOT', eveningRows.length);
    } else {
      await client.query(
        `INSERT INTO system_meta (record_key, payload_type, payload) VALUES ($1, 'DAILY_STATUS_SNAPSHOT', $2::jsonb)`,
        [`dss:${DATE}:evening`, JSON.stringify(snapshotPayload)]
      );
      console.log('INSERTED_EVENING_SNAPSHOT', eveningRows.length);
    }

    if (extraMorningRows.length) {
      const morningPayload = {
        ...(morning || {}),
        date: DATE,
        period: 'morning',
        rows: [...morningRows, ...extraMorningRows],
      };
      await client.query(`UPDATE system_meta SET payload = $1::jsonb WHERE record_key = $2`, [
        JSON.stringify(morningPayload),
        `dss:${DATE}:morning`,
      ]);
      console.log('APPENDED_MORNING_SNAPSHOT', extraMorningRows.length);
    }
    console.log('APPLY_DONE');
  }
} finally {
  client.release();
  await pool.end();
}
