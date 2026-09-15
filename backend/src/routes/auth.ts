import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import {
  authenticateLogin,
  changePassword,
  createAccountPassword,
  invitationLogin,
  lookupLoginMode,
  requestNewInvitation,
  requestPasswordReset,
  resendVerification,
  resetPasswordWithToken,
  signupUser,
  verifyEmailToken,
} from '../lib/authService.js';
import { sendInvitationToManager, sendPasswordResetEmail } from '../lib/authEmails.js';
import { isFullyActivated, publicUser, resolveSignupReportingManager } from '../lib/authUser.js';
import { clientKey, rateLimit } from '../lib/rateLimit.js';
import { requireAuth, requirePasswordSetupOrInitialPassword, AuthedRequest } from '../middleware/auth.js';
import { store } from '../store/db.js';

const router = Router();

function issueToken(
  user: { id: string; role_code: string; email: string },
  rememberMe = false
) {
  return jwt.sign(
    { sub: user.id, role: user.role_code, email: user.email },
    env.jwtSecret,
    {
      expiresIn: (rememberMe ? env.jwtRememberExpiresIn : env.jwtExpiresIn) as jwt.SignOptions['expiresIn'],
    }
  );
}

function issueSetupToken(user: { id: string; role_code: string; email: string }) {
  return jwt.sign(
    { sub: user.id, role: user.role_code, email: user.email, purpose: 'password_setup' },
    env.jwtSecret,
    { expiresIn: `${Math.max(5, env.passwordSetupTtlMinutes)}m` }
  );
}

function fail(res: import('express').Response, status: number, message: string, code?: string) {
  return res.status(status).json({ success: false, message, ...(code ? { code } : {}) });
}

function ok(res: import('express').Response, body: Record<string, unknown> = {}, status = 200) {
  return res.status(status).json({ success: true, ...body });
}

