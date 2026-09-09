'use client';

import { Link, useRouter, useSearchParams } from '@/lib/navigation';
import React, { Suspense, useEffect, useState } from 'react';


import { KeyRound, Loader2, Mail } from 'lucide-react';
import AuthShell from '@/components/auth/AuthShell';
import AuthField from '@/components/auth/AuthField';
import AuthButton from '@/components/auth/AuthButton';
import {
  invitationLoginWithApi,
  validateInvitationLogin,
  requestInvitationWithApi,
} from '@/lib/auth';
import { StorageService } from '@/lib/storage';

function InvitationLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; invitationCode?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [requestInfo, setRequestInfo] = useState<string | null>(null);

  useEffect(() => {
    const fromInvite = (searchParams.get('email') || '').trim();
    if (fromInvite) setEmail(fromInvite);
  }, [searchParams]);

  useEffect(() => {
    if (StorageService.getAuthToken()) {
      router.replace('/dashboard');
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setFormError(null);
    setErrorCode(undefined);
    setRequestInfo(null);

    const errors = validateInvitationLogin(email, invitationCode);
    setFieldErrors(errors);
    if (errors.email || errors.invitationCode) return;

    setLoading(true);
    const result = await invitationLoginWithApi(email, invitationCode);
    setLoading(false);
    if (!result.ok) {
      setFormError(result.error);
      setErrorCode(result.code);
      return;
    }

    StorageService.setPasswordSetupToken(result.setupToken);
    router.push('/create-password');
  };

  const handleRequestInvitation = async () => {
    if (!email.trim()) {
      setFieldErrors((prev) => ({ ...prev, email: 'Work email is required.' }));
      return;
    }
    setRequesting(true);
    setRequestInfo(null);
    const result = await requestInvitationWithApi(email);
    setRequesting(false);
    if (!result.ok) {
      setRequestInfo(result.error);
      return;
    }
    setRequestInfo(result.message);
  };

  const expired = errorCode === 'INVITATION_EXPIRED' || errorCode === 'expired';

  return (
    <AuthShell title="Welcome to CareYu" subtitle="Complete your first-time login" compact>
      <form onSubmit={handleSubmit} className="auth-signup-form" noValidate>
        <AuthField
          id="work-email"
          label="Work Email"
          icon={Mail}
          type="email"
          autoComplete="email"
          value={email}
          placeholder="name@careyu.ai"
          hint="Use the work email from the invitation, not a different inbox that forwarded the mail."
          error={fieldErrors.email}
          onChange={(e) => {
            setEmail(e.target.value);
            setFieldErrors((prev) => ({ ...prev, email: undefined }));
          }}
        />
        <AuthField
          id="invitation-code"
          label="Invitation Code"
          icon={KeyRound}
          value={invitationCode}
          placeholder="CY-XXXX-XXXX"
          autoComplete="one-time-code"
          error={fieldErrors.invitationCode}
          onChange={(e) => {
            setInvitationCode(e.target.value.toUpperCase());
            setFieldErrors((prev) => ({ ...prev, invitationCode: undefined }));
          }}
        />

        {formError && <p className="auth-signup-error">{formError}</p>}
        {expired && (
          <button
            type="button"
            onClick={() => void handleRequestInvitation()}
            disabled={requesting}
            className="auth-link text-left text-[13px] disabled:opacity-70"
          >
            {requesting ? 'Requesting new invitation...' : 'Ask Admin / Manager to resend invitation'}
          </button>
        )}
        {requestInfo && <p className="text-[13px] text-[color:var(--auth-muted)]">{requestInfo}</p>}

        <AuthButton loading={loading} loadingText="Verifying...">
          Verify Invitation
        </AuthButton>
      </form>

      <p className="auth-signup-signin">
        Already have an account?{' '}
        <Link href="/login" className="auth-link">
          Sign In
        </Link>
      </p>
    </AuthShell>
  );
}

export default function InvitationLoginPage() {
  return (
    <Suspense
      fallback={
        <AuthShell title="Welcome to CareYu" subtitle="Complete your first-time login" compact>
          <div className="flex items-center gap-2 text-sm text-[color:var(--auth-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        </AuthShell>
      }
    >
      <InvitationLoginContent />
    </Suspense>
  );
}
