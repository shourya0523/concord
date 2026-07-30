# packages/contracts

**Owner:** `ibpe-architecture`  
**Python mirror:** `src/ibpe_corpus/schemas/models.py` — keep Zod ↔ Pydantic aligned.

## Data thesis (do not invert)

| Source | Role |
|--------|------|
| GitHub / curated Q/A | Teaching truth (`source_provided` / `corpus_matched`) |
| Glassdoor bank | Firm signals → `InterviewOccurrence` / `TopicHeat` only |
| Gemini | Enrich / synthesise with `synthesised_*` provenance |

## Modules

| Path | Contents |
|------|----------|
| `src/enums.ts` | Domains, provenance, validation, job/API enums |
| `src/bank.ts` | `BankQuestion`, `CompletedJob`, `QuestionBankFile` |
| `src/corpus.ts` | Artefacts, canonical Q, variants, **Answer**, **Occurrence**, JobResult |
| `src/product.ts` | **Firm**, **Role**, **Attempt**, **Mastery**, **SearchRequest/Response**, concepts |
| `src/jobs.ts` | **JobEvent**, **ApiError**, audit, scrape completed_job event |
| `src/taxonomy.ts` | PE YAML + product **TopicTaxonomy** |

## Usage

```ts
import {
  BankQuestionSchema,
  AnswerSchema,
  InterviewOccurrenceSchema,
  FirmSchema,
  SearchRequestSchema,
  ApiErrorSchema,
} from "@ibpe/contracts";
```

Wave 2+ consumers: `apps/web`, `packages/database`, `packages/search`, `packages/ai`.
Do not diverge TypeScript types from these Zod schemas.
