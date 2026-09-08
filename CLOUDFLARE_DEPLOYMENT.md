# CareYu PMS — Production Cloudflare Deployment Guide

This guide provides step-by-step instructions for deploying the complete **CareYu PMS (Project Management System)** application to Cloudflare using the **100% Free Tier** infrastructure.

---

## 1. Architecture Overview

```text
                    ┌──────────────────────────┐
                    │    Cloudflare CDN/DNS    │
                    │   pms.careyu.ai (or TBD) │
                    └────────────┬─────────────┘
                                 │
                ┌────────────────┴────────────────┐
                │                                 │
     ┌──────────▼──────────┐           ┌──────────▼──────────┐
     │  Cloudflare Pages   │           │  Cloudflare Worker  │
     │  Next.js Frontend   │           │    Backend API      │
     └──────────┬──────────┘           └──────────┬──────────┘
                │                                 │
                └────────────────┬────────────────┘
                                 │
                       ┌─────────▼─────────┐
                       │  Production DB    │
                       │   PostgreSQL      │
                       └─────────┬─────────┘
                                 │
                       ┌─────────▼─────────┐
                       │  Cloudflare R2    │
                       │ Entity Documents  │
                       └───────────────────┘
```

- **Frontend**: Next.js App Router deployed on **Cloudflare Pages**.
- **Backend API**: Express 5 application running on **Cloudflare Workers** with Node.js compatibility (`nodejs_compat`).
- **Database**: External PostgreSQL instance (Aiven / Neon / Supabase / RDS / self-hosted) connecting securely over TLS.
- **File Storage**: **Cloudflare R2 Storage** for entity document attachments and uploads.
- **Scheduled Jobs**: **Cloudflare Worker Cron Triggers** running Reminders (15m), Daily Digest (08:00 IST), and Email Reports (11:15 & 19:15 IST).

---

## 2. Prerequisites & Free Tier Setup

