const DEFAULT_API_ORIGIN = 'https://careyu-backend-api.aicareyuautomation.workers.dev';

function apiOriginFromEnv(env: Record<string, unknown>): string {
  const configured =
    (typeof env.CLOUDFLARE_API_ORIGIN === 'string' && env.CLOUDFLARE_API_ORIGIN) ||
    (typeof env.NEXT_PUBLIC_API_URL === 'string' && env.NEXT_PUBLIC_API_URL) ||
    DEFAULT_API_ORIGIN;
  return configured.replace(/\/$/, '');
}

export async function onRequest(context: {
  request: Request;
  params: { path?: string | string[] };
  env: Record<string, unknown>;
}): Promise<Response> {
  const apiOrigin = apiOriginFromEnv(context.env);
  const pathParam = context.params.path;
  const segments = Array.isArray(pathParam) ? pathParam : pathParam ? [pathParam] : [];
  const incoming = new URL(context.request.url);
  const target = `${apiOrigin}/api/${segments.join('/')}${incoming.search}`;

  const headers = new Headers(context.request.headers);
  headers.delete('host');

  const method = context.request.method;
  const init: RequestInit = {
    method,
    headers,
    redirect: 'manual',
  };
  if (method !== 'GET' && method !== 'HEAD') {
    init.body = context.request.body;
  }

  return fetch(target, init);
}
