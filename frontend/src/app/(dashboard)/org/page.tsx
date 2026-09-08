'use client';

import React, { useEffect, useState } from 'react';
import {
  Building2,
  Plus,
  Users,
  UserCheck,
} from 'lucide-react';
import { StorageService } from '@/lib/storage';
import { Role, Team, User } from '@/lib/types';
import OrgChart from '@/components/org/OrgChart';
import OrgDetailsPanel from '@/components/org/OrgDetailsPanel';
import EmployeeActionModal, {
  EmployeeForm,
  EmployeeModalMode,
} from '@/components/org/EmployeeActionModal';
import { ORG_ADMIN_ROLES, MANAGEMENT_ROLES, getDirectReports, isDisplayedTeamMember, resolveReportingManagerId } from '@/components/org/orgHierarchy';
import { UsersApi } from '@/lib/usersApi';
import { apiRequest } from '@/lib/api';

type Selection =
  | { kind: 'person'; nodeId: string; userId: string; reportingContextId?: string }
  | { kind: 'team'; nodeId: string; teamId: string }
  | null;

export default function OrganizationManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<EmployeeModalMode>('add');
  const [teamStats, setTeamStats] = useState<
    Record<string, { activeProjects: number; pendingTasks: number; completedTasks: number }>
  >({});

  const reload = async () => {
    const listed = await UsersApi.list();
    const nextUsers = listed.ok ? listed.users : StorageService.getUsers();
    if (listed.ok) StorageService.saveUsers(nextUsers);
    const teamsResult = await apiRequest<{ teams: Team[] }>('/api/teams');
    const nextTeams = teamsResult.ok ? teamsResult.data.teams : StorageService.getTeams();
    if (teamsResult.ok) StorageService.saveTeams(nextTeams);
    setUsers(nextUsers);
    setTeams(nextTeams);
    setRoles(StorageService.getRoles());
    setCurrentUser(StorageService.getCurrentUser());

    const assignments = StorageService.getFeasibilityTeamAssignments();
    const tasks = StorageService.getTasks();
    const stats: Record<string, { activeProjects: number; pendingTasks: number; completedTasks: number }> = {};

    nextTeams.forEach((team) => {
      const memberIds = new Set(nextUsers.filter((u) => u.team_id === team.id).map((u) => u.id));
      const teamAssignments = assignments.filter(
        (a) => a.team_id === team.id && !['COMPLETED', 'CANCELLED'].includes(a.status)
      );
      const uniqueLeads = new Set(teamAssignments.map((a) => a.lead_id));
      const teamTasks = tasks.filter((task) => memberIds.has(task.assigned_to_id));
      stats[team.id] = {
        activeProjects: uniqueLeads.size,
        pendingTasks: teamTasks.filter((task) => task.status !== 'DONE').length,
        completedTasks: teamTasks.filter((task) => task.status === 'DONE').length,
      };
    });
    setTeamStats(stats);
  };

  useEffect(() => {
    void reload();
  }, []);

  const canManage = Boolean(currentUser && ORG_ADMIN_ROLES.has(currentUser.role_code));
  const selectedUser = selection?.kind === 'person' ? users.find((u) => u.id === selection.userId) : undefined;
  const selectedTeam = selection?.kind === 'team' ? teams.find((t) => t.id === selection.teamId) : undefined;

  const managerName = (() => {
    if (!selectedUser) return '—';
    const contextId = selection?.kind === 'person' ? selection.reportingContextId : undefined;
    const manager = users.find((u) => u.id === (contextId || selectedUser.reporting_manager_id));
    return manager?.name || '—';
  })();

  const openModal = (mode: EmployeeModalMode) => {
    setModalMode(mode);
    setModalOpen(true);
  };

  const persistUsers = (nextUsers: User[], description: string, entityId: string) => {
    StorageService.saveUsers(nextUsers);
    setUsers(nextUsers);
    if (currentUser) {
      StorageService.logAudit({
        user_id: currentUser.id,
        user_name: currentUser.name,
        user_role: currentUser.role_name,
        entity_type: 'USER',
        entity_id: entityId,
        action: 'ORG_EMPLOYEE_UPDATED',
        description,
      });
    }
  };

  const syncTeamMembership = (nextUsers: User[], previous?: User, next?: User) => {
    let nextTeams = [...teams];
    const recount = (teamId?: string) => {
      if (!teamId) return;
      nextTeams = nextTeams.map((team) =>
        team.id === teamId
          ? { ...team, member_count: nextUsers.filter((u) => u.team_id === team.id).length }
          : team
      );
    };

    if (previous?.team_id && previous.team_id !== next?.team_id) {
      nextTeams = nextTeams.map((team) =>
        team.id === previous.team_id && team.team_lead_id === previous.id
          ? { ...team, team_lead_id: undefined, team_lead_name: 'Not Assigned' }
          : team
      );
      recount(previous.team_id);
    }

    if (next?.team_id) {
      recount(next.team_id);
      if (next.role_code === 'TEAM_LEAD') {
        nextTeams = nextTeams.map((team) =>
          team.id === next.team_id
            ? { ...team, team_lead_id: next.id, team_lead_name: next.name }
            : team
        );
      }
    }

    StorageService.saveTeams(nextTeams);
    setTeams(nextTeams);
  };

  const applyEmployeeForm = (form: EmployeeForm) => {
    const selectedRole = roles.find((r) => r.id === form.role_id);
    const selectedTeam = teams.find((t) => t.id === form.team_id);
    const teamLead = selectedTeam
      ? users.find((u) => u.id === selectedTeam.team_lead_id)
      : undefined;
    const roleCode = selectedRole?.code || 'EMPLOYEE';
    const reportingManagerId =
      resolveReportingManagerId(roleCode, users, Boolean(selectedTeam)) || form.reporting_manager_id || undefined;

    if (modalMode === 'add') {
      const newUser: User = {
        id: `u-${Date.now()}`,
        employee_id: form.employee_id || `CYA-${Math.floor(100 + Math.random() * 900)}`,
        name: form.name,
        email: form.email,
        phone: form.phone || '',
        role_id: form.role_id,
        role_code: roleCode,
        role_name: selectedRole?.name || 'Team Member',
        team_id: selectedTeam?.id,
        team_name: selectedTeam?.name,
        team_lead_id: teamLead?.id,
        team_lead_name: teamLead?.name,
        reporting_manager_id: reportingManagerId,
        status: 'ACTIVE',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const nextUsers = [newUser, ...users];
      persistUsers(nextUsers, `Added employee ${newUser.name} (${newUser.role_name})`, newUser.id);
      syncTeamMembership(nextUsers, undefined, newUser);
      setSelection({ kind: 'person', nodeId: `person-${newUser.id}`, userId: newUser.id });
      setModalOpen(false);
      return;
    }

    if (!selectedUser) return;

    const updated: User = {
      ...selectedUser,
      name: modalMode === 'edit' ? form.name : selectedUser.name,
      email: modalMode === 'edit' ? form.email : selectedUser.email,
      phone: modalMode === 'edit' ? form.phone : selectedUser.phone,
      employee_id: modalMode === 'edit' ? form.employee_id || selectedUser.employee_id : selectedUser.employee_id,
      role_id: modalMode === 'edit' || modalMode === 'role' ? form.role_id : selectedUser.role_id,
      role_code:
        modalMode === 'edit' || modalMode === 'role'
          ? selectedRole?.code || selectedUser.role_code
          : selectedUser.role_code,
      role_name:
        modalMode === 'edit' || modalMode === 'role'
          ? selectedRole?.name || selectedUser.role_name
          : selectedUser.role_name,
      team_id: modalMode === 'edit' || modalMode === 'team' ? selectedTeam?.id : selectedUser.team_id,
      team_name: modalMode === 'edit' || modalMode === 'team' ? selectedTeam?.name : selectedUser.team_name,
      team_lead_id:
        modalMode === 'edit' || modalMode === 'team' ? teamLead?.id : selectedUser.team_lead_id,
      team_lead_name:
        modalMode === 'edit' || modalMode === 'team' ? teamLead?.name : selectedUser.team_lead_name,
      reporting_manager_id:
        modalMode === 'edit' || modalMode === 'manager'
          ? reportingManagerId
          : selectedUser.reporting_manager_id,
      status: modalMode === 'edit' ? form.status : selectedUser.status,
      updated_at: new Date().toISOString(),
    };

    const nextUsers = users.map((u) => (u.id === updated.id ? updated : u));
    persistUsers(nextUsers, `Updated ${updated.name} from Organization Management`, updated.id);
    syncTeamMembership(nextUsers, selectedUser, updated);
    setModalOpen(false);
  };

  const handleToggleStatus = () => {
    if (!selectedUser) return;
    const nextStatus = selectedUser.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const updated = { ...selectedUser, status: nextStatus as 'ACTIVE' | 'INACTIVE', updated_at: new Date().toISOString() };
    const nextUsers = users.map((u) => (u.id === updated.id ? updated : u));
    persistUsers(
      nextUsers,
      `${nextStatus === 'ACTIVE' ? 'Activated' : 'Deactivated'} employee ${updated.name}`,
      updated.id
    );
  };

  const teamMembers = selectedTeam
    ? users.filter((u) => isDisplayedTeamMember(u, selectedTeam, users) || u.id === selectedTeam.team_lead_id)
    : [];
  const selectedDirectReports = selectedUser ? getDirectReports(selectedUser.id, users) : [];
  const selectedTeamMembers = selectedUser?.team_id
    ? users.filter((u) => u.team_id === selectedUser.team_id && !MANAGEMENT_ROLES.has(u.role_code))
    : [];
  const teamReportsThrough = (() => {
    if (!selectedTeam) return '—';
    const lead = users.find((u) => u.id === selectedTeam.team_lead_id) || teamMembers.find((u) => u.role_code === 'TEAM_LEAD');
    const manager = users.find((u) => u.id === lead?.reporting_manager_id);
    return manager ? `${manager.name} (${manager.role_name})` : '—';
  })();
  const stats = selectedTeam ? teamStats[selectedTeam.id] : undefined;
  const functionalHeadcount = users.filter(
    (u) => u.team_id && u.status === 'ACTIVE' && u.role_code !== 'SYSTEM_ADMIN'
  ).length;
  const managementHeadcount = users.filter(
    (u) => MANAGEMENT_ROLES.has(u.role_code) && u.status === 'ACTIVE'
  ).length;

  return (
    <div className="surface-light -m-6 min-h-full bg-background p-4 text-foreground">
      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-blue-700">
            <Building2 className="h-4 w-4" />
            Careyu Automation
          </div>
          <h1 className="mt-0.5 text-xl font-bold text-foreground">Organization Management</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Organizational hierarchy and role-based access. Functional delivery teams exclude executive and management roles.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => {
              setSelection(null);
              openModal('add');
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0B1F3A] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#132a4d]"
          >
            <Plus className="h-4 w-4" /> Add Employee
          </button>
        )}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-3">
        {[
          { label: 'Total Employees', value: users.filter((u) => u.role_code !== 'SYSTEM_ADMIN').length, icon: Users },
          { label: 'Teams', value: teams.length, icon: Building2 },
          {
            label: 'Active Members',
            value: users.filter((u) => u.status === 'ACTIVE' && u.role_code !== 'SYSTEM_ADMIN').length,
            icon: UserCheck,
          },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-xl border border-border bg-card p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{card.label}</span>
                <Icon className="h-3.5 w-3.5 text-blue-600" />
              </div>
              <div className="mt-1 text-xl font-bold text-card-foreground">{card.value}</div>
            </div>
          );
        })}
      </div>
      <p className="-mt-1 mb-3 text-[11px] text-muted-foreground">
        {functionalHeadcount} functional team members + {managementHeadcount} management roles = {functionalHeadcount + managementHeadcount} total employees.
      </p>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section className="space-y-4">
          <OrgChart
            users={users.filter((u) => u.role_code !== 'SYSTEM_ADMIN')}
            teams={teams}
            roles={roles}
            selectedId={selection?.kind === 'person' ? selection.userId : selection?.kind === 'team' ? selection.teamId : null}
            onSelectPerson={(user) =>
              setSelection({
                kind: 'person',
                nodeId: `person-${user.id}`,
                userId: user.id,
                reportingContextId: user.reporting_manager_id,
              })
            }
            onSelectTeam={(team) => setSelection({ kind: 'team', nodeId: `team-${team.id}`, teamId: team.id })}
          />
        </section>

        <div className="xl:sticky xl:top-3 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto">
          <OrgDetailsPanel
            person={
              selectedUser
                ? {
                    user: selectedUser,
                    managerName,
                    directReports: selectedDirectReports,
                    teamMembers: selectedTeamMembers,
                  }
                : null
            }
            team={
              selectedTeam
                ? {
                    team: selectedTeam,
                    leadName: selectedTeam.team_lead_name || 'Not Assigned',
                    members: teamMembers,
                    memberCount: teamMembers.length,
                    reportsThrough: teamReportsThrough,
                    activeProjects: stats?.activeProjects || 0,
                    pendingTasks: stats?.pendingTasks || 0,
                    completedTasks: stats?.completedTasks || 0,
                  }
                : null
            }
            canManage={canManage}
            onEditEmployee={() => openModal('edit')}
            onAssignRole={() => openModal('role')}
            onAssignTeam={() => openModal('team')}
            onChangeManager={() => openModal('manager')}
            onToggleStatus={handleToggleStatus}
          />
        </div>
      </div>

      <EmployeeActionModal
        open={modalOpen}
        mode={modalMode}
        roles={roles}
        teams={teams}
        users={users}
        employee={modalMode === 'add' ? null : selectedUser}
        onClose={() => setModalOpen(false)}
        onSubmit={applyEmployeeForm}
      />
    </div>
  );
}
