# Learning loop release — implementation & verification (2026-09-23)

Plan: [`docs/plans/2026-09-23-001-learning-loop-grading-retention-plan.md`](../docs/plans/2026-09-23-001-learning-loop-grading-retention-plan.md).
Built as seven parallel tracks on shared contracts (`packages/contracts/src/learning-loop.ts`) and migrations 043–046, then integrated on `local/tender-mccarthy-t697it`.

## What shipped

| Phase | Units | Where |
|-------|-------|-------|
| 0 Foundations | Full grade persisted (score, source, grade_json, grader_version, confidence, time), grade card on study + simulator, concept-mastery roll-up (weak topics + readiness now populate), grader hardening (4 000-char cap, delimiters, 8 s timeout, `GRADER_MODEL`), web tests in CI | `lib/data/attempts.ts`, `lib/grading/**`, `components/grade-feedback-card.tsx`, `.github/workflows/ci.yml` |
| 1 Content hygiene | `Question N:` prefixes stripped, placeholder answers withheld, `needs_expansion` tag, coryjburk IB/PE playbooks + offergenie + HireAbo ingested (owner attests permission for all sources) | `src/ibpe_corpus/**`, `config/github_sources.yml`, `reports/license-review.md` |
| 2 Enrichment | Durable proposals + review queue, taxonomy rules v4, `rubric-v1` rubrics for every answer, 18 topic handlers, RAG `answer_chunk` + `concept` kinds, occurrence joins, 60-question behavioural bank, 16 numeric drill templates with TS↔Python calculator parity, 22 diagrams (18 mermaid + 4 interactive), 538 question↔diagram links, 8 modules / 39 checkpoints with real lessons, `/admin/review` | `answers/rubric.py`, `packages/domain/src/finance/**`, `lib/data/curriculum/**`, migrations 059–061, `app/admin/review` |
| 3 Grader v2 | Numeric pre-check, rubric judge (model ticks key points with verbatim evidence; code verifies evidence and computes score + `correct`), interviewer follow-ups, reveal-copy + injection guards, cache + per-user rate limit, 100-case eval harness | `lib/grading/**`, `evals/grader/**` |
| 4 Daily loop | SM-2-lite review driven by grade (kept from #42), per-day frozen daily set, `/today`, nav regrouped (Today / Practice / Learn / Firms / Progress), placement check | `lib/data/daily-set.ts`, `app/(product)/today`, `components/app-shell.tsx` |
| 5 Gamification | Timezone-aware streaks with earned freezes, XP (quality-weighted, half on repeats), readiness % per target firm with weekly delta, achievements, Warren mood, simulator stage-topic selection + cited after-action report | `lib/data/{activity,streaks,xp,readiness}.ts`, `lib/achievements.ts`, `app/api/practice/sessions/[id]/report` |
| 6 Notifications | Settings UI, Resend email (reminder / streak-at-risk / weekly recap, signed unsubscribe), Web Push, daily idempotent cron (hourly optional) with 2/day cap | `lib/notify/**`, `app/api/cron/notify`, `public/sw.js` |
| 7 Depth | Voice answers (MediaRecorder → Gemini transcription, delivery score, behind `voice_answers`), interactive fill-in diagrams, opt-in weekly leagues with anonymised handles | `components/voice-answer*.tsx`, `packages/ui/src/components/diagram-fill-blank.tsx`, `lib/data/leagues.ts` |

## Corpus before → after (exports/)

| Metric | Before | After |
|--------|--------|-------|
| Teaching questions | 416 | 666 |
| Placeholder answers | 47 | 0 |
| Topic + domain ∈ ib/pe/both (C2) | 18 | 539 (80.9%) |
| Approved rubrics (C11) | 0 | 666 (100%, heuristic — rule-validated, not human-reviewed) |
| `Question N:` wordings | 374 | 0 |
| expanded == concise | 246 | 99 (queued as expansion proposals) |
| Occurrence → teaching joins (C4, local DB) | ~0 | 978 / 3 492 (28%) |

## Verification

| Check | Result |
|-------|--------|
| `npm test --workspace=@ibpe/web` | 403 pass, 0 fail |
| `npm test --workspace=@ibpe/domain` / `@ibpe/search` | 28 / 8 pass |
| `python3 -m pytest` | 195 passed |
| `tsc --noEmit` (web, database, contracts, config) | clean |
| `npm run lint --workspace=@ibpe/web` | 0 errors (39 warnings, baseline 42) |
| `npm run build --workspace=@ibpe/web` | passes |
| `build-migrations.ts --check` | curriculum SQL in sync with source |
| Migrations 043–061 on local Postgres 16 + pgvector | apply cleanly, re-apply idempotently, 042 RLS guard passes |
| Full local deployment via `publish:teaching` + `seed:bank` (docs/deployment/local-e2e.md) | 666 Q / 666 A / 666 rubrics published, 1 610 proposals, 3 492 occurrences |
| `scripts/qa_learning_loop_smoke.sh` — no DB | 20/20 |
| `scripts/qa_learning_loop_smoke.sh` — DB as `concord_app` under RLS | 20/20 (grade persisted with rubric items, injection capped at 0, drill exact-graded, streak/XP/achievement rows written) |
| Browser (Playwright) on DB-backed app | `/today`, `/study` (graded card with evidence + follow-up), `/learn/module_dcf_wacc`, `/drills`, `/progress` render with 0 page errors — `reports/qa-evidence/e2e-db-*.png` |
| Grader eval (deterministic, no LLM key) | MAE 0.153, Spearman 0.805, correct-accuracy 0.97, injection resistance 1.0 |

Bugs found and fixed during integration: new users without target firms crashed `/api/targets`; DB sessions with `learning_mode: null` returned 500 on every attempt (pre-existing on main); retrying one card could fill the daily goal; voice delivery score was dropped by the attempts schema; seven curriculum checkpoints pointed at question ids retired by the corpus rewrite.

## Needs owner action (Neon / secrets / people)

Nothing below was done from this session — Neon was deliberately not touched.

1. **Apply migrations on Neon, in order:** 043, 044, 045, 046, 054, 057, 059, 060, 061, **062** (`062_score_source_jev.sql` — allows `score_source = 'jev'`; apply it **before** deploying the Jev grader, or Jev-graded attempts fail the CHECK) (then re-run 042's guard). `npm run migrate -w @ibpe/database` lists them.
2. **Publish the new corpus:** `npm run publish:teaching -w @ibpe/database -- --retire-missing` (unpublishes 38 retired fragment questions), then `npm run embed:rag` with `OPENROUTER_API_KEY`. **`embed:rag` must re-run over everything** — the embedding model changed (Gemini → `openai/text-embedding-3-small` via OpenRouter, still 768-d); the content hash includes the model id so the script re-embeds all docs, and dense search ignores old-model rows until it has run (lexical fallback meanwhile).
3. **Secrets (Vercel, server-only):** `OPENROUTER_API_KEY` (Jev grading + draft verification, small-model drafts / escalations, transcription, embeddings). `LLM_DECISION_MODEL` defaults to Jev `typesafe/jev-1.13` (pinned — nothing to set); optional `JEV_CONFIDENCE_FLOOR` (0.6) / `JEV_ACCEPT_CONFIDENCE` (0.8), `LLM_SMALL_MODEL` / `LLM_EMBED_MODEL` / `LLM_STT_MODEL` / `OPENROUTER_APP_URL` / `OPENROUTER_DECISIONS_URL` (see `docs/deployment/llm-stack.md`). Remove any `LLM_PRIMARY_MODEL` from Vercel — the web app no longer reads it. `GEMINI_API_KEY` is no longer read by the web app; `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL`, `NOTIFY_SIGNING_SECRET`; `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`; `CRON_SECRET`; `CRON_DATABASE_URL` and `ADMIN_DATABASE_URL` (owner role — the app role cannot span users or read staging); `ADMIN_EMAILS`; optional `UPSTASH_REDIS_REST_URL/TOKEN`.
4. **Reminders run once a day** (13:00 UTC, Hobby-compatible). For hourly timing on Vercel Pro, set the cron to `0 * * * *` and `NOTIFY_CADENCE=hourly`.
5. **Confirm the Jev grader on data:** `OPENROUTER_API_KEY=… npm run eval:grader -w @ibpe/web -- --jev` (and `-- --jev --no-escalation`, `-- --small` for comparison); it reports MAE / Spearman / correct accuracy / injection resistance, the Jev call rate (router: 0.48 on the eval set, skipped-case accuracy 1.00), the small-LLM escalation rate and total cost. Tune `JEV_CONFIDENCE_FLOOR` if needed and record the numbers in `docs/decision-log.md` (row "Grader = Jev decisions + small-LLM escalation").
6. **Human review:** 529 pending enrichment proposals in `/admin/review`, a sample of heuristic rubrics, lesson content and keyword-based question↔diagram links.
7. `voice_answers` flag is off by default — turn on with `FLAG_VOICE_ANSWERS=1` once `OPENROUTER_API_KEY` is set (STT via `openai/whisper-large-v3-turbo`; if the provider rejects the recorder's webm/opus, transcription returns 502 and the learner types instead).
