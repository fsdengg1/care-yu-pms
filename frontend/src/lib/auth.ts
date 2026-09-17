import { User } from './types';
import { apiRequest } from './api';
import { StorageService } from './storage';
import { isValidEmail, validatePasswordPolicy } from './passwordPolicy';

export interface LoginFieldErrors {
  email?: string;
  password?: string;
  invitationCode?: string;
}

export function validateLogin(email: string, password: string): LoginFieldErrors {
  const errors: LoginFieldErrors = {};
  const trimmed = email.trim();

  if (!trimmed) {
    errors.email = 'Work email is required.';
  } else if (!isValidEmail(trimmed)) {
    errors.email = 'Enter a valid work email address.';
  }

  if (!password) {
    errors.password = 'Password is required.';
  }

  return errors;
}

export function validateInvitationLogin(email: string, invitationCode: string): LoginFieldErrors {
  const errors: LoginFieldErrors = {};
  const trimmed = email.trim();
  if (!trimmed) errors.email = 'Work email is required.';
  else if (!isValidEmail(trimmed)) errors.email = 'Enter a valid work email address.';
  if (!invitationCode.trim()) errors.invitationCode = 'Invitation code is required.';
  return errors;
}

export async function loginWithApi(
  email: string,
  password: string,
  rememberMe = true
): Promise<{ ok: true; user: User; token: string } | { ok: false; error: string; code?: string }> {
  const result = await apiRequest<{ user: User; token: string }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ workEmail: email.trim(), email: email.trim(), password, rememberMe }),
  });

  if (!result.ok) {
    return { ok: false, error: result.message, code: result.code };
  }
  if (!result.data?.token || !result.data?.user) {
    return { ok: false, error: 'Unable to sign in. Please check the backend server.' };
  }
  return { ok: true, user: result.data.user, token: result.data.token };
}

export async function lookupLoginModeWithApi(
  email: string
): Promise<{ loginMode: 'password' | 'invitation' }> {
  const result = await apiRequest<{ loginMode: 'password' | 'invitation' }>('/api/auth/login-mode', {
    method: 'POST',
    body: JSON.stringify({ workEmail: email.trim(), email: email.trim() }),
  });
  if (!result.ok) return { loginMode: 'password' };
  return { loginMode: result.data.loginMode === 'invitation' ? 'invitation' : 'password' };
}

export async function invitationLoginWithApi(
  email: string,
  invitationCode: string
): Promise<
  | { ok: true; setupToken: string; user: { id: string; name: string; email: string } }
  | { ok: false; error: string; code?: string }
> {
  const result = await apiRequest<{
    setupToken: string;
    user: { id: string; name: string; email: string };
  }>('/api/auth/verify-invitation', {
    method: 'POST',
    body: JSON.stringify({ workEmail: email.trim(), invitationCode: invitationCode.trim() }),
  });
  if (!result.ok) return { ok: false, error: result.message, code: result.code };
  return { ok: true, setupToken: result.data.setupToken, user: result.data.user };
}

export async function requestInvitationWithApi(
  email: string
): Promise<{ ok: true; message: string } | { ok: false; error: string; code?: string }> {
  const result = await apiRequest<{ message: string }>('/api/auth/request-invitation', {
    method: 'POST',
    body: JSON.stringify({ workEmail: email.trim(), email: email.trim() }),
  });
  if (!result.ok) return { ok: false, error: result.message, code: result.code };
  return { ok: true, message: result.data.message };
}

export async function createPasswordWithApi(input: {
  newPassword: string;
  confirmPassword: string;
  setupToken?: string;
}): Promise<{ ok: true; message: string; user: User; token?: string } | { ok: false; error: string; code?: string }> {
  const headers: HeadersInit = {};
  if (input.setupToken) {
    headers.Authorization = `Bearer ${input.setupToken}`;
  }
  const result = await apiRequest<{ message: string; user: User; token?: string }>('/api/auth/create-password', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      newPassword: input.newPassword,
      confirmPassword: input.confirmPassword,
    }),
  });
  if (!result.ok) return { ok: false, error: result.message, code: result.code };
  return { ok: true, message: result.data.message, user: result.data.user, token: result.data.token };
}

export async function signupWithApi(input: {
  name: string;
  email: string;
}): Promise<
  | { ok: true; message: string; email: string; deliveryMode?: string; emailSent?: boolean }
  | { ok: false; error: string; code?: string }
> {
  const result = await apiRequest<{
    message: string;
    email: string;
    deliveryMode?: string;
    emailSent?: boolean;
  }>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      fullName: input.name.trim(),
      workEmail: input.email.trim().toLowerCase(),
    }),
  });
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.status === 0
          ? 'Unable to create your account right now. Please try again.'
          : result.message,
      code: result.code,
    };
  }
  return {
    ok: true,
    message: result.data.message,
    email: result.data.email,
    deliveryMode: result.data.deliveryMode,
    emailSent: result.data.emailSent,
  };
}

