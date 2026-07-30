# Accessibility report (Workstream K — QA)

**Wave:** 3  
**Branch:** `local/ws-qa-d1de`  
**Updated:** 2026-07-30  
**Method:** `agent-browser` accessibility-tree snapshots + DOM heuristics (html lang, h1, main landmark, unlabeled controls, img alt). BrowserStack a11y MCP not used (loading / third stack avoided per driver policy).

## Summary

| Severity | Count | Verdict |
|----------|-------|---------|
| Critical | 0 | — |
| High | 1 theme | Missing `<main>` landmark on AppShell product pages |
| Medium | 1 | Duplicate title suffix “· IBPE · IBPE” on several routes |
| Low | 0 blocking | — |

**Overall:** **Pass with findings** — pages are keyboard-reachable, have labelled primary nav, h1 headings, form labels on sign-in; no unlabeled buttons or missing img alt on smoked routes. Landmark gap should be fixed by frontend (wrap AppShell children in `<main>`).

## Route findings

| Route | Env | html lang | h1 | main landmark | Other |
|-------|-----|-----------|----|---------------|-------|
| `/` | local+prod | en | Editorial Finance Terminal | Present | Clean |
| `/onboarding` | local | en | Orient the terminal | **Missing** | Primary nav labelled |
| `/dashboard` | both | en | Company prep desk | **Missing** | Firm select + mode toggles labelled |
| `/prep/heat` | both | en | Topic heat compare | **Missing** | Firm chips exposed |
| `/prep/rag` | both | en | Pseudo-RAG session | **Missing** | Prompt textbox labelled; weak-topic buttons include severity in accessible name |
| `/companies/goldman-sachs` | both | en | Goldman Sachs | **Missing** | CTA links present |
| `/concepts/dcf-valuation` | both | en | DCF valuation | **Missing** | Related links |
| `/study` | both | en | Signature reveal | **Missing** | Reveal / next controls named |
| `/sign-in` | both | en | Sign in | **Missing** | Email required textbox; Password textbox; Sign in button |

## Keyboard

| Check | Result |
|-------|--------|
| Tab moves focus into primary nav | **Pass** — after Tabs from dashboard, focus landed on `A:Heat` |
| Sign-in fields reachable | **Pass** (a11y tree order) |
| Reduced motion (`prefers-reduced-motion: reduce`) | **Pass** — media flag honored in browser; RAG still usable |

## Interactive naming (spot checks)

- Weak-topic chips include severity in accessible name (e.g. “DCF Currently focused weak topic, severity high”).
- Primary navigation uses `aria-label="Primary"`.
- Pseudo-RAG focus prompt has accessible name “Pseudo-RAG focus prompt”.

## Recommended fixes (frontend — not applied by QA)

1. Wrap AppShell content region in `<main>` (currently a plain `<div>`).
2. Deduplicate document titles (`Onboarding · IBPE · IBPE` → single brand suffix).
3. Optional: add skip-to-content link before primary nav.

## Evidence

- Screenshots: `reports/qa-evidence/*.png`
- Snapshots captured during Wave 3 smoke (see `reports/test-report.md`)
