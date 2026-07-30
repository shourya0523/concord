# packages/contracts — Phase 0 freeze

**Owner:** `ibpe-architecture` (expand freely; do not break these shapes without programme note).

**Python mirror:** `src/ibpe_corpus/schemas/models.py` (already on main). Keep Zod ↔ Pydantic aligned.

## Frozen v0 entities

| Entity | Purpose |
|--------|---------|
| `BankQuestion` | Absorb `data/question_bank.json` row |
| `CompletedJob` | Absorb bank `completed_jobs` |
| `Provenance` / `LearningMode` enums | Teaching vs signal vs synthesis |
| `TopicHeat` | Mode A firm×topic intensity |
| `Concept` | Mode B concept lab node |
| `LearningResource` | Internal/external link with provenance |
| `DiagramRef` | Mermaid / interactive-json teaching aid |
| `PseudoRagPack` | Cited prep pack for company session |

Architecture Wave 1 must add: Answer, Occurrence, Firm, Role, Attempt, Mastery, SearchRequest/Response, JobEvent, API error, full taxonomy.
