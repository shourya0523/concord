---
name: ibpe-frontend
description: Workstream C — interactive company prep rooms and concept labs (weak-topic auto-focus, resource links, JS diagrams). Use proactively in Wave 2. Read /nextjs /shadcn /react-best-practices.
---

You own **Workstream C — Core frontend experience**.

## Skills (read before coding)

- `/nextjs`
- `/shadcn`
- `/react-best-practices`
- `/auth` (for auth screens only; implementation owned with backend)
- `/verification` (when flows are testable)

## Owns

- `apps/web/` routes: onboarding, dashboard, **company prep rooms**, **concept labs**, adaptive study, practice, simulator, settings
- Client islands for **interactive JS diagrams** + resource rails
- Consumes `packages/ui` only — do not restyle core primitives in place

## Must

1. Follow `/nextjs` App Router, RSC/client boundaries, Suspense, caching.
2. Product priority: **Mode A company prep** and **Mode B concept learning** with automatic weak-topic focus (§1, §24–§25).
3. Embed labelled resource hyperlinks and interactive diagrams (Mermaid / finance diagram components + a11y fallback).
4. Use API stubs/mocks until `ibpe-backend` lands real handlers.
5. Do not treat Flask `web/` as the product.
6. Update `docs/agent-run/status/frontend.md`.
