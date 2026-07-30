# Sibling agent progress

Checked: 2026-07-30 (orchestrator environment). Updated with data-thesis direction.

## Data thesis (product direction)

- Open-source **GitHub Q/A** = teaching source of truth (question/answer pairs).
- **Glassdoor** = directional firm preferences / topic heat for Mode A only.
- **Gemini** enriches and categorises into company-prep + concept-lab.
- Priority absorb: [PR #2](https://github.com/shourya0523/concord/pull/2) GitHub importers / staged Capital Markets QB export.

## `bc-a80753a1-8140-425a-88e1-3a90e54c3a7e`

| Field | Value |
|-------|--------|
| MCP list visibility | **Not available** in this environment’s `list-cloud-agents` |
| Dashboard URL | https://cursor.com/agents/bc-a80753a1-8140-425a-88e1-3a90e54c3a7e |
| Track via | GitHub PRs with footer bcId + branches ending `-3a7e` |

### Deliverables

| PR | Branch | State | Notes |
|----|--------|-------|-------|
| [#5](https://github.com/shourya0523/concord/pull/5) BFF API | `local/bff-api-cloudflare-bypass-3a7e` | **MERGED** | Firm-signal scrape path. Do not redo. |
| [#7](https://github.com/shourya0523/concord/pull/7) parallel batch | `local/parallel-full-scrape-3a7e` | **OPEN** | Scale Glassdoor **signals**; not answer corpus. |

### Related corpus work (teaching truth)

| PR | Branch | State | Notes |
|----|--------|-------|-------|
| [#2](https://github.com/shourya0523/concord/pull/2) IB/PE corpus | `local/ibpe-interview-corpus-042f` | **OPEN** | GitHub adapters + staged Q/A — **priority absorb**. |

### Action for programme

- Import/enrich GitHub Q/A first (`ibpe-data-quality` + `ibpe-answers`).
- Keep Glassdoor as Mode A signal layer (`ibpe-glassdoor`).
- Gemini categorises into company rooms + concept labs.
