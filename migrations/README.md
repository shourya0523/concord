# Migrations

**Owner:** `ibpe-database` (sole owner — other streams propose via contracts, do not land conflicting SQL).

## Dual storage path

| Path | Engine | How applied | Used by |
|------|--------|-------------|---------|
| `001_init.sql` | **SQLite** | Optional mirror; `src/ibpe_corpus/storage/db.py` already creates the same tables via SQLAlchemy `METADATA.create_all` | Teaching corpus jobs / local SQLite file |
| `010_neon_*.sql` onward | **Neon Postgres** | `psql "$DATABASE_URL" -f …` or package scripts | Product app, published views, Wave 2+ |
| `033_rag_embeddings.sql` | **Neon + pgvector** | Real RAG document embeddings | Search / prep packs |


Do **not** apply Neon migrations to the SQLite corpus DB. Do **not** apply `001_init.sql` to Neon (uses `PRAGMA` / SQLite types).

```text
SQLite corpus (ibpe_corpus)          Neon product (ADR 0001)
─────────────────────────            ───────────────────────
001_init.sql (dialect mirror)        010_neon_platform.sql
db.py METADATA.create_all            020_neon_published.sql
                                     030_neon_rls.sql
                                     031_neon_auth_user_id.sql
                                     032_learning_flows.sql
                                     033_rag_embeddings.sql
                                     034_occurrence_topic_backfill.sql
                                     035_diagram_resources_seed.sql
                                     036_keyword_rules_v2_backfill.sql
                                     037_heat_view_occurrence_topic.sql
                                     …
                                     042_app_rls_role.sql
```

Corpus table names stay stable for Python (`interview_occurrences`, `source_artefacts`, …). Neon uses the §17 product names (`question_occurrences`, `source_artifacts`, …) with a documented mapping in `packages/database/README.md`.

## Apply Neon (local / preview)

```bash
export DATABASE_URL='postgresql://…'   # Neon pooled or direct; never commit
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/010_neon_platform.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/020_neon_published.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/030_neon_rls.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/031_neon_auth_user_id.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/032_learning_flows.sql
```

Or from the package:

```bash
cd packages/database && npm run migrate
```

## Seed

Idempotent Glassdoor bank import (occurrences / firm signals only):

```bash
cd packages/database && npm run seed:bank -- --path ../../data/question_bank.json
```

Uses legacy bank `id` (SHA1 of `company|position|question`) as the primary idempotency key.

## Env

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Neon path | Prefer Vercel Marketplace Neon; use pooled URL for serverless |
| Never | — | Do not use sunset `@vercel/postgres` |

## 031

`031_neon_auth_user_id.sql` — rename legacy `clerk_user_id` → `neon_auth_user_id` when upgrading older Wave 1 DBs (ADR 0006). Fresh 010/030 already use Neon Auth column names.

## 032

`032_learning_flows.sql` — adds canonical learning modules/checkpoints/prerequisites/module-concept links, app target company sets, module progress, and collection items; widens `app.study_sessions.mode` to include `simulator`; adds RLS and published module views; seeds five illustrative modules.

## 042

`042_app_rls_role.sql` — creates `concord_app`, the non-owner `NOBYPASSRLS` login role the web app should connect as (`neondb_owner` bypasses RLS on Neon), grants it only `app` DML plus `published`/`canonical` reads, adds the missing `app.*` policies, and forces RLS on every `app.*` table. It sets no password. See `docs/deployment/app-db-role.md` for the password step, the Vercel `DATABASE_URL` switch, and the rules for new tables (they need an explicit `GRANT ... TO concord_app`).

The migrate runner splits statements on `;` even inside `--` comments, so keep semicolons out of comments.

## 043–046 (learning loop, plan 2026-09-23-001)

