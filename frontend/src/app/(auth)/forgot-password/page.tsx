'use client';

import { Link } from '@/lib/navigation';
import React, { useState } from 'react';

import { CheckCircle2, Mail } from 'lucide-react';
import AuthShell from '@/components/auth/AuthShell';
import AuthField from '@/components/auth/AuthField';
import AuthButton from '@/components/auth/AuthButton';
import { forgotPasswordWithApi, isValidEmail } from '@/lib/auth';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!email.trim()) {
      setFieldError('Work email is required.');
      return;
    }
    if (!isValidEmail(email)) {
      setFieldError('Please enter a valid work email address.');
      return;
    }
    setFieldError(null);
    setLoading(true);
    const result = await forgotPasswordWithApi(email);
    setLoading(false);
    if (!result.ok) {
      setError(result.error || 'Unable to process your request. Please try again.');
      return;
    }
    setSuccess(result.message);
  };

  return (
    <AuthShell
      title="Forgot Your Password?"
      subtitle="Enter your CareYu work email and we'll send you a secure reset link."
      showFlow={false}
      compact
    >
      {success && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <AuthField
          id="forgot-email"
          label="Work Email"
          icon={Mail}
          type="email"
          value={email}
          placeholder="Enter your work email"
          autoComplete="email"
          error={fieldError || undefined}
          onChange={(e) => {
            setEmail(e.target.value);
            setFieldError(null);
          }}
        />
        {error && <p className="text-[13px] text-[color:var(--auth-error)]">{error}</p>}
        <AuthButton loading={loading} loadingText="Sending Reset Link...">
          Send Reset Link
        </AuthButton>
      </form>

      <Link href="/login" className="auth-link mt-5 block text-center text-sm">
        Back to Sign In
      </Link>
    </AuthShell>
  );
}
