'use client';

import React, { useEffect, useState } from 'react';
import { X, UserPlus, Pencil } from 'lucide-react';
import { Role, Team, User } from '@/lib/types';
import { resolveReportingManagerId } from './orgHierarchy';

export type EmployeeModalMode = 'add' | 'edit' | 'role' | 'team' | 'manager';

interface EmployeeForm {
  name: string;
  email: string;
  phone: string;
  employee_id: string;
  role_id: string;
  team_id: string;
  reporting_manager_id: string;
  status: 'ACTIVE' | 'INACTIVE';
}

interface EmployeeActionModalProps {
  open: boolean;
  mode: EmployeeModalMode;
  roles: Role[];
  teams: Team[];
  users: User[];
  employee?: User | null;
  onClose: () => void;
  onSubmit: (form: EmployeeForm) => void;
}

const EMPTY_FORM: EmployeeForm = {
  name: '',
  email: '',
  phone: '',
  employee_id: '',
  role_id: '',
  team_id: '',
  reporting_manager_id: '',
  status: 'ACTIVE',
};

const TITLES: Record<EmployeeModalMode, string> = {
  add: 'Add employee',
  edit: 'Edit employee',
  role: 'Assign role',
  team: 'Assign team',
  manager: 'Change reporting manager',
};

export default function EmployeeActionModal({
  open,
  mode,
  roles,
  teams,
  users,
  employee,
  onClose,
  onSubmit,
}: EmployeeActionModalProps) {
  const [form, setForm] = useState<EmployeeForm>(EMPTY_FORM);

  useEffect(() => {
    if (!open) return;
    if (employee) {
      setForm({
        name: employee.name,
        email: employee.email,
        phone: employee.phone || '',
        employee_id: employee.employee_id,
        role_id: employee.role_id,
        team_id: employee.team_id || '',
        reporting_manager_id: employee.reporting_manager_id || '',
        status: employee.status,
      });
    } else {
      const pm = users.find((user) => user.role_code === 'PROJECT_MANAGER' && user.status === 'ACTIVE');
      setForm({ ...EMPTY_FORM, reporting_manager_id: pm?.id || '' });
    }
  }, [open, employee, users]);

  if (!open) return null;

  const showProfile = mode === 'add' || mode === 'edit';
  const showRole = mode === 'add' || mode === 'edit' || mode === 'role';
  const showTeam = mode === 'add' || mode === 'edit' || mode === 'team';
  const showManager = mode === 'add' || mode === 'edit' || mode === 'manager';
  const managers = users.filter((u) => u.id !== employee?.id && u.status === 'ACTIVE');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (showProfile && (!form.name || !form.email)) return;
    if (showRole && !form.role_id) return;
    onSubmit(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B1F3A]/50 p-4 backdrop-blur-sm">
      <div className="surface-light w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="flex items-center gap-2 text-base font-bold text-card-foreground">
            {mode === 'add' ? <UserPlus className="h-4 w-4 text-blue-600" /> : <Pencil className="h-4 w-4 text-blue-600" />}
            {TITLES[mode]}
          </h3>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 p-5 text-xs">
          {showProfile && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="font-medium text-slate-600">Full name *</span>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-[#0B1F3A] outline-none focus:border-blue-500"
                  />
                </label>
                <label className="space-y-1">
                  <span className="font-medium text-slate-600">Employee ID</span>
                  <input
                    value={form.employee_id}
                    onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-[#0B1F3A] outline-none focus:border-blue-500"
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="font-medium text-slate-600">Email *</span>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-[#0B1F3A] outline-none focus:border-blue-500"
                  />
                </label>
                <label className="space-y-1">
                  <span className="font-medium text-slate-600">Phone</span>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-[#0B1F3A] outline-none focus:border-blue-500"
                  />
                </label>
              </div>
            </>
          )}

          {showRole && (
            <label className="block space-y-1">
              <span className="font-medium text-slate-600">Role *</span>
              <select
                required
                value={form.role_id}
                onChange={(e) => {
                  const role = roles.find((item) => item.id === e.target.value);
                  setForm({
                    ...form,
                    role_id: e.target.value,
                    reporting_manager_id:
                      resolveReportingManagerId(role?.code || 'EMPLOYEE', users, Boolean(form.team_id)) ||
                      form.reporting_manager_id,
                  });
                }}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-[#0B1F3A] outline-none focus:border-blue-500"
              >
                <option value="">Select role</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {showTeam && (
            <label className="block space-y-1">
              <span className="font-medium text-slate-600">Team</span>
              <select
                value={form.team_id}
                onChange={(e) => {
                  const role = roles.find((item) => item.id === form.role_id);
                  setForm({
                    ...form,
                    team_id: e.target.value,
                    reporting_manager_id:
                      resolveReportingManagerId(role?.code || 'EMPLOYEE', users, Boolean(e.target.value)) ||
                      form.reporting_manager_id,
                  });
                }}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-[#0B1F3A] outline-none focus:border-blue-500"
              >
                <option value="">Unassigned</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {showManager && (
            <label className="block space-y-1">
              <span className="font-medium text-slate-600">Reporting manager</span>
              <select
                value={form.reporting_manager_id}
                onChange={(e) => setForm({ ...form, reporting_manager_id: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-[#0B1F3A] outline-none focus:border-blue-500"
              >
                <option value="">Select manager</option>
                {managers.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.name} — {manager.role_name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {mode === 'edit' && (
            <label className="block space-y-1">
              <span className="font-medium text-slate-600">Status</span>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as 'ACTIVE' | 'INACTIVE' })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-[#0B1F3A] outline-none focus:border-blue-500"
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </label>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-[#0B1F3A] px-4 py-2 font-semibold text-white hover:bg-[#132a4d]"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export type { EmployeeForm };