| File | Adds |
|------|------|
| `043_attempt_grades.sql` | Full grade on `app.question_attempts` (score, score_source, grade_json, confidence, time, grader_version, session_id) + `app.drill_attempts` |
| `044_rubrics_enrichment.sql` | `canonical.answers.rubric_json/rubric_status`, `staging.enrichment_proposals`, occurrence `join_score/join_method`, `canonical.question_diagrams` |
| `045_retention_core.sql` | `app.daily_sets`, `daily_activity`, `user_streaks`, `readiness_snapshots`, `user_achievements` |
| `046_notifications_leagues.sql` | `app.notification_log`, `push_subscriptions`, `league_memberships` (+ league read policy) |

Every new `app.*` table ships with RLS + FORCE + a self policy and a conditional `GRANT … TO concord_app`, so the 042 guard keeps passing. Verified on a local Postgres 16 + pgvector: 043–046 apply cleanly, re-apply idempotently, and a re-run of 042's guard passes.

## 054 (retention track, plan 2026-09-23-001 P5.2/P5.5/P5.6)

`054_activity_events.sql` — `app.activity_events`, the learning-activity ledger written by `apps/web/lib/data/activity.ts` (`recordLearningActivity`). One row per graded action (attempt, drill, mock, placement) plus the daily-goal bonus; it backs the "same subject within 24 h earns half XP" rule, the graded-card / first-drill / first-mock achievement counters and an auditable XP history. The 045 aggregates (`daily_activity`, `user_streaks`) keep their semantics and remain what other tracks read. RLS + FORCE + self policy + conditional `GRANT … TO concord_app`, so 042's guard still passes.

## 057 (notify track — leagues)

`057_league_sizes.sql` — `app.league_sizes(week_start, prefix)`: a `SECURITY DEFINER` function that returns member **counts** per league id for one week and one league-id prefix, so a joining member can be placed in a league with room (≤ 30) without the 046 read policy exposing other leagues. `EXECUTE` is revoked from `PUBLIC` and granted to `concord_app`. Adds `ix_league_memberships_week_league`. No new tables, so the 042 guard is unaffected (verified locally: 057 applies, re-applies, and 042 re-runs clean).

## 059–061 (curriculum, diagrams, interactive quizzes — plan P2.9 / P2.10 / P7.2)

Generated — edit the source in `apps/web/lib/data/curriculum/` and run `npx tsx scripts/curriculum/build-migrations.ts` (`--check` fails when a file is stale). The same source is the web app's no-DB fallback, so stub mode and the database show the same curriculum.

| File | Adds |
|------|------|
| `059_diagrams_core.sql` | Version `2` bodies for the 8 existing mermaid diagrams, 10 new diagrams (comps/precedents, full 3-statement linkages, debt schedule + revolver, working capital cycle, merger model, returns attribution, DDM, football field, restructuring and PE distribution waterfalls), and `canonical.question_diagrams` rows from keyword rules over `exports/questions.jsonl` wording |
| `060_curriculum_lessons.sql` | 8 modules (3 new: comps, merger model, PE fund mechanics), 3 new concepts, 300–700-word `body_markdown` for every lesson / concept lab, ≥3 export question ids per checkpoint (replaces the 039 seeds and its duplicated LBO id), diagram checkpoints pointed at 059 diagrams |
| `061_interactive_diagrams.sql` | 4 `interactive-json` diagram versions (`InteractiveDiagramSchema`, `packages/contracts/src/diagram.ts`) and the matching diagram quiz checkpoints |

Question links join `canonical.canonical_questions`, so a database without the export questions just gets fewer rows. Diagram versions are text (`'1'`, `'v1'`, `'2'`); readers order by the numeric part. Verified locally: 059–061 apply with psql and statement-by-statement through the migrate runner's splitter, re-apply idempotently, and 042's guard still passes.

## 062 (grader — Jev decisions)

`062_score_source_jev.sql` — adds `jev` to the `app.question_attempts.score_source` CHECK (grades produced by the Jev decision model; `llm` now means the small chat model on escalation). The unnamed 043 CHECK is found by definition and dropped, then recreated as `question_attempts_score_source_check`, so re-applying is a no-op. No new tables, so the 042 guard is unaffected. Verified locally on a clone of a 010–061 database with data: applies with psql and statement-by-statement through the runner splitter, re-applies idempotently, accepts `jev`, still rejects unknown sources, and 042 re-runs clean.
