# Concord — user stories

**Updated:** 2026-09-22
**Source of truth:** `DESIGN.md` §10 (screens / flows) and `docs/agent-run/remaining-product-gaps.md`.

Concord is interview prep for IB/PE candidates. It has two modes:

- **Mode A: company prep.** Firm heat from Glassdoor signals, company rooms, and grounded RAG packs.
- **Mode B: learn.** Modules, concept labs, and diagrams.

Everything else supports those two modes: the study loop, spaced review, saved items, the plan, the simulator, and progress.

## Personas

| Persona | Goal |
|---------|------|
| **Superday candidate** | Has an interview date at named firms. Wants the questions those firms ask, weighted toward their weak topics. |
| **Career switcher** | Needs the fundamentals first (accounting → EV → DCF → LBO) before firm-specific drilling. |
| **Returning learner** | Studies a little each day. Needs the app to remember what to review and what's done. |

## Epics and stories

Status key: ✅ shipped · 🟡 partial · ⬜ open. The **This pass** column marks stories delivered on this branch.

### E1 — Onboarding and targets (§10.1, §10.14)

| # | Story | Status | This pass |
|---|-------|--------|-----------|
| 1.1 | As a candidate, I pick my path, track, role, target firms and interview date, so the dashboard and plan are personalised. | ✅ | |
| 1.2 | As a candidate, I change targets and interview date later in Settings. | ✅ | |
| 1.3 | As a candidate, I set study reminders / notifications. | ⬜ | |

### E2 — Company prep, Mode A (§10.3–10.5)

| # | Story | Status | This pass |
|---|-------|--------|-----------|
| 2.1 | As a Superday candidate, I see which topics a firm over-indexes on, with sample sizes, so I know where to focus. | ✅ | |
| 2.2 | I compare heat across my target firms and see shared vs firm-unique topics. | ✅ | |
| 2.3 | I start a grounded prep pack where every question explains why it was picked and cites its source. | ✅ | |

### E3 — Study loop and spaced review (§10.8, §10.9)

| # | Story | Status | This pass |
|---|-------|--------|-----------|
| 3.1 | As a learner, I answer before I reveal, then unlock the answer layer by layer. | ✅ | |
| 3.2 | **As a returning learner, my Again/Hard/Good/Easy rating decides when the question comes back, so I review just before I'd forget.** | ✅ | ✔ |
| 3.3 | **As a returning learner, I see how many cards are due on the dashboard and start a review session in one click.** | ✅ | ✔ |
| 3.4 | **As a keyboard user, I rate with `1–4`, open a note with `e`, and bookmark with `b` without reaching for the mouse.** | ✅ | ✔ |

Acceptance for 3.2–3.3:

- Submitting an attempt schedules the question. "Again" brings it back in 10 minutes. "Good" goes 1 → 3 → interval × ease days. "Easy" goes further, and the cap is 120 days.
- The status line shows when the question returns ("back for review tomorrow").
- The dashboard shows *N due now · M scheduled*. **Review now** opens `/study?review=due` with the due queue.
- If nothing is due, the study page says when the next card is due and falls back to fresh questions.

### E4 — Saved items: notes, bookmarks, collections (§10.12)

| # | Story | Status | This pass |
|---|-------|--------|-----------|
| 4.1 | **As a learner, I bookmark a question while studying and un-bookmark it with the same control.** Before this pass the request was rejected with a 400 and failed silently. | ✅ | ✔ |
| 4.2 | **As a learner, I capture a note in my own words, then edit or delete it from Saved.** | ✅ | ✔ |
| 4.3 | **As a learner, I add the current question to a named collection (e.g. "Superday set") from the study page.** | ✅ | ✔ |
| 4.4 | **As a learner, I open a collection in Saved, see its questions, remove items, study the whole collection, or delete it.** | ✅ | ✔ |
| 4.5 | I filter everything I've saved by text. | ✅ | |

### E5 — Learn modules, Mode B (§10.6, §10.7)

| # | Story | Status | This pass |
|---|-------|--------|-----------|
| 5.1 | As a career switcher, I browse modules and follow a roadmap of lessons → labs → drills → quiz. | ✅ | |
| 5.2 | **As a career switcher, I mark a roadmap checkpoint done (or undo it), and module mastery % updates.** Before this pass nothing wrote `app.module_progress`, so checkpoints could never complete. | ✅ | ✔ |
| 5.3 | I open a concept lab with an interactive diagram and firm bridges. | ✅ | |
| 5.4 | I take notes or bookmark from a concept lab. | ⬜ | |

