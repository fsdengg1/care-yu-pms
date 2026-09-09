import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import RootLayout from '@/layouts/RootLayout';
import AuthLayout from '@/layouts/AuthLayout';
import DashboardLayout from '@/layouts/DashboardLayout';

import LoginPage from '@/app/(auth)/login/page';
import SignupPage from '@/app/(auth)/signup/page';
import ForgotPasswordPage from '@/app/(auth)/forgot-password/page';
import ResetPasswordPage from '@/app/(auth)/reset-password/page';
import VerifyEmailPage from '@/app/(auth)/verify-email/page';
import InvitationLoginPage from '@/app/(auth)/invitation-login/page';
import CreatePasswordPage from '@/app/(auth)/create-password/page';

import DashboardPage from '@/app/(dashboard)/dashboard/page';
import CeoDashboardPage from '@/app/(dashboard)/dashboard/ceo/page';
import CtoDashboardPage from '@/app/(dashboard)/dashboard/cto/page';
import BusinessHeadDashboardPage from '@/app/(dashboard)/dashboard/business-head/page';
import EngineeringDashboardPage from '@/app/(dashboard)/dashboard/engineering/page';
import PmDashboardPage from '@/app/(dashboard)/dashboard/pm/page';
import TeamLeadDashboardPage from '@/app/(dashboard)/dashboard/team-lead/page';
import TeamMemberDashboardPage from '@/app/(dashboard)/dashboard/team-member/page';
import TeamDashboardPage from '@/app/(dashboard)/dashboard/team/page';
import CeoProjectManagerPage from '@/app/(dashboard)/dashboard/ceo/project-manager/page';
import CeoEscalationsPage from '@/app/(dashboard)/dashboard/ceo/escalations/page';
import CeoEscalationDetailPage from '@/app/(dashboard)/dashboard/ceo/escalations/[id]/page';
import CeoEscalationDetailStaticPage from '@/app/(dashboard)/dashboard/ceo/escalations/detail/page';

import PreSalesLeadsPage from '@/app/(dashboard)/pre-sales/leads/page';
import PreSalesLeadsCreatePage from '@/app/(dashboard)/pre-sales/leads/create/page';
import PreSalesLeadDetailPage from '@/app/(dashboard)/pre-sales/leads/[id]/page';
import PreSalesLeadDetailStaticPage from '@/app/(dashboard)/pre-sales/leads/detail/page';
import PreSalesFeasibilityPage from '@/app/(dashboard)/pre-sales/feasibility/page';
import PreSalesFeasibilityCreatePage from '@/app/(dashboard)/pre-sales/feasibility/create/page';
import PreSalesCostingPage from '@/app/(dashboard)/pre-sales/costing/page';

import ProjectsActivePage from '@/app/(dashboard)/projects/active/page';
import ProjectsCreatePage from '@/app/(dashboard)/projects/create/page';
import ProjectsPlanningPage from '@/app/(dashboard)/projects/planning/page';
import ProjectDetailPage from '@/app/(dashboard)/projects/[id]/page';
import ProjectDetailStaticPage from '@/app/(dashboard)/projects/detail/page';
import ProjectActivityPage from '@/app/(dashboard)/projects/[id]/activity/page';
import ProjectActivityStaticPage from '@/app/(dashboard)/projects/activity/page';

import DailyUpdatesPage from '@/app/(dashboard)/daily-updates/page';
import DailyUpdatesNewPage from '@/app/(dashboard)/daily-updates/new/page';
import DailyUpdateDetailPage from '@/app/(dashboard)/daily-updates/[id]/page';
import DailyUpdateDetailStaticPage from '@/app/(dashboard)/daily-updates/detail/page';

