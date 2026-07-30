# Answer coverage report

- Canonical questions: 3310
- Answers (non-rejected): 837
- Coverage: 25.3%
- Source-provided: 377
- Corpus-matched: 310
- Generated: 150
- Validated: 461
- Rejected: 0

## Provenance rule

Synthesised answers are never labelled `source_provided`.
Gemini enrichment is always `gemini_synthesised` and never attributed to Glassdoor
or to a GitHub path that did not contain the text. Corpus / GitHub answers win;
synthesis fills gaps only.

## Enrichment (Wave 1 skeleton)

- Job: `python -m ibpe_corpus.answers.enrich_job`
- Calculators + fixtures: `fixtures/finance/*`
- Editorial queue stub: `ibpe_corpus.answers.editorial`
- Graph outputs: company_prep + concept_lab nodes in enrichment report
