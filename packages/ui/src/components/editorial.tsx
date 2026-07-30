import * as React from "react"

import { cn } from "@ibpe/ui/lib/utils"

export type EditorialHeadingProps = {
  as?: "h1" | "h2" | "h3" | "h4"
  eyebrow?: string
  children: React.ReactNode
  className?: string
}

const sizeMap = {
  h1: "text-4xl md:text-6xl",
  h2: "text-3xl md:text-5xl",
  h3: "text-2xl md:text-3xl",
  h4: "text-xl md:text-2xl",
} as const

function EditorialHeading({
  as: Tag = "h2",
  eyebrow,
  children,
  className,
}: EditorialHeadingProps) {
  return (
    <div data-slot="editorial-heading" className={cn("space-y-2", className)}>
      {eyebrow ? (
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          {eyebrow}
        </p>
      ) : null}
      <Tag className={cn("font-display leading-[1.05] tracking-tight text-foreground", sizeMap[Tag])}>
        {children}
      </Tag>
    </div>
  )
}

export type MetadataPillProps = {
  children: React.ReactNode
  tone?: "default" | "lime" | "muted"
  className?: string
}

function MetadataPill({ children, tone = "default", className }: MetadataPillProps) {
  return (
    <span
      data-slot="metadata-pill"
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-wide uppercase",
        tone === "default" && "border-border bg-muted text-muted-foreground",
        tone === "lime" && "border-lime/40 bg-accent text-accent-foreground",
        tone === "muted" && "border-transparent bg-transparent text-muted-foreground",
        className
      )}
    >
      {children}
    </span>
  )
}

export type MetricDisplayProps = {
  label: string
  value: string | number
  hint?: string
  className?: string
}

function MetricDisplay({ label, value, hint, className }: MetricDisplayProps) {
  return (
    <div data-slot="metric-display" className={cn("min-w-0", className)}>
      <p className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="font-display mt-1 text-4xl leading-none tracking-tight md:text-5xl">{value}</p>
      {hint ? <p className="mt-2 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export { EditorialHeading, MetadataPill, MetricDisplay }
