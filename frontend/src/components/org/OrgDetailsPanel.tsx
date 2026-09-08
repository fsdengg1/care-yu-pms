'use client';

import React from 'react';
import {
  Mail,
  Shield,
  Users,
  UserCheck,
  UserX,
  Pencil,
  Briefcase,
  Network,
  FolderKanban,
  CheckCircle2,
  Clock3,
  CircleDot,
} from 'lucide-react';
import { Team, User } from '@/lib/types';
import { getAccessScope, getDepartment } from './orgHierarchy';
import { directoryStatus } from '@/lib/usersApi';

interface PersonDetails {
  user: User;
  managerName: string;
  directReports: User[];
  teamMembers: User[];
}

interface TeamDetails {
  team: Team;
  leadName: string;
  members: User[];
  memberCount: number;
  reportsThrough: string;
  activeProjects: number;
  pendingTasks: number;
  completedTasks: number;
}

interface OrgDetailsPanelProps {
  person?: PersonDetails | null;
  team?: TeamDetails | null;
  canManage: boolean;
  onEditEmployee?: () => void;
  onAssignRole?: () => void;
  onAssignTeam?: () => void;
  onChangeManager?: () => void;
  onToggleStatus?: () => void;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-muted px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-card-foreground">{value || '—'}</div>
    </div>
  );
}

export default function OrgDetailsPanel({
  person,
  team,
  canManage,
  onEditEmployee,
  onAssignRole,
  onAssignTeam,
  onChangeManager,
  onToggleStatus,
}: OrgDetailsPanelProps) {
  if (!person && !team) {
    return (
      <aside className="flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2 text-foreground">
          <Network className="h-4 w-4" />
          <h2 className="text-sm font-bold">Details</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Select an employee or team in the hierarchy to review reporting lines and membership.
        </p>
      </aside>
    );
  }

  if (team) {
    return (
      <aside className="flex h-full flex-col rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border p-5">
          <div className="flex items-center gap-2 text-emerald-700">
            <Users className="h-4 w-4" />
            <span className="text-[11px] font-semibold uppercase tracking-wider">Team details</span>
          </div>
          <h2 className="mt-1 text-lg font-bold text-card-foreground">{team.team.name}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{team.team.description}</p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Team name" value={team.team.name} />
            <Field label="Team lead" value={team.leadName} />
            <Field label="Reports through" value={team.reportsThrough} />
            <Field label="Number of members" value={team.memberCount} />
            <Field
              label="Active projects"
              value={
                <span className="inline-flex items-center gap-1">
                  <FolderKanban className="h-3.5 w-3.5 text-blue-600" />
                  {team.activeProjects}
                </span>
              }
            />
            <Field
              label="Pending tasks"
              value={
                <span className="inline-flex items-center gap-1">
                  <Clock3 className="h-3.5 w-3.5 text-amber-600" />
                  {team.pendingTasks}
                </span>
              }
            />
            <Field
              label="Completed tasks"
              value={
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  {team.completedTasks}
                </span>
              }
            />
          </div>

          <div>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Team members
            </div>
            {team.members.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                No members assigned to this team yet.
              </div>
            ) : (
              <div className="space-y-2">
                {team.members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                  >
                    <div>
                      <div className="text-sm font-semibold text-card-foreground">{member.name}</div>
                      <div className="text-[11px] text-muted-foreground">{member.role_name}</div>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        directoryStatus(member).pending
                          ? 'bg-amber-50 text-amber-700'
                          : member.status === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {directoryStatus(member).label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>
    );
  }

  if (!person) return null;
  const { user, managerName, directReports, teamMembers } = person;

  return (
    <aside className="flex h-full flex-col rounded-2xl border border-border bg-card shadow-sm">
      <div className="border-b border-border p-5">
        <div className="flex items-center gap-2 text-blue-700">
          <UserCheck className="h-4 w-4" />
          <span className="text-[11px] font-semibold uppercase tracking-wider">Employee details</span>
        </div>
        <h2 className="mt-1 text-lg font-bold text-card-foreground">{user.name}</h2>
        <p className="text-xs text-muted-foreground">{user.employee_id}</p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        <div className="grid grid-cols-1 gap-2">
          <Field label="Employee name" value={user.name} />
          <Field label="Role" value={user.role_name} />
          <Field label="Department" value={getDepartment(user)} />
          <Field label="Reporting manager" value={managerName} />
          <Field label="Team" value={user.team_name || 'Not assigned'} />
          <Field
            label="Email"
            value={
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-slate-400" />
                {user.email}
              </span>
            }
          />
          <Field
            label="Status"
            value={
              <span
                className={`inline-flex items-center gap-1.5 ${
                  directoryStatus(user).pending
                    ? 'text-amber-700'
                    : user.status === 'ACTIVE'
                      ? 'text-emerald-700'
                      : 'text-slate-500'
                }`}
              >
                <CircleDot className="h-3.5 w-3.5" />
                {directoryStatus(user).label}
                {directoryStatus(user).pending ? ' · Signup' : ''}
              </span>
            }
          />
          <Field
            label="Access level"
            value={
              <span className="inline-flex items-start gap-1.5">
                <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
                <span>{getAccessScope(user.role_code, user.team_name)}</span>
              </span>
            }
          />
        </div>

        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Direct reports</div>
          {directReports.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
              No direct reports.
            </div>
          ) : (
            <div className="space-y-2">
              {directReports.map((report) => (
                <div key={report.id} className="rounded-lg border border-border px-3 py-2">
                  <div className="text-sm font-semibold text-card-foreground">{report.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {report.role_name}
                    {report.team_name ? ` · ${report.team_name}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {teamMembers.length > 0 && (
          <div>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Team members</div>
            <div className="space-y-2">
              {teamMembers.map((member) => (
                <div key={member.id} className="rounded-lg border border-border px-3 py-2">
                  <div className="text-sm font-semibold text-card-foreground">{member.name}</div>
                  <div className="text-[11px] text-muted-foreground">{member.role_name}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {canManage && (
          <div className="space-y-2 border-t border-border pt-4">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Actions</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onEditEmployee}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-card-foreground hover:bg-muted"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
              <button
                type="button"
                onClick={onAssignRole}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-card-foreground hover:bg-muted"
              >
                <Briefcase className="h-3.5 w-3.5" /> Assign role
              </button>
              <button
                type="button"
                onClick={onAssignTeam}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-card-foreground hover:bg-muted"
              >
                <Users className="h-3.5 w-3.5" /> Assign team
              </button>
              <button
                type="button"
                onClick={onChangeManager}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-card-foreground hover:bg-muted"
              >
                <Network className="h-3.5 w-3.5" /> Reporting
              </button>
              <button
                type="button"
                onClick={onToggleStatus}
                className={`col-span-2 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${
                  user.status === 'ACTIVE'
                    ? 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                    : 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                {user.status === 'ACTIVE' ? (
                  <>
                    <UserX className="h-3.5 w-3.5" /> Deactivate employee
                  </>
                ) : (
                  <>
                    <UserCheck className="h-3.5 w-3.5" /> Activate employee
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
