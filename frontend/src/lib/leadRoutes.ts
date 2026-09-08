const RESERVED_LEAD_SEGMENTS = new Set(['create', 'detail']);

/** Lead detail route using a query param fallback. */
export function leadEditHref(leadId: string): string {
  return `/pre-sales/leads/create?id=${encodeURIComponent(leadId)}`;
}

export function leadDetailHref(leadId: string, extraQuery?: string): string {
  const base = `/pre-sales/leads/detail?id=${encodeURIComponent(leadId)}`;
  if (!extraQuery) return base;
  const normalized = extraQuery.startsWith('?') ? extraQuery.slice(1) : extraQuery;
  return normalized ? `${base}&${normalized}` : base;
}

/** Resolve lead id from dynamic segment, query param, or rewritten static path. */
export function resolveLeadIdFromLocation(
  paramsId: string | string[] | undefined,
  pathname: string,
  searchId: string | null
): string {
  if (typeof paramsId === 'string' && paramsId) return paramsId;
  if (searchId) return searchId;
  const match = /^\/pre-sales\/leads\/([^/]+)$/.exec(pathname);
  if (match) {
    const segment = decodeURIComponent(match[1]);
    if (!RESERVED_LEAD_SEGMENTS.has(segment)) return segment;
  }
  if (typeof window !== 'undefined') {
    const fromQuery = new URLSearchParams(window.location.search).get('id');
    if (fromQuery) return fromQuery;
  }
  return '';
}
