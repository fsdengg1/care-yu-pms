import { store } from '../store/db.js';
import { LeaveRequest, LeaveRequestStatus, User } from '../types.js';
import { hasPermission } from './rbac.js';
import { formatEmployeeDisplayName } from './people.js';
import { enumerateDates, isCompanyLeaveDay } from './workCalendar.js';

export const LEAVE_TYPES = [
  'Casual Leave',
  'Sick Leave',
  'Earned Leave',
  'Permission',
  'Other',
] as const;

function newId() {
  return `leave-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function allLeave(): LeaveRequest[] {
  return store.getLeaveRequests();
}

export function canApproveLeave(actor: User, request: LeaveRequest) {
  if (actor.role_code === 'SYSTEM_ADMIN') return true;
  if (actor.id === request.user_id && actor.role_code !== 'CEO') return false;
  if (['CEO', 'CTO', 'ENG_DIRECTOR', 'PROJECT_MANAGER'].includes(actor.role_code)) return true;
  if (request.approver_id && request.approver_id === actor.id) return true;
  const employee = store.findUserById(request.user_id);
  if (!employee) return false;
  if (employee.reporting_manager_id === actor.id) return true;
  if (employee.team_lead_id === actor.id) return true;
  if (actor.role_code === 'TEAM_LEAD' && employee.team_id && employee.team_id === actor.team_id) return true;
  return hasPermission(actor, 'manage:users');
}

export function canViewLeave(actor: User, request: LeaveRequest) {
  if (actor.id === request.user_id) return true;
  if (canApproveLeave(actor, request)) return true;
  return ['CEO', 'CTO', 'ENG_DIRECTOR', 'PROJECT_MANAGER', 'SYSTEM_ADMIN', 'BUSINESS_HEAD'].includes(actor.role_code);
}

function defaultApprover(employee: User): { id?: string; name?: string } {
  const manager =
    (employee.reporting_manager_id && store.findUserById(employee.reporting_manager_id)) ||
    (employee.team_lead_id && store.findUserById(employee.team_lead_id));
  if (manager) return { id: manager.id, name: formatEmployeeDisplayName(manager) };
  const pm = store.getUsers().find((user) => user.role_code === 'PROJECT_MANAGER' && user.status === 'ACTIVE');
  return pm ? { id: pm.id, name: formatEmployeeDisplayName(pm) } : {};
}

export function listLeaveRequests(actor: User, filters?: { userId?: string; status?: string; from?: string; to?: string }) {
  return allLeave()
    .filter((item) => canViewLeave(actor, item))
    .filter((item) => (filters?.userId ? item.user_id === filters.userId : true))
    .filter((item) => (filters?.status ? item.status === filters.status : true))
    .filter((item) => {
      if (!filters?.from && !filters?.to) return true;
      const from = filters.from || '0000-01-01';
      const to = filters.to || '9999-12-31';
      return item.to_date >= from && item.from_date <= to;
    })
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

export function createLeaveRequest(actor: User, body: Record<string, unknown>) {
  const kind = String(body.kind || '').toLowerCase() === 'permission' ? 'PERMISSION' : 'LEAVE';
  const targetId = String(body.user_id || actor.id);
  if (targetId !== actor.id && !['PROJECT_MANAGER', 'TEAM_LEAD', 'SYSTEM_ADMIN', 'ENG_DIRECTOR'].includes(actor.role_code)) {
    return { error: 'You can only submit leave for yourself.', status: 403 as const };
  }
  const employee = store.findUserById(targetId);
  if (!employee) return { error: 'Employee was not found.', status: 404 as const };

  const fromDate = String(body.from_date || body.date || '').slice(0, 10);
  const toDate = String(body.to_date || fromDate).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate) || toDate < fromDate) {
    return { error: 'Enter a valid from/to date.', status: 400 as const };
  }
  const reason = String(body.reason || '').trim();
  if (!reason) return { error: 'Reason is required.', status: 400 as const };

  let dayPortion: LeaveRequest['day_portion'] = 'FULL';
  if (kind === 'PERMISSION') dayPortion = 'PERMISSION';
  else if (String(body.day_portion || '').toUpperCase() === 'FIRST_HALF') dayPortion = 'FIRST_HALF';
  else if (String(body.day_portion || '').toUpperCase() === 'SECOND_HALF') dayPortion = 'SECOND_HALF';
  else if (String(body.half_day || '') === 'true' || String(body.duration || '').toLowerCase() === 'half day') {
    dayPortion = String(body.half_which || '').toUpperCase() === 'SECOND_HALF' ? 'SECOND_HALF' : 'FIRST_HALF';
  }

  const fromTime = kind === 'PERMISSION' ? String(body.from_time || '').trim() : undefined;
  const toTime = kind === 'PERMISSION' ? String(body.to_time || '').trim() : undefined;
  if (kind === 'PERMISSION' && (!fromTime || !toTime)) {
    return { error: 'Permission requests need from time and to time.', status: 400 as const };
  }

  const approver = defaultApprover(employee);
  const now = new Date().toISOString();
  const request: LeaveRequest = {
    id: newId(),
    user_id: employee.id,
    user_name: formatEmployeeDisplayName(employee),
    kind,
    leave_type: kind === 'PERMISSION' ? 'Permission' : String(body.leave_type || 'Casual Leave'),
    from_date: fromDate,
    to_date: kind === 'PERMISSION' ? fromDate : toDate,
    day_portion: dayPortion,
    from_time: fromTime,
    to_time: toTime,
    reason,
    attachment_url: String(body.attachment_url || '').trim() || undefined,
    status: 'PENDING',
    approver_id: approver.id,
    approver_name: approver.name,
    created_at: now,
    updated_at: now,
  };
  const next = [request, ...allLeave()];
  store.saveLeaveRequests(next);
  return { request };
}

export function decideLeaveRequest(actor: User, id: string, status: LeaveRequestStatus, comment?: string) {
  const items = allLeave();
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return { error: 'not_found' as const, status: 404 as const };
  const current = items[index];
  if (!canApproveLeave(actor, current)) return { error: 'You cannot approve this request.', status: 403 as const };
  if (current.status !== 'PENDING') return { error: 'Only pending requests can be decided.', status: 400 as const };
  if (status !== 'APPROVED' && status !== 'REJECTED') return { error: 'Invalid decision.', status: 400 as const };
  const now = new Date().toISOString();
  const next: LeaveRequest = {
    ...current,
    status,
    decision_comment: comment?.trim() || undefined,
    decided_by_id: actor.id,
    decided_by_name: formatEmployeeDisplayName(actor),
    decided_at: now,
    updated_at: now,
  };
  items[index] = next;
  store.saveLeaveRequests(items);
  return { request: next };
}

export function cancelLeaveRequest(actor: User, id: string) {
  const items = allLeave();
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return { error: 'not_found' as const, status: 404 as const };
  const current = items[index];
  if (current.user_id !== actor.id && actor.role_code !== 'SYSTEM_ADMIN') {
    return { error: 'You can only cancel your own request.', status: 403 as const };
  }
  if (current.status === 'REJECTED' || current.status === 'CANCELLED') {
    return { error: 'This request cannot be cancelled.', status: 400 as const };
  }
  const now = new Date().toISOString();
  const next: LeaveRequest = { ...current, status: 'CANCELLED', updated_at: now };
  items[index] = next;
  store.saveLeaveRequests(items);
  return { request: next };
}

export function approvedLeaveOnDate(userId: string, date: string) {
  return allLeave().filter(
    (item) =>
      item.user_id === userId &&
      item.status === 'APPROVED' &&
      item.kind === 'LEAVE' &&
      item.from_date <= date &&
      item.to_date >= date
  );
}

export function approvedPermissionOnDate(userId: string, date: string) {
  return allLeave().filter(
    (item) =>
      item.user_id === userId &&
      item.status === 'APPROVED' &&
      item.kind === 'PERMISSION' &&
      item.from_date <= date &&
      item.to_date >= date
  );
}

export function fullDayLeaveOnDate(userId: string, date: string) {
  return approvedLeaveOnDate(userId, date).some((item) => item.day_portion === 'FULL');
}

export function leaveNonWorkingDays(userId: string, from: string, to: string) {
  const days = new Set<string>();
  for (const item of allLeave()) {
    if (item.user_id !== userId || item.status !== 'APPROVED' || item.kind !== 'LEAVE') continue;
    if (item.day_portion !== 'FULL') continue;
    const start = item.from_date > from ? item.from_date : from;
    const end = item.to_date < to ? item.to_date : to;
    for (const day of enumerateDates(start, end)) {
      if (!isCompanyLeaveDay(day)) days.add(day);
    }
  }
  return days;
}

export function leaveAndPermissionStats(userId: string, from: string, to: string) {
  const leaveDays = new Set<string>();
  const permissionDays = new Set<string>();
  for (const item of allLeave()) {
    if (item.user_id !== userId || item.status !== 'APPROVED') continue;
    const start = item.from_date > from ? item.from_date : from;
    const end = item.to_date < to ? item.to_date : to;
    if (end < start) continue;
    for (const day of enumerateDates(start, end)) {
      if (item.kind === 'PERMISSION') permissionDays.add(day);
      else if (item.day_portion === 'FULL') {
        if (!isCompanyLeaveDay(day)) leaveDays.add(day);
      } else leaveDays.add(`${day}:${item.day_portion}`);
    }
  }
  const fullLeave = [...leaveDays].filter((value) => !value.includes(':')).length;
  const halfLeave = [...leaveDays].filter((value) => value.includes(':')).length;
  return {
    leaveDays: fullLeave + halfLeave * 0.5,
    permissionDays: permissionDays.size,
    fullLeaveDates: new Set([...leaveDays].filter((value) => !value.includes(':'))),
    permissionDates: permissionDays,
  };
}

export function attendanceForUsers(userIds: string[], date: string) {
  return userIds.map((userId) => {
    const user = store.findUserById(userId);
    const leaves = approvedLeaveOnDate(userId, date);
    const permissions = approvedPermissionOnDate(userId, date);
    const full = leaves.find((item) => item.day_portion === 'FULL');
    const half = leaves.find((item) => item.day_portion === 'FIRST_HALF' || item.day_portion === 'SECOND_HALF');
    const permission = permissions[0];
    return {
      personId: userId,
      person: formatEmployeeDisplayName(user || userId),
      onLeave: Boolean(full),
      halfDay: full ? undefined : half?.day_portion,
      leaveReason: (full || half)?.reason,
      leaveType: (full || half)?.leave_type,
      permission: permission
        ? { fromTime: permission.from_time, toTime: permission.to_time, reason: permission.reason }
        : undefined,
    };
  });
}
