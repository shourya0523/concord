# Status: frontend

State: complete
Wave: 2
Updated: 2026-07-30
Branch: `local/ws-frontend-a9ff`

## Verification

- `npm run typecheck -w @ibpe/web` — green
- `npm run build -w @ibpe/web` — green (routes listed below)

## Notes

- Workstream C Wave 2 — Mode A/B product routes on Editorial Finance Terminal
- Neon Auth shells (`/sign-in`, `/sign-up`, `/api/auth/[...path]`) — ADR 0006; stub when env unset
- Consumes `@ibpe/ui` primitives (TopicHeatmap, PseudoRagCitationCard, TargetCompanyMultiSelect, etc.)
- Mock data typed against `@ibpe/contracts` — no Glassdoor browser calls
- Keeps `/ds` design-system catalogue

## Routes added

| Route | Purpose |
|-------|---------|
| `/` | Marketing CTAs (company prep + concept lab) |
| `/sign-in`, `/sign-up` | Neon Auth UI shells |
| `/onboarding` | Mode A/B + multi-select targets |
| `/dashboard` | Weak-topic focus + heat snapshot + next RAG |
| `/prep/heat` | Multi-firm topic heat compare |
| `/prep/rag` | Pseudo-RAG prep + citation cards |
| `/companies/[firm]` | Company prep rooms |
| `/concepts/[slug]` | Concept labs + diagram a11y fallback |
| `/study` | Layered reveal study loop |
| `/simulator` | Firm-flavoured simulator shell |
| `/settings` | Targets + Neon Auth status |
| `/ds` | Design system catalogue (unchanged) |
