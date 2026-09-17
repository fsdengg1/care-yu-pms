import { WorkAssignment } from './types';
import { isLeadBasedAssignment } from './leadTasks';
import { compareLeadNumber } from './leadPipelineDisplay';

export type WorkFilter = 'ALL' | 'OVERDUE' | 'TODAY' | 'UPCOMING' | 'COMPLETED';

export type AssignedWorkNode = {
  item?: WorkAssignment;
  contextTitle?: string;
  children: AssignedWorkNode[];
};

export type AssignedWorkGroup = {
  id: string;
  code: string;
  title: string;
  subtitle?: string;
  nodes: AssignedWorkNode[];
  taskCount: number;
  nested: boolean;
};

function assignmentKey(item: WorkAssignment) {
  return item.task_id || item.id;
}

export function matchesWorkFilter(item: WorkAssignment, filter: WorkFilter, today: string) {
  const done = item.current_status === 'COMPLETED' || item.current_status === 'DONE';
  if (filter === 'COMPLETED') return done;
  if (filter === 'OVERDUE') {
    return Boolean(item.due_date && item.due_date < today && !done && item.current_status !== 'PENDING_TL_REVIEW');
  }
  if (filter === 'TODAY') return item.due_date === today;
  if (filter === 'UPCOMING') return Boolean(item.due_date && item.due_date > today && !done);
  return true;
}

export function workGroupId(item: WorkAssignment) {
  return `lead:${item.lead_id || item.lead_number || item.lead_name || 'unlinked'}`;
}

export function workGroupLabel(item: WorkAssignment) {
  const code = item.lead_number || 'Lead';
  const name = item.customer_name || item.lead_name || item.project_name || 'Opportunity';
  const subtitle =
    item.lead_name && item.customer_name && item.lead_name !== item.customer_name ? item.lead_name : undefined;
  return { code, title: name, subtitle };
}

function buildTaskTree(items: WorkAssignment[]): AssignedWorkNode[] {
  const ids = new Set(items.map(assignmentKey));
  const childrenByParent = new Map<string, WorkAssignment[]>();
  const roots: WorkAssignment[] = [];
  const orphans: WorkAssignment[] = [];

  for (const item of items) {
    if (item.parent_task_id && ids.has(item.parent_task_id)) {
      const list = childrenByParent.get(item.parent_task_id) || [];
      list.push(item);
      childrenByParent.set(item.parent_task_id, list);
    } else if (item.parent_task_id) {
      orphans.push(item);
    } else {
      roots.push(item);
    }
  }

  const sortByDue = (a: WorkAssignment, b: WorkAssignment) => (a.due_date || '9999').localeCompare(b.due_date || '9999');
  roots.sort(sortByDue);

  const toChildNodes = (parentId: string): AssignedWorkNode[] =>
    (childrenByParent.get(parentId) || [])
      .slice()
      .sort(sortByDue)
      .map((child) => ({ item: child, children: [] }));

  const nodes: AssignedWorkNode[] = roots.map((item) => ({
    item,
    children: toChildNodes(assignmentKey(item)),
  }));

  const orphanGroups = new Map<string, WorkAssignment[]>();
  for (const item of orphans) {
    const key = item.parent_task_id || 'unknown';
    const list = orphanGroups.get(key) || [];
    list.push(item);
    orphanGroups.set(key, list);
  }
  for (const [, kids] of orphanGroups) {
    kids.sort(sortByDue);
    nodes.push({
      contextTitle: kids[0].parent_task_title || 'Parent task',
      children: kids.map((child) => ({ item: child, children: [] })),
    });
  }
  return nodes;
}

export function buildAssignedWorkGroups(assignments: WorkAssignment[], filter: WorkFilter, today: string): AssignedWorkGroup[] {
  const visible = assignments.filter(
    (item) =>
      isLeadBasedAssignment(item) &&
      item.acceptance_status !== 'REJECTED' &&
      item.acceptance_status !== 'REQUESTED' &&
      matchesWorkFilter(item, filter, today)
  );
  const groups = new Map<string, { meta: AssignedWorkGroup; items: WorkAssignment[] }>();

  for (const item of visible) {
    const id = workGroupId(item);
    const label = workGroupLabel(item);
    const existing = groups.get(id);
    if (existing) {
      existing.items.push(item);
      continue;
    }
    groups.set(id, {
      meta: {
        id,
        code: label.code,
        title: label.title,
        subtitle: label.subtitle,
        nodes: [],
        taskCount: 0,
        nested: false,
      },
      items: [item],
    });
  }

  return [...groups.values()]
    .map(({ meta, items }) => {
      const nodes = buildTaskTree(items);
      const nested = items.length > 1 || nodes.some((node) => !node.item || node.children.length > 0);
      return { ...meta, nodes, taskCount: items.length, nested };
    })
    .sort((a, b) => compareLeadNumber(a.code, b.code) || a.title.localeCompare(b.title));
}
