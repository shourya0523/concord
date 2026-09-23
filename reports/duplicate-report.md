# Duplicate report

- Canonical questions (all): 4148
- Publishable teaching questions: 666
- Variants: 4742
- Duplicate rate (1 - canonical/variants): 0.0944

Merges are reversible via `merge_audit` rows (`reverse_merge` / payload snapshots).
Beyond SHA1: normalised SHA-256 exact-hash + rapidfuzz token_set_ratio with
`same_answer_would_satisfy` distinctive-concept guard on the teaching corpus.
Firm-signal topic clusters dedupe by exact hash only at bank scale; joins onto
teaching Qs use exact-hash + fuzzy (threshold 88) and are reversible.
