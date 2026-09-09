'use client';

import { Link, useRouter } from '@/lib/navigation';
import React, { useEffect, useState } from 'react';


import { CheckCircle2 } from 'lucide-react';
import AuthShell from '@/components/auth/AuthShell';
import AuthPasswordField from '@/components/auth/AuthPasswordField';
import AuthButton from '@/components/auth/AuthButton';
import PasswordRequirements from '@/components/auth/PasswordRequirements';
import { createPasswordWithApi, validatePasswordPolicy } from '@/lib/auth';
import { StorageService } from '@/lib/storage';

export default function CreatePasswordPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = StorageService.getPasswordSetupToken();
    if (!token) {
      router.replace('/invitation-login');
      return;
    }
    setReady(true);
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    const errors: Record<string, string> = {};
    const passwordError = validatePasswordPolicy(newPassword);
    if (passwordError) errors.newPassword = 'Please meet all password requirements.';
    if (!confirmPassword) errors.confirmPassword = 'Confirm password is required.';
    else if (newPassword !== confirmPassword) errors.confirmPassword = 'Passwords do not match.';
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    const setupToken = StorageService.getPasswordSetupToken();
    if (!setupToken) {
      setError('Your invitation session has expired. Please sign in with your invitation code again.');
      return;
    }

    setLoading(true);
    const result = await createPasswordWithApi({
      newPassword,
      confirmPassword,
      setupToken,
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    StorageService.clearPasswordSetupToken();
    setSuccess(true);
  };

  if (!ready) {
    return (
      <AuthShell title="Create Your Password" subtitle="Checking your invitation..." compact>
        <p className="text-sm text-[color:var(--auth-muted)]">Please wait...</p>
      </AuthShell>
    );
  }

  if (success) {
    return (
      <AuthShell title="Account Setup Complete" subtitle="Your CareYu account is ready." compact>
        <div className="flex items-start gap-2.5 rounded-xl border border-blue-100 bg-blue-50 px-3.5 py-3 text-sm text-slate-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--auth-blue)]" />
          <span>Your password has been created. Sign in with your work email and password.</span>
        </div>
        <Link href="/login" className="auth-btn-primary mt-5">
          Go to Sign In
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create Your Password"
      subtitle="Your invitation has been verified. Create a password to activate your account."
      compact
    >
      <form onSubmit={handleSubmit} className="auth-signup-form" noValidate>
        <div>
          <AuthPasswordField
            id="new-password"
            label="New Password"
            value={newPassword}
            placeholder="Create a strong password"
            autoComplete="new-password"
            error={fieldErrors.newPassword}
            onChange={(value) => {
              setNewPassword(value);
              setFieldErrors((prev) => ({ ...prev, newPassword: '' }));
            }}
          />
          <PasswordRequirements password={newPassword} />
        </div>

        <AuthPasswordField
          id="confirm-password"
          label="Confirm Password"
          value={confirmPassword}
          placeholder="Confirm your password"
          autoComplete="new-password"
          error={fieldErrors.confirmPassword}
          onChange={(value) => {
            setConfirmPassword(value);
            setFieldErrors((prev) => ({ ...prev, confirmPassword: '' }));
          }}
        />

        {error && <p className="auth-signup-error">{error}</p>}

        <AuthButton loading={loading} loadingText="Creating Password...">
          Create Password
        </AuthButton>
      </form>

      <Link href="/invitation-login" className="auth-link mt-5 block text-center text-sm">
        Back to First-Time Login
      </Link>
    </AuthShell>
  );
}
