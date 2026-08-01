# Status: frontend

State: progress/saved P1 closed
Wave: 2
Updated: 2026-08-01
Branch: `local/ws-progress-saved-bb32`

## Verification

- `npm run typecheck -w @ibpe/web` — green
- `npm run lint -w @ibpe/web` — green exit; repo still has pre-existing warnings in unrelated files

## Notes

- Workstream C Wave 2 — Mode A/B product routes on Editorial Finance Terminal
- DESIGN.md §10.12-§10.13 P1 gaps closed: Saved now has client search over bookmarks/notes/collections, real bookmark provenance/firm/tag chips when present, and POST-backed collection creation
- Progress now renders a target-firm heat∩weakness matrix using the shared heatmap hatch overlay, a weak concept mastery map, and a calm empty state for diagram completion while the API has no completion flags
- Design Phase 2 gap-close Item 4 — dashboard readiness/streak/urgency polish, study-plan urgency + prereq module mini-map, and concept lab prereq/parent-module mini-maps
- Dashboard readiness now derives from target firm heat rows + concept mastery, mirroring the progress readiness tiers with visible numeric scores
- Neon Auth shells (`/sign-in`, `/sign-up`, `/api/auth/[...path]`) — ADR 0006; stub when env unset
- Consumes `@ibpe/ui` primitives (TopicHeatmap, PseudoRagCitationCard, TargetCompanyMultiSelect, etc.)
- Mock data typed against `@ibpe/contracts` — no Glassdoor browser calls
- Keeps `/ds` design-system catalogue

## Routes added

| Route                  | Purpose                                     |
| ---------------------- | ------------------------------------------- |
| `/`                    | Marketing CTAs (company prep + concept lab) |
| `/sign-in`, `/sign-up` | Neon Auth UI shells                         |
| `/onboarding`          | Mode A/B + multi-select targets             |
| `/dashboard`           | Weak-topic focus + heat snapshot + next RAG |
| `/prep/heat`           | Multi-firm topic heat compare               |
| `/prep/rag`            | Pseudo-RAG prep + citation cards            |
| `/companies/[firm]`    | Company prep rooms                          |
| `/concepts/[slug]`     | Concept labs + diagram a11y fallback        |
| `/study`               | Layered reveal study loop                   |
| `/simulator`           | Firm-flavoured simulator shell              |
| `/settings`            | Targets + Neon Auth status                  |
| `/ds`                  | Design system catalogue (unchanged)         |