function tooMany(res: import('express').Response, retryAfterSec: number) {
  res.setHeader('Retry-After', String(retryAfterSec));
  return fail(res, 429, 'Too many requests. Please try again shortly.', 'RATE_LIMITED');
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isSystemAdmin(user?: { role_code?: string }) {
  return user?.role_code === 'SYSTEM_ADMIN';
}

router.get('/config', (_req, res) => {
  const domains = env.allowedEmailDomains;
  return res.json({
    allowedEmailDomains: domains,
    primaryEmailDomain: domains[0] || 'careyu.ai',
    supportEmail: env.supportEmail,
  });
});

router.post('/signup', async (req, res) => {
  const limited = rateLimit({ key: clientKey(req, 'signup'), limit: 8, windowMs: 15 * 60 * 1000 });
  if (!limited.ok) return tooMany(res, limited.retryAfterSec);

  const result = await signupUser({
    name: readString(req.body?.fullName || req.body?.name),
    email: readString(req.body?.workEmail || req.body?.email),
  });

  if (!result.ok) {
    return fail(res, result.status, result.message, result.code);
  }
  console.info('[auth] Signup completed', { email: result.email, emailSent: result.emailSent });
  return ok(
    res,
    {
      message: result.message,
      email: result.email,
      invitationCreated: true,
      deliveryMode: result.deliveryMode,
      emailSent: result.emailSent,
      ...(result.code ? { code: result.code } : {}),
    },
    201
  );
});

router.post('/login-mode', (req, res) => {
  const limited = rateLimit({ key: clientKey(req, 'login-mode'), limit: 40, windowMs: 15 * 60 * 1000 });
  if (!limited.ok) return tooMany(res, limited.retryAfterSec);
  const email = readString(req.body?.workEmail || req.body?.email);
  return res.json(lookupLoginMode(email));
});

router.post('/invitation-login', handleInvitationVerify);
router.post('/verify-invitation', handleInvitationVerify);

async function handleInvitationVerify(req: import('express').Request, res: import('express').Response) {
  const limited = rateLimit({ key: clientKey(req, 'invitation-login'), limit: 15, windowMs: 15 * 60 * 1000 });
  if (!limited.ok) return tooMany(res, limited.retryAfterSec);

  const result = await invitationLogin({
    email: readString(req.body?.workEmail || req.body?.email),
    invitationCode: readString(req.body?.invitationCode),
  });
  if (!result.ok) {
    return fail(res, result.status, result.message, result.code);
  }

  console.info('[auth] Invitation verification success', { userId: result.user.id });
  return ok(res, {
    setupToken: issueSetupToken(result.user),
    user: { id: result.user.id, name: result.user.name, email: result.user.email },
    message: 'Invitation verified. Please create your password.',
  });
}

router.post('/request-invitation', async (req, res) => {
  const limited = rateLimit({ key: clientKey(req, 'request-invitation'), limit: 5, windowMs: 15 * 60 * 1000 });
  if (!limited.ok) return tooMany(res, limited.retryAfterSec);

  const result = await requestNewInvitation(readString(req.body?.workEmail || req.body?.email));
  if (!result.ok) {
    return fail(res, result.status, result.message, result.code);
  }
  return ok(res, {
    message: result.message,
    deliveryMode: result.deliveryMode,
    emailSent: result.emailSent,
  });
});

router.post('/resend-invitation', requireAuth, async (req, res) => {
  if (!isSystemAdmin((req as AuthedRequest).user)) {
    return fail(res, 403, 'Forbidden. This action is not permitted for your role.', 'FORBIDDEN');
  }
  const limited = rateLimit({
    key: clientKey(req, `resend-invitation:${(req as AuthedRequest).user?.id || 'anon'}`),
    limit: 8,
    windowMs: 15 * 60 * 1000,
  });
  if (!limited.ok) return tooMany(res, limited.retryAfterSec);

  const result = await requestNewInvitation(readString(req.body?.workEmail || req.body?.email));
  if (!result.ok) {
    return fail(res, result.status, result.message, result.code);
  }
  return ok(res, {
    message: result.emailSent ? 'Invitation notification sent successfully.' : result.message,
    deliveryMode: result.deliveryMode,
    emailSent: result.emailSent,
  });
});

router.post('/create-password', requirePasswordSetupOrInitialPassword, async (req, res) => {
  const limited = rateLimit({
    key: clientKey(req, `create-password:${(req as AuthedRequest).user?.id || 'anon'}`),
    limit: 10,
    windowMs: 15 * 60 * 1000,
  });
  if (!limited.ok) return tooMany(res, limited.retryAfterSec);

  const authed = req as AuthedRequest;
  const result = await createAccountPassword({
    user: authed.user!,
    newPassword: readString(req.body?.newPassword || req.body?.password),
    confirmPassword: readString(req.body?.confirmPassword),
  });
  if (!result.ok) return fail(res, result.status, result.message);
  console.info('[auth] Password created', { userId: result.user.id });
  return ok(res, {
    message: result.message,
    user: result.user,
  });
});

router.post('/login', async (req, res) => {
  const limited = rateLimit({ key: clientKey(req, 'login'), limit: 60, windowMs: 15 * 60 * 1000 });
  if (!limited.ok) return tooMany(res, limited.retryAfterSec);

  const email = readString(req.body?.workEmail || req.body?.email).trim();
  const password = readString(req.body?.password);
  const rememberMe = Boolean(req.body?.rememberMe);

  if (!email) return fail(res, 400, 'Work email is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail(res, 400, 'Enter a valid work email address.');
  }
  if (!password) return fail(res, 400, 'Password is required.');

  const result = await authenticateLogin({ email, password });
  if (!result.ok) {
    return fail(res, result.status, result.message, result.code);
  }

  console.info('[auth] Login success', { userId: result.user.id, role: result.user.role_code });
  return ok(res, {
    token: issueToken(result.user, rememberMe),
    user: result.user,
  });
});

router.get('/verify-email', async (req, res) => {
  const limited = rateLimit({ key: clientKey(req, 'verify'), limit: 30, windowMs: 15 * 60 * 1000 });
  if (!limited.ok) return tooMany(res, limited.retryAfterSec);

  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const result = await verifyEmailToken(token);
  if (!result.ok) {
    return res.status(result.status).json({ message: result.message, code: result.code });
  }
  return res.json({ message: result.message });
});

router.post('/resend-verification', async (req, res) => {
  const limited = rateLimit({ key: clientKey(req, 'resend-verify'), limit: 5, windowMs: 15 * 60 * 1000 });
  if (!limited.ok) return tooMany(res, limited.retryAfterSec);

  const email = readString(req.body?.email);
  const result = await resendVerification(email);
  return res.json(result);
});

router.post('/forgot-password', async (req, res) => {
  const limited = rateLimit({ key: clientKey(req, 'forgot'), limit: 5, windowMs: 15 * 60 * 1000 });
  if (!limited.ok) return tooMany(res, limited.retryAfterSec);

  const email = readString(req.body?.workEmail || req.body?.email);
  const result = await requestPasswordReset(email);
  console.info('[auth] Password reset requested');
  return ok(res, result);
});

router.post('/reset-password', async (req, res) => {
  const limited = rateLimit({ key: clientKey(req, 'reset'), limit: 10, windowMs: 15 * 60 * 1000 });
  if (!limited.ok) return tooMany(res, limited.retryAfterSec);

  const result = await resetPasswordWithToken({
    token: readString(req.body?.token),
    password: readString(req.body?.password || req.body?.newPassword),
    confirmPassword: readString(req.body?.confirmPassword),
  });
  if (!result.ok) return fail(res, result.status, result.message);
  console.info('[auth] Password reset completed');
  return ok(res, { message: result.message });
});

router.post('/change-password', requireAuth, async (req, res) => {
  const limited = rateLimit({
    key: clientKey(req, `change:${(req as AuthedRequest).user?.id || 'anon'}`),
    limit: 10,
    windowMs: 15 * 60 * 1000,
  });
  if (!limited.ok) return tooMany(res, limited.retryAfterSec);

  const authed = req as AuthedRequest;
  const result = await changePassword({
    user: authed.user!,
    currentPassword: readString(req.body?.currentPassword),
    newPassword: readString(req.body?.newPassword),
    confirmPassword: readString(req.body?.confirmPassword),
  });
  if (!result.ok) return fail(res, result.status, result.message);
  return ok(res, { message: result.message });
});

router.post('/logout', (_req, res) => {
  // JWTs are client-held; logout is completed by clearing browser storage.
  return res.json({ message: 'Signed out successfully.' });
});

router.post('/restore-session', requireAuth, async (req, res) => {
  const limited = rateLimit({ key: clientKey(req, 'restore'), limit: 60, windowMs: 15 * 60 * 1000 });
  if (!limited.ok) return tooMany(res, limited.retryAfterSec);

  const user = (req as AuthedRequest).user!;
  return res.json({ token: issueToken(user, true), user: publicUser(user) });
});

router.post('/impersonate', requireAuth, (req, res) => {
  if (!env.enableDevRolePreview) {
    return res.status(403).json({ message: 'Forbidden. This action is not permitted for your role.' });
  }
  if ((req as AuthedRequest).user?.role_code !== 'SYSTEM_ADMIN') {
    return res.status(403).json({ message: 'Forbidden. This action is not permitted for your role.' });
  }

  const userId = readString(req.body?.userId);
  const target = store.findUserById(userId);
  if (!target || !isFullyActivated(target)) {
    return res.status(404).json({ message: 'User not found.' });
  }

  return res.json({ token: issueToken(target), user: publicUser(target) });
});

router.get('/me', (req, res) => {
  const token = readBearerToken(req);
  if (!token) {
    return res.status(401).json({ message: 'Not authenticated.' });
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret) as { sub: string; purpose?: string };
    if (payload.purpose === 'password_setup') {
      return res.status(401).json({ message: 'Please create your password to continue.' });
    }
    const user = store.findUserById(payload.sub);
    if (!user || !isFullyActivated(user)) {
      return res.status(401).json({ message: 'Not authenticated.' });
    }
    return res.json({ user: publicUser(user) });
  } catch {
    return res.status(401).json({ message: 'Session expired. Please sign in again.' });
  }
});

