# packages/ui

Owned by `ibpe-design-system`.

## Editorial Finance Terminal

shadcn/ui (radix-nova) + custom tokens:

- Warm paper / near-black surfaces
- Acid-lime primary accent
- Instrument Serif (display) · Geist (UI) · Geist Mono (metadata)

## Imports

```ts
import { Button } from "@ibpe/ui/components/button"
import { TopicHeatmap } from "@ibpe/ui/components/topic-heatmap"
import { brand, motion } from "@ibpe/ui/tokens"
import "@ibpe/ui/globals.css"
```

## Domain primitives (Wave 1 stubs)

| Component | Path |
|-----------|------|
| DiagramCanvas | `components/diagram-canvas` |
| TopicHeatmap | `components/topic-heatmap` |
| TargetCompanyMultiSelect | `components/target-company-multi-select` |
| PseudoRagCitationCard | `components/pseudo-rag-citation-card` |
| ResourceLinkList | `components/resource-link-list` |
| WeakTopicChip | `components/weak-topic-chip` |
| CompanyRoomHeader / ConceptLabHeader | `components/company-concept-headers` |
| EditorialHeading / MetadataPill / MetricDisplay | `components/editorial` |

## Catalogue

`apps/web` route `/ds` — DS demo only (no feature pages).

## Add shadcn components

```bash
cd packages/ui
npx shadcn@latest add button input badge separator skeleton -y
```
