import Link from "next/link"

import { Button } from "@ibpe/ui/components/button"

import { HeatCompareViews } from "@/components/heat-compare-views"
import { RoughHover, WarrenCallout } from "@/components/paper"
import { TargetSelectIsland } from "@/components/target-select-island"

export const metadata = {
  title: "Topic heat compare · Concord",
  description:
    "Compare which topics your target firms ask most — side by side on a heat map or spider chart.",
}

export const dynamic = "force-dynamic"

type Props = {
  searchParams: Promise<{ firms?: string }>
}

export default async function HeatComparePage({ searchParams }: Props) {
  const { firms } = await searchParams
  const firmIds = (firms ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            Company prep · multi-firm
          </p>
          <h1 className="font-display text-4xl leading-[1.05] tracking-tight text-foreground md:text-6xl">
            Topic heat compare
          </h1>
          <p className="max-w-2xl text-[15px] text-muted-foreground">
            See which topics come up most at each of your target firms. Switch
            between the heat map and the spider chart. Hatch marks topics you
            are weak on. Heat tells you what to prioritise — answers still come
            from teaching materials.
          </p>
        </div>
        <Link href="/prep/rag">
          <RoughHover padding={5}>
            <Button>Start firm prep</Button>
          </RoughHover>
        </Link>
      </div>

      <WarrenCallout mood="thinking">
        Line the same topics up across your targets. Shared heat means one
        practice set can cover several firms. Firm-unique heat means one firm
        asks that topic a lot more — give it its own session. Add or remove
        firms and the views update.
      </WarrenCallout>

      <section className="space-y-3 border-b border-border pb-6">
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          Your target firms
        </p>
        <TargetSelectIsland syncSearchParam className="max-w-full" />
      </section>

      <HeatCompareViews firmIds={firmIds.length > 0 ? firmIds : undefined} />
    </div>
  )
}
