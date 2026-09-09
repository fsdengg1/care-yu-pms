import { IncomingMessage, ServerResponse } from 'node:http';
import { app, initializeBackend } from './index.js';
import { runPendingReminders, runDailyDigests } from './lib/reminderJob.js';
import { sendConfiguredEmailReport } from './lib/emailReportSchedule.js';

type WorkerEnv = Record<string, unknown> & {
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
};

let initialized = false;
let initializing: Promise<void> | null = null;

function bindWorkerEnv(env: WorkerEnv) {
  if (!env) return;
  process.env.CLOUDFLARE_WORKER = '1';
  for (const [key, value] of Object.entries(env)) {
    if (key === 'ASSETS' || key === 'HYPERDRIVE') continue;
    if (typeof value === 'string' && value.trim() !== '') {
      process.env[key] = value.trim();
    }
  }
  const secretUrl = typeof env.DATABASE_URL === 'string' ? env.DATABASE_URL.trim() : process.env.DATABASE_URL || '';
  if (secretUrl) process.env.DATABASE_URL_SECRET = secretUrl;

  const hyperdriveConn =
    env.HYPERDRIVE && typeof env.HYPERDRIVE === 'object' && 'connectionString' in env.HYPERDRIVE
      ? String((env.HYPERDRIVE as { connectionString?: string }).connectionString || '')
      : '';
  if (hyperdriveConn) {
    process.env.DATABASE_URL = hyperdriveConn;
    process.env.DATABASE_SSL = 'false';
    process.env.HYPERDRIVE_ACTIVE = '1';
    console.info('[worker-env] Using Cloudflare Hyperdrive connection string');
  } else if (secretUrl) {
    process.env.DATABASE_URL = secretUrl;
    process.env.DATABASE_SSL = 'true';
    process.env.HYPERDRIVE_ACTIVE = '0';
    console.info('[worker-env] Using DATABASE_URL secret for PostgreSQL');
  }
}

async function ensureInitialized() {
  if (initialized) return;
  if (!initializing) {
    initializing = initializeBackend()
      .then(() => {
        initialized = true;
      })
      .finally(() => {
        initializing = null;
      });
  }
  await initializing;
}

function corsHeaders(request: Request): Headers {
  const origin = request.headers.get('Origin') || '';
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, Accept, Origin, X-Requested-With, X-File-Name, X-File-Type, X-File-Size, X-Mime-Type, X-Entity-Type, X-Entity-Id',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  });
  if (origin) headers.set('Access-Control-Allow-Origin', origin);
  return headers;
}

function applyRequestBody(req: IncomingMessage, raw: Buffer) {
  const contentType = (req.headers['content-type'] || '').toLowerCase();
  if (!raw.length) {
    (req as IncomingMessage & { _preParsedBody?: unknown })._preParsedBody = {};
    (req as IncomingMessage & { _body?: boolean })._body = true;
    req.push(null);
    return;
  }

  if (contentType.includes('application/json')) {
    try {
      (req as IncomingMessage & { _preParsedBody?: unknown })._preParsedBody = JSON.parse(raw.toString('utf8'));
    } catch {
      (req as IncomingMessage & { _preParsedBody?: unknown })._preParsedBody = {};
    }
    (req as IncomingMessage & { _body?: boolean })._body = true;
  } else if (contentType.includes('application/x-www-form-urlencoded')) {
    try {
      (req as IncomingMessage & { _preParsedBody?: unknown })._preParsedBody = Object.fromEntries(
        new URLSearchParams(raw.toString('utf8'))
      );
    } catch {
      (req as IncomingMessage & { _preParsedBody?: unknown })._preParsedBody = {};
    }
    (req as IncomingMessage & { _body?: boolean })._body = true;
  }

  req.headers['content-length'] = String(raw.length);
  req.push(raw);
  req.push(null);
}

function dispatchExpress(request: Request, raw: Buffer): Promise<Response> {
  return new Promise<Response>((resolve) => {
    let resolved = false;
    const finish = (response: Response) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      resolve(response);
    };

    const timeout = setTimeout(() => {
      finish(
        new Response(JSON.stringify({ success: false, message: 'Backend request timed out.' }), {
          status: 504,
          headers: { 'Content-Type': 'application/json', ...Object.fromEntries(corsHeaders(request)) },
        })
      );
    }, 25000);

    try {
      const url = new URL(request.url);
      const req = new IncomingMessage(null as never);
      req.url = url.pathname + url.search;
      req.method = request.method;
      req.headers = Object.fromEntries(request.headers.entries());

      const res = new ServerResponse(req);
      const chunks: Uint8Array[] = [];

      const complete = () => {
        const body = Buffer.concat(chunks);
        const headers = new Headers();
        for (const [key, value] of Object.entries(res.getHeaders())) {
          if (value == null) continue;
          if (Array.isArray(value)) {
            for (const item of value) headers.append(key, String(item));
          } else {
            headers.set(key, String(value));
          }
        }
        finish(new Response(body, { status: res.statusCode || 200, headers }));
      };

      res.write = ((chunk: unknown) => {
        if (chunk) {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk as Uint8Array));
        }
        return true;
      }) as typeof res.write;

      res.end = ((chunk: unknown) => {
        if (chunk) {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk as Uint8Array));
        }
        complete();
        return res;
      }) as typeof res.end;

      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
        applyRequestBody(req, raw);
      } else {
        req.push(null);
      }
      (app as unknown as (req: IncomingMessage, res: ServerResponse) => void)(req, res);
    } catch (err) {
      console.error('[worker-handler] Error:', err);
      finish(
        new Response(JSON.stringify({ error: 'Internal Server Error', message: String(err) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }
  });
}

async function handleApiRequest(request: Request, env: WorkerEnv): Promise<Response> {
  bindWorkerEnv(env);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  try {
    await ensureInitialized();
  } catch (err) {
    console.error('[worker-init] Store init error:', err);
    return new Response(
      JSON.stringify({
        error: 'Backend Initialization Error',
        message: err instanceof Error ? err.message : String(err),
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json', ...Object.fromEntries(corsHeaders(request)) },
      }
    );
  }

  const raw =
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)
      ? Buffer.from(await request.arrayBuffer())
      : Buffer.alloc(0);

  return dispatchExpress(request, raw);
}

export default {
  async fetch(request: Request, env: WorkerEnv, _ctx: unknown): Promise<Response> {
    const pathname = new URL(request.url).pathname;

    // API routes are handled by the Worker (see run_worker_first in wrangler.jsonc).
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return handleApiRequest(request, env);
    }

    // Fallback: serve static SPA assets when the Worker is invoked for non-API paths.
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('CareYu PMS is starting. Rebuild frontend assets and redeploy.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  },

  async scheduled(event: { cron: string; scheduledTime: number }, env: WorkerEnv, _ctx: unknown): Promise<void> {
    bindWorkerEnv(env);
    await ensureInitialized();
    const cron = event.cron || '';
    console.info(`[worker-cron] Triggered cron="${cron}" at ${new Date().toISOString()}`);

    try {
      if (cron.includes('15') && cron.includes('*')) {
        await runPendingReminders();
      }
      if (cron === '0 2 * * *') {
        await runDailyDigests();
      }
      if (cron === '45 5 * * *') {
        await sendConfiguredEmailReport({ slot: 'noon', source: 'schedule' });
      }
      if (cron === '45 13 * * *') {
        await sendConfiguredEmailReport({ slot: 'evening', source: 'schedule' });
      }
    } catch (error) {
      console.error('[worker-cron] Scheduled task failed:', error);
    }
  },
};
