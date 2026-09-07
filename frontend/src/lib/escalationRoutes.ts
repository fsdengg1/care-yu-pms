const RESERVED_ESCALATION_SEGMENTS = new Set(['detail']);

/** Resolve escalation id from dynamic segment or rewritten static path. */
export function resolveEscalationIdFromLocation(
  paramsId: string | string[] | undefined,
  pathname: string,
  searchId: string | null
): string {
  if (typeof paramsId === 'string' && paramsId) return paramsId;
  if (searchId) return searchId;

  const match = /^\/dashboard\/ceo\/escalations\/([^/]+)$/.exec(pathname);
  if (match) {
    const segment = decodeURIComponent(match[1]);
    if (!RESERVED_ESCALATION_SEGMENTS.has(segment)) return segment;
  }

  if (typeof window !== 'undefined') {
    const fromQuery = new URLSearchParams(window.location.search).get('id');
    if (fromQuery) return fromQuery;
  }

  return '';
}
