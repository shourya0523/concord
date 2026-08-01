# Integration fixes applied (2026-08-01 follow-up)

Implements gaps from `reports/integration-audit-2026-08-01.md`.

## Code / schema

| Fix | Change |
|-----|--------|
| Mode A prep public-read | Removed `/prep/:path*` from `apps/web/proxy.ts` matcher |
| Topic rules v3 | `migrations/038_topic_rules_v3_and_domains.sql` + `packages/search/src/topics.ts` |
| Checkpoint drill seeds | `migrations/039_seed_checkpoint_questions.sql`; 032 no longer clobbers non-empty `question_ids` |
| Occurrence→teaching links | `packages/database/scripts/link-occurrences.ts` (`npm run link:occurrences`) |
| `bank_signals` API | `apps/web/lib/data/questions.ts` loads linked Glassdoor rows |
| Publish guard | `publish-teaching.ts` preserves backfilled topic/domain when export is null/`other` |
| Firm id mocks | `mock-data.ts` / mode-a journey use live catalog ids (`firm_goldman-sachs`, …) |
| Heat view durability | `037` (prior) + migrate runner entries through `039` |

## Neon production (applied this run)

| Metric | Before | After |
|--------|-------:|------:|
| Occurrence tagged | 1272 | **1855** |
| Occurrence untagged | 2220 | **1637** |
| Occurrence↔teaching links | 0 | **47** |
| Teaching domain `other` | 370 | **186** |
| Teaching domain `ib` | 11 | **179** |
| Checkpoints with question_ids | 0 | **6** |

## Ops commands

```bash
DATABASE_URL=… npm run migrate -w @ibpe/database   # may stop on 020 view drift; apply 038/039 directly if needed
DATABASE_URL=… npm run link:occurrences -w @ibpe/database
DATABASE_URL=… npm run link:occurrences -w @ibpe/database -- --dry-run
```

## Still open

- Broader occurrence linking (wording mismatch keeps most Glassdoor rows unlinked)
- Authenticated E2E test user
- Agent scrape session (`data/glassdoor_state.json`)
- Sentry / Blob / Cron verification
- Full `migrate.ts` resilience past `020` view recreation errors
