"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@ibpe/ui/components/button"
import { MetadataPill } from "@ibpe/ui/components/editorial"
import { Input } from "@ibpe/ui/components/input"
import { Label } from "@ibpe/ui/components/label"

import type { UsageSummary } from "@/lib/billing/meter"
import type { AiAction } from "@/lib/billing/meter-core"
import { CREDITS_PER_MONTH, CREDITS_PRICE_USD, contactHref, creditsHref } from "@/lib/billing/plans"

const PLAN_LABEL: Record<UsageSummary["plan"], string> = {
  free: "Individual · Free",
  credits: "Individual · Credits",
  team: "Team",
  custom: "Custom",
}

const ACTION_LABEL: Record<AiAction, string> = {
  grade: "Graded answers",
  coaching: "Coaching reports",
  voice: "Voice answers",
}

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
  return body?.error?.message ?? `Request failed (HTTP ${response.status}).`
}

/** Settings → Plan: today's AI usage, credits, and the bring-your-own-key form. */
export function SettingsPlanPanel() {
  const [usage, setUsage] = React.useState<UsageSummary | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [key, setKey] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [keyMessage, setKeyMessage] = React.useState<{ tone: "ok" | "error"; text: string } | null>(null)

  React.useEffect(() => {
    let live = true
    fetch("/api/billing/usage", { cache: "no-store", credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response))
        return (await response.json()) as UsageSummary
      })
      .then((data) => live && setUsage(data))
      .catch((err: unknown) => live && setLoadError(err instanceof Error ? err.message : "Couldn't load usage."))
    return () => {
      live = false
    }
  }, [])

  async function sendKey(method: "PUT" | "DELETE") {
    setPending(true)
    setKeyMessage(null)
    try {
      const response = await fetch("/api/billing/byok", {
        method,
        credentials: "include",
        headers: method === "PUT" ? { "content-type": "application/json" } : undefined,
        body: method === "PUT" ? JSON.stringify({ key }) : undefined,
      })
      if (!response.ok) {
        setKeyMessage({ tone: "error", text: await readError(response) })
        return
      }
      setUsage((await response.json()) as UsageSummary)
      setKey("")
      setKeyMessage({
        tone: "ok",
        text: method === "PUT" ? "Key saved. AI now runs on your key with no daily caps." : "Key removed.",
      })
    } catch {
      setKeyMessage({ tone: "error", text: "Network error. Try again." })
    } finally {
      setPending(false)
    }
  }

  if (loadError) return <p className="text-sm text-muted-foreground">{loadError}</p>
  if (!usage) return <p className="text-sm text-muted-foreground">Loading your plan…</p>

  const byok = usage.byok.configured
  const resetTime = new Date(usage.resets.daily).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <MetadataPill tone="lime">{PLAN_LABEL[usage.plan]}</MetadataPill>
        {byok ? <MetadataPill tone="lime">Own key</MetadataPill> : null}
        {usage.credits.monthly > 0 ? (
          <MetadataPill>
            {usage.credits.balance.toLocaleString()} / {usage.credits.monthly.toLocaleString()} credits
          </MetadataPill>
        ) : null}
      </div>

      <div className="space-y-2">
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">Today</p>
        {byok ? (
          <p className="text-sm">No caps: grading, coaching and voice run on your OpenRouter key.</p>
        ) : (
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
                    <div className="h-full bg-ink" style={{ width: `${limit ? Math.min(100, (used / limit) * 100) : 100}%` }} />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {!byok ? (
          <p className="max-w-xl text-xs text-muted-foreground">
            Free uses reset at {resetTime}. After that, credits pay: grading {usage.cost.grade}, coaching{" "}
            {usage.cost.coaching}, voice {usage.cost.voice}. Practice itself is never limited.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        {usage.plan === "free" ? (
          <a href={creditsHref(usage.account_id)} className="underline-offset-4 hover:underline">
            Get {CREDITS_PER_MONTH.toLocaleString()} credits for ${CREDITS_PRICE_USD}/month →
          </a>
        ) : null}
        <a href={contactHref("team", usage.account_id)} className="underline-offset-4 hover:underline">
          Get team access →
        </a>
        <Link href="/pricing" className="underline-offset-4 hover:underline">
          Compare plans →
        </Link>
      </div>

      <div id="byok" className="scroll-mt-24 space-y-3 border-t border-border pt-4">
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">Your own OpenRouter key</p>
        {!usage.byok.available ? (
          <p className="text-sm text-muted-foreground">Bring-your-own-key isn&apos;t enabled on this server yet.</p>
        ) : byok ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-mono text-sm">sk-or-…{usage.byok.last4}</p>
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => void sendKey("DELETE")}>
              Remove key
            </Button>
          </div>
        ) : (
          <form
            className="max-w-md space-y-2"
            onSubmit={(event) => {
              event.preventDefault()
              void sendKey("PUT")
            }}
          >
            <Label htmlFor="byok-key">API key</Label>
            <div className="flex gap-2">
              <Input
                id="byok-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="sk-or-v1-…"
                value={key}
                onChange={(event) => setKey(event.target.value)}
              />
              <Button type="submit" disabled={pending || !key.trim()}>
                {pending ? "Checking…" : "Save"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Create one at{" "}
              <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
                openrouter.ai/keys
              </a>
              . We check it with OpenRouter, store it encrypted and never show it again. You pay OpenRouter
              directly, usually under $0.10 a month.
            </p>
          </form>
        )}
        {keyMessage ? (
          <p role={keyMessage.tone === "error" ? "alert" : "status"} className={keyMessage.tone === "error" ? "text-sm text-destructive" : "text-sm"}>
            {keyMessage.text}
          </p>
        ) : null}
      </div>

      <p className="font-mono text-[11px] text-muted-foreground">Account ID · {usage.account_id}</p>
    </div>
  )
}
