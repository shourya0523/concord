# apps/web

<<<<<<< HEAD
Next.js App Router product (Wave 2 — `ibpe-frontend` / `ibpe-backend`).

## Scaffold only (Wave 1)

This directory is a **placeholder**. Do not implement feature routes here until Wave 2.

| Concern | Owner |
|---------|-------|
| Feature routes, company rooms, concept labs | `ibpe-frontend` |
| API route handlers, Clerk auth | `ibpe-backend` |
| DS demo / catalogue route | `ibpe-design-system` |
| Deploy / vercel project root | `ibpe-infra` |

## Planned layout (not created yet)

```text
apps/web/
  app/                 # App Router
  package.json
  next.config.ts
```

Depends on: `@ibpe/contracts`, `@ibpe/config`, `@ibpe/ui`, `@ibpe/database`.
=======
Next.js product app.

- Feature routes: owned by `ibpe-frontend` (Wave 2)
- DS catalogue: `/ds` owned by `ibpe-design-system`

```bash
npm install
npm run dev -w @ibpe/web
# → http://127.0.0.1:3000/ds
```
>>>>>>> origin/local/ws-design-system-a9ff
