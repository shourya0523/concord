# Status: design-system

State: complete
Wave: 1
Updated: 2026-07-30
Branch: `local/ws-design-system-a9ff`

## Done

- [x] `npx shadcn@latest init --monorepo -d --base radix` foundation adapted into repo
- [x] `@ibpe/ui` package with CSS variables + Tailwind v4 theme
- [x] Editorial Finance Terminal tokens (warm paper, near-black, acid-lime)
- [x] Typography: Instrument Serif + Geist + Geist Mono (literal `@theme` names)
- [x] Motion primitives (`@ibpe/ui/motion`) + reduced-motion CSS
- [x] Domain stubs: DiagramCanvas, TopicHeatmap, TargetCompanyMultiSelect, PseudoRagCitationCard, ResourceLinkList, WeakTopicChip, Company/Concept headers, editorial helpers
- [x] DS catalogue route `apps/web/app/ds` (no feature pages)
- [x] Tooling packages: `packages/typescript-config`, `packages/eslint-config` (shadcn monorepo)

## Notes

- Feature teams must import from `@ibpe/ui/*` — do not fork primitives.
- Primary button uses lime accent (not default shadcn zinc).
- Heatmap encodes intensity numerically + hatch for weak topics (a11y).
- Isolated via git worktree `.worktrees/ds` to avoid parallel-agent branch thrash.

## Next (Wave 2 / polish)

- Add more shadcn primitives (command, dialog, tabs, table) via CLI into `packages/ui`
- Wire Mermaid into DiagramCanvas
- Promote TargetCompanyMultiSelect to Command/Popover composition
