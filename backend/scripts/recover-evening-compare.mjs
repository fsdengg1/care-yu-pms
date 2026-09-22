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

function isHoursShell(update, masterText) {
  const text = String(update.work_completed || '').trim();
  if (!text) return true;
  const summary = String(update.summary || '');
  if (!/via Daily Work Updates/i.test(summary)) return false;
  return norm(text) === norm(masterText);
}

const DATE = '2026-09-03';
const apply = process.argv.includes('--apply');
const backupDir = path.resolve('data/backups');
fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(backupDir, `backup_compare_fix_${stamp}.json`);

const client = await pool.connect();
try {
  const tasksRes = await client.query(`SELECT * FROM tasks`);
  const updatesRes = await client.query(`SELECT * FROM daily_updates`);
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
  console.log('BACKUP_COUNTS', { tasks: tasksRes.rows.length, daily_updates: updatesRes.rows.length, snapshots: metaRes.rows.length });

  const morning = metaRes.rows.find((row) => row.record_key === `dss:${DATE}:morning`)?.payload;
  const evening = metaRes.rows.find((row) => row.record_key === `dss:${DATE}:evening`)?.payload;
  const morningRows = Array.isArray(morning?.rows) ? morning.rows : [];
  const eveningRows = Array.isArray(evening?.rows) ? evening.rows : [];
  const eveningById = new Map(eveningRows.map((row) => [row.id, row]));

  const plan = [];
  for (const morningRow of morningRows) {
    const task = tasksRes.rows.find((row) => row.record_key === morningRow.id);
    if (!task) continue;
    const master = String(morningRow.taskDescription || task.description || task.title || '').trim();
    const eveningRow = eveningById.get(morningRow.id);
    const snapEveningText = String(eveningRow?.taskDescription || '').trim();
    const existing = updatesRes.rows.filter(
      (row) =>
        row.work_date === DATE &&
        (row.task_id === morningRow.id || row.assignment_id === morningRow.id) &&
        (row.period === 'evening' || row.update_type === 'EVENING')
    );
    const genuine = existing.find((row) => !isHoursShell(row, master) && String(row.work_completed || '').trim());
    const recoveredText =
      genuine?.work_completed?.trim() ||
      (snapEveningText && norm(snapEveningText) !== norm(master) ? snapEveningText : '');
    const currentDesc = String(task.description || '').trim();
    const eveningLikeCurrent =
      Boolean(snapEveningText) &&
      Boolean(currentDesc) &&
      (norm(currentDesc) === norm(snapEveningText) ||
        norm(snapEveningText).includes(norm(currentDesc)) ||
        norm(currentDesc).includes(norm(snapEveningText)));
    const descOverwritten = Boolean(master) && norm(currentDesc) !== norm(master) && eveningLikeCurrent;

    plan.push({
      task_id: morningRow.id,
      person: morningRow.person,
      personId: morningRow.personId || task.assigned_to_id,
      project: morningRow.project,
      master,
      current_task_description: task.description,
      snap_evening: snapEveningText,
      existing_evening_ids: existing.map((row) => row.record_key),
      genuine_evening: genuine ? genuine.work_completed : null,
      recover_evening: recoveredText || null,
      restore_description: Boolean(descOverwritten || (recoveredText && norm(task.description) === norm(recoveredText) && norm(task.description) !== norm(master))),
    });
  }

  console.log('RECOVERY_PLAN', JSON.stringify(plan, null, 2));

  if (!apply) {
    console.log('DRY_RUN only. Re-run with --apply to persist recovered Evening updates and restore master descriptions.');
  } else {

  for (const item of plan) {
    if (item.restore_description && item.master) {
      const title = item.master.slice(0, 120);
      await client.query(
        `UPDATE tasks SET description = $1, title = $2 WHERE record_key = $3`,
        [item.master, title, item.task_id]
      );
      console.log('RESTORED_DESCRIPTION', item.task_id);
    }
    if (!item.recover_evening || item.genuine_evening) continue;
    const hoursExisting = updatesRes.rows.find(
      (row) =>
        row.work_date === DATE &&
        (row.task_id === item.task_id || row.assignment_id === item.task_id) &&
        (row.period === 'evening' || row.update_type === 'EVENING')
    );
    const now = new Date().toISOString();
    if (hoursExisting) {
      await client.query(
        `UPDATE daily_updates
         SET work_completed = $1,
             update_type = 'EVENING',
             period = 'evening',
             summary = $2,
             updated_at = $3::timestamptz
         WHERE record_key = $4`,
        [item.recover_evening, item.recover_evening, now, hoursExisting.record_key]
      );
      console.log('UPDATED_EVENING', hoursExisting.record_key, item.task_id);
    } else {
      const recordKey = `upd-recover-${DATE}-${item.task_id}-evening`;
      const user = await client.query(`SELECT user_key, name, role, team_id, team_name FROM users WHERE user_key = $1`, [item.personId]);
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
           'SUBMITTED',$11,ARRAY[]::text[],0,0,
           'evening','EVENING',$12::timestamptz,$12::timestamptz,$12::timestamptz
         )
         ON CONFLICT (record_key) DO UPDATE SET
           work_completed = EXCLUDED.work_completed,
           update_type = 'EVENING',
           period = 'evening',
           summary = EXCLUDED.summary,
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
          item.master.slice(0, 120),
          DATE,
          item.recover_evening,
          now,
        ]
      );
      console.log('INSERTED_EVENING', recordKey);
    }
  }
  console.log('APPLY_DONE');
  }
} finally {
  client.release();
  await pool.end();
}
