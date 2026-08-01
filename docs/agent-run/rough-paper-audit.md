# Concord paper-system audit (DESIGN.md §2 · §7 · §11)

**Date:** 2026-08-01  
**Branch:** `local/design-frontend-continue-bb32`

## Binding spec

| Layer | Required use |
|------|--------------|
| Rough border | `RoughFrame` / `PaperSheet` draw seeded rough.js borders; fixed seed keys avoid wobble. |
| Torn filters | `PaperSheet` uses decorative SVG strips only; `#torn-paper-static` for sheets/lists of flagship cards, `#torn-paper-hero` only for score or milestone hero moments. Text is never filtered. |
| Semantic marks | `Annotate` handles meaning: underline, box, bracket, circle, strike/cross-off. |
| Lime hover | `RoughHover` / `InkHoverScope` draw rough-notation lime hover boxes for actionable elements. |
| Handwriting | `HandwritingHeadline` is rare and ceremonial, mainly onboarding and score/milestone reveal. |
| Burst | `PaperBurst` appears only after confirmed state changes/milestones. |
| Non-flagship | Lists, loading, errors, signed-out states, target pickers, and plan peeks use bordered rows/sections, not `PaperSheet`. |

## Flagship audit

| Flagship moment | Torn static | Torn hero | Rough border | Annotate | Handwriting | Burst | Lime hover | Current state | Fix |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|
| Study answer card | Yes | No | Yes | Layered reveal annotations after submit | No | No | Reveal CTA | `PaperSheet` restored to default torn; reveal CTA keeps `RoughHover`. | Done. |
| Study close milestone | Yes | No | Yes | CTA hover scope; optional text marks only | Optional | Yes | CTA group | Close sheet restored to default torn and keeps confirmed `PaperBurst`. | Done. |
| RAG grounded brief / pack intro | Yes | No | Yes | Brief heading/trigger annotations | No | No | Prep CTA elsewhere | Brief uses torn `PaperSheet`; embedded study-loop pack intro also defaults torn. | Done. |
| RAG citation hits | No sheet; card chrome only | No | Yes | Provenance labels stay semantic | No | No | Link hover from card | Product RAG hits use `RoughCitationCard` with `RoughFrame`; every card keeps citation URL/label. | Done. |
| Simulator score reveal | No | Yes | Yes | Weak-stage boxes + `CircledNumber` | Yes | Yes | Follow-up CTA | Reveal sheet is `hero`, with `HandwritingHeadline`, `PaperBurst`, and `CircledNumber`. | Done. |
| Simulator live study card / diagram prompt | Yes | No | Yes | Stage/diagram semantics | No | No | Rating buttons | Running stage and diagram prompt use torn `PaperSheet`; after-action guidance is bordered. | Done. |
| Learn module catalog cards | Yes | No | Yes | Progress/circled completion | No | No | Module title hover | Catalog cards use torn `PaperSheet`; links keep rough hover. | Done. |
| Lesson and practice sheets on module hub | Yes | No | Yes | Core concept box, completed marks | No | No | Lesson/practice links | Lesson and practice checkpoint sheets use default torn; roadmap overview is bordered. | Done. |
| Saved notes / collection covers | Yes | No | Yes | Provenance chips, links | No | No | Link hover | Note and collection covers use torn `PaperSheet`; saved loading/error/signed-out are bordered. | Done. |
| Concept diagram frame | Yes | No | Yes | A11y fallback outside filter | No | No | Concept links | Diagram frame uses torn `PaperSheet`; prerequisite mini-map is bordered. | Done. |
| Topic heat cells | No sheet | No | Yes, per-cell overlay | Weakness hatch/labels | No | No | `InkHoverScope` lime boxes | `RoughHeatBorders` wraps `TopicHeatmap`; `InkHoverScope` targets enabled cells. | Done. |
| Dashboard suggested next | Yes | No | Yes | Warren underline + callout bracket | No | No | CTA group | Only suggested-next remains a torn sheet; plan peek became bordered list. | Done. |
| Onboarding ceremonial phrase / heat preview | Heat preview yes | No | Yes | Selected path underline | Yes | No | Navigation/choices | Handwriting remains; target picker/path choices are bordered; heat preview is one torn sheet. | Done. |

## Non-flagship cleanup

| Surface | Expected | Current state | Fix |
|---|---|---|---|
| Company index firm groups | Bordered lists | No `PaperSheet`; rough hover on firm names remains. | Done. |
| Company room over-index concepts | Bordered insight section | No `PaperSheet`; annotate box remains on concept links. | Done. |
| Progress loading/error/signed-out/empty | Bordered status sections | No `PaperSheet`; Warren/status copy remains. | Done. |
| Progress weak concept / diagram empty lists | Bordered rows | No `PaperSheet`; `CircledNumber` and hatches remain. | Done. |
| Saved loading/error/signed-out | Bordered status sections | No `PaperSheet`; notes/collections still paper covers. | Done. |
| Plan loading/error/signed-out/urgency/empty/roadmap rows | Bordered status/list sections | No `PaperSheet`; annotations and rough hover remain on links. | Done. |
| Dashboard plan peek | Bordered list | No `PaperSheet`; suggested-next remains the single dashboard paper moment. | Done. |
| Heat insights callouts | Warren callout + annotated bordered lists | No `PaperSheet`; shared/unique lists keep `Annotate`. | Done. |
