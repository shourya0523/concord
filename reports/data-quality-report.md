# Data quality report

## Teaching vs firm signals

- Canonical rows (all): 3899
- Publishable teaching questions: 416
- Firm-signal topic clusters (withheld from teaching publish): 3483
- Firm-signal occurrences joined to teaching Qs: 738
- Answers with provenance source_ids: 364/416
- Glassdoor responses extracted: 3
- Exact questions metric: 1221
- Pages blocked: 6
- Zero-result anomalies: 3
- `[Interview process]` placeholders rejected: 0
- Answers withheld by publish gate: 0

## Policy

- GitHub / static seed = teaching source of truth (`product_role=teaching_qa`).
- `question_bank.json` = firm signals only (`product_role=firm_signal`).
- Never publish `[Interview process]` placeholders as questions or answers.
- Dedup: teaching corpus uses normalised SHA-256 + fuzzy `token_set_ratio`
  (concept-gated); firm-signal clusters use exact-hash at bank scale.
  All merges write reversible `merge_audit` payloads.
- Production publish blocked until `reports/license-review.md` clears high-priority sources.

## Alerts

- fixture company-goldman-sachs-interviews-httpx.html access_state=captcha
- fixture occupation-investment-banking-analyst-httpx.html access_state=captcha
- fixture occupation-private-equity-associate-httpx.html access_state=captcha
- question QTN_2000000001 reports answer_count=3 comment_count=2 but zero responses extracted
- question QTN_1000000001 reports answer_count=4 comment_count=1 but zero responses extracted
- question QTN_1000000002 reports answer_count=2 comment_count=0 but zero responses extracted
- missing staged file: /workspace/.worktrees/data-quality/data/staging/github/ddeng5_Capital-Markets-Question-Bank-App/www/js/controllers.js
- missing staged file: /workspace/.worktrees/data-quality/data/staging/github/coryjburk_intv-playbook-ib_vc/index.html
- missing staged file: /workspace/.worktrees/data-quality/data/staging/github/coryjburk_intv-playbook-ib_vc/README.md
- missing staged file: /workspace/.worktrees/data-quality/data/staging/github/coryjburk_intv-playbook-pe_vc/index.html
- missing staged file: /workspace/.worktrees/data-quality/data/staging/github/coryjburk_intv-playbook-pe_vc/README.md
