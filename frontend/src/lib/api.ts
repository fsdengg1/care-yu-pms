import { StorageService } from './storage';

function isLoopbackHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function resolveApiBaseUrl() {
  const configured = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');
  const productionApi = 'https://careyu-backend-api.aicareyuautomation.workers.dev';

  if (typeof window !== 'undefined') {
    const { hostname, origin } = window.location;
    if (isLoopbackHost(hostname)) {
      return '';
    }
    if (configured) {
      try {
        const apiUrl = new URL(configured);
        if (apiUrl.origin === origin) return '';
        if (isLoopbackHost(apiUrl.hostname)) return productionApi;
        return configured;
      } catch {
        return productionApi;
      }
    }
    if (
      hostname === 'careyu-frontend.pages.dev' ||
      hostname.endsWith('.careyu-frontend.pages.dev') ||
      hostname === 'pms.careyu.ai'
    ) {
      return productionApi;
    }
    return '';
  }

  return configured;
}

export const API_URL = resolveApiBaseUrl();

function backendUnreachableMessage() {
  return 'Unable to sign in. Please check the backend server.';
}

export async function apiRequest<T>(
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
        message: backendUnreachableMessage(),
      };
    }

    if (!response.ok) {
      const emptyBody = !payload || typeof payload !== 'object' || !('message' in payload);
      const proxyDown =
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504 ||
        (response.status >= 500 && emptyBody);
      return {
        ok: false,
        status: response.status,
        message: proxyDown
          ? backendUnreachableMessage()
          : payload.message || 'Request failed. Please try again.',
        code: typeof payload.code === 'string' ? payload.code : undefined,
        errors: Array.isArray(payload.errors) ? payload.errors : undefined,
      };
    }

    return { ok: true, data: payload as T };
  } catch {
    return {
      ok: false,
      status: 0,
      message: backendUnreachableMessage(),
    };
  }
}
