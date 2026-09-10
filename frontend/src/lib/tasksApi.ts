import { apiRequest } from './api';
import { Task, TaskComment, WorkAssignment } from './types';

export interface CreateTaskPayload {
  title: string;
  description?: string;
  task_type: 'PROJECT_TASK' | 'NON_PROJECT_TASK' | 'LEAD_TASK';
  project_id?: string;
  assigned_to_id?: string;
  assigned_to_ids?: string[];
  start_date?: string;
  due_date?: string;
  priority?: string;
  depends_on_id?: string;
  depends_on_ids?: string[];
  is_additional?: boolean;
  period?: 'morning' | 'evening';
  work_date?: string;
  status?: string;
  project_name?: string;
  parent_task_id?: string;
  lead_id?: string;
  acceptance_status?: 'REQUESTED' | 'ACCEPTED' | 'REJECTED';
  requested_from_task_id?: string;
  progress_percent?: number;
}

export const TasksApi = {
  async mine() {
    const result = await apiRequest<{ assignments: WorkAssignment[] }>('/api/tasks?mine=1');
    if (!result.ok) return [] as WorkAssignment[];
    return result.data.assignments;
  },

  async create(body: CreateTaskPayload) {
    return apiRequest<{ task: Task }>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async update(
    id: string,
    body: Omit<Partial<Task>, 'status'> & {
      review_action?: 'approve' | 'return' | 'resubmit';
      review_comments?: string;
      status?: string;
      depends_on_ids?: string[];
    }
  ) {
    return apiRequest<{ task: Task }>(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  async bulkDelete(ids: string[]) {
    return apiRequest<{ deleted: number; ids: string[]; message: string }>('/api/tasks/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  },

  async comment(id: string, comment: string) {
    return apiRequest<{ task: Task; comment: TaskComment }>(`/api/tasks/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    });
  },

  async accept(id: string) {
    return apiRequest<{ task: Task; message: string }>(`/api/tasks/${id}/accept`, { method: 'POST', body: '{}' });
  },

  async reject(id: string, reason?: string) {
    return apiRequest<{ task: Task; message: string }>(`/api/tasks/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  async requestDependency(body: {
    from_task_id: string;
    assigned_to_id: string;
    title: string;
    description?: string;
    due_date?: string;
  }) {
    return apiRequest<{ task: Task }>('/api/tasks/dependency-request', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
};