### E6 — Plan, simulator, progress (§10.10, §10.11, §10.13)

| # | Story | Status | This pass |
|---|-------|--------|-----------|
| 6.1 | As a candidate, my study plan mixes firm drills and module checkpoints, with interview-date urgency. | ✅ | |
| 6.2 | I run a firm-templated mock with an interviewer cast. | 🟡 readiness report not persisted | |
| 6.3 | **As a learner, Progress shows my streak, activity calendar, weekly accuracy and session history, even in local/offline mode.** | ✅ | ✔ |

## Implementation notes (this pass)

| Story | Surface | API | Data |
|-------|---------|-----|------|
| 3.2–3.4 | `app/(product)/study/page.tsx`, `components/dashboard-island.tsx` | `POST /api/practice/sessions/[id]/attempts` (now takes `rating`, returns `review`), `GET /api/review/due` | `lib/review-schedule.ts` (pure SM-2-lite, tested), `lib/data/review.ts`, `migrations/041_review_queue_scheduling.sql` |
| 4.1 | study page | `DELETE /api/bookmarks/[id]` | `lib/data/saved-items.ts` |
| 4.2 | `components/saved-island.tsx` | `GET /api/notes` (fixed), `PATCH`/`DELETE /api/notes/[id]` | `lib/data/notes.ts` |
| 4.3–4.4 | study page, saved island | `POST /api/collections/[id]/items`, `DELETE /api/collections/[id]`, `DELETE /api/collections/[id]/items/[itemId]` | `lib/data/saved-items.ts` |
| 5.2 | `components/module-roadmap-island.tsx` | `PUT /api/learn/modules/[slug]/progress` | `lib/data/progress.ts` (`setModuleCheckpoint`), `lib/progress-summary.ts` |
| 6.3 | progress page (unchanged UI) | `GET /api/progress` | in-memory aggregation via `lib/progress-summary.ts` (tested) |

**Cross-cutting fix: in-memory fallback.** Next.js bundles each route handler separately. The module-level `Map`s used when `DATABASE_URL` is unset were therefore different objects in each route: a note saved via `/api/notes` was invisible to `/api/notes/[id]`, and an attempt couldn't see its practice session. `lib/data/memory-store.ts` now keeps one process-wide store on `globalThis`.

**Deploy note.** Apply `migrations/041_review_queue_scheduling.sql` to Neon before shipping. It is also registered in `packages/database/scripts/migrate.ts`.

**Verified on Neon (2026-09-22).** These checks ran on the branch `test/review-queue-041`, forked from `production`. The app's SQL was run directly through the Neon connector; the Next.js server was not run against Neon.

- **Migration 041:** applies cleanly. Running it a second time changes nothing, and no constraint is duplicated.
- **Write queries:** the review upsert, due-list query, notes edit/delete, bookmark delete, collection item add/remove/cascade and `module_progress` upsert all behave as intended.
- **Bad input:** an invalid rating is rejected by the CHECK constraint.
- **Cross-user writes:** a second user's edit, delete and add attempts against the first user's rows hit 0 rows every time.

**Found while verifying (not changed here):**

- The app role `neondb_owner` has `BYPASSRLS`, so the RLS policies in `030`/`032`/`041` are not enforced. User isolation relies entirely on each query's `neon_auth_user_id` filter.
- `app.study_sessions.mode` accepts `pseudo_rag` but not `rag`, so RAG practice sessions fail to insert and fall back to memory.

## Still open (next candidates)

- 1.3 Notifications / reminders in Settings (store in `preferences_json`).
- 5.4 Notes and bookmarks on concept labs. The `app.notes` table has no `concept_id` yet, so this needs a migration.
- 6.2 Persist the simulator readiness report (`completed_at` plus `metadata_json`) and list it in progress history.
- Recommendations endpoint on `@ibpe/search` `recommendForTargets` (gap #9).
- Offline mode has no teaching answers: the bank fallback carries firm signals only. The study page therefore can't submit without Neon. Consider bundling `packages/search/fixtures/teaching_seed.json` as a local fallback.
