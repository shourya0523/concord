# Vercel project link (`apps/web`)

## Topology

| Surface | Runtime | Notes |
|---------|---------|-------|
| Product UI + API routes | Vercel (Next.js App Router) | Root Directory = `apps/web` |
| Scrape / transform / enrich | `apps/worker` + host/queue | See [workers.md](./workers.md) |
| Teaching pipeline CLI | Python `main.py` / `ibpe` | Local + Cloud Agents; not Vercel request path |

## Prerequisites

1. Vercel CLI authenticated: `vercel login` then `vercel whoami`
2. Team selected: `vercel teams ls` / `vercel teams switch`
3. Next.js app present under `apps/web` (Wave 2 frontend / architecture scaffold) with `package.json` `build` script

Wave 1 ships root `vercel.json` + docs only. **Live `vercel link` / deploy is blocked until a Next.js app exists and a Vercel token/team is available in this environment.**

## Link (monorepo)

Repo root may have npm workspaces + Turbo (`package.json` workspaces: `apps/*`, `packages/*`). Prefer **Root Directory = `apps/web`** in Vercel project settings.

```bash
export PATH="$HOME/.npm-global/bin:$HOME/.local/bin:$PATH"
cd apps/web
vercel link --yes --scope <team> --project concord-web
# Creates apps/web/.vercel/project.json (gitignored; CI uses VERCEL_* secrets)
```

If workspace packages (`@ibpe/ui`, etc.) must resolve at build time, set install/build to run from the monorepo root while Root Directory stays `apps/web`:

```text
Install Command: cd ../.. && npm install
Build Command:   cd ../.. && npm run build --workspace=@ibpe/web
```

(Adjust when architecture finalizes Turbo scripts.)

Do **not** leave an accidental root-only `.vercel/project.json` that points at the Python tree.

## Env pull (product only)

```bash
cd apps/web
vercel env pull .env.local --yes
```

Product / Vercel env vars (Neon, Clerk, Blob, `CRON_SECRET`, AI Gateway) live here.

**Never** put scrape secrets in Vercel **public** / `NEXT_PUBLIC_*` vars:

- `HTTPS_PROXY`
- `GLASSDOOR_EMAIL` / `GLASSDOOR_PASSWORD` / `GLASSDOOR_TOTP_SECRET`
- Capsolver keys
- Cookie jars / `storage_state` paths or contents (`data/glassdoor_state.json`)

Those stay in Cloud Agents Secrets / worker host env / local `.env` (see `AGENTS.md`).

## Preview then production

1. Push feature branch → Vercel Git integration creates **preview** URL (or CI `vercel deploy` with `VERCEL_TOKEN`)
2. Validate against preview (QA Wave 3)
3. Promote: `vercel promote <preview-url>` or merge to production branch / `vercel --prod`

Record URLs in `reports/deployment-report.md`.

## CI secrets (when deploy job is enabled)

| Secret | Purpose |
|--------|---------|
| `VERCEL_TOKEN` | CLI auth in GitHub Actions |
| `VERCEL_ORG_ID` | From `.vercel/project.json` |
| `VERCEL_PROJECT_ID` | From `.vercel/project.json` |

Pin CLI version in CI (`npm install -g vercel@X.Y.Z`); use `--yes` and prefer `vercel build` + `vercel deploy --prebuilt` for gated promote.

## Crons (planned — Wave 2+)

Short Vercel Cron handlers may **enqueue** worker jobs only (auth with `CRON_SECRET`). They must not run `python main.py batch` or browser scrapes. Example path (not wired yet): `/api/cron/enqueue-scrape`.
