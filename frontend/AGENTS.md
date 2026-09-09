# CareYu Frontend (Vite + React)

- React 19 + TypeScript + Vite + React Router
- Path alias: `@/*` → `src/*`
- Navigation shim: `@/lib/navigation`
- API client: `src/lib/api.ts` — leave `VITE_API_URL` empty; uses same-origin `/api`
- Local dev: Vite proxies `/api` → `BACKEND_URL`
- Production: unified Cloudflare Worker serves SPA + `/api` from one deployment
