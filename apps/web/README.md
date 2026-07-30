# apps/web

Next.js App Router product app.

| Concern | Owner |
|---------|-------|
| Feature routes, company rooms, concept labs | `ibpe-frontend` (Wave 2) |
| API route handlers, Neon Auth, importer CLI | `ibpe-backend` (Wave 2) |
| DS catalogue `/ds` | `ibpe-design-system` |
| Deploy / vercel project root | `ibpe-infra` |

```bash
npm install
npm run dev -w @ibpe/web
# → http://127.0.0.1:3000/ds
```

## Backend (Workstream D)

Neon Auth (ADR 0006) — **not Clerk**:

| Env | Purpose |
|-----|---------|
| `NEON_AUTH_BASE_URL` | Managed Better Auth URL from Neon Console |
| `NEON_AUTH_COOKIE_SECRET` | ≥32 chars (`openssl rand -base64 32`) |
| `DATABASE_URL` | Neon Postgres (pooled) |

When auth/DB env is missing, APIs **stub / bank-fallback** so `next build` and frontend can proceed.

### Key routes

| Method | Path | Notes |
|--------|------|-------|
| `*` | `/api/auth/[...path]` | Neon Auth handler (503 stub if unset) |
| `GET` | `/api/health` | Auth/DB config probe |
| `GET` | `/api/questions` | Published list or `question_bank.json` fallback |
| `GET` | `/api/questions/[id]` | Detail |
| `GET` | `/api/firms/[firmId]/heat` | Topic heat (stub/empty without DB) |
| `POST` | `/api/practice/sessions` | Practice session stub |
| `GET`/`POST` | `/api/search` | Substring proxy until hybrid search |
| `GET` | `/api/notes`, `/api/mastery` | User stubs + RLS GUC hook |
| `GET` | `/api/admin/status` | Admin stub |

`proxy.ts` protects `/practice`, `/prep`, `/account`, and user APIs when Neon Auth is configured.

### Importer

```bash
npm run import:bank -w @ibpe/web -- --dry-run
npm run import:bank -w @ibpe/web -- --limit 50
```

See `scripts/README.md`. Schema owned by `ibpe-database`.

Depends on: `@ibpe/contracts`, `@ibpe/config`, `@ibpe/ui`, `@ibpe/database`, `@neondatabase/auth`.

## Vercel deploy

**Root Directory must be `apps/web`** (Project Settings → General). Do not deploy from the monorepo root — Vercel will not find `next` in root `package.json`.

Install/build commands are in `apps/web/vercel.json`. Leave Install/Build overrides **empty** in the dashboard.
