import { JourneyShell } from "@/components/mockups/journey-shell"
import { ModeAJourney } from "@/components/mockups/mode-a-journey"

export const metadata = {
  title: "Mockup · Mode A company journey",
}

export default function ModeAMockupPage() {
  return (
    <JourneyShell
      eyebrow="Mode A"
      title="Company prep"
      activeHref="/mockups/mode-a"
      techniques={[
        {
          part: "Topic heat dual-encoding",
          technique:
            "TopicHeatmap cells: heat chroma + numeric intensity; weak hatch pattern; glow reserved for weakest cell callout (not full-grid glow).",
        },
        {
          part: "rough.js frames",
          technique:
            "RoughFrame uses rough.svg with fixed seedFrom(seedKey) + ResizeObserver redraw; torn-paper-static filter on cards.",
        },
        {
          part: "Pseudo-RAG citations",
          technique:
            "PseudoRagCitationCard shows why-retrieved + provenance chips; pack freeze boxed via rough-notation.",
        },
        {
          part: "Annotation semantic map",
          technique:
            "Annotate: underline (key phrase), highlight (strong answer part), strike-through (mistake), box (pack), circle (count).",
        },
        {
          part: "Warren focus-pause",
          technique:
            "Idle breathing pauses while textarea focused; celebrating only after Submit confirms score.",
        },
      ]}
    >
      <ModeAJourney />
    </JourneyShell>
  )
}
