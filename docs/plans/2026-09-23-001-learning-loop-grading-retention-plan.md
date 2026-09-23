---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: session analysis 2026-09-22
execution: code
title: Learning Loop, Grading v2, Content Enrichment & Retention - Plan
date: 2026-09-23
updated: 2026-09-23
status: implemented — see reports/learning-loop-release.md
---

# Learning Loop, Grading v2, Content Enrichment & Retention - Plan

## Goal Capsule

**Objective:** Turn Concord from a set of prep surfaces into one daily learning loop:
**answer → graded feedback → scheduled review → visible progress toward a target firm**,
backed by a richer, rubric-bearing teaching corpus.

**Product authority:** ADR 0002 (teaching truth vs firm signals), `docs/data-pipeline.md`
(lanes T/S/P, gates C1–C10), `DESIGN.md` §10 (journeys, notifications §10.14).
This plan extends `2026-08-01-001-architecture-data-pipeline-rethink-plan.md`; it does not
replace it.

**Why now (verified 2026-09-22):**

| Area | Finding | Evidence |
|------|---------|----------|
| Content | 398/416 teaching Qs have null topic + difficulty; 374 wordings keep a raw `Question N:` prefix | `exports/questions.jsonl` |
| Content | 246/416 answers have `expanded_explanation == concise_answer`; only 52 have mistakes/follow-ups; 47 "validated" answers are `_generic_handler` placeholders | `exports/answers.jsonl`, `src/ibpe_corpus/answers/generate.py:429` |
| Content | 348/416 answers come from a GitHub source whose licence is "Pending review" (BLOCKING) | `reports/license-review.md` |
| Enrichment | Gemini enricher has only run dry on 3 demo Qs; output is never persisted | `src/ibpe_corpus/answers/enrich_job.py:230`, `editorial.py:41` |
| Diagrams | 8 three-to-five-node mermaid flows; no Q↔diagram link; `interactive-json` has no renderer | migrations 032/035/040, `packages/ui/src/components/diagram-canvas.tsx` |
| Grading | LLM grade is computed but never shown in study/simulator UI | `apps/web/app/(product)/study/page.tsx`, `components/simulator-island.tsx` |
| Grading | Only 0/1 `correctness` persisted; score, source, feedback, citations discarded | `apps/web/lib/data/attempts.ts:161` |
| Grading | No rubric/key points; `score` and `correct` independent model outputs; no numeric check at grade time; no length cap; candidate text unescaped in prompt | `apps/web/lib/data/practice-grade.ts:20-128`, `lib/api/schemas.ts:283` |
| Mastery | EMA α=0.5; stub vs DB formulas diverge; no spaced repetition; `app.review_queue` unused | `attempts.ts:41,170`, `schema/app.ts:128` |
| Mastery | Weak topics + firm readiness read only concept-level mastery, which is never written → always empty/0 | `lib/weak-topics.ts:24`, `components/dashboard-island.tsx:225-250` |
| Bug | Practice mode `rag` inserted but DB CHECK only allows `pseudo_rag` | `lib/data/practice.ts:22`, `migrations/032_learning_flows.sql:126` |
| Retention | Streak = any attempt on a UTC day, capped at 28-day window; no goal, freeze, XP, achievements, reminders | `lib/data/progress.ts:50-80` |
| CI | Web `node:test` files exist but are not run in CI | `.github/workflows/ci.yml`, `apps/web/lib/**/*.test.ts` |

> **Status (2026-09-23):** all phases implemented and verified locally; Neon rollout and secrets pending. See [`reports/learning-loop-release.md`](../../reports/learning-loop-release.md).

## Reconciliation with main (2026-09-23, before implementation)

