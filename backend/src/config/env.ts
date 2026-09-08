import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

function stripEnvValue(value: string | undefined): string {
  return (value ?? '').trim().replace(/^['"]|['"]$/g, '').trim();
}

function loadBackendEnv() {
  try {
    const metaUrl = import.meta?.url;
    if (!metaUrl) return;
    const here = path.dirname(fileURLToPath(metaUrl));
    const candidates = [
      path.resolve(here, '../../.env'),
      path.resolve(process.cwd(), '.env'),
      path.resolve(here, '../../../backend/.env'),
    ];
    const envPath = candidates.find((candidate) => {
      try {
        return fs.existsSync(candidate);
      } catch {
        return false;
      }
    });
    const assignIfUnset = (key: string, raw: string | undefined) => {
      const value = stripEnvValue(raw);
      if (!value) return;
      if (process.env[key] == null || process.env[key] === '') {
        process.env[key] = value;
      }
    };

    if (!envPath) {
      dotenv.config({ quiet: true, override: false });
      return;
    }
    const parsed = dotenv.parse(fs.readFileSync(envPath));
    for (const [key, raw] of Object.entries(parsed)) {
      assignIfUnset(key, raw);
    }
  } catch {
    // Ignore file system env loading errors when the process cannot read .env files
  }
}

loadBackendEnv(); // load backend/.env once at process start

function required(name: string, fallback = ''): string {
  const value = stripEnvValue(process.env[name]) || fallback;
  return value;
}

function firstEnv(...names: string[]): string {
  for (const name of names) {
    const value = stripEnvValue(process.env[name]);
    if (value) return value;
  }
  return '';
}

function parseAllowedEmailDomains(): string[] {
  const multi = process.env.ALLOWED_EMAIL_DOMAINS;
  const single = process.env.ALLOWED_EMAIL_DOMAIN;
  const raw = multi?.trim() || single?.trim() || 'careyu.ai';
  const domains = raw
    .split(',')
    .map((part) => part.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
  return [...new Set(domains)];
}

function parseEmailProvider(): string {
  const explicit = (process.env.EMAIL_PROVIDER ?? '').trim().toLowerCase();
  if (explicit === 'elastic' || explicit === 'elastic-email') return 'elasticemail';
  if (explicit) return explicit;
  if (firstEnv('ELASTIC_EMAIL_API_KEY')) return 'elasticemail';
  return 'console';
}

function parseEmailList(raw: string | undefined, extras: string[] = []): string[] {
  const listed = (raw ?? '')
    .split(/[,;]+/)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.includes('@'));
  return [...new Set([...listed, ...extras])];
}

function firstEmailAddress(raw: string | undefined, fallback: string): string {
  return parseEmailList(raw)[0] || fallback;
}

function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/$/, '');
}

function localhostAlias(origin: string): string | null {
  try {
    const url = new URL(origin);
    if (url.hostname === 'localhost') {
      url.hostname = '127.0.0.1';
      return url.origin;
    }
    if (url.hostname === '127.0.0.1') {
      url.hostname = 'localhost';
      return url.origin;
    }
    return null;
  } catch {
    return null;
  }
}

function parseCorsOrigins(): string[] {
  const listed = (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);
  const frontend = normalizeOrigin(process.env.FRONTEND_URL ?? '');
  const origins = new Set(listed);
  if (frontend) origins.add(frontend);
  for (const origin of [...origins]) {
    const alias = localhostAlias(origin);
    if (alias) origins.add(alias);
  }
  return [...origins];
}

