import * as React from "react"

import { cn } from "@ibpe/ui/lib/utils"
import { WeakTopicChip } from "@ibpe/ui/components/weak-topic-chip"

export type CompanyRoomHeaderProps = {
  companyName: string
  track?: string
  role?: string
  subtitle?: string
  weakTopics?: string[]
  actions?: React.ReactNode
  className?: string
}

function CompanyRoomHeader({
  companyName,
  track,
  role,
  subtitle,
  weakTopics = [],
  actions,
  className,
}: CompanyRoomHeaderProps) {
  return (
    <header
      data-slot="company-room-header"
      className={cn(
        "border-border flex flex-col gap-4 border-b pb-6 md:flex-row md:items-end md:justify-between",
        className
      )}
    >
      <div className="min-w-0">
        <p className="mb-2 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          Company prep{track ? ` · ${track}` : ""}
        </p>
        <h1 className="font-display text-4xl leading-[1.05] tracking-tight text-foreground md:text-5xl">
          {companyName}
        </h1>
        {role || subtitle ? (
          <p className="mt-2 max-w-2xl text-[15px] text-muted-foreground">
            {[role, subtitle].filter(Boolean).join(" — ")}
          </p>
        ) : null}
        {weakTopics.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {weakTopics.map((topic) => (
              <WeakTopicChip key={topic} label={topic} />
            ))}
          </div>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </header>
  )
}

export type ConceptLabHeaderProps = {
  conceptName: string
  domain?: string
  masteryLabel?: string
  subtitle?: string
  actions?: React.ReactNode
  className?: string
}

function ConceptLabHeader({
  conceptName,
  domain,
  masteryLabel,
  subtitle,
  actions,
  className,
}: ConceptLabHeaderProps) {
  return (
    <header
      data-slot="concept-lab-header"
      className={cn(
        "border-border flex flex-col gap-4 border-b pb-6 md:flex-row md:items-end md:justify-between",
        className
      )}
    >
      <div className="min-w-0">
        <p className="mb-2 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          Concept lab{domain ? ` · ${domain}` : ""}
        </p>
        <h1 className="font-display text-4xl leading-[1.05] tracking-tight text-foreground md:text-5xl">
          {conceptName}
        </h1>
        {subtitle ? (
          <p className="mt-2 max-w-2xl text-[15px] text-muted-foreground">{subtitle}</p>
        ) : null}
        {masteryLabel ? (
          <p className="mt-3 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
            Mastery · <span className="text-foreground">{masteryLabel}</span>
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </header>
  )
}

export { CompanyRoomHeader, ConceptLabHeader }
