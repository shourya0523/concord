"use client"

import * as React from "react"
import Link from "next/link"

import { MetadataPill } from "@ibpe/ui/components/editorial"

import type { UsageSummary } from "@/lib/billing/meter"
import type { AiAction } from "@/lib/billing/meter-core"
import { CREDITS_PER_MONTH, CREDITS_PRICE_USD, contactHref, getPlan } from "@/lib/billing/plans"

const ACTION_LABEL: Record<AiAction, string> = {
  grade: "Graded answers",
  coaching: "Coaching reports",
  voice: "Voice answers",
}

/**
 * Settings → Plan: the tier (Standby / Supersonic / Charter / Fleet), today's
 * free AI usage, credits, and the organisation key on Charter / Fleet seats.
 */
export function SettingsPlanPanel() {
  const [usage, setUsage] = React.useState<UsageSummary | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let live = true
    fetch("/api/billing/usage", { cache: "no-store", credentials: "include" })
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
          throw new Error(body?.error?.message ?? `Couldn't load your plan (HTTP ${response.status}).`)
        }
        return (await response.json()) as UsageSummary
      })
      .then((data) => live && setUsage(data))
      .catch((err: unknown) => live && setLoadError(err instanceof Error ? err.message : "Couldn't load your plan."))
    return () => {
      live = false
    }
  }, [])

  if (loadError) return <p className="text-sm text-muted-foreground">{loadError}</p>
  if (!usage) return <p className="text-sm text-muted-foreground">Loading your plan…</p>

  const plan = getPlan(usage.plan)
  const orgKey = usage.byok.configured
  const resetTime = new Date(usage.resets.daily).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <MetadataPill tone="lime">{plan.name}</MetadataPill>
        <MetadataPill>{plan.kind}</MetadataPill>
        {orgKey ? <MetadataPill tone="lime">Organisation key</MetadataPill> : null}
        {usage.credits.monthly > 0 ? (
          <MetadataPill>
            {usage.credits.balance.toLocaleString()} / {usage.credits.monthly.toLocaleString()} credits
          </MetadataPill>
        ) : null}
      </div>

      <div className="space-y-2">
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">Today</p>
        {orgKey ? (
          <p className="text-sm">
            No caps: grading, coaching and voice run on your organisation&apos;s OpenRouter key{" "}
            <span className="font-mono">(sk-or-…{usage.byok.last4})</span>. Your admin manages it.
          </p>
        ) : (
          <>
            <ul className="max-w-md space-y-2" aria-label="Free AI usage today">
              {(Object.keys(usage.today) as AiAction[]).map((action) => {
                const { used, limit } = usage.today[action]
                return (
                  <li key={action} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{ACTION_LABEL[action]}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {used} / {limit} free
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted" aria-hidden>
                      <div
                        className="h-full bg-ink"
                        style={{ width: `${limit ? Math.min(100, (used / limit) * 100) : 100}%` }}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
            <p className="max-w-xl text-xs text-muted-foreground">
              Free uses reset at {resetTime}. After that, credits pay: grading {usage.cost.grade}, coaching{" "}
              {usage.cost.coaching}, voice {usage.cost.voice}. Practice itself is never limited.
            </p>
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        {usage.plan === "free" ? (
          <a href={contactHref("credits", usage.account_id)} className="underline-offset-4 hover:underline">
            Go Supersonic: {CREDITS_PER_MONTH.toLocaleString()} credits for ${CREDITS_PRICE_USD}/month →
          </a>
        ) : null}
        {usage.plan === "free" || usage.plan === "credits" ? (
          <a href={contactHref("team", usage.account_id)} className="underline-offset-4 hover:underline">
            Book a charter for your group →
          </a>
        ) : null}
        <Link href="/pricing" className="underline-offset-4 hover:underline">
          Compare plans →
        </Link>
      </div>

      <p className="font-mono text-[11px] text-muted-foreground">Account ID · {usage.account_id}</p>
    </div>
  )
}