function readBearerToken(req: { headers: { authorization?: string } }) {
  const header = req.headers.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

router.post('/email-test', requireAuth, async (req, res) => {
  if (!isSystemAdmin((req as AuthedRequest).user)) {
    return fail(res, 403, 'Forbidden. This action is not permitted for your role.', 'FORBIDDEN');
  }
  const limited = rateLimit({
    key: clientKey(req, `email-test:${(req as AuthedRequest).user?.id || 'anon'}`),
    limit: 6,
    windowMs: 15 * 60 * 1000,
  });
  if (!limited.ok) return tooMany(res, limited.retryAfterSec);

  const type = readString(req.body?.type).toLowerCase();
  const user = (req as AuthedRequest).user!;
  const toEmail = readString(req.body?.toEmail).trim().toLowerCase() || user.email;

  try {
    if (type === 'password-reset') {
      const sent = await sendPasswordResetEmail({
        toEmail,
        toName: user.name,
        toUserId: user.id,
        token: 'test-token-not-valid',
        expiresInMinutes: env.passwordResetTtlMinutes,
      });
      return ok(res, {
        message: sent.status === 'SENT' ? 'Test password reset email sent.' : 'Email delivery failed.',
        transactionId: sent.transactionId || null,
        deliveryMode: sent.deliveryMode,
      });
    }

    const manager = resolveSignupReportingManager();
    if (!manager.ok) {
      return fail(res, 409, manager.message, 'MANAGER_MISSING');
    }
    const deliveries = [];
    for (const notifyEmail of env.invitationNotifyEmails) {
      const recipient = store.findUserByEmail(notifyEmail);
      const sent = await sendInvitationToManager({
        managerEmail: notifyEmail,
        managerName: recipient?.name || manager.manager.name,
        managerUserId: recipient?.id || manager.manager.id,
        employeeName: 'Test Employee',
        employeeEmail: 'testemployee@careyu.ai',
        invitationCode: 'CY-TEST-ONLY',
        expiresInHours: env.invitationTtlHours,
      });
      deliveries.push({
        to: notifyEmail,
        status: sent.status,
        transactionId: sent.transactionId || null,
        deliveryMode: sent.deliveryMode,
      });
    }
    const anySent = deliveries.some((item) => item.status === 'SENT');
    return ok(res, {
      message: anySent ? 'Test invitation email sent.' : 'Email delivery failed.',
      transactionId: deliveries.find((item) => item.transactionId)?.transactionId || null,
      deliveryMode: env.emailProvider,
      recipients: deliveries,
    });
  } catch (error) {
    console.error('[auth] Email test failed', { message: error instanceof Error ? error.message : 'unknown error' });
    return fail(res, 500, 'Unable to send the test email.', 'EMAIL_DELIVERY_FAILED');
  }
});

export default router;
