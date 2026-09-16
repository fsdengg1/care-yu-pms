import '../src/config/env.js';
import { initStore, shutdownStore, store } from '../src/store/db.js';

async function main() {
  await initStore();
  const tasks = store.getTasks();
  console.log('tasks', tasks.length);
  const roots = tasks.filter((t) => !t.parent_task_id);
  const hidden = tasks.filter((t) => t.sheet_hidden);
  const done = tasks.filter((t) => t.status === 'DONE');
  console.log('roots', roots.length, 'hidden', hidden.length, 'done', done.length);
  for (const task of tasks.slice(0, 40)) {
    console.log(
      [
        task.id,
        task.status,
        task.task_type,
        task.parent_task_id ? 'child' : 'root',
        task.sheet_hidden ? 'hidden' : 'vis',
        `lead=${task.lead_id || '-'}`,
        `proj=${task.project_id || task.project_name || '-'}`,
        `assignee=${task.assigned_to || task.assigned_to_id}`,
        (task.title || '').slice(0, 60),
      ].join(' | ')
    );
  }
  const updates = store.getDailyUpdates().filter((u) => u.work_date === '2026-09-15' || u.work_date === '2026-09-16');
  console.log('updates 15/16', updates.length);
  const grouped = new Map<string, string[]>();
  for (const item of updates) {
    const key = `${item.user_name || item.user_id} | ${(item.task_title || item.task_id || '').slice(0, 40)}`;
    const line = `${item.work_date} ${item.period || item.update_type || '?'} hours=${item.hours_worked} "${(item.work_completed || '').slice(0, 80)}"`;
    grouped.set(key, [...(grouped.get(key) || []), line]);
  }
  for (const [key, lines] of grouped) {
    console.log('---', key);
    for (const line of lines) console.log('   ', line);
  }
  const byDate: Record<string, number> = {};
  for (const u of store.getDailyUpdates()) {
    byDate[u.work_date] = (byDate[u.work_date] || 0) + 1;
  }
  console.log('updates by date', byDate);
  console.log('projects', store.getProjects().length);
  await shutdownStore();
}

main().catch(async (error) => {
  console.error(error);
  await shutdownStore().catch(() => undefined);
  process.exit(1);
});
