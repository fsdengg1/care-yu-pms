import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { initStore, isStoreInitialized, store } from './store/db.js';
import authRouter from './routes/auth.js';
import masterRouter from './routes/master.js';
import dashboardRouter from './routes/dashboard.js';
import leadsRouter from './routes/leads.js';
import notificationsRouter from './routes/notifications.js';
import escalationsRouter from './routes/escalations.js';
import projectsRouter from './routes/projects.js';
import operationsRouter from './routes/operations.js';
import dailyUpdatesRouter from './routes/dailyUpdates.js';
import dailyStatusRouter from './routes/dailyStatus.js';
import planningRouter from './routes/planning.js';
import usersRouter from './routes/users.js';
import documentsRouter from './routes/documents.js';
import chatRouter from './routes/chat.js';
import forumRouter from './routes/forum.js';
import tasksRouter from './routes/tasks.js';
import executiveOverviewRouter from './routes/executiveOverview.js';
import { logEmailConfigOnStartup } from './lib/emailDiagnostics.js';
import { ensureLiveDirectory } from './lib/directoryRoles.js';
import { ensureRobotLeadAccount } from './lib/robotLead.js';
import { ensureActionItemTasks } from './lib/actionItemSheet.js';
import emailRouter from './routes/email.js';

export const app = express();
export { initializeBackend };

function isLoopbackHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function isPrivateLanHost(hostname: string) {
  return (
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  );
}

function isAllowedOrigin(origin: string | undefined) {
  if (!origin) return true;
  const incoming = origin.replace(/\/$/, '');
  if (env.corsOrigins.includes(incoming)) return true;
  try {
    const url = new URL(incoming);
    // Allow Cloudflare Pages production and preview deployments
    if (url.hostname === 'careyu-frontend.pages.dev' || url.hostname.endsWith('.careyu-frontend.pages.dev')) {
      return true;
    }
    const swapped = new URL(incoming);
    if (url.hostname === 'localhost') swapped.hostname = '127.0.0.1';
    else if (url.hostname === '127.0.0.1') swapped.hostname = 'localhost';
    if (swapped.origin !== url.origin && env.corsOrigins.includes(swapped.origin)) return true;
    if (env.nodeEnv === 'production') return false;
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    return isLoopbackHost(url.hostname) || isPrivateLanHost(url.hostname);
  } catch {
    return false;
  }
}

const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, origin || true);
      return;
    }
    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Accept',
    'Origin',
    'X-Requested-With',
    'X-File-Name',
    'X-File-Type',
    'X-File-Size',
    'X-Mime-Type',
    'X-Entity-Type',
    'X-Entity-Id',
  ],
  exposedHeaders: ['Content-Type'],
  optionsSuccessStatus: 204,
  maxAge: 86400,
};

app.use((_req, res, next) => {
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});
app.use(cors(corsOptions));
app.options('/{*path}', cors(corsOptions));
app.use((req, _res, next) => {
  if ((req as { _preParsedBody?: unknown })._preParsedBody !== undefined) {
    req.body = (req as { _preParsedBody?: unknown })._preParsedBody;
    (req as { _body?: boolean })._body = true;
  }
  next();
});
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'careyu-backend-api',
    message: 'CareYu PMS Backend API Service',
    health: '/api/health',
  });
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'careyu-backend',
    env: env.nodeEnv,
    store: isStoreInitialized() ? 'ready' : 'starting',
  });
});

app.use('/api/auth', authRouter);
app.use('/api/email', emailRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/escalations', escalationsRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/daily-updates', dailyUpdatesRouter);
app.use('/api/daily-status', dailyStatusRouter);
app.use('/api/planning', planningRouter);
app.use('/api/users', usersRouter);
app.use('/api/chat', chatRouter);
app.use('/api/forum', forumRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/executive-overview', executiveOverviewRouter);
app.use('/api', documentsRouter);
app.use('/api', operationsRouter);
app.use('/api', masterRouter);

async function initializeBackend() {
  if (isStoreInitialized()) return;
  const storeInfo = await initStore();
  console.log(
    `Store ready (source=${storeInfo.source}, users=${storeInfo.counts.users}, pendingSignups=${storeInfo.counts.pendingSignups ?? 0}, leads=${storeInfo.counts.leads}, projects=${storeInfo.counts.projects})`
  );
  if (process.env.CLOUDFLARE_WORKER === '1') {
    logEmailConfigOnStartup();
    return;
  }
  const leads = store.getLeads();
  const retired = leads.map((lead) => {
    if (String(lead.status) !== 'LIVE_CASE_DEMONSTRATION' && String(lead.pipeline_stage) !== 'LIVE_DEMO') return lead;
    return { ...lead, status: 'QUOTATION' as const, pipeline_stage: 'QUOTATION' as const };
  });
  if (retired.some((lead, index) => lead !== leads[index])) {
    store.saveLeads(retired);
  }
  await ensureLiveDirectory();
  await ensureRobotLeadAccount();
  ensureActionItemTasks();
  logEmailConfigOnStartup();
}

