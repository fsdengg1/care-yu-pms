'use client';

import { Link, useRouter } from '@/lib/navigation';
import React, { useEffect, useRef, useState } from 'react';


import { Mail } from 'lucide-react';
import AuthShell from '@/components/auth/AuthShell';
import AuthField from '@/components/auth/AuthField';
import AuthPasswordField from '@/components/auth/AuthPasswordField';
import AuthButton from '@/components/auth/AuthButton';
import {
  loginWithApi,
  getDashboardPath,
  safeReturnPath,
  validateLogin,
  LoginFieldErrors,
} from '@/lib/auth';
import { StorageService } from '@/lib/storage';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mode') === 'invitation') {
      router.replace('/invitation-login');
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || submitting.current) return;
    submitting.current = true;
    setFormError(null);
    setErrorCode(undefined);

    const errors = validateLogin(email, password);
    setFieldErrors(errors);
    if (errors.email || errors.password) {
      submitting.current = false;
      return;
    }

    setLoading(true);
    const result = await loginWithApi(email, password, rememberMe);
    if (!result.ok) {
      submitting.current = false;
      setLoading(false);
      setFormError(result.error);
      setErrorCode(result.code);
      if (result.code === 'ACCOUNT_PENDING' || result.code === 'invitation_required') {
        router.push('/invitation-login');
      }
      return;
    }

    StorageService.clearPasswordSetupToken();
    StorageService.setAuthToken(result.token, rememberMe);
    StorageService.setCurrentUser(result.user, rememberMe);
    StorageService.logAudit({
      user_id: result.user.id,
      user_name: result.user.name,
      user_role: result.user.role_name,
      entity_type: 'AUTH',
      entity_id: result.user.id,
      action: 'USER_LOGIN',
      description: `Logged in successfully as ${result.user.name} (${result.user.role_name})`,
    });

    const next = safeReturnPath(new URLSearchParams(window.location.search).get('next'));
    submitting.current = false;
    router.push(next || getDashboardPath(result.user.role_code));
  };

  return (
    <AuthShell title="Welcome Back" subtitle="Sign in to continue to your dashboard" compact>
      <form onSubmit={handleSubmit} className="auth-signup-form" noValidate>
        <AuthField
          id="work-email"
          label="Work Email"
          icon={Mail}
          type="email"
          autoComplete="email"
          value={email}
          placeholder="name@careyu.ai"
          data-demo="login-email"
          error={fieldErrors.email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
          }}
        />

        <AuthPasswordField
          id="password"
          label="Password"
          value={password}
          placeholder="Enter your password"
          autoComplete="current-password"
          error={fieldErrors.password}
          onChange={(value) => {
            setPassword(value);
            if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
          }}
        />

        {formError && <p className="auth-signup-error">{formError}</p>}
        {(errorCode === 'ACCOUNT_PENDING' || errorCode === 'invitation_required') && (
          <p className="text-[13px] text-[color:var(--auth-muted)]">
            <Link href="/invitation-login" className="auth-link">
              Continue with invitation code
            </Link>
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-[color:var(--auth-muted)]">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-[color:var(--auth-blue)] accent-[color:var(--auth-blue)]"
            />
            Remember me
          </label>
          <Link href="/forgot-password" className="auth-link text-sm">
            Forgot Password?
          </Link>
        </div>

        <AuthButton loading={loading} loadingText="Signing In...">
          Sign In
        </AuthButton>
      </form>

      <div className="auth-signup-signin space-y-2">
        <p>
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="auth-link">
            Create Account
          </Link>
        </p>
        <p>
          First-time login?{' '}
          <Link href="/invitation-login" className="auth-link">
            Use invitation code
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
