import { apiRequest } from './api';

export type LeaveRequestRecord = {
  id: string;
  user_id: string;
  user_name: string;
  kind: 'LEAVE' | 'PERMISSION';
  leave_type: string;
  from_date: string;
  to_date: string;
  day_portion: 'FULL' | 'FIRST_HALF' | 'SECOND_HALF' | 'PERMISSION';
  from_time?: string;
  to_time?: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  approver_name?: string;
  decided_by_name?: string;
  decision_comment?: string;
  created_at: string;
};

export const LeaveApi = {
  async list(query?: { userId?: string; status?: string; from?: string; to?: string }) {
    const params = new URLSearchParams();
    if (query?.userId) params.set('userId', query.userId);
    if (query?.status) params.set('status', query.status);
    if (query?.from) params.set('from', query.from);
    if (query?.to) params.set('to', query.to);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<{ requests: LeaveRequestRecord[]; leaveTypes: string[] }>(`/api/leave-requests${suffix}`);
  },
  async create(body: Record<string, unknown>) {
    return apiRequest<{ request: LeaveRequestRecord; message: string }>('/api/leave-requests', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  async decide(id: string, status: 'APPROVED' | 'REJECTED', comment?: string) {
    return apiRequest<{ request: LeaveRequestRecord; message: string }>(`/api/leave-requests/${id}/decide`, {
      method: 'POST',
      body: JSON.stringify({ status, comment }),
    });
  },
  async cancel(id: string) {
    return apiRequest<{ request: LeaveRequestRecord; message: string }>(`/api/leave-requests/${id}/cancel`, {
      method: 'POST',
    });
  },
};
