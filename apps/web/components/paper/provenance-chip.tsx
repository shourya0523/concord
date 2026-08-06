import { BookOpen, CheckCircle2, FlaskConical, SignalHigh, Sparkles } from "lucide-react"

import { cn } from "@ibpe/ui/lib/utils"

const PROVENANCE_META: Record<
  string,
  { label: string; Icon: typeof BookOpen; tone: string }
> = {
  source_provided: {
    label: "Source provided",
    Icon: BookOpen,
    tone: "border-foreground/30 text-foreground",
  },
  corpus_matched: {
    label: "Teaching answer",
    Icon: CheckCircle2,
    tone: "border-foreground/30 text-foreground",
  },
  github_source: {
    label: "GitHub corpus",
    Icon: BookOpen,
    tone: "border-foreground/30 text-foreground",
  },
  synthesised_validated: {
    label: "Synthesised · validated",
    Icon: Sparkles,
    tone: "border-milestone-foreground/40 text-milestone-foreground",
  },
  gemini_synthesised: {
    label: "Synthesised",
    Icon: Sparkles,
    tone: "border-milestone-foreground/40 text-milestone-foreground",
  },
  synthesised_unvalidated: {
    label: "Synthesised · unvalidated",
    Icon: FlaskConical,
    tone: "border-streak-foreground/40 text-streak-foreground",
  },
  glassdoor_occurrence: {
    label: "Firm signal",
    Icon: SignalHigh,
    tone: "border-graphite/40 text-graphite",
  },
  editorial: {
    label: "Editorial",
    Icon: BookOpen,
    tone: "border-foreground/30 text-foreground",
  },
  static_seed: {
    label: "Seed corpus",
    Icon: BookOpen,
    tone: "border-foreground/30 text-foreground",
  },
}

/**
 * Teaching provenance chip — icon + mono label (never color alone).
 * Glassdoor chips only ever mark *signals*, never answer text.
 */
export function ProvenanceChip({
  provenance,
  className,
}: {
  provenance: string
  className?: string
}) {
  const meta = PROVENANCE_META[provenance] ?? {
    label: provenance.replace(/_/g, " "),
    Icon: BookOpen,
    tone: "border-foreground/30 text-foreground",
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border bg-transparent px-2 py-0.5 font-mono text-[10px] tracking-wide uppercase",
        meta.tone,
        className,
      )}
      data-provenance={provenance}
    >
      <meta.Icon className="size-3" aria-hidden />
      {meta.label}
    </span>
  )
}
