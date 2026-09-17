import { StorageService } from './storage';

function isLoopbackHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function resolveApiBaseUrl() {
  const configured = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

  if (typeof window !== 'undefined') {
    const { hostname, origin } = window.location;
    if (isLoopbackHost(hostname)) {
      return '';
    }
    if (configured) {
      try {
        const apiUrl = new URL(configured);
        if (apiUrl.origin === origin) return '';
        return configured;
      } catch {
        return configured;
      }
    }
    return '';
  }

  return configured;
}

export const API_URL = resolveApiBaseUrl();

function backendUnreachableMessage(status?: number) {
  if (status === 502 || status === 503 || status === 504) {
    return 'The server is starting. Please wait a few seconds and try again.';
  }
  return 'Unable to reach the server. Please check your connection and try again.';
}

function isRetryableStatus(status: number) {
  return status === 0 || status === 502 || status === 503 || status === 504;
}

function shouldRetry(path: string, method: string, status: number) {
  if (!isRetryableStatus(status)) return false;
  const verb = method.toUpperCase();
  const route = path.split('?')[0];
  if (verb === 'POST' && /\/api\/auth\/(login|login-mode|invitation-login|verify-invitation)$/.test(route)) {
    return false;
  }
  if (verb === 'GET' || verb === 'HEAD') return true;
  return verb === 'POST' && /\/api\/auth\/me$/.test(route);
}

async function apiRequestOnce<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string; code?: string; errors?: { field: string; message: string }[] }> {
  try {
    const headers = new Headers(options.headers);
    if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData) && !(options.body instanceof Blob)) {
      headers.set('Content-Type', 'application/json');
    }
    const token = StorageService.getAuthToken();
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
      credentials: 'same-origin',
      referrerPolicy: 'same-origin',
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json().catch(() => ({}))
      : {};

    if (!contentType.includes('application/json')) {
      return {
        ok: false,
        status: response.status,
        message: backendUnreachableMessage(response.status),
      };
    }

    if (!response.ok) {
      const payloadMessage = typeof payload.message === 'string' && payload.message.trim() ? payload.message : '';
      const emptyBody = !payload || typeof payload !== 'object' || !payloadMessage;
      const proxyDown =
        isRetryableStatus(response.status) ||
        (response.status >= 500 && emptyBody);
      return {
        ok: false,
        status: response.status,
        message: payloadMessage || (proxyDown ? backendUnreachableMessage(response.status) : 'Request failed. Please try again.'),
        code: typeof payload.code === 'string' ? payload.code : undefined,
        errors: Array.isArray(payload.errors) ? payload.errors : undefined,
      };
    }

    return { ok: true, data: payload as T };
  } catch {
    return {
      ok: false,
      status: 0,
      message: backendUnreachableMessage(0),
    };
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string; code?: string; errors?: { field: string; message: string }[] }> {
  const method = String(options.method || 'GET');
  let last = await apiRequestOnce<T>(path, options);
  for (let attempt = 1; !last.ok && attempt < 3 && shouldRetry(path, method, last.status); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    last = await apiRequestOnce<T>(path, options);
  }
  return last;
}