export const env = {
  get port() { return Number(process.env.PORT ?? 4000); },
  get nodeEnv() { return process.env.NODE_ENV ?? 'development'; },
  get jwtSecret() { return required('JWT_SECRET', 'careyu-dev-jwt-secret-change-in-production'); },
  get jwtExpiresIn() { return process.env.JWT_EXPIRES_IN ?? '8h'; },
  get jwtRememberExpiresIn() { return process.env.JWT_REMEMBER_EXPIRES_IN ?? '30d'; },
  get demoPassword() { return required('DEMO_PASSWORD', 'Careyu@123'); },
  get fsdEngg1Password() { return stripEnvValue(process.env.FSDENGG1_PASSWORD); },
  get businessHeadPassword() { return stripEnvValue(process.env.BUSINESSHEAD_PASSWORD); },
  get robotLeadEmail() { return (process.env.ROBOT_LEAD_EMAIL ?? 'robottech@careyu.ai').trim().toLowerCase(); },
  get robotLeadPassword() { return stripEnvValue(process.env.ROBOT_LEAD_PASSWORD) || 'Careyu@9865'; },
  get databaseUrl() { return required('DATABASE_URL'); },
  get databaseSsl() { return (process.env.DATABASE_SSL ?? 'true').toLowerCase() !== 'false'; },
  get frontendUrl() { return (process.env.FRONTEND_URL ?? 'http://localhost:3000').replace(/\/$/, ''); },
  get allowedEmailDomains() { return parseAllowedEmailDomains(); },
  get emailProvider() { return parseEmailProvider(); },
  get emailApiKey() { return firstEnv('ELASTIC_EMAIL_API_KEY', 'EMAIL_API_KEY'); },
  get emailFrom() { return firstEnv('ELASTIC_EMAIL_FROM_EMAIL', 'ELASTIC_EMAIL_SENDER_EMAIL', 'EMAIL_FROM') || 'noreply@careyu.ai'; },
  get emailFromName() { return firstEnv('ELASTIC_EMAIL_FROM_NAME', 'ELASTIC_EMAIL_SENDER_NAME', 'EMAIL_FROM_NAME') || 'CareYu Automation'; },
  get emailReplyTo() { return process.env.EMAIL_REPLY_TO ?? ''; },
  get emailDebug() { return (process.env.EMAIL_DEBUG ?? 'false').toLowerCase() === 'true'; },
  get supportEmail() { return process.env.SUPPORT_EMAIL ?? 'admin@careyu.ai'; },
  get smtpHost() { return process.env.SMTP_HOST ?? ''; },
  get smtpPort() { return Number(process.env.SMTP_PORT ?? 587); },
  get smtpSecure() { return (process.env.SMTP_SECURE ?? 'false').toLowerCase() === 'true'; },
  get smtpUser() { return process.env.SMTP_USER ?? ''; },
  get smtpPass() { return process.env.SMTP_PASS ?? ''; },
  get emailVerificationTtlHours() { return Number(process.env.EMAIL_VERIFICATION_TTL_HOURS ?? 24); },
  get passwordResetTtlMinutes() { return Number(process.env.PASSWORD_RESET_EXPIRY_MINUTES ?? process.env.PASSWORD_RESET_TTL_MINUTES ?? 30); },
  get invitationTtlHours() { return Number(process.env.INVITATION_EXPIRY_HOURS ?? process.env.INVITATION_TTL_HOURS ?? 24); },
  get passwordSetupTtlMinutes() { return Number(process.env.PASSWORD_SETUP_TTL_MINUTES ?? 30); },
  get defaultReportingManagerEmail() { return firstEmailAddress(process.env.DEFAULT_REPORTING_MANAGER_EMAIL, 'robotlead1@careyu.ai'); },
  get invitationNotifyEmails() { return parseEmailList(process.env.INVITATION_NOTIFY_EMAILS ?? 'fsdengg1@careyu.ai', parseEmailList(process.env.DEFAULT_REPORTING_MANAGER_EMAIL ?? 'robotlead1@careyu.ai')); },
  get enableDevRolePreview() { return (process.env.ENABLE_DEV_ROLE_PREVIEW ?? 'false').toLowerCase() === 'true' && (process.env.NODE_ENV ?? 'development') !== 'production'; },
  get corsOrigins() { return parseCorsOrigins(); },
  get reminderAfterHours() { return Number(process.env.REMINDER_AFTER_HOURS ?? 24); },
  get maxReminders() { return Number(process.env.MAX_REMINDERS ?? 3); },
  get escalationAfterReminders() { return Number(process.env.ESCALATION_AFTER_REMINDERS ?? 3); },
  get dailyDigestEnabled() { return (process.env.DAILY_DIGEST_ENABLED ?? 'true').toLowerCase() === 'true'; },
  get schedulerEnabled() { return (process.env.NOTIFICATION_SCHEDULER_ENABLED ?? 'true').toLowerCase() !== 'false'; },
  get appTimezone() { return (process.env.APP_TIMEZONE ?? process.env.TZ ?? 'Asia/Kolkata').trim() || 'Asia/Kolkata'; },
  get defaultProjectManagerEmail() { return (process.env.DEFAULT_PROJECT_MANAGER_EMAIL ?? '').trim().toLowerCase(); },
};
