# CareYu Frontend (Vite + React)

- React 19 + TypeScript + Vite + React Router
- Path alias: `@/*` → `src/*`
- Navigation shim: `@/lib/navigation` (Link with `href`, useRouter, usePathname, useParams, useSearchParams)
- API client: `src/lib/api.ts` — uses `VITE_API_URL` (empty = same-origin `/api` proxy)
- Dev proxy: `vite.config.ts` proxies `/api` → `BACKEND_URL` (default `http://127.0.0.1:4100`)
- Cloudflare build: `npm run build` → `dist/` → `.cloudflare-out/` with SPA `_redirects`
