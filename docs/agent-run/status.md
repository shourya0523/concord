# Programme status

**Phase:** Wave 2 on main — ready for Wave 3  
**Base:** `main` @ Wave 2 integrate  
**Updated:** 2026-07-30

## Waves

| Wave | State |
|------|-------|
| Phase 0 | Complete |
| Wave 1 | Complete (#15 + #16) |
| Wave 2 | Complete on main (frontend + Neon Auth APIs + search) |
| Wave 3 | Ready — QA + infra promote |

## Product surfaces live on main

- UI: `/onboarding`, `/dashboard`, `/prep/heat`, `/prep/rag`, `/companies/[firm]`, `/concepts/[slug]`, `/study`, `/sign-in`
- API: `/api/auth/*`, `/api/questions`, `/api/search`, `/api/practice/*`, `/api/firms/*/heat`
- Package: `@ibpe/search` (heat + pseudo-RAG)

## Your env for live auth

Vercel / `.env.local`: `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `NEXT_PUBLIC_APP_URL`

## Next

Wave 3: `ibpe-qa` verification + `ibpe-infra` preview→prod.
