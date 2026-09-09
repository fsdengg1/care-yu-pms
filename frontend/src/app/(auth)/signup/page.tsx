'use client';

import { Link } from '@/lib/navigation';
import React, { useEffect, useMemo, useState } from 'react';

import { Mail, MailCheck, User } from 'lucide-react';
import SignupShell from '@/components/auth/SignupShell';
import AuthField from '@/components/auth/AuthField';
import AuthButton from '@/components/auth/AuthButton';
import { fetchAuthConfig, isAllowedWorkEmail, isValidEmail, signupWithApi } from '@/lib/auth';

export default function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | undefined>();
  const [successEmail, setSuccessEmail] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(true);
  const [successMessage, setSuccessMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [allowedDomains, setAllowedDomains] = useState<string[]>(['careyu.ai']);
  const [primaryDomain, setPrimaryDomain] = useState('careyu.ai');

  useEffect(() => {
    let cancelled = false;
    void fetchAuthConfig().then((config) => {
      if (cancelled || !config) return;
      setAllowedDomains(config.allowedEmailDomains);
      setPrimaryDomain(config.primaryEmailDomain);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const emailPlaceholder = useMemo(() => `name@${primaryDomain}`, [primaryDomain]);

  const clearFieldError = (key: string) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const validateEmailField = (value: string): string | undefined => {
    const trimmed = value.trim();
    if (!trimmed) return 'Work email is required.';
    if (!isValidEmail(trimmed)) return 'Please enter a valid work email address.';
    if (!isAllowedWorkEmail(trimmed, allowedDomains)) {
      return 'Please use your CareYu work email address.';
    }
    return undefined;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setErrorCode(undefined);

    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = 'Full name is required.';
    const emailError = validateEmailField(email);
    if (emailError) errors.email = emailError;

    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setLoading(true);
    const result = await signupWithApi({
      name: name.trim(),
      email: email.trim(),
    });
    setLoading(false);

    if (!result.ok) {
      setError(result.error);
      setErrorCode(result.code);
      if (result.code === 'INVALID_EMAIL_DOMAIN' || result.code === 'invalid_domain' || result.code === 'DUPLICATE_EMAIL' || result.code === 'PENDING_SIGNUP' || result.code === 'duplicate_email') {
        setFieldErrors((prev) => ({ ...prev, email: result.error }));
        setError(null);
      }
      return;
    }

    setSuccessEmail(result.email || email.trim().toLowerCase());
    setEmailSent(result.emailSent !== false);
    setSuccessMessage(result.message);
  };

  if (successEmail) {
    return (
      <SignupShell showHeader={false}>
        <div className="auth-signup-success">
          <div className="auth-signup-success-icon" aria-hidden="true">
            <MailCheck strokeWidth={2.2} />
          </div>
          <header className="auth-signup-card__header">
            <h2>{emailSent ? 'Account Created Successfully' : 'Invitation created'}</h2>
            <p>
              {emailSent
                ? successMessage || `Invitation sent to fsdengg1@careyu.ai. Complete first-time login with ${successEmail} and the invitation code.`
                : successMessage || 'Invitation email could not be sent.'}
            </p>
          </header>
          {emailSent ? (
            <p>An invitation code has been sent to your Reporting Manager.</p>
          ) : (
            <p className="auth-signup-error">
              {successMessage ||
                'Invitation email could not be sent.'}
            </p>
          )}
          <p>
            Please contact your Reporting Manager to receive the invitation code, then first-time login
            with <strong>{successEmail}</strong> and that code.
          </p>
          <div className="auth-signup-next">
            <span>Next Step</span>
            <p>
              Use your <strong>Work Email + Invitation Code</strong> to continue.
            </p>
          </div>
          <Link href={`/invitation-login?email=${encodeURIComponent(successEmail)}`} className="auth-btn-primary">
            Continue to First-Time Login
          </Link>
        </div>
      </SignupShell>
    );
  }

  return (
    <SignupShell title="Create Your Account" subtitle="Join the CareYu Automation workspace">
      <form onSubmit={handleSubmit} className="auth-signup-form" noValidate>
        <AuthField
          id="full-name"
          label="Full Name"
          icon={User}
          value={name}
          placeholder="Enter your full name"
          autoComplete="name"
          error={fieldErrors.name}
          onChange={(e) => {
            setName(e.target.value);
            clearFieldError('name');
          }}
        />

        <AuthField
          id="signup-email"
          label="Work Email"
          icon={Mail}
          type="email"
          value={email}
          placeholder={emailPlaceholder}
          autoComplete="email"
          hint="Use your CareYu work email address"
          error={fieldErrors.email}
          onChange={(e) => {
            setEmail(e.target.value);
            clearFieldError('email');
            if (
              errorCode === 'invalid_domain' ||
              errorCode === 'INVALID_EMAIL_DOMAIN' ||
              errorCode === 'duplicate_email' ||
              errorCode === 'DUPLICATE_EMAIL' ||
              errorCode === 'PENDING_SIGNUP'
            ) {
              setError(null);
              setErrorCode(undefined);
            }
          }}
          onBlur={() => {
            if (!email.trim()) return;
            const message = validateEmailField(email);
            if (message) setFieldErrors((prev) => ({ ...prev, email: message }));
            else clearFieldError('email');
          }}
        />

        {errorCode === 'duplicate_email' || errorCode === 'DUPLICATE_EMAIL' ? (
          <p className="auth-signup-error">
            Already have an account?{' '}
            <Link href="/login" className="auth-link">
              Sign In
            </Link>
          </p>
        ) : null}

        {error &&
          errorCode !== 'duplicate_email' &&
          errorCode !== 'DUPLICATE_EMAIL' &&
          errorCode !== 'invalid_domain' &&
          errorCode !== 'INVALID_EMAIL_DOMAIN' &&
          errorCode !== 'PENDING_SIGNUP' && (
          <p className="auth-signup-error">{error}</p>
        )}

        <AuthButton loading={loading} loadingText="Creating Account...">
          Create Account
        </AuthButton>
      </form>

      <p className="auth-signup-signin">
        Already have an account?{' '}
        <Link href="/login" className="auth-link">
          Sign In
        </Link>
      </p>
    </SignupShell>
  );
}
