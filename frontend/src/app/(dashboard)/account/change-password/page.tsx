'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import PasswordRequirements from '@/components/auth/PasswordRequirements';
import { changePasswordWithApi, validatePasswordPolicy } from '@/lib/auth';

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
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

  return (
    <div className="surface-light mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Change Password</h1>
        <p className="mt-1 text-sm text-muted-foreground">Update your CareYu account password securely.</p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-card-foreground">Current Password</label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="form-control w-full rounded-xl py-2.5 pl-10 pr-11 text-sm"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {fieldErrors.currentPassword && <p className="mt-1.5 text-xs text-rose-700">{fieldErrors.currentPassword}</p>}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-card-foreground">New Password</label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="form-control w-full rounded-xl py-2.5 pl-10 pr-3.5 text-sm"
                autoComplete="new-password"
              />
            </div>
            <PasswordRequirements password={newPassword} />
            {fieldErrors.newPassword && <p className="mt-1.5 text-xs text-rose-700">{fieldErrors.newPassword}</p>}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-card-foreground">Confirm New Password</label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="form-control w-full rounded-xl py-2.5 pl-10 pr-3.5 text-sm"
                autoComplete="new-password"
              />
            </div>
            {fieldErrors.confirmPassword && <p className="mt-1.5 text-xs text-rose-700">{fieldErrors.confirmPassword}</p>}
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-80"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                'Change Password'
              )}
            </button>
            <Link
              href="/dashboard"
              className="inline-flex items-center rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-card-foreground hover:bg-muted"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
