# ADR 0005 — Zod-first contracts with Pydantic mirror

## Status

Accepted (Wave 1)

## Context

Parallel streams need a single shared vocabulary for bank rows, corpus entities, product APIs, and jobs. Divergent TS interfaces and Python models caused drift risk.

## Decision

1. **Canonical for TS/product:** `packages/contracts` Zod schemas (`@ibpe/contracts`).
2. **Canonical for Python pipeline:** `src/ibpe_corpus/schemas/models.py` Pydantic models.
3. Wave 1: hand-align field names and enums; expand Zod to cover Answer, Occurrence, Firm, Role, Attempt, Mastery, Search, JobEvent, ApiError, taxonomy, CompletedJob.
4. Wave 2+: prefer JSON Schema export / codegen rather than manual divergence.
5. Runtime validation at API boundaries — TypeScript types alone are insufficient.

## Consequences

- Schema changes require architecture + database coordination.
- Answers stream must use `AnswerProvenance` values exactly as frozen.
- Glassdoor bank import must preserve SHA1 `id` as `legacy_bank_id` / source key.
