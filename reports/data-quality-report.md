# Data quality report

## Teaching vs firm signals

- Canonical rows (all): 4148
- Publishable teaching questions: 666
- Firm-signal topic clusters (withheld from teaching publish): 3482
- Firm-signal occurrences joined to teaching Qs: 1105
- Answers with provenance source_ids: 573/666
- Glassdoor responses extracted: 3
- Exact questions metric: 2046
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
- missing staged file: /home/user/concord/.claude/worktrees/agent-a7fa7484822e0f141/data/staging/github/ddeng5_Capital-Markets-Question-Bank-App/www/js/controllers.js
