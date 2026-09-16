import '../src/config/env.js';
import { flushStore, initStore, shutdownStore, store } from '../src/store/db.js';

function leadSequence(leadNumber: string): number | null {
  const matches = String(leadNumber || '').match(/(\d+)/g);
  if (!matches?.length) return null;
  return Number(matches[matches.length - 1]);
}

async function main() {
  await initStore();
  const leads = store.getLeads();
  console.log(`leads total: ${leads.length}`);
  for (const lead of [...leads].sort((a, b) => (a.lead_number || '').localeCompare(b.lead_number || ''))) {
    console.log(`${lead.lead_number}\t${lead.id}\t${lead.customer_name || lead.title || ''}\t${lead.status}`);
  }

  const keep = leads.filter((lead) => {
    const seq = leadSequence(lead.lead_number);
    return seq != null && seq >= 1 && seq <= 8;
  });
  const keepIds = new Set(keep.map((lead) => lead.id));
  const remove = leads.filter((lead) => !keepIds.has(lead.id));
  const removeIds = new Set(remove.map((lead) => lead.id));
  const removeNumbers = new Set(remove.map((lead) => lead.lead_number));

  console.log(`keeping: ${keep.length}`);
  console.log(`removing: ${remove.length}`);
  for (const lead of remove) {
    console.log(`DELETE ${lead.lead_number} ${lead.id} ${lead.customer_name || lead.title || ''}`);
  }

  const projects = store.getProjects();
  const removeProjects = projects.filter((project) => {
    if (project.lead_id && !keepIds.has(project.lead_id)) return true;
    if (project.lead_number && removeNumbers.has(project.lead_number)) return true;
    return false;
  });
  const removeProjectIds = new Set(removeProjects.map((project) => project.id));

  const tasks = store.getTasks();
  const removeTasks = tasks.filter(
    (task) =>
      (task.lead_id && !keepIds.has(task.lead_id)) ||
      (task.project_id && removeProjectIds.has(task.project_id))
  );
  const removeTaskIds = new Set(removeTasks.map((task) => task.id));

  store.saveLeads(keep);
  store.saveProjects(projects.filter((project) => !removeProjectIds.has(project.id)));
  store.saveTasks(tasks.filter((task) => !removeTaskIds.has(task.id) && !(task.parent_task_id && removeTaskIds.has(task.parent_task_id))));
  store.saveDailyUpdates(
    store.getDailyUpdates().filter(
      (item) =>
        !(item.lead_id && !keepIds.has(item.lead_id)) &&
        !(item.task_id && removeTaskIds.has(item.task_id)) &&
        !(item.project_id && removeProjectIds.has(item.project_id))
    )
  );
  store.saveLeadDocuments(store.getLeadDocuments().filter((item) => keepIds.has(item.lead_id)));
  store.saveLeadComments(store.getLeadComments().filter((item) => keepIds.has(item.lead_id)));
  store.saveLeadActivities(store.getLeadActivities().filter((item) => keepIds.has(item.lead_id)));
  store.saveLeadStatusHistory(store.getLeadStatusHistory().filter((item) => keepIds.has(item.lead_id)));
  store.saveFeasibilityTeamAssignments(store.getFeasibilityTeamAssignments().filter((item) => keepIds.has(item.lead_id)));
  store.saveFeasibilityEmployeeAllocations(store.getFeasibilityEmployeeAllocations().filter((item) => keepIds.has(item.lead_id)));
  store.saveProjectPhases(store.getProjectPhases().filter((item) => !removeProjectIds.has(item.project_id)));
  store.saveEntityDocuments(
    store.getEntityDocuments().filter((item) => {
      if (item.entity_type === 'LEAD') return keepIds.has(item.entity_id);
      const entityId = String(item.entity_id || '');
      return !removeProjectIds.has(entityId) && !removeTaskIds.has(entityId);
    })
  );
  store.saveStageTransitions(
    store.getStageTransitions().filter((item) => {
      if (item.lead_id && !keepIds.has(item.lead_id)) return false;
      if (item.project_id && removeProjectIds.has(item.project_id)) return false;
      return true;
    })
  );
  store.saveNotifications(
    store.getNotifications().filter((item) => {
      const entityId = String(item.entity_id || '');
      return !removeIds.has(entityId) && !removeProjectIds.has(entityId) && !removeTaskIds.has(entityId);
    })
  );
  store.saveEscalations(
    store.getEscalations().filter((item) => !(item.project_id && removeProjectIds.has(item.project_id)))
  );

  await flushStore();
  console.log(`remaining leads: ${store.getLeads().length}`);
  console.log(`remaining projects: ${store.getProjects().length}`);
  console.log(`remaining tasks: ${store.getTasks().length}`);
  await shutdownStore();
}

main().catch(async (error) => {
  console.error(error);
  await shutdownStore().catch(() => undefined);
  process.exit(1);
});
