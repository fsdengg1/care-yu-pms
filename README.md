# Careyu Automation — Project Hub

```
care-yu-project-hub/
  frontend/     React + TypeScript + Vite (SPA)
  backend/      Express API + PostgreSQL (Cloudflare Worker in production)
```

## Environment

- `frontend/.env.local` → `BACKEND_URL=http://localhost:4100` (leave `VITE_API_URL` empty)
- `backend/.env` → `PORT`, `JWT_SECRET`, `CORS_ORIGIN`, `DATABASE_URL`, etc.

Use the `.env.example` files in each folder as templates.

## Run locally

```bash
npm install
npm run dev
```

- Frontend: http://localhost:3000/login
- Backend: http://localhost:4100/api/health

## Production architecture (single Cloudflare deployment)

```
User
  ↓
Cloudflare Worker (careyu-backend-api)
  ├── /api/*     → Express API + PostgreSQL (Hyperdrive)
  ├── /assets/*  → Vite static bundles
  └── /*         → React SPA (index.html fallback)
```

Same-origin API: the frontend calls `/api/...` on the same domain — no separate Pages deployment.

## Build

```bash
npm run build:prod
```

- Frontend output: `frontend/dist/`
- Backend output: `backend/dist/` (TypeScript compile; Worker bundles from source)

## Deploy (unified)

```bash
npm run deploy
```

Or push to `main` — GitHub Actions runs `.github/workflows/deploy-cloudflare.yml`.

### Production URLs

| URL | Role |
|-----|------|
| `https://careyu-backend-api.aicareyuautomation.workers.dev` | Workers.dev hostname |
| `https://pms.careyu.ai` | Custom domain (attach to the Worker in Cloudflare dashboard) |

### After migration — disable old Pages project

In Cloudflare Dashboard, **disable or delete** the separate `careyu-frontend` Pages project so only the unified Worker serves production traffic.

Point `pms.careyu.ai` custom domain to the **Worker** (`careyu-backend-api`), not Pages.
