# Dependency graph

```mermaid
flowchart TB
  subgraph phase0 [Phase 0 — orchestrator]
    O[Contracts freeze + ownership]
  end

  subgraph wave1 [Wave 1 — parallel]
    A[A Architecture / contracts]
    B[B Design system]
    E[E Database]
    F[F Glassdoor signals]
    G[G GitHub Q/A + transform]
    H[H Gemini enrich + validators]
    J[J Infra CI/Vercel scaffold]
  end

  subgraph wave2 [Wave 2 — parallel after integrate]
    C[C Frontend]
    D[D Backend / auth]
    I[I Search / recs]
  end

  subgraph wave3 [Wave 3]
    K[K QA / verification]
    J3[J Infra prod promote]
  end

  O --> A & B & E & F & G & H & J
  A -->|Zod schemas| E & G & H & D & I
  B -->|UI primitives| C
  E -->|migrations / seed| D & G & H & I
  G -->|published corpus| H & I & C
  F -->|occurrences / heat| G & I & C
  H -->|enriched graph| C & I
  J -->|preview project| C & D & K
  A & B & E --> C & D
  C & D & I --> K
  K --> J3
```

## Hard dependencies

| Consumer | Needs from |
|----------|------------|
| Database | Frozen bank + canonical entity shapes from architecture (min freeze OK to start) |
| Data-quality | Contracts; existing `src/ibpe_corpus` on main |
| Answers | Contracts + GitHub-imported answers from G (can start validators/fixtures in parallel) |
| Design system | None beyond Next/shadcn skills — can start immediately |
| Glassdoor | Nothing from product UI; AGENTS.md constraints |
| Infra | App stub path from architecture; can scaffold CI immediately |
| Frontend (W2) | DS primitives + published API stubs + auth |
| Backend (W2) | Contracts + DB + auth skill |
| Search (W2) | Published corpus + embeddings from H |
| QA (W3) | Deployable preview |

## Non-blocking rule

Never wait on Glassdoor credentials / residential proxy to stop frontend, fixtures, validators, or CI.