1. **Cloudflare Account**: Sign up at [dash.cloudflare.com](https://dash.cloudflare.com) (Free Tier).
2. **Node.js & npm**: Node 20+ installed locally.
3. **Wrangler CLI**: Pre-configured in workspace (`npm run dry-run`). Log in using:
   ```bash
   npx wrangler login
   ```

---

## 3. Environment Variables & Secrets Setup

### Local vs Production Environment Variables

Never commit secrets to Git. Use `.env.example` as a template for team members.

#### Public Environment Variables (Frontend)
Set in Cloudflare Pages Dashboard or `frontend/.env.local`:
```env
NEXT_PUBLIC_API_URL=https://api-pms.careyu.ai
```

#### Secrets (Backend Worker)
Secrets are securely stored in Cloudflare and injected directly into the Worker environment.

To set production secrets via Wrangler:
```bash
cd backend

# Database Connection (PostgreSQL)
npx wrangler secret put DATABASE_URL
# Input your PostgreSQL connection string:
# postgres://user:password@host:port/dbname?sslmode=require

# Authentication Secrets
npx wrangler secret put JWT_SECRET
# Input a strong random string (e.g., 64-char hex)

# Email Integration (ElasticEmail)
npx wrangler secret put ELASTIC_EMAIL_API_KEY
# Input your ElasticEmail API Key

# Optional Support Settings
npx wrangler secret put EMAIL_FROM
# Input: aicareyuautomation@gmail.com
```

---

## 4. Backend Deployment (Cloudflare Worker)

The backend API is wrapped in `src/worker.ts` with serverless fetch adapter and cron handlers.

### 1. Build Verification
Before deploying, verify typechecking and worker bundle compilation:
```bash
npm run typecheck -w backend
npm run dry-run:worker -w backend
```

### 2. Deploy Worker API
Deploy to Cloudflare Workers:
```bash
npm run deploy:worker -w backend
```
Wrangler will output your live worker URL (e.g., `https://careyu-backend-api.<your-subdomain>.workers.dev`).

---

## 5. Frontend Deployment (Cloudflare Pages)

### Build settings (Next.js → static Cloudflare output)

| Setting | Value |
|---------|--------|
| **Root directory** | *(repository root — leave empty)* |
| **Build command** | `npm run build:pages` |
| **Build output directory** | `frontend/.cloudflare-out` |
| **Node.js** | `20` |

Alternative (frontend-only root):

| **Root directory** | `frontend` |
| **Build command** | `npm run build` |
| **Build output directory** | `.cloudflare-out` |

The repo `.npmrc` sets `include=dev` so Tailwind/TypeScript install during Cloudflare production builds.

Do **not** use `frontend/.next` or `dist` — this project packages static HTML into `.cloudflare-out` via `scripts/build-cloudflare.mjs`.

### Connect GitHub (automatic deploy on push)

Full step-by-step: **[docs/GITHUB_CLOUDFLARE_SETUP.md](../docs/GITHUB_CLOUDFLARE_SETUP.md)**

Repository: `https://github.com/fsdengg1/care-yu-project-hub`  
Production branch: `main`

**Cloudflare Dashboard:** Workers & Pages → `careyu-frontend` → Settings → Builds & deployments → **Connect to Git**

**Production environment variables:**

```env
NEXT_PUBLIC_API_URL=
CLOUDFLARE_API_ORIGIN=https://careyu-backend-api.aicareyuautomation.workers.dev
```

### Manual deploy (CLI)

```bash
npm run build -w frontend
npm run deploy:frontend -w frontend
```

This uploads from your machine and updates `careyu-frontend.pages.dev` when it is the latest production deployment.

### GitHub Actions (alternative)

Workflow: `.github/workflows/deploy-frontend-cloudflare.yml`  
Requires GitHub secret `CLOUDFLARE_API_TOKEN`. See `docs/GITHUB_CLOUDFLARE_SETUP.md`.

Use **either** Dashboard Git **or** GitHub Actions — not both.

---

## 6. Database Connectivity & Safety

The CareYu PMS database uses a non-destructive relational schema with automatic fallback initialization.

- **Non-Destructive Initialization**: Running `ensureSchema()` applies missing tables and columns (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ADD COLUMN IF NOT EXISTS`).
- **Data Protection**: Existing leads, projects, users, tasks, and historical records are preserved.
- **Connection Settings**:
  - `DATABASE_SSL=true` is enabled by default for managed cloud PostgreSQL providers.
  - Connection timeouts and pool size (`max: 3`) are optimized for serverless execution.

---

## 7. Storage Configuration (Cloudflare R2)

Cloudflare R2 provides S3-compatible object storage with **zero egress fees** (Free Tier includes 10 GB storage and 1,000,000 Class A operations/month).

### 1. Create R2 Bucket
Run via Wrangler:
```bash
npx wrangler r2 bucket create careyu-documents
```

### 2. Binding in `wrangler.jsonc`
The backend worker is pre-bound to `careyu-documents`:
```jsonc
"r2_buckets": [
  {
    "binding": "MY_BUCKET",
    "bucket_name": "careyu-documents"
  }
]
```

---

## 8. Scheduled Jobs (Cron Triggers)

Cloudflare Worker Cron Triggers execute automatically without requiring a dedicated Node process.

Pre-configured schedules in `backend/wrangler.jsonc`:
- `*/15 * * * *` — Reminders job (every 15 minutes)
- `0 2 * * *` — Daily digest (08:00 IST / 02:00 UTC)
- `45 5 * * *` — Morning status email report (11:15 IST / 05:45 UTC)
- `45 13 * * *` — Evening status email report (19:15 IST / 13:45 UTC)

---

## 9. Custom Domain Setup

To configure custom production domains (e.g. `pms.careyu.ai` and `api-pms.careyu.ai`):

1. **DNS CNAME Records in Cloudflare DNS**:
   - `pms.careyu.ai` -> `careyu-frontend.pages.dev`
   - `api-pms.careyu.ai` -> `careyu-backend-api.<your-subdomain>.workers.dev`
2. **Update CORS Origins**:
   Add `https://pms.careyu.ai` to `CORS_ORIGIN` in backend secrets.
3. **Update Frontend API URL**:
   Set `NEXT_PUBLIC_API_URL=https://api-pms.careyu.ai`.

---

## 10. Production Smoke Test & Verification

Perform these validation steps after deployment:

1. **Health Check**:
   ```bash
   curl -i https://api-pms.careyu.ai/api/health
   ```
   Expected response: `{"ok": true, "service": "careyu-backend", "env": "production", "store": "ready"}`
2. **Authentication Flow**:
   - Open `https://pms.careyu.ai/login` in your browser.
   - Log in with valid credentials.
   - Confirm redirect to `/dashboard`.
3. **Dashboard & Modules**:
   - Verify Pre-Sales / Leads creation and stage transitions.
   - Verify Projects & Task management sheets.
   - Verify Executive Overview and Audit Logs.
4. **Document Upload**:
   - Upload a test PDF document to a project/lead.
   - Confirm download and view functionality.
5. **Logout**:
   - Click Logout and confirm redirect to `/login`.

---

## 11. Rollback Procedure

If issues arise after deployment:

### Backend Worker Rollback
To roll back to a previous Worker deployment:
```bash
cd backend
npx wrangler deployments list
npx wrangler rollback <deployment-id>
```

### Frontend Pages Rollback
1. Open Cloudflare Dashboard -> **Workers & Pages** -> **careyu-frontend**.
2. Select **Deployments** tab.
3. Click `...` next to the previous known good deployment and select **Rollback to this deployment**.

---

## 12. Troubleshooting & Common Errors

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| **CORS error in browser** | Missing `CORS_ORIGIN` secret or trailing slash mismatch. | Ensure `CORS_ORIGIN` in Cloudflare Secrets matches exact frontend URL (`https://pms.careyu.ai`). |
| **Database ping timeout** | PostgreSQL host unreachable or TLS mismatch. | Verify `DATABASE_URL` host, port, and ensure `DATABASE_SSL=true`. Allow Cloudflare IP ranges in DB firewall if restricted. |
| **404 on page refresh** | SPA route fallback missing. | Cloudflare Pages handles Next.js App Router natively. Ensure `pages_build_output_dir` points to `.next`. |
| **Email fails to send** | `ELASTIC_EMAIL_API_KEY` invalid or unverified sender. | Verify `ELASTIC_EMAIL_API_KEY` in secrets and ensure `EMAIL_FROM` is a verified sender domain. |
| **Worker bundle size > 10MB** | Unused dependencies bundled. | Cloudflare Workers Free Tier permits up to 10MB script size. `wrangler dry-run` currently generates ~2.2MB (well within limit). |

---

## 13. Final Deployment Checklist

- [x] Full codebase audit complete
- [x] TypeScript build passes for backend (`npm run build -w backend`)
- [x] TypeScript build passes for frontend (`npm run build -w frontend`)
- [x] `worker.ts` Cloudflare Worker entry point created
- [x] `wrangler.jsonc` configs created for backend and frontend
- [x] `.env.example` templates created
- [x] R2 Bucket `careyu-documents` binding configured
- [x] Cron triggers configured for scheduled jobs
- [x] Dry-run compilation verified (`npm run dry-run:worker -w backend`)
- [ ] Log in with `npx wrangler login`
- [ ] Set production secrets via `npx wrangler secret put`
- [ ] Deploy backend (`npm run deploy:worker -w backend`)
- [ ] Deploy frontend (`npm run deploy:frontend -w frontend`)
- [ ] Run production smoke test
