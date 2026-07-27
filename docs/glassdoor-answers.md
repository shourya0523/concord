# Glassdoor answers and comments

How the Glassdoor adapter extracts and classifies responses on question-detail
surfaces (and related fixtures).

## Surfaces

| Surface | Typical evidence | Responses extracted? |
|---------|------------------|----------------------|
| Occupation search | Question cards + answer/comment **counts** | No bodies — counts only |
| Company interviews | Review + `QTN_` links + counts | No bodies — counts only |
| Question detail | `#answers` / `#comments` or Apollo arrays | Yes |

When a question reports `answer_count` or `comment_count` > 0 but the parse
yields zero `QuestionResponse` rows (list pages, or a broken detail page), the
parser emits a diagnostic such as:

```text
question QTN_… reports answer_count=N comment_count=M but zero responses extracted
```

## Extraction order

1. Prefer `script#__NEXT_DATA__` → `props.pageProps.apolloState` nodes with
   `__typename: InterviewQuestion`.
2. Read embedded `answers[]` / `comments[]` bodies when present (detail fixture).
3. Fall back to DOM:
   - Answers: `[data-test="answer"]` (optional `data-answer-id`)
   - Comments: `[data-test="comment"]` (optional `data-comment-id`)

## Classification (`ResponseType`)

| Source | `response_type` | Notes |
|--------|-----------------|-------|
| Answer body / `data-test="answer"` | `candidate_answer` | Treated as a candidate attempt, not an authoritative bank answer |
| Comment body / `data-test="comment"` | `clarification` or `discussion_comment` | Clarification if wording suggests clarifying assumptions/meaning; otherwise discussion |

Schema field: `QuestionResponse` in `ibpe_corpus.schemas.models`.

- `source_provided=True` for text taken from the page.
- `question_id` is the Glassdoor `QTN_…` id when available.
- `source_response_id` is `ANS_…` / `COM_…` when present on the node or DOM.

## Replay detail fixture

```bash
python -c "
from ibpe_corpus.adapters.glassdoor import GlassdoorFetcher
r = GlassdoorFetcher().fetch_fixture(
    'fixtures/glassdoor/html/synthetic-question-detail-qtn.html'
)
for resp in r.responses:
    print(resp.response_type.value, resp.source_response_id, resp.exact_source_text[:60])
"
```

Expected on the synthetic detail fixture: **2** `candidate_answer` + **1**
`clarification` comment.

## What this is not

- Not a claim that live Glassdoor DOM matches the synthetic fixtures.
- Not credentialed or cookie-based answer scraping.
- Not synthesis: responses are only exact source text from fixtures/HTML.
