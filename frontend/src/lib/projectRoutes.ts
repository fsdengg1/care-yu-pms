const RESERVED_PROJECT_SEGMENTS = new Set(['active', 'create', 'planning', 'detail', 'activity']);

/** Static Cloudflare Pages route for project detail (query param fallback). */
export function projectDetailHref(projectId: string, extraQuery?: string): string {
  const base = `/projects/detail?id=${encodeURIComponent(projectId)}`;
  if (!extraQuery) return base;
  const normalized = extraQuery.startsWith('?') ? extraQuery.slice(1) : extraQuery;
  return normalized ? `${base}&${normalized}` : base;
}

/** Resolve project id from dynamic segment, query param, or rewritten static path. */
export function resolveProjectIdFromLocation(
  paramsId: string | string[] | undefined,
  pathname: string,
  searchId: string | null
): string {
  if (typeof paramsId === 'string' && paramsId) return paramsId;
  if (searchId) return searchId;

  const activityMatch = /^\/projects\/([^/]+)\/activity$/.exec(pathname);
  if (activityMatch) {
    const segment = decodeURIComponent(activityMatch[1]);
    if (!RESERVED_PROJECT_SEGMENTS.has(segment)) return segment;
  }

  const detailMatch = /^\/projects\/([^/]+)$/.exec(pathname);
  if (detailMatch) {
    const segment = decodeURIComponent(detailMatch[1]);
    if (!RESERVED_PROJECT_SEGMENTS.has(segment)) return segment;
  }

  if (typeof window !== 'undefined') {
    const fromQuery = new URLSearchParams(window.location.search).get('id');
    if (fromQuery) return fromQuery;
  }

  return '';
}
