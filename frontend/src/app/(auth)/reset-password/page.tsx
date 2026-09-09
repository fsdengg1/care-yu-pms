'use client';

import { Link, useSearchParams } from '@/lib/navigation';
import React, { Suspense, useMemo, useState } from 'react';


import { CheckCircle2, Loader2 } from 'lucide-react';
import AuthShell from '@/components/auth/AuthShell';
import AuthPasswordField from '@/components/auth/AuthPasswordField';
import AuthButton from '@/components/auth/AuthButton';
import PasswordRequirements from '@/components/auth/PasswordRequirements';
import { resetPasswordWithApi, validatePasswordPolicy } from '@/lib/auth';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get('token') || '', [searchParams]);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError('This password reset link is invalid or has expired.');
      return;
    }
    const errors: Record<string, string> = {};
    const passwordError = validatePasswordPolicy(password);
    if (passwordError) errors.password = 'Please meet all password requirements.';
    if (!confirmPassword) errors.confirmPassword = 'Confirm password is required.';
    else if (password !== confirmPassword) errors.confirmPassword = 'Passwords do not match.';
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setLoading(true);
    const result = await resetPasswordWithApi({ token, password, confirmPassword });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(result.message);
  };

  if (success) {
    return (
      <AuthShell title="Password Reset Successfully" subtitle="Your password has been updated." showFlow={false} compact>
        <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
        <Link href="/login" className="auth-btn-primary mt-5">
          Back to Sign In
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset Your Password" subtitle="Choose a new secure password for your CareYu account." showFlow={false} compact>
      <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
        <div>
          <AuthPasswordField
            id="new-password"
            label="New Password"
            value={password}
            placeholder="Enter your new password"
            autoComplete="new-password"
            error={fieldErrors.password}
            onChange={(value) => {
              setPassword(value);
              setFieldErrors((prev) => ({ ...prev, password: '' }));
            }}
          />
          <PasswordRequirements password={password} />
        </div>

        <AuthPasswordField
          id="confirm-new-password"
          label="Confirm Password"
          value={confirmPassword}
          placeholder="Confirm your new password"
          autoComplete="new-password"
          error={fieldErrors.confirmPassword}
          onChange={(value) => {
            setConfirmPassword(value);
            setFieldErrors((prev) => ({ ...prev, confirmPassword: '' }));
          }}
        />

        {error && <p className="text-[13px] text-[color:var(--auth-error)]">{error}</p>}

        <AuthButton loading={loading} loadingText="Resetting Password..." disabled={!token}>
          Reset Password
        </AuthButton>
      </form>

      <Link href="/login" className="auth-link mt-5 block text-center text-sm">
        Back to Sign In
      </Link>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <AuthShell title="Reset Your Password" subtitle="Loading..." showFlow={false} compact>
          <div className="flex items-center gap-2 text-sm text-[color:var(--auth-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading reset form...
          </div>
        </AuthShell>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
