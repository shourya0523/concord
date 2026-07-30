import * as React from "react"
import { ExternalLink, Quote } from "lucide-react"

import { cn } from "@ibpe/ui/lib/utils"

export type CitationProvenance =
  | "github-corpus"
  | "glassdoor-signal"
  | "editorial"
  | "gemini-enriched"
  | "user-note"

export type PseudoRagCitationCardProps = {
  title: string
  excerpt: string
  whyRetrieved: string
  provenance: CitationProvenance
  sourceUrl?: string
  score?: number
  className?: string
}

const provenanceLabel: Record<CitationProvenance, string> = {
  "github-corpus": "Teaching corpus",
  "glassdoor-signal": "Firm signal",
  editorial: "Editorial",
  "gemini-enriched": "Gemini enriched",
  "user-note": "Your note",
}

/**
 * Pseudo-RAG citation surface — why retrieved + provenance, never laundered.
 */
function PseudoRagCitationCard({
  title,
  excerpt,
  whyRetrieved,
  provenance,
  sourceUrl,
  score,
  className,
}: PseudoRagCitationCardProps) {
  return (
    <article
      data-slot="pseudo-rag-citation-card"
      className={cn(
        "border-border/80 bg-card text-card-foreground border-l-2 border-l-lime border-y border-r px-4 py-3",
        className
      )}
    >
      <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-medium leading-snug">{title}</h3>
        <div className="flex items-center gap-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          <span>{provenanceLabel[provenance]}</span>
          {typeof score === "number" ? (
            <span aria-label={`Relevance ${score.toFixed(2)}`}>rel {score.toFixed(2)}</span>
          ) : null}
        </div>
      </header>
      <blockquote className="text-muted-foreground mb-3 flex gap-2 text-[15px] leading-relaxed">
        <Quote className="mt-0.5 size-3.5 shrink-0 text-lime" aria-hidden />
        <p>{excerpt}</p>
      </blockquote>
      <p className="text-foreground/80 text-xs leading-relaxed">
        <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          Why retrieved ·{" "}
        </span>
        {whyRetrieved}
      </p>
      {sourceUrl ? (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs text-foreground underline-offset-4 hover:underline"
        >
          Source
          <ExternalLink className="size-3" aria-hidden />
        </a>
      ) : null}
    </article>
  )
}

export { PseudoRagCitationCard }
