'use client';

import React, { useEffect, useState } from 'react';
import {
  Users,
  UserPlus,
  Search,
  Pencil,
  Trash2,
  Filter,
  X,
} from 'lucide-react';
import { StorageService } from '@/lib/storage';
import { directoryStatus, UsersApi } from '@/lib/usersApi';
import { Role, Team, User } from '@/lib/types';
import { resolveReportingManagerId } from '@/components/org/orgHierarchy';

const emptyForm = {
  name: '',
  email: '',
  phone: '',
  employee_id: '',
  role_id: '',
  team_id: '',
  reporting_manager_id: '',
  status: 'ACTIVE' as User['status'],
};

export default function UserManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [modal, setModal] = useState<'add' | 'edit' | null>(null);
  const [editing, setEditing] = useState<User | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const applyUsers = (next: User[]) => {
    setUsers(next);
    StorageService.saveUsers(next);
  };

  const load = async () => {
    const result = await UsersApi.list();
    if (result.ok) applyUsers(result.users);
    else applyUsers(StorageService.getUsers());
  };

  useEffect(() => {
    setCurrentUser(StorageService.getCurrentUser());
    setRoles(StorageService.getRoles());
    setTeams(StorageService.getTeams());
    void load();
  }, []);

  const openAdd = () => {
    setEditing(null);
    setForm({
      ...emptyForm,
      reporting_manager_id: resolveReportingManagerId('EMPLOYEE', users, false) || currentUser?.id || '',
    });
    setModal('add');
    setError(null);
  };

  const openEdit = (user: User) => {
    setEditing(user);
    setForm({
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      employee_id: user.employee_id,
      role_id: user.role_id,
      team_id: user.team_id || '',
      reporting_manager_id: user.reporting_manager_id || '',
      status: user.status,
    });
    setModal('edit');
    setError(null);
  };

  const saveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.role_id) {
      setError('Name, email, and role are required.');
      return;
    }
    setBusy(true);
    setError(null);
    const selectedRole = roles.find((item) => item.id === form.role_id);
    const payload = {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      employee_id: form.employee_id.trim() || undefined,
      role_id: form.role_id,
      team_id: form.team_id || null,
      reporting_manager_id:
        resolveReportingManagerId(selectedRole?.code || 'EMPLOYEE', users, Boolean(form.team_id)) ||
        form.reporting_manager_id ||
        null,
      status: form.status,
    };
    const result = editing
      ? await UsersApi.update(editing.id, payload)
      : await UsersApi.create(payload);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    applyUsers(result.data.users);
    setMessage(editing ? `${result.data.user.name} was updated.` : `${result.data.user.name} was added.`);
    setModal(null);
    setEditing(null);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    setError(null);
    const result = await UsersApi.remove(deleting.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      setDeleting(null);
      return;
    }
    applyUsers(result.data.users);
    setMessage(`${deleting.name} was deleted.`);
    setDeleting(null);
  };

  const pendingSignupCount = users.filter((user) => directoryStatus(user).pending).length;

  const filteredUsers = users
    .filter((user) => {
      const hay = `${user.name} ${user.email} ${user.employee_id}`.toLowerCase();
      const matchesSearch = hay.includes(search.toLowerCase());
      const matchesRole = roleFilter === 'ALL' || user.role_code === roleFilter;
      const status = directoryStatus(user);
      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'PENDING_SIGNUP' && status.pending) ||
        (statusFilter === 'ACTIVE' && status.key === 'ACTIVE') ||
        (statusFilter === 'INACTIVE' && status.key === 'INACTIVE');
      return matchesSearch && matchesRole && matchesStatus;
    })
    .sort((a, b) => {
      const pendingDelta = Number(directoryStatus(b).pending) - Number(directoryStatus(a).pending);
      if (pendingDelta !== 0) return pendingDelta;
      return a.name.localeCompare(b.name);
    });

  return (
    <div className="space-y-6 text-xs">
      <div className="flex flex-col items-start justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900 p-5 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
            <Users className="h-4 w-4" /> Enterprise User Directory
          </div>
          <h1 className="mt-1 text-xl font-bold text-slate-100">User & Employee Management</h1>
          <p className="mt-1 text-xs text-slate-400">
            Add employees, review signup requests, edit roles and teams, and remove users from the directory.
            {pendingSignupCount > 0 ? ` ${pendingSignupCount} signup request${pendingSignupCount === 1 ? '' : 's'} awaiting invitation or password setup.` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-medium text-white shadow-lg shadow-cyan-950/50 hover:bg-cyan-500"
        >
          <UserPlus className="h-4 w-4" /> Add Employee / User
        </button>
      </div>

      {message && (
        <div className="rounded-xl border border-emerald-900 bg-emerald-950/30 px-4 py-3 text-emerald-300">{message}</div>
      )}
      {error && !modal && (
        <div className="rounded-xl border border-rose-900 bg-rose-950/40 px-4 py-3 text-rose-300">{error}</div>
      )}

      <div className="flex flex-col items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/80 p-3 sm:flex-row">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or employee ID..."
            className="w-full rounded-md border border-slate-800 bg-slate-950 py-1.5 pl-9 pr-4 text-xs text-slate-200 placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
          />
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Filter className="h-4 w-4 text-slate-500" />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-md border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-300 focus:border-cyan-500 focus:outline-none"
          >
            <option value="ALL">All Roles ({users.length})</option>
            {roles.map((role) => (
              <option key={role.id} value={role.code}>{role.name}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-300 focus:border-cyan-500 focus:outline-none"
          >
            <option value="ALL">All statuses</option>
            <option value="PENDING_SIGNUP">Signup / pending ({pendingSignupCount})</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/90">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-950/80 text-[10px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="p-3">ID</th>
                <th className="p-3">Name</th>
                <th className="p-3">Email</th>
                <th className="p-3">Phone</th>
                <th className="p-3">Role</th>
                <th className="p-3">Status</th>
                <th className="p-3">Created at</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-xs text-slate-500">No matching users found in directory.</td>
                </tr>
              ) : (
                filteredUsers.map((user, index) => (
                  <tr key={user.id} className="transition-colors hover:bg-slate-800/40">
                    <td className="p-3 font-mono text-[11px] font-semibold text-cyan-400">{index + 1}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <div className="font-semibold text-slate-100">{user.name}</div>
                        {directoryStatus(user).pending && (
                          <span className="rounded border border-amber-800/60 bg-amber-950 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                            Signup
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-[11px] text-slate-400">{user.email}</td>
                    <td className="p-3 text-slate-400">{user.phone?.trim() || '—'}</td>
                    <td className="p-3">
                      <span className="rounded border border-cyan-800/60 bg-cyan-950 px-2 py-0.5 text-[10px] font-semibold text-cyan-300">
                        {user.role_name}
                      </span>
                    </td>
                    <td className="p-3">
                      {(() => {
                        const status = directoryStatus(user);
                        if (status.pending) {
                          return (
                            <span className="flex w-fit items-center gap-1 rounded border border-amber-800/60 bg-amber-950 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> {status.label}
                            </span>
                          );
                        }
                        if (status.key === 'ACTIVE') {
                          return (
                            <span className="flex w-fit items-center gap-1 rounded border border-emerald-800/60 bg-emerald-950 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Active
                            </span>
                          );
                        }
                        return (
                          <span className="flex w-fit items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-500" /> {status.label}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="p-3 text-slate-400">{(user.created_at || '').slice(0, 10) || '—'}</td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEdit(user)}
                          className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-[11px] font-medium text-slate-200 hover:border-cyan-700"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(user)}
                          disabled={user.id === currentUser?.id || user.role_code === 'CEO'}
                          className="inline-flex items-center gap-1 rounded border border-rose-900 px-2 py-1 text-[11px] font-medium text-rose-300 hover:bg-rose-950 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="flex items-center gap-2 text-base font-bold text-slate-100">
                {modal === 'add' ? <UserPlus className="h-4 w-4 text-cyan-400" /> : <Pencil className="h-4 w-4 text-cyan-400" />}
                {modal === 'add' ? 'Add Employee / User' : 'Edit / Update User'}
              </h3>
              <button type="button" onClick={() => setModal(null)} className="text-slate-400 hover:text-slate-200">
                <X className="h-4 w-4" />
              </button>
            </div>
            {error && <div className="rounded border border-rose-900 bg-rose-950/40 px-3 py-2 text-rose-300">{error}</div>}
            <form onSubmit={saveUser} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Full Name *</span>
                  <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Employee ID</span>
                  <input value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} placeholder="Auto if blank" className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Email *</span>
                  <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Phone</span>
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Assigned Role *</span>
                  <select required value={form.role_id} onChange={(e) => {
                    const role = roles.find((item) => item.id === e.target.value);
                    setForm({
                      ...form,
                      role_id: e.target.value,
                      reporting_manager_id: resolveReportingManagerId(role?.code || 'EMPLOYEE', users, Boolean(form.team_id)) || form.reporting_manager_id,
                    });
                  }} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500">
                    <option value="">Select Role...</option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>{role.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Functional Team</span>
                  <select value={form.team_id} onChange={(e) => {
                    const role = roles.find((item) => item.id === form.role_id);
                    setForm({
                      ...form,
                      team_id: e.target.value,
                      reporting_manager_id: resolveReportingManagerId(role?.code || 'EMPLOYEE', users, Boolean(e.target.value)) || form.reporting_manager_id,
                    });
                  }} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500">
                    <option value="">Unassigned</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>{team.name}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Reporting Manager</span>
                  <select value={form.reporting_manager_id} onChange={(e) => setForm({ ...form, reporting_manager_id: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500">
                    <option value="">None</option>
                    {users.filter((user) => user.id !== editing?.id && user.status === 'ACTIVE').map((user) => (
                      <option key={user.id} value={user.id}>{user.name} — {user.role_name}</option>
                    ))}
                  </select>
                </label>
                {modal === 'edit' && (
                  <label className="block">
                    <span className="mb-1 block font-medium text-slate-400">Status</span>
                    <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as User['status'] })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500">
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                    </select>
                  </label>
                )}
              </div>
              {modal === 'add' && (
                <p className="text-[11px] text-slate-500">New users sign in with this email and the shared demo password.</p>
              )}
              <div className="mt-4 flex justify-end gap-2 border-t border-slate-800 pt-3">
                <button type="button" onClick={() => setModal(null)} className="rounded bg-slate-800 px-3 py-1.5 font-medium text-slate-300 hover:bg-slate-700">
                  Cancel
                </button>
                <button type="submit" disabled={busy} className="rounded bg-cyan-600 px-4 py-1.5 font-medium text-white shadow hover:bg-cyan-500 disabled:opacity-50">
                  {modal === 'add' ? 'Add User' : 'Update User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleting && (
        <div className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="w-full max-w-md space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="text-base font-bold text-slate-100">Delete user</h3>
            <p className="text-slate-400">
              Remove <span className="font-semibold text-slate-100">{deleting.name}</span> ({deleting.employee_id}) from the directory? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDeleting(null)} className="rounded bg-slate-800 px-3 py-1.5 font-medium text-slate-300 hover:bg-slate-700">
                Cancel
              </button>
              <button type="button" disabled={busy} onClick={() => void confirmDelete()} className="rounded bg-rose-700 px-4 py-1.5 font-medium text-white hover:bg-rose-600 disabled:opacity-50">
                Delete User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