export type AuthPublicConfig = {
  allowedEmailDomains: string[];
  primaryEmailDomain: string;
  supportEmail: string;
};

export async function fetchAuthConfig(): Promise<AuthPublicConfig | null> {
  const result = await apiRequest<AuthPublicConfig>('/api/auth/config');
  if (!result.ok) return null;
  const domains = Array.isArray(result.data.allowedEmailDomains)
    ? result.data.allowedEmailDomains.map((d) => String(d).toLowerCase().replace(/^@/, ''))
    : [];
  return {
    allowedEmailDomains: domains.length ? domains : ['careyu.ai'],
    primaryEmailDomain: result.data.primaryEmailDomain || domains[0] || 'careyu.ai',
    supportEmail: result.data.supportEmail || 'admin@careyu.ai',
  };
}

export function isAllowedWorkEmail(email: string, allowedDomains: string[]): boolean {
  const normalized = email.trim().toLowerCase();
  if (!isValidEmail(normalized)) return false;
  const domain = normalized.split('@')[1];
  if (!domain) return false;
  if (!allowedDomains.length) return true;
  return allowedDomains.includes(domain);
}

export async function forgotPasswordWithApi(
  email: string
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const result = await apiRequest<{ message: string }>('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ workEmail: email.trim(), email: email.trim() }),
  });
  if (!result.ok) return { ok: false, error: result.message };
  return { ok: true, message: result.data.message };
}

export async function resetPasswordWithApi(input: {
  token: string;
  password: string;
  confirmPassword: string;
}): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const result = await apiRequest<{ message: string }>('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!result.ok) return { ok: false, error: result.message };
  return { ok: true, message: result.data.message };
}

export async function verifyEmailWithApi(
  token: string
): Promise<{ ok: true; message: string } | { ok: false; error: string; code?: string }> {
  const result = await apiRequest<{ message: string; code?: string }>(
    `/api/auth/verify-email?token=${encodeURIComponent(token)}`
  );
  if (!result.ok) {
    return { ok: false, error: result.message, code: result.code };
  }
  return { ok: true, message: result.data.message };
}

export async function resendVerificationWithApi(
  email: string
): Promise<
  | { ok: true; message: string; verifyUrl?: string; deliveryMode?: string }
  | { ok: false; error: string }
> {
  const result = await apiRequest<{ message: string; verifyUrl?: string; deliveryMode?: string }>(
    '/api/auth/resend-verification',
    {
      method: 'POST',
      body: JSON.stringify({ email: email.trim() }),
    }
  );
  if (!result.ok) return { ok: false, error: result.message };
  return {
    ok: true,
    message: result.data.message,
    verifyUrl: result.data.verifyUrl,
    deliveryMode: result.data.deliveryMode,
  };
}

export async function changePasswordWithApi(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const result = await apiRequest<{ message: string }>('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!result.ok) return { ok: false, error: result.message };
  return { ok: true, message: result.data.message };
}

export async function fetchCurrentUser(): Promise<{ ok: true; user: User } | { ok: false }> {
  const result = await apiRequest<{ user: User }>('/api/auth/me');
  if (!result.ok) return { ok: false };
  return { ok: true, user: result.data.user };
}

export async function logoutWithApi() {
  await apiRequest<{ message: string }>('/api/auth/logout', { method: 'POST' });
}

export async function ensureAuthSession(): Promise<boolean> {
  const token = StorageService.getAuthToken();
  if (!token) {
    StorageService.clearCurrentUser();
    return false;
  }

  const me = await fetchCurrentUser();
  if (!me.ok) {
    StorageService.clearCurrentUser();
    return false;
  }

  const remember = Boolean(typeof window !== 'undefined' && localStorage.getItem('cya_current_user_v6'));
  StorageService.setCurrentUser(me.user, remember);
  StorageService.setAuthToken(token, remember);
  return true;
}

export function safeReturnPath(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('://')) return null;
  return trimmed;
}

export function getDashboardPath(roleCode: string): string {
  switch (roleCode) {
    case 'CEO':
      return '/dashboard/ceo';
    case 'CTO':
      return '/dashboard/cto';
    case 'BUSINESS_HEAD':
      return '/dashboard/business-head';
    case 'ENGG_DIRECTOR':
      return '/dashboard/engineering';
    case 'PROJECT_MANAGER':
    case 'PROJECT_ENGINEER':
      return '/dashboard/pm';
    case 'TEAM_LEAD':
      return '/dashboard/team-lead';
    case 'EMPLOYEE':
    case 'EXECUTION':
      return '/dashboard/team-member';
    default:
      return '/dashboard';
  }
}

export { validatePasswordPolicy, isValidEmail };
