'use client';

import { Link } from '@/lib/navigation';
import React, { useEffect, useState } from 'react';

import { AlertCircle, Bell, CheckCircle2, KeyRound, Loader2, Mail, Shield, User } from 'lucide-react';
import PasswordRequirements from '@/components/auth/PasswordRequirements';
import {
  changePasswordWithApi,
  createPasswordWithApi,
  validatePasswordPolicy,
} from '@/lib/auth';
import { apiRequest } from '@/lib/api';
import { StorageService } from '@/lib/storage';
import { UsersApi } from '@/lib/usersApi';
import { NotificationPreferences, User as AppUser } from '@/lib/types';
import { useAuth } from '@/components/auth/AuthProvider';

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Active',
  INVITED: 'Pending invitation',
  INVITATION_VERIFIED: 'Invitation verified',
  PASSWORD_SETUP_REQUIRED: 'Password setup required',
  DISABLED: 'Disabled',
  INVITATION_EXPIRED: 'Invitation expired',
};

export default function SettingsPage() {
  const { applyUser } = useAuth();
  const [user, setUser] = useState<AppUser | null>(null);
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [prefs, setPrefs] = useState<NotificationPreferences>({
    email_enabled: true,
    in_app_enabled: true,
    assignment: true,
    forward: true,
    reminder: true,
    approval: true,
  });
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{
    provider: string;
    backendIntegration: string;
    apiKey: string;
    sender: string;
    senderEmail: string;
    domain: string;
    domainAuth: { spf: string; dkim: string; dmarc: string };
    notes: string[];
  } | null>(null);
  const [testTo, setTestTo] = useState('');
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const canTestEmail = Boolean(user && ['SYSTEM_ADMIN', 'CEO', 'CTO'].includes(user.role_code));

  useEffect(() => {
    const stored = StorageService.getCurrentUser();
    setUser(stored);
    if (stored) {
      setProfileName(stored.name || '');
      setProfileEmail(stored.email || '');
      setProfilePhone(stored.phone || '');
    }
    void apiRequest<{ user: AppUser }>('/api/auth/me').then((result) => {
      if (!result.ok) return;
      setUser(result.data.user);
      StorageService.setCurrentUser(result.data.user);
      applyUser(result.data.user);
      setProfileName(result.data.user.name || '');
      setProfileEmail(result.data.user.email || '');
      setProfilePhone(result.data.user.phone || '');
      if (result.data.user.notification_preferences) {
        setPrefs((current) => ({ ...current, ...result.data.user.notification_preferences }));
      }
      if (['SYSTEM_ADMIN', 'CEO', 'CTO'].includes(result.data.user.role_code)) {
        void apiRequest<{
          provider: string;
          backendIntegration: string;
          apiKey: string;
          sender: string;
          senderEmail: string;
          domain: string;
          domainAuth: { spf: string; dkim: string; dmarc: string };
          notes: string[];
        }>('/api/email/status').then((status) => {
          if (status.ok) setEmailStatus(status.data);
        });
      }
    });
  }, [applyUser]);

  const hasPassword = user?.has_password !== false;
  const accountStatus = user?.account_status || 'ACTIVE';

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const errors: Record<string, string> = {};
    if (!profileName.trim() || profileName.trim().length < 2) {
      errors.name = 'Please enter your full name.';
    }
    if (!profileEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profileEmail.trim())) {
      errors.email = 'Enter a valid work email address.';
    }
    setProfileErrors(errors);
    if (Object.keys(errors).length) return;

    setProfileSaving(true);
    const result = await UsersApi.updateMe({
      name: profileName.trim(),
      email: profileEmail.trim(),
      phone: profilePhone.trim(),
    });
    setProfileSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setUser(result.data.user);
    applyUser(result.data.user);
    setProfileName(result.data.user.name || '');
    setProfileEmail(result.data.user.email || '');
    setProfilePhone(result.data.user.phone || '');
    setSuccess('Profile updated. Your name will show on the dashboard.');
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const errors: Record<string, string> = {};
    if (!currentPassword) errors.currentPassword = 'Current password is required.';
    const passwordError = validatePasswordPolicy(newPassword);
    if (passwordError) errors.newPassword = passwordError;
    if (!confirmPassword) errors.confirmPassword = 'Confirm password is required.';
    else if (newPassword !== confirmPassword) errors.confirmPassword = 'Passwords do not match.';
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setLoading(true);
    const result = await changePasswordWithApi({ currentPassword, newPassword, confirmPassword });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(result.message);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleCreatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const errors: Record<string, string> = {};
    const passwordError = validatePasswordPolicy(newPassword);
    if (passwordError) errors.newPassword = passwordError;
    if (!confirmPassword) errors.confirmPassword = 'Confirm password is required.';
    else if (newPassword !== confirmPassword) errors.confirmPassword = 'Passwords do not match.';
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setLoading(true);
    const result = await createPasswordWithApi({ newPassword, confirmPassword });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    StorageService.setCurrentUser(result.user, true);
    if (result.token) StorageService.setAuthToken(result.token, true);
    setUser(result.user);
    setSuccess(result.message);
    setNewPassword('');
    setConfirmPassword('');
  };

  if (!user) {
    return <p className="text-sm text-slate-400">Loading settings...</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-100">Settings</h1>
        <p className="mt-1 text-sm text-slate-400">Manage your CareYu profile and account security.</p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-900/60 bg-red-950/40 px-3 py-2.5 text-sm text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-800/60 bg-emerald-950/40 px-3 py-2.5 text-sm text-emerald-300">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-2">
          <User className="h-4 w-4 text-cyan-400" />
          <h2 className="text-lg font-semibold text-slate-100">Profile</h2>
        </div>
        <p className="mb-4 text-sm text-slate-400">
          Update your name and contact details. The dashboard header uses this name after you save.
        </p>
        <form onSubmit={handleSaveProfile} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Full Name</label>
              <input
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 px-3.5 text-sm text-slate-100 outline-none focus:border-cyan-500"
                autoComplete="name"
              />
              {profileErrors.name && <p className="mt-1.5 text-xs text-red-400">{profileErrors.name}</p>}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Work Email</label>
              <input
                type="email"
                value={profileEmail}
                onChange={(e) => setProfileEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 px-3.5 text-sm text-slate-100 outline-none focus:border-cyan-500"
                autoComplete="email"
              />
              {profileErrors.email && <p className="mt-1.5 text-xs text-red-400">{profileErrors.email}</p>}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Phone</label>
              <input
                value={profilePhone}
                onChange={(e) => setProfilePhone(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 px-3.5 text-sm text-slate-100 outline-none focus:border-cyan-500"
                autoComplete="tel"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Employee ID</label>
              <input
                value={user.employee_id || '—'}
                readOnly
                className="w-full cursor-not-allowed rounded-xl border border-slate-800 bg-slate-950/60 py-2.5 px-3.5 text-sm text-slate-400"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Role</label>
              <input
                value={user.role_name}
                readOnly
                className="w-full cursor-not-allowed rounded-xl border border-slate-800 bg-slate-950/60 py-2.5 px-3.5 text-sm text-slate-400"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Team</label>
              <input
                value={user.team_name || 'Not assigned'}
                readOnly
                className="w-full cursor-not-allowed rounded-xl border border-slate-800 bg-slate-950/60 py-2.5 px-3.5 text-sm text-slate-400"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Reporting Manager</label>
              <input
                value={user.reporting_manager_name || 'Not assigned'}
                readOnly
                className="w-full cursor-not-allowed rounded-xl border border-slate-800 bg-slate-950/60 py-2.5 px-3.5 text-sm text-slate-400"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Account Status</label>
              <input
                value={STATUS_LABELS[accountStatus] || accountStatus}
                readOnly
                className="w-full cursor-not-allowed rounded-xl border border-slate-800 bg-slate-950/60 py-2.5 px-3.5 text-sm text-slate-400"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={profileSaving}
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-80"
          >
            {profileSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save profile
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-2">
          <Shield className="h-4 w-4 text-cyan-400" />
          <h2 className="text-lg font-semibold text-slate-100">Security</h2>
        </div>

        <form onSubmit={hasPassword ? handleChangePassword : handleCreatePassword} className="space-y-4" noValidate>
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <KeyRound className="h-4 w-4 text-slate-400" />
            <span>{hasPassword ? 'Change Password' : 'Create New Password'}</span>
          </div>

          {hasPassword && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 px-3.5 text-sm text-slate-100 outline-none focus:border-cyan-500"
                autoComplete="current-password"
              />
              {fieldErrors.currentPassword && <p className="mt-1.5 text-xs text-red-400">{fieldErrors.currentPassword}</p>}
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 px-3.5 text-sm text-slate-100 outline-none focus:border-cyan-500"
              autoComplete="new-password"
            />
            <div className="mt-2 [&_.text-slate-400]:text-slate-500">
              <PasswordRequirements password={newPassword} />
            </div>
            {fieldErrors.newPassword && <p className="mt-1.5 text-xs text-red-400">{fieldErrors.newPassword}</p>}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">
              {hasPassword ? 'Confirm New Password' : 'Confirm Password'}
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 px-3.5 text-sm text-slate-100 outline-none focus:border-cyan-500"
              autoComplete="new-password"
            />
            {fieldErrors.confirmPassword && <p className="mt-1.5 text-xs text-red-400">{fieldErrors.confirmPassword}</p>}
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-80"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {hasPassword ? 'Updating...' : 'Creating...'}
                </>
              ) : hasPassword ? (
                'Update Password'
              ) : (
                'Create Password'
              )}
            </button>
            {hasPassword && (
              <>
                <Link href="/forgot-password" className="text-sm text-cyan-400 hover:underline">
                  Forgot Password?
                </Link>
                <Link href="/forgot-password" className="text-sm text-cyan-400 hover:underline">
                  Reset Password
                </Link>
              </>
            )}
          </div>
        </form>
      </section>

      {canTestEmail && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <Mail className="h-4 w-4 text-cyan-400" />
            <h2 className="text-lg font-semibold text-slate-100">Email Service</h2>
          </div>
          <p className="mb-4 text-sm text-slate-400">
            Provider: Elastic Email. API keys are never shown here.
          </p>
          {emailStatus ? (
            <ul className="mb-4 space-y-1 text-sm text-slate-300">
              <li>Backend: {emailStatus.backendIntegration === 'PASS' ? 'connected' : 'not using Elastic Email'}</li>
              <li>API key: {emailStatus.apiKey}</li>
              <li>Sender: {emailStatus.sender} {emailStatus.senderEmail ? `(${emailStatus.senderEmail})` : ''}</li>
              <li>Domain: {emailStatus.domain}</li>
              <li>SPF: {emailStatus.domainAuth.spf} · DKIM: {emailStatus.domainAuth.dkim} · DMARC: {emailStatus.domainAuth.dmarc}</li>
            </ul>
          ) : (
            <p className="mb-4 text-sm text-slate-500">Loading email configuration…</p>
          )}
          {emailStatus?.notes?.length ? (
            <p className="mb-4 text-xs text-amber-300">{emailStatus.notes[0]}</p>
          ) : null}
          <form
            className="flex flex-col gap-3 sm:flex-row"
            onSubmit={async (event) => {
              event.preventDefault();
              setTestBusy(true);
              setTestResult(null);
              const result = await apiRequest<{ message: string; transactionId?: string }>('/api/email/test', {
                method: 'POST',
                body: JSON.stringify({ to: testTo }),
              });
              setTestBusy(false);
              if (!result.ok) {
                setTestResult(result.message);
                return;
              }
              setTestResult(
                `${result.data.message}${result.data.transactionId ? ` Transaction ID: ${result.data.transactionId}` : ''}`
              );
            }}
          >
            <input
              type="email"
              required
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="work-email@careyu.ai"
              className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
            <button
              type="submit"
              disabled={testBusy}
              className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-80"
            >
              {testBusy ? 'Sending…' : 'Send Test Email'}
            </button>
          </form>
          {testResult && <p className="mt-3 text-sm text-slate-300">{testResult}</p>}
        </section>
      )}

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <Bell className="h-4 w-4 text-cyan-400" />
          <h2 className="text-lg font-semibold text-slate-100">Notifications</h2>
        </div>
        <p className="mb-5 text-sm text-slate-400">
          Internal stage and assignment emails are not sent automatically. Use Send Email Notification on the item when it is urgent. If nobody views or acts within the reminder period, PMS sends an automatic reminder. Client/customer emails stay on a separate list.
        </p>
        <div className="space-y-3">
          {[
            ['email_enabled', 'Email notifications'],
            ['in_app_enabled', 'In-app notifications'],
            ['assignment', 'Assignment notifications'],
            ['forward', 'Forward notifications'],
            ['reminder', 'Reminder notifications'],
            ['approval', 'Approval notifications'],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-200">
              <span>{label}</span>
              <input
                type="checkbox"
                checked={Boolean(prefs[key as keyof NotificationPreferences])}
                onChange={(e) => setPrefs((current) => ({ ...current, [key]: e.target.checked }))}
                className="h-4 w-4 accent-cyan-500"
              />
            </label>
          ))}
        </div>
        <button
          type="button"
          disabled={prefsSaving}
          onClick={async () => {
            setPrefsSaving(true);
            setError(null);
            setSuccess(null);
            const result = await UsersApi.updateNotificationPreferences(prefs);
            setPrefsSaving(false);
            if (!result.ok) {
              setError(result.message);
              return;
            }
            setUser(result.data.user);
            applyUser(result.data.user);
            setSuccess('Notification preferences saved.');
          }}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-80"
        >
          {prefsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save notification settings
        </button>
      </section>
    </div>
  );
}
