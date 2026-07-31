import { JourneyShell } from "@/components/mockups/journey-shell"
import { PlanSimJourney } from "@/components/mockups/plan-sim-journey"

export const metadata = {
  title: "Mockup · Plan → Simulator",
}

export default function PlanSimMockupPage() {
  return (
    <JourneyShell
      eyebrow="Plan · Simulator"
      title="Study plan → firm mock → score reveal"
      activeHref="/mockups/plan-sim"
      techniques={[
        {
          part: "Study plan roadmap",
          technique:
            "Mixed Mode A + Learn checkpoints; crossed-off completed items; today marker in lime.",
        },
        {
          part: "DiceBear interviewer cast",
          technique:
            "Fixed seed morgan-vp-gs via @dicebear/core + adventurer; states listening / speaking / evaluating.",
        },
        {
          part: "Torn-paper hero",
          technique:
            "feTurbulence (#torn-paper-hero) on score-card edges only so headline + score stay sharp — never on list cards.",
        },
        {
          part: "Handwriting headline",
          technique:
            "Pre-drawn SVG path stroke-dashoffset animation for 'You scored 87%!' — ceremonial only.",
        },
        {
          part: "State-confirmed celebration",
          technique:
            "Score/annotations/Warren celebrate fire after evaluate delay — never on tap alone.",
        },
      ]}
    >
      <PlanSimJourney />
    </JourneyShell>
  )
}
