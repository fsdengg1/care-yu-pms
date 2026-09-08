'use client';

import React, { useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { StorageService } from '@/lib/storage';
import { LeaveApi, LeaveRequestRecord } from '@/lib/leaveApi';
import { User } from '@/lib/types';

const APPROVER_ROLES = new Set(['CEO', 'CTO', 'ENG_DIRECTOR', 'PROJECT_MANAGER', 'TEAM_LEAD', 'SYSTEM_ADMIN']);

export default function LeavePermissionPage() {
  const [user, setUser] = useState<User | null>(null);
  const [requests, setRequests] = useState<LeaveRequestRecord[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [kind, setKind] = useState<'LEAVE' | 'PERMISSION'>('LEAVE');
  const [leaveType, setLeaveType] = useState('Casual Leave');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [dayPortion, setDayPortion] = useState('FULL');
  const [fromTime, setFromTime] = useState('10:00');
  const [toTime, setToTime] = useState('12:00');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const canApprove = Boolean(user && APPROVER_ROLES.has(user.role_code));

  const load = async () => {
    const result = await LeaveApi.list();
    if (!result.ok) {
      setError(result.message || 'Unable to load leave requests.');
      return;
    }
    setRequests(result.data.requests);
    setLeaveTypes(result.data.leaveTypes);
  };

  useEffect(() => {
    const current = StorageService.getCurrentUser();
    if (!current) return;
    setUser(current);
    void load();
  }, []);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const result = await LeaveApi.create({
      kind,
      leave_type: leaveType,
      from_date: fromDate,
      to_date: kind === 'PERMISSION' ? fromDate : toDate || fromDate,
      day_portion: kind === 'PERMISSION' ? 'PERMISSION' : dayPortion,
      from_time: kind === 'PERMISSION' ? fromTime : undefined,
      to_time: kind === 'PERMISSION' ? toTime : undefined,
      reason,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message || 'Unable to submit request.');
      return;
    }
    setNotice(result.data.message);
    setReason('');
    await load();
  };

  if (!user) return null;

  return (
    <div className="space-y-4 text-xs">
      <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-cyan-400">
          <CalendarClock className="h-3.5 w-3.5" /> Leave & Permission
        </div>
        <h1 className="mt-1 text-lg font-bold text-slate-100">Time away from daily work</h1>
        <p className="mt-1 text-slate-400">Submit leave or permission. Approved full-day leave is treated as non-working time for daily updates and delay calculation. Project deadlines are not changed.</p>
      </div>
      {error && <div className="rounded-lg border border-rose-900 bg-rose-950/40 px-3 py-2 text-rose-300">{error}</div>}
      {notice && <div className="rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-emerald-200">{notice}</div>}

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <form
          className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="font-bold text-slate-100">New request</div>
          <label className="block text-slate-300">
            Type
            <select value={kind} onChange={(e) => setKind(e.target.value as 'LEAVE' | 'PERMISSION')} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100">
              <option value="LEAVE">Leave</option>
              <option value="PERMISSION">Permission</option>
            </select>
          </label>
          {kind === 'LEAVE' ? (
            <>
              <label className="block text-slate-300">
                Leave type
                <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100">
                  {(leaveTypes.length ? leaveTypes.filter((item) => item !== 'Permission') : ['Casual Leave', 'Sick Leave', 'Earned Leave', 'Other']).map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label className="block text-slate-300">
                From date
                <input type="date" required value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" />
              </label>
              <label className="block text-slate-300">
                To date
                <input type="date" required value={toDate} onChange={(e) => setToDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" />
              </label>
              <label className="block text-slate-300">
                Duration
                <select value={dayPortion} onChange={(e) => setDayPortion(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100">
                  <option value="FULL">Full day</option>
                  <option value="FIRST_HALF">First half</option>
                  <option value="SECOND_HALF">Second half</option>
                </select>
              </label>
            </>
          ) : (
            <>
              <label className="block text-slate-300">
                Date
                <input type="date" required value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-slate-300">
                  From time
                  <input type="time" required value={fromTime} onChange={(e) => setFromTime(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" />
                </label>
                <label className="block text-slate-300">
                  To time
                  <input type="time" required value={toTime} onChange={(e) => setToTime(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" />
                </label>
              </div>
            </>
          )}
          <label className="block text-slate-300">
            Reason
            <textarea required value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" />
          </label>
          <button type="submit" disabled={busy} className="w-full rounded-lg bg-cyan-600 px-3 py-2 font-bold text-white hover:bg-cyan-500 disabled:opacity-60">
            Submit request
          </button>
        </form>

        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
          <div className="border-b border-slate-800 px-4 py-3 font-bold text-slate-100">Requests</div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="bg-slate-950 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2">Kind</th>
                  <th className="px-3 py-2">Dates</th>
                  <th className="px-3 py-2">Reason</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((item) => (
                  <tr key={item.id} className="border-t border-slate-800">
                    <td className="px-3 py-2 text-slate-100">{item.user_name}</td>
                    <td className="px-3 py-2 text-slate-300">
                      {item.kind === 'PERMISSION' ? `Permission ${item.from_time || ''}–${item.to_time || ''}` : `${item.leave_type} (${item.day_portion.replaceAll('_', ' ').toLowerCase()})`}
                    </td>
                    <td className="px-3 py-2 text-slate-300">{item.from_date}{item.to_date !== item.from_date ? ` → ${item.to_date}` : ''}</td>
                    <td className="max-w-xs px-3 py-2 text-slate-400">{item.reason}</td>
                    <td className="px-3 py-2 font-semibold text-slate-200">{item.status}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {item.status === 'PENDING' && canApprove && (item.user_id !== user.id || user.role_code === 'CEO' || user.role_code === 'SYSTEM_ADMIN') && (
                          <>
                            <button type="button" className="rounded border border-emerald-700 px-2 py-1 text-emerald-300" onClick={() => void LeaveApi.decide(item.id, 'APPROVED').then(load)}>Approve</button>
                            <button type="button" className="rounded border border-rose-700 px-2 py-1 text-rose-300" onClick={() => void LeaveApi.decide(item.id, 'REJECTED').then(load)}>Reject</button>
                          </>
                        )}
                        {item.status === 'PENDING' && item.user_id === user.id && (
                          <button type="button" className="rounded border border-slate-600 px-2 py-1 text-slate-300" onClick={() => void LeaveApi.cancel(item.id).then(load)}>Cancel</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {requests.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">No leave or permission requests yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
