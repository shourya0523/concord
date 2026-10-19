import Link from "next/link"

import { MetadataPill } from "@ibpe/ui/components/editorial"

import {
  CREDITS_PER_MONTH,
  CREDITS_PRICE_USD,
  FREE_DAILY_LIMITS,
  contactHref,
  creditsHref,
  currentPlanId,
  getPlan,
} from "@/lib/billing/plans"

/** Settings → Plan: the account's tier, its free daily limits and the credit upgrade. */
export function SettingsPlanPanel() {
  const plan = getPlan(currentPlanId())

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <MetadataPill tone="lime">{plan.name}</MetadataPill>
        <MetadataPill>{plan.price}</MetadataPill>
        <MetadataPill>{plan.cadence}</MetadataPill>
      </div>
      <p className="max-w-xl text-sm text-muted-foreground">
        Practice is unlimited. Each day you get {FREE_DAILY_LIMITS.grade} graded answers,{" "}
        {FREE_DAILY_LIMITS.coaching} coaching report and {FREE_DAILY_LIMITS.voice} voice answers free.
        For ${CREDITS_PRICE_USD} a month, {CREDITS_PER_MONTH.toLocaleString("en-US")} credits lift those
        caps.
      </p>
      <div className="flex flex-wrap gap-3 text-sm">
        <a href={creditsHref()} className="underline-offset-4 hover:underline">
          Get credits →
        </a>
        <a href={contactHref("team")} className="underline-offset-4 hover:underline">
          Get team access →
        </a>
        <Link href="/pricing" className="underline-offset-4 hover:underline">
          Compare plans →
        </Link>
      </div>
    </div>
  )
}
