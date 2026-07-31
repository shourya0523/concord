import { JourneyShell } from "@/components/mockups/journey-shell"
import { ModeBJourney } from "@/components/mockups/mode-b-journey"

export const metadata = {
  title: "Mockup · Mode B Learn journey",
}

export default function ModeBMockupPage() {
  return (
    <JourneyShell
      eyebrow="Mode B · Learn"
      title="Learn"
      activeHref="/mockups/mode-b"
      techniques={[
        {
          part: "Learning modules",
          technique:
            "Catalog cards with progress; hub roadmap uses crossed-off for done and lime circle for current checkpoint.",
        },
        {
          part: "DiagramCanvas",
          technique:
            "First-class concept diagram host with mermaid source + reduced-motion table fallback (DESIGN.md §10.7).",
        },
        {
          part: "Lab notes annotations",
          technique: "rough-notation box around formula definition; Warren bracket for pitfalls.",
        },
        {
          part: "Firm bridge",
          technique:
            "Heat relevance chips from concept.firm_relevance → Apply at Firm CTA into Mode A room.",
        },
        {
          part: "Quiz score calmness",
          technique: "Score circled ceremonially; numeric progression stays calm (no bounce).",
        },
      ]}
    >
      <ModeBJourney />
    </JourneyShell>
  )
}