Main moved after this plan was drafted (#42–#44). Adjustments:

| Plan item | Status on main | Change |
|-----------|----------------|--------|
| P0.3 `rag` mode insert | Fixed in #43 (`rag` → `pseudo_rag` at the DB boundary) | Dropped |
| P0.7 write `module_progress` | Shipped in #42 (`/api/learn/modules/[slug]/progress`) | Dropped |
| P4.1 FSRS | #42 shipped SM-2-lite spaced review (`lib/review-schedule.ts`, migration 041) | **KD-5 amended:** keep SM-2-lite; grader score drives the rating when the learner does not rate. No FSRS dependency. |
| Migration numbers | 041/042 taken | Shared DDL lands as 043–046 (foundation commit). Track-specific follow-ups use 047+. |
| OQ-1 licensing | **Resolved by owner (2026-09-23): permission granted for all listed sources** | P1.1 closed; P1.5 ingest unblocked |

## Product Contract

### Target user experience

```text
Onboard (track, firms, interview date, focus, timezone, reminder time)
  → Placement check (10 Qs, skippable) → seeds review cards + concept mastery
  → TODAY (post-login home)
       countdown · streak (+freezes) · "Goldman readiness 62% (+7 this week)" · Warren
       [Start today's set — 8 cards · ~12 min]
         card: question → answer (type; later speak) → timer
           → grade: score, key points hit/missed (with evidence), mistake, numeric check
           → "Interviewer follows up…" (optional second try)
           → weak concept? → 2-min diagram/lesson → back
           → FSRS schedules next review
       set complete → streak +1, XP, milestone check, PaperBurst
  → Weekly: firm mock (simulator) → cited after-action report → plan re-weights
  → Reminders: daily at chosen time, evening streak-at-risk, weekly recap
```

Navigation collapses from 12 entries to **Today / Practice / Learn / Firms / Progress**
(Plan + Settings move under Progress / account menu). Routes stay; only `app-shell.tsx`
grouping changes.

### Key Decisions

| ID | Decision |
|----|----------|
| KD-1 | **Rubric is the grading contract.** Every publishable answer gets `rubric_json` (weighted key points, must-haves, red flags, follow-ups, numeric checks). The same rubric drives grading, feedback and drills. |
| KD-2 | **Code computes the score, the model ticks boxes.** LLM returns per-key-point hit/partial/miss + verbatim evidence quote; code verifies quotes and computes score + `correct`. |
| KD-3 | **Numbers are checked by code, never by the LLM.** Calculators are ported to TS (`packages/domain`) with parity tests against `fixtures/finance/*.json`. |
| KD-4 | **LLM proposes, code/humans approve.** Every Gemini-generated field lands in a review queue (`admin.review_tasks`) with provenance; auto-approve only where a validator can prove correctness (numeric) or for low-risk taxonomy above a confidence bar with sampled human review. |
| KD-5 | **FSRS replaces EMA** for scheduling; mastery is derived from FSRS retrievability + latest graded score; concept mastery is a roll-up of question mastery. |
| KD-6 | **Streak = daily goal met**, in the user's timezone, stored incrementally (not recomputed from attempts). Freezes are earned, not bought. |
| KD-7 | **Readiness % is the primary progress metric;** XP is secondary and rewards graded quality, not volume. |
| KD-8 | **Glassdoor stays signals-only** (ADR 0002): used for heat weighting, readiness weights and coaching citations, never as gold answers. |
| KD-9 | Every phase ships behind a feature flag in `packages/config/src/flags.ts`. |

### Non-goals

- Replacing Neon, Neon Auth, or the three-lane pipeline.
- Paid mechanics (buying streak freezes, gems).
- Public leaderboards by real name.
- Glassdoor-derived answer text anywhere.
- Full visual redesign (reuse paper design system components).

## Implementation Units

Effort: S ≤ 1 day, M 2–4 days, L 1–2 weeks (one engineer). Migrations continue from `040`.

### Phase 0 — Foundations & quick wins (≈1 week, no content dependency)

| ID | Unit | Files | Change | Done when |
|----|------|-------|--------|-----------|
| P0.1 | Persist full grades (M) | `migrations/041_attempt_grades.sql`, `packages/database/src/schema/app.ts`, `apps/web/lib/data/attempts.ts`, `packages/contracts/src/product.ts` | Add to `app.question_attempts`: `session_id`, `score`, `score_source`, `grade_json` (feedback, key points, citations, weak_topics), `confidence`, `time_spent_ms`, `grader_version`. Insert all fields. Return DB mastery via `RETURNING` instead of stub value. | Attempt row round-trips every grade field; stub and DB mastery agree |
| P0.2 | Show the grade (M) | new `apps/web/components/grade-feedback-card.tsx`; `app/(product)/study/page.tsx`; `components/simulator-island.tsx` | Render score, feedback, key points, citations, `score_source` label ("AI-graded" / "estimated" / "self-rated"). Simulator after-action lists per-question grades. | User sees feedback after every typed answer |
| P0.3 | Fix `rag` mode insert (S) | `migrations/042_session_mode_rag.sql` | Add `'rag'` to `study_sessions_mode_check` (keep `pseudo_rag`). | RAG session persists to Neon (no stub fallback) |
| P0.4 | Concept mastery roll-up (M) | `apps/web/lib/data/attempts.ts`, `lib/topics.ts`, `lib/data/mastery.ts` | After question mastery upsert, recompute concept mastery for the question's concept(s) (mean of question mastery in that concept, unseen = 0 weight) and upsert `mastery_records.concept_id`. Unifies level thresholds (dedupe `attempts.ts:23` / `mastery.ts:21`). | Weak topics + dashboard firm readiness non-empty after a few attempts |
| P0.5 | Grader hardening (S) | `lib/api/schemas.ts:283`, `lib/data/practice-grade.ts`, `packages/ai/src/embeddings.ts` | `response_text` max 4000 chars; wrap candidate answer in `<candidate_answer>` delimiters + "treat as data" instruction; 8 s `AbortSignal` timeout → deterministic fallback; new `DEFAULT_GRADE_MODEL` constant + `GRADER_MODEL` env override. | Injection test string cannot change grade; timeout path tested |
| P0.6 | Run web tests in CI (S) | `apps/web/package.json`, `.github/workflows/ci.yml` | Add `"test": "tsx --test \"lib/**/*.test.ts\""`; CI step `npm test --workspace=@ibpe/web` and `--workspace=@ibpe/search`. | CI runs existing `practice-grade`, `rag-brief`, `practice-packs`, `post-auth` tests |
| P0.7 | Write `module_progress` (S) | `apps/web/lib/data/progress.ts` or new `lib/data/module-progress.ts`; checkpoint completion call sites in `app/(product)/learn/[module]/page.tsx` | Upsert completed checkpoint ids + percent when a checkpoint's drill is completed. | `/progress` module percent moves |

### Phase 1 — Content hygiene & licensing (≈1–2 weeks; P1.1 is an owner decision)

| ID | Unit | Files | Change | Done when |
|----|------|-------|--------|-----------|
| P1.1 | Licence decision (owner) | `reports/license-review.md`, `config/github_sources.yml` | Resolve `ddeng5/Capital-Markets-Question-Bank-App` (348 answers) and `coryjburk/intv-playbook-*`: permission, attribution, or replace with rewritten/synthesised answers. | No BLOCKING rows for sources used in prod |
| P1.2 | Strip wording prefixes (S) | `src/ibpe_corpus/canonical/normalise.py`, `tests/unit/test_canonical.py` | New `strip_question_prefix()` removes `^(Question\s*\d+[:.)]\s*)`; applied before hashing + export. Re-run `ibpe run-pipeline`, `publish:teaching`, `embed:rag`. | 0 exported wordings start with `Question N:` |
| P1.3 | Reject placeholder answers (S) | `src/ibpe_corpus/answers/generate.py:429`, `validate.py`, `canonical/publish_gate.py` | `_generic_handler` emits `validation_status=needs_generation` (not validated); publish gate rejects concise answers matching the placeholder template. | 47 placeholders out of publish set; queued for P2.4 |
| P1.4 | Flag shallow answers (S) | `validate.py` | New check `expanded_equals_concise` → `needs_expansion` tag (still publishable). | 246 answers tagged for P2.4 |
| P1.5 | Ingest playbooks (M, after P1.1) | `src/ibpe_corpus/adapters/github/importers.py` (`import_html_playbook`), `data/staging/github/coryjburk_*` | Stage files; map model answer → concise, deep dive → expanded, red flags → `common_mistakes`, coaching notes → rubric seed hints, category/difficulty → taxonomy. | +~200 Q&A with provenance `github_source` |
| P1.6 | Regenerate stale reports (S) | `reports/answer-coverage-report.md`, `reports/pipeline-completeness.md` | Regenerate from current exports; add new dimensions (see Completeness). | Reports match exports |

### Phase 2 — Enrichment pipeline (≈3 weeks; depends on P1.2–P1.4)

| ID | Unit | Files | Change | Done when |
|----|------|-------|--------|-----------|
| P2.1 | Persist proposals + review queue (M) | `src/ibpe_corpus/answers/editorial.py`, `enrich_job.py`, `migrations/043_enrichment_proposals.sql` | Add `staging.enrichment_proposals(id, target_kind, target_id, field, proposal_json, model, prompt_version, confidence, status, reviewer, decided_at)`; each proposal also opens an `admin.review_tasks` row. Replace in-memory queue. | Enrich run writes durable proposals |
| P2.2 | Taxonomy enrichment run (M) | `enrich_job.py`, `apps/worker` | Run `enrich-v1` on all teaching Qs (worker, not Vercel). Auto-approve topic/difficulty/domain when confidence ≥ 0.8 **and** agrees with keyword rules (migration 038); 10% random sample to human review. | C2 ≥ 80% (topic + domain ∈ ib/pe/both) |
| P2.3 | Rubric generation (L) | new `src/ibpe_corpus/answers/rubric.py`; `schemas/models.py`; `packages/contracts/src/corpus.ts` (`AnswerRubricSchema`); `migrations/044_answer_rubrics.sql` (`canonical.answers.rubric_json`) | Prompt `rubric-v1` → `{key_points:[{id,text,weight,must_have}], red_flags[], common_mistakes[], follow_ups[2], numeric_checks:[{label,calculator,inputs,expected,tolerance,unit}]}`. Validators: weights sum 1.0, ≥1 must-have, ≤6 key points, every numeric check recomputed by `calculators.py` (mismatch → reject). | ≥ 90% publishable answers carry an approved rubric (new C11) |
| P2.4 | Answer depth (M) | `generate.py`, `enrich_job.py` | Regenerate the 47 placeholders; write expanded explanations for `needs_expansion`; add worked examples for calc topics. Provenance `synthesised_*`, never `source_provided`. | 0 placeholders; `expanded == concise` < 5% |
| P2.5 | Review UI (M) | `apps/web/app/admin/review/page.tsx`, `app/api/admin/*` (currently 501), `proxy.ts` admin gate | List pending proposals with diff vs current; approve/reject/edit; email allow-list via `ADMIN_EMAILS` env. | Reviewer can clear queue without SQL |
| P2.6 | Publish + RAG expansion (M) | `packages/database/scripts/publish-teaching.ts`, `embed-rag.ts` | Publish approved proposals + rubrics. Embed `concept` and `answer_chunk` kinds (chunk expanded explanations ~800 chars); de-dup concise/expanded. | RAG covers concepts + chunks |
| P2.7 | Firm-signal tagging + join (M) | `src/ibpe_corpus/canonical/firm_signals.py`, `migrations/045_occurrence_join.sql` | LLM-tag `untagged` occurrences (batch, worker) with topic taxonomy; join occurrence → teaching canonical by embedding cosine ≥ 0.82, persist `canonical_question_id` + `join_score`. | C3 ≥ 70%, C4 ≥ 25% |
| P2.8 | Numeric drill generator (L) | new `packages/domain/src/finance/{wacc,moic,irr,ev-bridge,lbo,accretion,ufcf,three-statement}.ts` + `drills.ts`; tests vs `fixtures/finance/*.json`; Python parity test in `tests/unit/test_enrich_and_calculators.py` | TS calculators (parity with `calculators.py`). `DrillTemplate {id, topic, concept_id, difficulty, sample(rng), prompt(inputs), compute(inputs) → {answer, unit, tolerance}, explain(inputs)}`. Seeded RNG; seed stored on attempt for reproducibility. Start with 8 templates incl. classic "D&A +10 flows through 3 statements". | Unlimited auto-graded numeric drills per core concept |
| P2.9 | Diagram coverage + links (M) | `migrations/046_diagrams_core.sql`, new `canonical.question_diagrams(question_id, diagram_id, relevance)` | Gemini-drafted, human-reviewed mermaid for: comps/precedents, 3-statement linkages (expand), debt schedule/revolver, working capital, merger model, returns attribution, DDM, football field. Link to questions by concept. | Every core concept ≥ 1 diagram (C10); ≥ 60% of core-topic Qs linked |
| P2.10 | Curriculum fill (M) | new `migrations/047_curriculum_lessons.sql` | Lesson `body_markdown` generated from teaching answers + sources (reviewed); fill 7 empty checkpoints; every checkpoint ≥ 3 `question_ids` (fix duplicate id in 039). | C6 green |
| P2.11 | Behavioural bank (M) | `generate.py` (behavioural handler), rubric type `star` | ~60 fit/behavioural Qs with STAR rubric (situation, task, action, result, reflection) + "Why [firm]?" rubric that references firm profile + heat (cite-only). | Behavioural module has drills + rubric grading |

### Phase 3 — Grader v2 (≈2 weeks; P3.1/P3.4 can start in parallel with Phase 2)

| ID | Unit | Files | Change | Done when |
|----|------|-------|--------|-----------|
| P3.1 | Numeric pre-check (M) | `apps/web/lib/practice-grade-core.ts` (+ tests) | `extractNumbers(text)` handles `$`, `%`, `x`, `bn/mm/k`, ranges; compare against `rubric.numeric_checks` or drill `compute()` with tolerance. Result becomes a scored rubric item. | Drill and calc Qs graded exactly with no LLM call |
| P3.2 | Rubric judge (L) | `apps/web/lib/data/practice-grade.ts` | LLM schema → `{items:[{id, verdict: hit\|partial\|miss, evidence}], red_flags_triggered[], feedback, follow_up_id}`. Code: evidence must be a substring of the answer (else → miss); `score = Σ weight·{1, .5, 0} − 0.15·red_flags`, capped at 0.6 if any must-have missed; `correct = score ≥ 0.7 ∧ all must-haves hit`. Falls back to v1 prompt when no rubric. | `score`/`correct` always consistent; `grader_version=v2` |
| P3.3 | Interviewer follow-up (S) | `grade-feedback-card.tsx`, study + simulator | Show the rubric follow-up targeting the biggest missed point; optional second attempt graded against the same rubric (counts once for scheduling). | Follow-up visible on ≥ 1 missed-point grade |
| P3.4 | Anti-gaming (M) | `attempts.ts`, `practice-grade-core.ts` | If gold was revealed for this question in the last 30 min and answer Jaccard vs gold > 0.7 → `score_source=reveal_copy`, no mastery/XP/streak credit. Deterministic fallback: cap coverage by answer-length ratio to stop keyword stuffing. | Copy-paste after reveal earns nothing |
| P3.5 | Latency, cost, rate limits (M) | `practice-grade.ts`, Upstash (`UPSTASH_REDIS_*` already in env) | Cache grade by `hash(question_id, rubric_version, normalised answer)`; per-user limit 60 LLM grades/hour → deterministic beyond. Log latency + tokens. | p95 grade latency < 4 s; cost/attempt tracked |
| P3.6 | Grader eval harness (L) | new `apps/web/evals/grader/{dataset.jsonl,run.ts}`; `package.json` `eval:grader` | ~100 human-graded answers: 20 Qs × {excellent, good, partial, wrong, gamed}. Metrics: score MAE, Spearman, key-point agreement, `correct` accuracy, injection cases. Deterministic parts in CI; LLM run manual/nightly with key. | MAE ≤ 0.12, `correct` accuracy ≥ 90% (new C12) |
| P3.7 | Model bake-off (S) | `evals/grader` | Run eval across candidate models via `GRADER_MODEL`; pick by accuracy × latency × cost. Record decision in `docs/decision-log.md`. | Grader model chosen on data, not guess |

### Phase 4 — Spaced repetition & the daily loop (≈2 weeks; depends on P0.1, P0.4)

| ID | Unit | Files | Change | Done when |
|----|------|-------|--------|-----------|
| P4.1 | FSRS scheduling (M) | `migrations/048_review_cards.sql` (replaces unused `app.review_queue`), `apps/web/lib/data/review.ts`, dependency `ts-fsrs` (verify MIT licence) | `app.review_cards(user_id, question_id \| drill_template_id, state, stability, difficulty, due_at, reps, lapses, last_review_at)`. Rating from grade: <0.45 Again, <0.68 Hard, <0.85 Good, else Easy; self-rating used only when `score_source=self`. | Every graded attempt reschedules its card |
| P4.2 | Mastery from FSRS (M) | `attempts.ts`, `mastery.ts` | Question mastery = f(retrievability, last score); concept roll-up (P0.4) reuses it; remove EMA. `next_review_at` populated. | Mastery decays when reviews are skipped |
| P4.3 | Daily set builder (M) | new `apps/web/lib/data/daily-set.ts`, `migrations/049_daily_sets.sql`, `app/api/daily-set/route.ts` | Per user per local day: due reviews (cap) + 1–2 new (plan/weak/heat) + 1 firm-heat item + 1 numeric drill; size from `availability_minutes` (~1.5 min/card, default 8). Frozen in `app.daily_sets(user_id, local_date, items, goal, completed_count, completed_at)`. | Same set all day; completion tracked |
| P4.4 | Today home (L) | new `app/(product)/today/page.tsx` + `components/today-island.tsx`; `lib/auth/post-auth.ts` redirect | Countdown, streak + freezes, readiness hero with weekly delta, daily-set CTA, Warren. Dashboard content folds in or redirects. | Post-login lands on Today |
| P4.5 | Nav simplification (S) | `components/app-shell.tsx` | Groups: Today / Practice (study, simulator, saved) / Learn (modules, concepts) / Firms (companies, heat, pack) / Progress (+plan). Settings to account menu. | ≤ 6 top-level entries |
| P4.6 | Placement check (M) | `components/onboarding-form.tsx` (new step), `lib/data/daily-set.ts` | 10 Qs across core concepts and difficulty; skippable; results seed review cards + concept mastery so readiness is meaningful on day 1. | New users see non-zero, honest readiness |

### Phase 5 — Streaks, readiness & gamification (≈2 weeks; depends on P4.3)

| ID | Unit | Files | Change | Done when |
|----|------|-------|--------|-----------|
| P5.1 | Timezone + reminder prefs (S) | `lib/data/profile.ts`, onboarding + settings | Capture `timezone` (`Intl.DateTimeFormat().resolvedOptions().timeZone`) and `reminder_hour` into `preferences_json`. | Every active user has a timezone |
| P5.2 | Streak engine (M) | `migrations/050_streaks.sql`: `app.daily_activity(user_id, local_date, cards_done, goal, goal_met, xp, freeze_used)`, `app.user_streaks(user_id, current, longest, freezes, last_goal_date)`; `lib/data/streaks.ts`; replace `streakFromDates` in `progress.ts` | Updated in the attempt transaction; streak counts goal-met days (or freeze days) in the user's timezone; no 28-day cap. | Streak correct across timezones/DST (unit tests) |
| P5.3 | Streak freezes (S) | `lib/data/streaks.ts` | Earn 1 per 7-day streak, hold max 2; auto-applied lazily on next visit for a single missed day. | Missed day with freeze keeps streak |
| P5.4 | Readiness % (M) | new `lib/data/readiness.ts`, `migrations/051_readiness_snapshots.sql`; replace calc in `dashboard-island.tsx:225-250` | `readiness(firm) = Σ heat_weight(topic)·concept_mastery(topic) / Σ heat_weight` over tagged topics; daily snapshot for trend. | "+N this week" delta shown on Today + firm room |
| P5.5 | XP + levels (S) | `lib/data/streaks.ts` | XP = round(10·score) per graded attempt; ×0.5 repeats < 24 h; 0 for `reveal_copy`/empty self; +20 daily goal; +50 completed mock. | XP visible, secondary to readiness |
| P5.6 | Milestones (M) | `lib/achievements.ts`, `migrations/052_achievements.sql` (`app.user_achievements`) | Code-defined: streak 3/7/30; "{concept} cleared" (all concept Qs ≥ proficient); firm readiness 50/80%; first mock; 100 graded cards. Evaluated after attempt; PaperBurst + celebrating Warren. | Achievements earned + shown on Progress |
| P5.7 | Warren state (S) | `components/paper/warren-callout.tsx` callers | Mood from state: on-track, streak-at-risk (after 18:00 local, goal unmet), celebrating, returning after lapse. | Warren reflects streak state |
| P5.8 | Weekly firm mock (L) | `components/simulator-island.tsx`, `lib/data/practice-packs.ts` | Stage questions picked by stage topic (not pack index); per-stage rubric grades; cited Gemini after-action report (heat citations only); results re-weight study plan + readiness. | Mock report cites teaching + heat ids |

### Phase 6 — Notifications (≈1–2 weeks; depends on P5.1, P5.2)

| ID | Unit | Files | Change | Done when |
|----|------|-------|--------|-----------|
| P6.1 | Preferences UI (S) | `components/settings-island.tsx` (DESIGN §10.14) | Reminder time, channels (email, push), weekly recap toggle, pause-all. | Prefs saved in `preferences_json` |
| P6.2 | Email (M) | new `apps/web/lib/notify/email.ts`, env `RESEND_API_KEY` (provider TBD, OQ-3) | Templates: daily reminder, streak-at-risk, weekly recap (readiness delta, weak topic, next mock). One-click unsubscribe. | Emails send in preview env |
| P6.3 | Web push (M) | `public/sw.js`, `app/api/push/subscribe/route.ts`, `migrations/053_push_subscriptions.sql`, VAPID env keys | Opt-in only after first completed daily set. | Push delivered on Chrome/Safari |
| P6.4 | Scheduler (M) | `app/api/cron/notify/route.ts` (guarded by `CRON_SECRET`), `apps/web/vercel.json` `crons` hourly, `app.notification_log(user_id, kind, local_date)` unique | Hourly: users whose local hour = reminder hour and goal unmet → reminder; 20:00 local and streak ≥ 3 unmet → at-risk; Sunday → recap. Max 2 notifications/day. Also applies freeze rollover. | Idempotent, capped, logged |

### Phase 7 — Depth (after retention metrics are live)

| ID | Unit | Change |
|----|------|--------|
| P7.1 | Voice answers (L) | MediaRecorder in study/simulator → Vercel Blob → transcription → rubric grade on transcript + delivery sub-score (duration vs 60–90 s target, filler words, words/min). Delivery never affects content mastery. |
| P7.2 | Interactive diagrams (L) | Define `interactive-json` schema in contracts (nodes, edges, blank slots, answer labels); new `packages/ui/src/components/diagram-fill-blank.tsx`; checkpoint kind `diagram` becomes a graded quiz. Stop passing `interactive-json` to mermaid. |
| P7.3 | Cohorts / leagues (M) | Opt-in weekly XP leagues by recruiting class or school; anonymised handles; privacy review first. |

## Cross-cutting

**Feature flags** (`packages/config/src/flags.ts` + `ENV_FLAG_MAP`): `grader_v2`, `fsrs_scheduling`,
`daily_set`, `gamification`, `notifications`, `voice_answers`. Default off in prod until each
phase's success criteria pass.

**Analytics:** events `daily_set_started/completed`, `grade_shown`, `follow_up_attempted`,
`streak_extended/broken/frozen`, `notification_sent/opened`, `achievement_earned`.
Metrics: D1/D7/D30 retention, daily-goal completion rate, median cards/day, grader agreement.

**Contracts:** every new table/field gets a Zod schema in `packages/contracts` and, where
the corpus pipeline touches it, a Pydantic mirror in `src/ibpe_corpus/schemas/models.py`
(ADR 0005).

**Docs:** update `docs/data-pipeline.md` (rubric stage, proposals, drills), `docs/data-model.md`
(new tables), `migrations/README.md` (041–053), `DESIGN.md` §10 (Today, nav), and
`reports/pipeline-completeness.md` (new dimensions).

**Testing:** unit tests for every pure function (number extraction, rubric scoring, FSRS
mapping, streak/timezone logic, readiness, XP, drill templates, calculator parity);
`scripts/qa_product_smoke.sh` extended for Today + daily set + attempt grade display.

## Completeness additions

| ID | Dimension | Green when |
|----|-----------|------------|
| C11 | Rubric coverage | ≥ 90% publishable answers have approved `rubric_json` |
| C12 | Grader quality | Eval MAE ≤ 0.12 and `correct` accuracy ≥ 90% on the gold set |
| C13 | Daily loop live | FSRS + daily set + streak engine on in prod; notification idempotency verified |
| C14 | Drill coverage | Every core calc concept has ≥ 1 numeric drill template with calculator parity tests |

## Sequencing

```text
Phase 0 ───────────────┬──────────────────────────────► (ship immediately)
                       │
Phase 1 (P1.1 owner) ──┴─► Phase 2 enrichment ──► P2.3 rubrics ──► Phase 3 P3.2 rubric judge
                               │                                    ▲
                               └─► P2.8 drills ──► P3.1 numeric ────┘
Phase 0 (P0.1,P0.4) ──► Phase 4 FSRS + daily set ──► Phase 5 streaks/readiness ──► Phase 6 notify
                                                                                   └─► Phase 7
```

Parallel tracks: **content** (Phases 1–2, mostly Python + worker) and **product loop**
(Phases 0, 4–6, mostly web) can run side by side; they meet at Phase 3. Rough total:
10–12 engineer-weeks, excluding content review time.

## Success Criteria

| ID | Signal |
|----|--------|
| S-1 | Every typed answer shows a grade; grade fields persisted (Phase 0) |
| S-2 | 0 placeholder answers; C2 ≥ 80%; C11 ≥ 90% (Phases 1–2) |
| S-3 | C12 met; numeric answers graded exactly (Phase 3) |
| S-4 | ≥ 60% of active users complete the daily set on days they open the app (Phase 4) |
| S-5 | D7 retention improves vs pre-launch baseline (Phase 5–6) |
| S-6 | Readiness % and weak topics non-empty for any user with ≥ 10 graded attempts |

## Outstanding Questions

| ID | Question | Default if unresolved |
|----|----------|------------------------|
| OQ-1 | Licence for `ddeng5` and `coryjburk` sources (owner / legal) | **Resolved 2026-09-23: owner has permission for all sources** |
| OQ-2 | Grader model ("Jev" in the request — unclear which model is meant) | Keep Gemini flash behind `GRADER_MODEL`; decide via P3.7 bake-off |
| OQ-3 | Email provider | Resend |
| OQ-4 | Web push in v1 or email only? | Email first; push in P6.3 after first cohort |
| OQ-5 | Show XP numbers or only readiness + streak? | Show both; readiness is the hero |
| OQ-6 | Who reviews enrichment proposals, and what weekly throughput? | Founder review ~200 items/week; auto-approve numeric-verified + high-confidence taxonomy |
| OQ-7 | Transcription provider for voice (P7.1) | Gemini audio input; revisit on cost |

## Risks / Assumptions

| ID | Note |
|----|------|
| A-1 | ADR 0002 stays accepted; Glassdoor remains signals-only. |
| A-2 | `GEMINI_API_KEY` available on Vercel prod and workers. |
| RSK-1 | Licence resolution could remove ~84% of current answers → Phase 2 regeneration grows. |
| RSK-2 | LLM rubric generation may encode wrong finance → numeric validators + human review + eval set. |
| RSK-3 | Streak pressure can feel punitive → freezes, goal sized to availability, no loss messaging. |
| RSK-4 | Grader cost scales with engagement → cache, rate limit, deterministic numeric path, flash-tier model. |
| RSK-5 | Many new tables → keep one owner for migrations (`migrations/README.md`), RLS policies added with each table (`030_neon_rls.sql` pattern). |