import MyWorkPage from '@/app/(dashboard)/my-work/page';
import MessagesPage from '@/app/(dashboard)/messages/page';
import CeoChatPage from '@/app/(dashboard)/ceo-chat/page';
import LeavePage from '@/app/(dashboard)/leave/page';
import EmailReportsPage from '@/app/(dashboard)/email-reports/page';
import NotificationsPage from '@/app/(dashboard)/notifications/page';
import TeamsPage from '@/app/(dashboard)/teams/page';
import ProcurementPage from '@/app/(dashboard)/procurement/page';
import OrgPage from '@/app/(dashboard)/org/page';
import SettingsPage from '@/app/(dashboard)/settings/page';
import UsersPage from '@/app/(dashboard)/users/page';
import RolesPage from '@/app/(dashboard)/roles/page';
import AuditLogsPage from '@/app/(dashboard)/audit-logs/page';
import ChangePasswordPage from '@/app/(dashboard)/account/change-password/page';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<RootLayout />}>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/dashboard/login" element={<Navigate to="/login" replace />} />

          <Route element={<AuthLayout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/invitation-login" element={<InvitationLoginPage />} />
            <Route path="/create-password" element={<CreatePasswordPage />} />
          </Route>

          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/dashboard/ceo" element={<CeoDashboardPage />} />
            <Route path="/dashboard/cto" element={<CtoDashboardPage />} />
            <Route path="/dashboard/business-head" element={<BusinessHeadDashboardPage />} />
            <Route path="/dashboard/engineering" element={<EngineeringDashboardPage />} />
            <Route path="/dashboard/pm" element={<PmDashboardPage />} />
            <Route path="/dashboard/team-lead" element={<TeamLeadDashboardPage />} />
            <Route path="/dashboard/team-member" element={<TeamMemberDashboardPage />} />
            <Route path="/dashboard/team" element={<TeamDashboardPage />} />
            <Route path="/dashboard/ceo/leads" element={<Navigate to="/pre-sales/leads" replace />} />
            <Route path="/dashboard/ceo/project-manager" element={<CeoProjectManagerPage />} />
            <Route path="/dashboard/ceo/escalations" element={<CeoEscalationsPage />} />
            <Route path="/dashboard/ceo/escalations/:id" element={<CeoEscalationDetailPage />} />
            <Route path="/dashboard/ceo/escalations/detail" element={<CeoEscalationDetailStaticPage />} />

            <Route path="/pre-sales/leads" element={<PreSalesLeadsPage />} />
            <Route path="/pre-sales/leads/create" element={<PreSalesLeadsCreatePage />} />
            <Route path="/pre-sales/leads/:id" element={<PreSalesLeadDetailPage />} />
            <Route path="/pre-sales/leads/detail" element={<PreSalesLeadDetailStaticPage />} />
            <Route path="/pre-sales/feasibility" element={<PreSalesFeasibilityPage />} />
            <Route path="/pre-sales/feasibility/create" element={<PreSalesFeasibilityCreatePage />} />
            <Route path="/pre-sales/costing" element={<PreSalesCostingPage />} />

            <Route path="/projects/active" element={<ProjectsActivePage />} />
            <Route path="/projects/create" element={<ProjectsCreatePage />} />
            <Route path="/projects/planning" element={<ProjectsPlanningPage />} />
            <Route path="/projects/:id/activity" element={<ProjectActivityPage />} />
            <Route path="/projects/activity" element={<ProjectActivityStaticPage />} />
            <Route path="/projects/detail" element={<ProjectDetailStaticPage />} />
            <Route path="/projects/:id" element={<ProjectDetailPage />} />

            <Route path="/daily-updates" element={<DailyUpdatesPage />} />
            <Route path="/daily-updates/new" element={<DailyUpdatesNewPage />} />
            <Route path="/daily-updates/:id" element={<DailyUpdateDetailPage />} />
            <Route path="/daily-updates/detail" element={<DailyUpdateDetailStaticPage />} />

            <Route path="/my-work" element={<MyWorkPage />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/ceo-chat" element={<CeoChatPage />} />
            <Route path="/leave" element={<LeavePage />} />
            <Route path="/email-reports" element={<EmailReportsPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/teams" element={<TeamsPage />} />
            <Route path="/procurement" element={<ProcurementPage />} />
            <Route path="/org" element={<OrgPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/roles" element={<RolesPage />} />
            <Route path="/audit-logs" element={<AuditLogsPage />} />
            <Route path="/account/change-password" element={<ChangePasswordPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
