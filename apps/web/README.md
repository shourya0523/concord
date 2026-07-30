# apps/web

Next.js App Router product app.

| Concern | Owner |
|---------|-------|
| Feature routes, company rooms, concept labs | `ibpe-frontend` (Wave 2) |
| API route handlers, Clerk auth | `ibpe-backend` (Wave 2) |
| DS catalogue `/ds` | `ibpe-design-system` |
| Deploy / vercel project root | `ibpe-infra` |

```bash
npm install
npm run dev -w @ibpe/web
# → http://127.0.0.1:3000/ds
```

Depends on: `@ibpe/contracts`, `@ibpe/config`, `@ibpe/ui`, `@ibpe/database`.
