import { useMemo } from 'react';
import {
  Link as RouterLink,
  type LinkProps,
  useLocation,
  useNavigate,
  useParams as useRouterParams,
  useSearchParams as useRouterSearchParams,
} from 'react-router-dom';

type AppLinkProps = Omit<LinkProps, 'to'> & {
  href: string;
};

/** Drop-in replacement for `next/link` — accepts `href` instead of `to`. */
export function Link({ href, ...props }: AppLinkProps) {
  return <RouterLink to={href} {...props} />;
}

/** Drop-in replacement for Next.js `useRouter()`. */
export function useRouter() {
  const navigate = useNavigate();
  return useMemo(
    () => ({
      push: (url: string) => navigate(url),
      replace: (url: string) => navigate(url, { replace: true }),
      back: () => navigate(-1),
    }),
    [navigate]
  );
}

/** Drop-in replacement for Next.js `usePathname()`. */
export function usePathname() {
  return useLocation().pathname;
}

export { useRouterParams as useParams };

/** Drop-in replacement for Next.js `useSearchParams()` (returns read-only params). */
export function useSearchParams() {
  const [searchParams] = useRouterSearchParams();
  return searchParams;
}
