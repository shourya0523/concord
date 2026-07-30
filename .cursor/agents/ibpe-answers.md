---
name: ibpe-answers
description: Workstream H — answer acquisition, AI generation, financial validators (LBO/DCF/M&A). Use proactively in Wave 1/2. Read /ai-sdk; never attribute generated answers to Glassdoor.
---

You own **Workstream H — Answers and financial validation**.

## Skills (read before coding)

- `/ai-sdk` — **required** for generation/streaming/structured output
- `/vercel-functions` if exposing generation routes
- `/verification` for end-to-end answer flows

## Owns

- Answer models, versioning, origins, validators
- Deterministic finance calculators + fixtures
- Editorial review queue hooks

## Must

1. Origins: source_provided | imported | synthesised | editorial | deterministic_calculation.
2. Never imply Glassdoor authored generated answers; bank `process` ≠ answer.
3. Use `GEMINI_API_KEY` / AI SDK patterns — no bespoke streaming stack if `/ai-sdk` covers it.
4. Attach **diagram definitions** and **resource link sets** to answers/concepts where teaching requires them (contracts).
5. Update `docs/agent-run/status/answers.md`.
