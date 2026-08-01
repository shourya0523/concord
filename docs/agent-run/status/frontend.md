# Status: frontend

State: DESIGN.md gap-close integrate (dark mode + §10.5/10.3/10.4/10.6/10.8/10.9/10.12/10.13)
Wave: 2
Updated: 2026-08-01
Branch: `local/ws-learn-study-depth-bb32`

## Verification

- `npm run typecheck -w @ibpe/web` — green (per workstream branches; re-run on integrate)
- `npm run typecheck -w @ibpe/web` — green on `local/ws-learn-study-depth-bb32`

## Notes

- Workstream C Wave 2 — Mode A/B product routes on Editorial Finance Terminal
- Dark mode: cream paper + black ink preserved under `.dark` (chrome deepens only); Settings theme control; PaperSheet/diagram tokenised
- DESIGN.md §10.5 P0 Pseudo-RAG is now a real flagship session: `/prep/rag` keeps the frozen brief + citation-card pack preview, then starts an inline layered study loop over retrieved pack item ids.
- The loop is shared with `/study` via `StudyLoopIsland`, so Mode A reuses the signature answer-before-reveal flow, keyboard shortcuts, concept diagram/heat peek rail, sources, notes/bookmarks, and session close pattern.
- RAG context passed into the loop includes pack id, frozen date, firm names, per-item why-retrieved text, and per-item citation labels/URLs; attempts use existing practice session/attempt APIs with anonymous reveal fallback when auth is unavailable.
- DESIGN.md §10.3-§10.4 P1 heat interaction gaps closed: company and compare heat cells now open scoped `/prep/rag?firm=&topic=`, with topic focus prefilled in RAG and concept-lab secondary CTA when mapped
- Company room role filter renders from available occurrence `role_raw` values and scopes the occurrence browser; heat rows remain firm/topic scoped because the current heat API/view has no role dimension
- Weakness overlay can be toggled on heat matrices; heat cells print both level and sample `n`, with hatch/captions preserving non-color-only low-N and weakness cues
- DESIGN.md §10.12-§10.13 P1 gaps closed: Saved now has client search over bookmarks/notes/collections, real bookmark provenance/firm/tag chips when present, and POST-backed collection creation
- Progress now renders a target-firm heat∩weakness matrix using the shared heatmap hatch overlay, a weak concept mastery map, and a calm empty state for diagram completion while the API has no completion flags
- DESIGN.md §10.6 Learn depth: module hubs now render lesson PaperSheets with prereq/core/apply notes from concept detail, pitfall callouts, resource provenance links, real-ID module drill/quiz links when available, and saved-target Apply-at-firm RAG CTAs
- DESIGN.md §10.8-§10.9 Study depth: Again/Hard/Good/Easy self-rating pills map to confidence, hints stay pre-reveal and structure-only, `p` backs up one revealed layer while `Shift+p` moves to the previous question, and close CTAs link to weak-topic practice plus target-firm context
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
| `/prep/rag`            | Pseudo-RAG prep + citation cards + study loop |
| `/companies/[firm]`    | Company prep rooms                          |
| `/concepts/[slug]`     | Concept labs + diagram a11y fallback        |
| `/study`               | Layered reveal study loop                   |
| `/saved`               | Bookmarks, notes, collections               |
| `/progress`            | Readiness + heat∩weakness + mastery         |
| `/simulator`           | Firm-flavoured simulator shell              |
| `/settings`            | Targets + theme + Neon Auth status          |
| `/ds`                  | Design system catalogue (unchanged)         |
