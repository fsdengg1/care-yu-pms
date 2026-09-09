# Careyu Automation — Project Hub

This repo is split into a frontend app and a backend API.

```
care-yu-project-hub/
  frontend/     React + Vite UI
  backend/      Express API
```

## Environment

Copy is already done for local development:

- `frontend/.env.local` → `BACKEND_URL=http://localhost:4100` (Vite dev proxy; leave `VITE_API_URL` empty locally)
- `backend/.env` → `PORT`, `JWT_SECRET`, `CORS_ORIGIN`, `DEMO_PASSWORD`

Use the `.env.example` files in each folder as templates.

## Run locally

From the repo root:

```bash
npm install
npm run dev
```

- Frontend: http://localhost:3000/login
- Backend: http://localhost:4000/api/health
`.
