# GitHub ↔ Cloudflare Pages setup

Repository: [fsdengg1/care-yu-project-hub](https://github.com/fsdengg1/care-yu-project-hub)

Production URL: `https://careyu-frontend.pages.dev`

---

## Option A — Cloudflare Dashboard Git link (recommended)

Use this if you want **Cloudflare to build automatically** when you push to `main`.

### Step 1 — Open Cloudflare Pages

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. **Workers & Pages** → project **`careyu-frontend`**

### Step 2 — Connect GitHub

1. **Settings** → **Builds & deployments**
2. Click **Connect to Git** (or **Connect GitHub**)
3. Sign in to GitHub if asked
4. Authorize **Cloudflare Pages** for your account
5. Select repository: **`fsdengg1/care-yu-project-hub`**

### Step 3 — Build configuration

| Setting | Value |
|---------|--------|
| **Production branch** | `main` |
| **Root directory** | `frontend` |
| **Framework preset** | None (or Next.js — build command below is what matters) |
| **Build command** | `npm run build` |
| **Build output directory** | `.cloudflare-out` |
| **Node.js version** | `20` |

### Step 4 — Environment variables (Production)

In **Settings → Environment variables → Production**:

| Variable | Value |
|----------|--------|
| `NEXT_PUBLIC_API_URL` | *(leave empty)* |
| `CLOUDFLARE_API_ORIGIN` | `https://careyu-backend-api.aicareyuautomation.workers.dev` |

Do **not** commit secrets to Git.

### Step 5 — Save and deploy

1. Click **Save and Deploy**
2. Wait for the first build to finish
3. Open `https://careyu-frontend.pages.dev` — it should match latest `main`

### Verify Git is connected

```bash
cd frontend
npx wrangler pages project list
```

**Git Provider** should show **GitHub** (not `No`).

---

## Option B — GitHub Actions (already in this repo)

Workflow file: `.github/workflows/deploy-frontend-cloudflare.yml`

This deploys on every push to `main` when `frontend/` changes.

### One-time setup

1. Create a Cloudflare API token:
   - [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
   - **Create Token** → template **Edit Cloudflare Workers** (includes Pages)
   - Or custom token with **Account → Cloudflare Pages → Edit**

2. Add GitHub secret:
   - GitHub → **fsdengg1/care-yu-project-hub** → **Settings** → **Secrets and variables** → **Actions**
   - **New repository secret**
   - Name: `CLOUDFLARE_API_TOKEN`
   - Value: paste the token

3. Push to `main` (or run workflow manually: **Actions** → **Deploy Frontend** → **Run workflow**)

### Important

Use **either** Option A (native Cloudflare Git) **or** Option B (GitHub Actions), not both — otherwise every push deploys twice.

---

## After setup — normal workflow

```text
git add .
git commit -m "your message"
git push origin main
   ↓
Cloudflare builds & deploys
   ↓
https://careyu-frontend.pages.dev  (latest code)
```

Hash URLs like `https://abc123.careyu-frontend.pages.dev` are normal — they point to a specific deployment. The stable URL always uses the **latest production** deployment.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Git Provider still `No` | Finish Option A Step 2 in Dashboard |
| Build fails on Cloudflare | Check build logs; confirm root `frontend`, output `.cloudflare-out` |
| Stable URL shows old UI | Hard refresh (`Ctrl+Shift+R`) — JS chunks are cached 1 year |
| GitHub Action fails | Add `CLOUDFLARE_API_TOKEN` secret |
