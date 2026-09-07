const RESERVED_DAILY_UPDATE_SEGMENTS = new Set(['new', 'detail']);

/** Static Cloudflare Pages route for daily update detail (query param fallback). */
export function dailyUpdateDetailHref(updateId: string): string {
  return `/daily-updates/detail?id=${encodeURIComponent(updateId)}`;
}

/** Resolve daily update id from dynamic segment, query param, or rewritten static path. */
export function resolveDailyUpdateIdFromLocation(
  paramsId: string | string[] | undefined,
  pathname: string,
  searchId: string | null
): string {
  if (typeof paramsId === 'string' && paramsId) return paramsId;
  if (searchId) return searchId;

  const match = /^\/daily-updates\/([^/]+)$/.exec(pathname);
  if (match) {
    const segment = decodeURIComponent(match[1]);
    if (!RESERVED_DAILY_UPDATE_SEGMENTS.has(segment)) return segment;
  }

  if (typeof window !== 'undefined') {
    const fromQuery = new URLSearchParams(window.location.search).get('id');
    if (fromQuery) return fromQuery;
  }

  return '';
}
