# Skills used (Phase 0 — orchestrator)

Date: 2026-07-30  
Agent: `ibpe-orchestrator` on branch `local/orchestrator-phase0-a9ff`

| Slash ref | Path | Decisions influenced |
|-----------|------|----------------------|
| `/bootstrap` | `~/.cursor/plugins/cache/cursor-public/649/.../skills/bootstrap/SKILL.md` | Link Vercel → provision → `env pull` before db/dev; Neon not `@vercel/postgres`; AUTH_SECRET via vercel env |
| `/nextjs` | `.../skills/nextjs/SKILL.md` | App Router + RSC; Node default; no custom Express; managed auth; AI via Gateway |
| `/shadcn` | `.../skills/shadcn/SKILL.md` | `shadcn@latest init -d`; source-owned components; Editorial Finance Terminal overrides default look |
| `/auth` | `.../skills/auth/SKILL.md` | Clerk via Vercel integration for product auth (Wave 2); never for Glassdoor |
| `/ai-sdk` | `.../skills/ai-sdk/SKILL.md` | Gemini enrich via AI SDK + Gateway; structured `Output.object()`; no direct provider SDKs |
| `/vercel-cli` | `.../skills/vercel-cli/SKILL.md` | Link from monorepo root carefully; `--yes` in CI; preview then prod |
| `/vercel-storage` | `.../skills/vercel-storage/SKILL.md` | Neon Postgres + Blob for artefacts; Upstash if Redis needed; no sunset `@vercel/postgres`/`kv` |
| `/vercel-functions` | `.../skills/vercel-functions/SKILL.md` | App Router route handlers; scrape/enrich as workers/workflow not request timeouts |
| `/deployments-cicd` | `.../skills/deployments-cicd/SKILL.md` | Preview → promote; pin CLI; two-phase migrations |
| `/env-vars` | `.../skills/env-vars/SKILL.md` | Split Glassdoor secrets vs `NEXT_PUBLIC_*`; `.env.example` only committed |
| `/workflow` | `.../skills/workflow/SKILL.md` | Durable scrape/transform/enrich jobs with `"use workflow"` / steps |
| `/verification` | `.../skills/verification/SKILL.md` | Full-story UI→API→data gates after Wave 2/3 |
| `/react-best-practices` | `.../skills/react-best-practices/SKILL.md` | Kill waterfalls; avoid barrels; RSC-first |
| `/supabase` | `.../skills/supabase/SKILL.md` | If Supabase chosen: RLS mandatory; no service_role in client |
| `/supabase-postgres-best-practices` | `.../skills/supabase-postgres-best-practices/SKILL.md` | Indexes + pooling for serverless; FTS/pgvector for search |
| `/ce-worktree` | `.../skills/ce-worktree/SKILL.md` | Prefer harness worktrees / `best-of-n-runner` per stream; no nested worktrees |
| `/create-subagent` | **not found** in this environment | Agents already present under `.cursor/agents/ibpe-*.md`; no recreate needed |

Skill > preference. Product prompt + `AGENTS.md` Cloudflare constraints override skill aesthetics when they conflict.
