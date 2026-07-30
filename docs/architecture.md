# Architecture

## Pipeline stages

```text
discover → fetch/archive → extract → classify PE → canonicalise
        → answer (source|match|synth) → validate → export
```

Jobs are restartable with idempotency keys (`JobRunner`). SQLite stores artefacts,
raw records, canonical entities, answers, jobs, and dead letters.

## Source adapters

- **Glassdoor** — fixture-first HTML/`__NEXT_DATA__` parser; live fetch detects
  CAPTCHA/block and stops without circumvention.
- **GitHub** — pinned-commit file fetch + Firebase QB / markdown / playbook importers.
- **Static seed** — bundled offline IB/PE Q&A for tests and bootstrap.

## Graph model

Employer, occupation search, interview review, interview question, question response,
and source artefact are separate entities (see `docs/data-model.md`).

## Answers

Provenance is explicit: `source_provided`, `corpus_matched`, `synthesised_*`,
`needs_review`, `rejected`. Synthesised answers are never labelled source-provided.
