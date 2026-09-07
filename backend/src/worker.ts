import { IncomingMessage, ServerResponse } from 'node:http';
import { app, initializeBackend } from './index.js';
import { runPendingReminders, runDailyDigests } from './lib/reminderJob.js';
import { sendConfiguredEmailReport } from './lib/emailReportSchedule.js';

let initialized = false;

function bindWorkerEnv(env: Record<string, unknown>) {
  if (!env) return;
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string' && value.trim() !== '') {
      process.env[key] = value.trim();
    }
  }
}

export default {
  async fetch(request: Request, env: Record<string, unknown>, _ctx: any): Promise<Response> {
    bindWorkerEnv(env);
    if (!initialized) {
      try {
        await initializeBackend();
      } catch (err) {
        console.error('[worker-init] Store init error:', err);
      }
      initialized = true;
    }

    return new Promise<Response>((resolve) => {
      try {
        const url = new URL(request.url);
        const req = new IncomingMessage(null as any);
        req.url = url.pathname + url.search;
        req.method = request.method;
        req.headers = Object.fromEntries(request.headers.entries());

        const res = new ServerResponse(req);
        const chunks: Uint8Array[] = [];

        res.write = (chunk: any) => {
          if (chunk) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
          }
          return true;
        };

        res.end = (chunk: any) => {
          if (chunk) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
          }
          const body = Buffer.concat(chunks);
          const headers = new Headers();
          const rawHeaders = res.getHeaders();
          for (const [key, value] of Object.entries(rawHeaders)) {
            if (value != null) {
              if (Array.isArray(value)) {
                for (const v of value) headers.append(key, String(v));
              } else {
                headers.set(key, String(value));
              }
            }
          }
          resolve(new Response(body, { status: res.statusCode || 200, headers }));
          return res;
        };

        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) && request.body) {
          request.arrayBuffer().then((buf) => {
            req.push(Buffer.from(buf));
            req.push(null);
            (app as any)(req, res);
          }).catch((err) => {
            console.error('[worker-req] Body parse error:', err);
            req.push(null);
            (app as any)(req, res);
          });
        } else {
          req.push(null);
          (app as any)(req, res);
        }
      } catch (err) {
        console.error('[worker-handler] Error:', err);
        resolve(new Response(JSON.stringify({ error: 'Internal Server Error', message: String(err) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }));
      }
    });
  },

  async scheduled(event: { cron: string; scheduledTime: number }, env: Record<string, unknown>, _ctx: any): Promise<void> {
    bindWorkerEnv(env);
    if (!initialized) {
      await initializeBackend();
      initialized = true;
    }
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
