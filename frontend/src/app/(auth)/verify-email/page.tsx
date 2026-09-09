'use client';

import { Link, useSearchParams } from '@/lib/navigation';
import React, { Suspense, useEffect, useMemo, useState } from 'react';


import { CheckCircle2, Loader2, Mail } from 'lucide-react';
import AuthShell from '@/components/auth/AuthShell';
import AuthField from '@/components/auth/AuthField';
import AuthButton from '@/components/auth/AuthButton';
import { isValidEmail, resendVerificationWithApi, verifyEmailWithApi } from '@/lib/auth';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get('token') || '', [searchParams]);
  const [status, setStatus] = useState<'loading' | 'success' | 'expired' | 'invalid' | 'pending'>('loading');
  const [message, setMessage] = useState('Verifying your email...');
  const [email, setEmail] = useState('');
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [verifyUrl, setVerifyUrl] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!token) {
        if (!cancelled) {
          setStatus('pending');
          setMessage("We've sent a verification link to your work email.");
        }
        return;
      }
      const result = await verifyEmailWithApi(token);
      if (cancelled) return;
      if (result.ok) {
        setStatus('success');
        setMessage(result.message);
        return;
      }
      if (result.code === 'expired') {
        setStatus('expired');
        setMessage(result.error);
        return;
      }
      setStatus('invalid');
      setMessage(result.error);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    setResendMessage(null);
    setVerifyUrl(null);
    if (!isValidEmail(email)) {
      setResendMessage('Enter a valid work email address.');
      return;
    }
    setResending(true);
    const result = await resendVerificationWithApi(email);
    setResending(false);
    if (!result.ok) {
      setResendMessage(result.error);
      return;
    }
    setResendMessage(result.message);
    if (result.verifyUrl) setVerifyUrl(result.verifyUrl);
  };

  return (
    <AuthShell title="Verify Your Email" subtitle="Confirm your CareYu work email to activate your account." showFlow={false} compact>
      {status === 'loading' && (
        <div className="flex items-center gap-2 text-sm text-[color:var(--auth-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          {message}
        </div>
      )}

      {(status === 'success' || status === 'pending') && (
        <>
          <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{message}</span>
          </div>
          <div className="mt-5 space-y-2.5">
            {status === 'success' ? (
              <Link href="/login" className="auth-btn-primary">
                Continue to Sign In
              </Link>
            ) : (
              <>
                <a href="https://outlook.office.com/mail/" target="_blank" rel="noreferrer" className="auth-btn-primary">
                  Open Email
                </a>
                <Link href="/login" className="auth-btn-secondary">
                  Back to Sign In
                </Link>
              </>
            )}
          </div>
        </>
      )}

      {(status === 'expired' || status === 'invalid') && (
        <>
          <p className="mb-4 text-sm text-[color:var(--auth-error)]">{message}</p>
          {(status === 'expired' || status === 'invalid') && (
            <form onSubmit={handleResend} className="space-y-3.5">
              <AuthField
                id="resend-email"
                label="Work Email"
                icon={Mail}
                type="email"
                value={email}
                placeholder="Enter your work email"
                onChange={(e) => setEmail(e.target.value)}
              />
              {resendMessage && <p className="text-sm text-[color:var(--auth-muted)]">{resendMessage}</p>}
              {verifyUrl && (
                <a href={verifyUrl} className="auth-link block break-all text-[12px]">
                  {verifyUrl}
                </a>
              )}
              <AuthButton loading={resending} loadingText="Sending...">
                Resend Verification Email
              </AuthButton>
            </form>
          )}
          <Link href="/login" className="auth-link mt-5 block text-center text-sm">
            Back to Sign In
          </Link>
        </>
      )}
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <AuthShell title="Verify Your Email" subtitle="Confirming your account..." showFlow={false} compact>
          <div className="flex items-center gap-2 text-sm text-[color:var(--auth-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Verifying your email...
          </div>
        </AuthShell>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
