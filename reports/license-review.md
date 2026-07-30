# License review — GitHub teaching corpora

**Status: BLOCKING for production publish.** Staging / offline pipeline OK.

GitHub Q/A is the teaching source of truth. Do not ship imported answers to
production until each high-priority source below has an explicit rights decision.

| Source | Commit | Product role | License / rights note | Decision |
|--------|--------|--------------|----------------------|----------|
| `ddeng5/Capital-Markets-Question-Bank-App` | `05dca576…` | `teaching_qa` | No clear SPDX in repo inventory; Firebase export of IB Q/A. Confirm author permission / license before prod. | **Pending review** |
| `coryjburk/intv-playbook-ib_vc` | `c174e326…` | `teaching_qa` | Single-file HTML playbook; rights unclear. Review README / contact author. | **Pending review** |
| `coryjburk/intv-playbook-pe_vc` | `ae3b2693…` | `teaching_qa` | Same as IB playbook. | **Pending review** |
| `HireAbo/awesome-interview-questions-5000-jobs` | `837a40fb…` | `teaching_qa` (questions only) | Broad templated lists; verify LICENSE in repo before prod. | **Pending review** |
| `offergenieai/Finance-Interview-Questions` | `b651edc0…` | `teaching_qa` (titles) | Titles only; low risk but still attribute. | **Pending review** |
| Static seed (`fixtures/corpus/seed_ib_pe_questions.json`) | n/a | `teaching_qa` | Synthetic in-repo fixture; OK to publish as synthetic. | **Allowed (synthetic)** |
| `data/question_bank.json` | n/a | `firm_signal` | GlassCleaner legacy scrape; **not** teaching answers; occurrence heat only. | **Signal-only (no teaching publish)** |

## Gate

- [ ] Legal/product owner signs off high-priority GitHub sources
- [ ] Attribution strings recorded on published answer provenance
- [ ] Pattern-only scraper repos remain non-imported
- [ ] `[Interview process]` placeholders confirmed absent from published exports

## References

- `config/github_sources.yml`
- `docs/source-registry.md`
- `docs/research/github-source-inventory.md`
- `packages/contracts` `ProvenanceEnum` (`github_source` | `glassdoor_occurrence` | …)
