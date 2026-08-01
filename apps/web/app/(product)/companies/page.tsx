import Link from "next/link"

import {
  InkHoverScope,
  PaperSheet,
  RoughHover,
  SemanticPill,
  WarrenCallout,
} from "@/components/paper"
import { intensityBand } from "@/components/paper/heat-strip"
import { listFirmCatalog, type FirmCatalogItem } from "@/lib/data/catalog"

export const metadata = {
  title: "Company rooms · Concord",
  description:
    "Every firm prep room, ranked by reported Glassdoor occurrence signal volume",
}

export const dynamic = "force-dynamic"

const HEAT_FILL = [
  "bg-heat-0",
  "bg-heat-1",
  "bg-heat-2",
  "bg-heat-3",
  "bg-heat-4",
] as const

type VolumeGroup = {
  id: string
  label: string
  hint: string
  firms: FirmCatalogItem[]
}

/**
 * Rank by occurrence volume and group into quiet, data-relative tiers
 * (thresholds scale with the catalog max, never hardcoded counts).
 */
function groupBySignalVolume(items: FirmCatalogItem[]): VolumeGroup[] {
  const sorted = [...items].sort(
    (a, b) => b.signals - a.signals || a.name.localeCompare(b.name)
  )
  const max = sorted[0]?.signals ?? 0
  if (max === 0) {
    return [
      {
        id: "all",
        label: "All firms",
        hint: "No occurrence volume reported yet",
        firms: sorted,
      },
    ]
  }
  const deep = sorted.filter((firm) => firm.signals >= max * 0.5)
  const established = sorted.filter(
    (firm) => firm.signals >= max * 0.15 && firm.signals < max * 0.5
  )
  const early = sorted.filter((firm) => firm.signals < max * 0.15)
  return [
    {
      id: "deep",
      label: "Deepest signal coverage",
      hint: "≥ half of the catalog peak",
      firms: deep,
    },
    {
      id: "established",
      label: "Established coverage",
      hint: "meaningful reported volume",
      firms: established,
    },
    {
      id: "early",
      label: "Early coverage",
      hint: "thin volume — treat heat as directional",
      firms: early,
    },
  ].filter((group) => group.firms.length > 0)
}

function SignalMeter({ signals, max }: { signals: number; max: number }) {
  const ratio = max > 0 ? signals / max : 0
  const band = intensityBand(ratio)
  const width = Math.max(4, Math.round(ratio * 100))
  return (
    <span
      className="flex items-center gap-2"
      aria-label={`${signals} reported signals`}
    >
      <span
        aria-hidden
        className="inline-block h-2 w-20 overflow-hidden rounded-[2px] border border-foreground/25 bg-transparent"
      >
        <span
          className={`block h-full ${HEAT_FILL[band]}`}
          style={{ width: `${width}%` }}
        />
      </span>
      <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
        {signals} <span className="text-muted-foreground/70">signals</span>
      </span>
    </span>
  )
}

export default async function CompaniesIndexPage() {
  const catalog = await listFirmCatalog()
  const max = catalog.items.reduce(
    (peak, firm) => Math.max(peak, firm.signals),
    0
  )
  const groups = groupBySignalVolume(catalog.items)

  let rank = 0

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          Company rooms · reported occurrence signals
        </p>
        <h1 className="font-display text-4xl leading-[1.05] tracking-tight text-foreground md:text-6xl">
          Companies
        </h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          {catalog.items.length} firm rooms, ranked by how much reported
          interview volume sits behind each one. Open a room for topic heat,
          over-indexed concepts, and the reported signal browser.
        </p>
      </header>

      <WarrenCallout mood="idle">
        Every room here runs on Glassdoor <em>occurrence</em> signals — which
        topics show up and how often. They point you at what to drill; teaching
        answers always come from the corpus, never from scraped interview text.
      </WarrenCallout>

      {catalog.note ? (
        <p className="font-mono text-[11px] tracking-wide text-muted-foreground">
          {catalog.note}
        </p>
      ) : null}
      <p className="font-mono text-[10px] tracking-wide text-muted-foreground/80 uppercase">
        Bars show catalog-relative occurrence intensity; every row keeps the raw
        signal count.
      </p>

      {catalog.items.length === 0 ? (
        <p className="border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
          No firm rooms are published yet. Run an occurrence import and the
          rooms will open here, ranked by signal volume.
        </p>
      ) : (
        <InkHoverScope selector="a" className="space-y-10">
          {groups.map((group) => (
            <section
              key={group.id}
              className="space-y-3"
              aria-label={group.label}
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border pb-2">
                <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                  {group.label}
                </h2>
                <span className="font-mono text-[10px] tracking-wide text-muted-foreground/70 uppercase">
                  {group.firms.length} firms · {group.hint}
                </span>
              </div>
              <PaperSheet seedKey={`company-index-${group.id}`} torn={false}>
                <ul>
                  {group.firms.map((firm, index) => {
                    rank += 1
                    return (
                      <li key={firm.id}>
                        <Link
                          href={`/companies/${firm.slug}`}
                          className={`flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b border-stone/60 px-2 py-3 transition-colors duration-200 ease-out hover:bg-foreground/[0.03] ${
                            index === group.firms.length - 1 ? "border-b-0" : ""
                          }`}
                        >
                          <span className="w-7 shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
                            {String(rank).padStart(2, "0")}
                          </span>
                          <RoughHover padding={2} className="align-baseline">
                            <span className="font-display text-xl tracking-tight text-foreground">
                              {firm.name}
                            </span>
                          </RoughHover>
                          <SemanticPill
                            tone={firm.track === "PE" ? "success" : "neutral"}
                            icon={false}
                          >
                            {firm.track ?? "Track tbd"}
                          </SemanticPill>
                          <span className="ml-auto">
                            <SignalMeter signals={firm.signals} max={max} />
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </PaperSheet>
            </section>
          ))}
        </InkHoverScope>
      )}
    </div>
  )
}
