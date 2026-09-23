"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@ibpe/ui/components/button"
import { Input } from "@ibpe/ui/components/input"
import { Label } from "@ibpe/ui/components/label"

import { PaperSheet, SemanticPill, WarrenCallout } from "@/components/paper"

/**
 * /leagues — opt-in weekly XP league (plan P7.3). Standings show anonymous
 * handles only; the server never sends user ids, names or emails.
 */

type Zone = "promotion" | "safe" | "demotion"

type Standing = { rank: number; handle: string; xp: number; is_you: boolean; zone: Zone }

type League = {
  opted_in: boolean
  week_start: string
  week_end: string
  time_zone: string
  cohort: string | null
  cohort_label: string
  you: Standing | null
  standings: Standing[]
  size: number
  cap: number
  copy: string
  source: string
  note?: string
}

type Phase = "loading" | "ready" | "unauthenticated" | "disabled" | "error"

function formatDay(iso: string): string {
  const date = new Date(`${iso}T12:00:00Z`)
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })
}

const ZONE_LABEL: Record<Zone, string> = {
  promotion: "Moving up",
  safe: "",
  demotion: "At risk",
}

export function LeagueIsland() {
  const [phase, setPhase] = React.useState<Phase>("loading")
  const [league, setLeague] = React.useState<League | null>(null)
  const [cohort, setCohort] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [notice, setNotice] = React.useState<string | null>(null)

  const apply = React.useCallback((response: Response, payload: unknown) => {
    if (response.status === 401) {
      setPhase("unauthenticated")
      return
    }
    if (response.status === 404) {
      setPhase("disabled")
      return
    }
    if (!response.ok) {
      setPhase("error")
      return
    }
    const next = payload as League
    setLeague(next)
    setCohort(next.cohort ?? "")
    setPhase("ready")
  }, [])

  React.useEffect(() => {
    const controller = new AbortController()
    fetch("/api/leagues/current", { signal: controller.signal })
      .then(async (response) => apply(response, await response.json().catch(() => null)))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        setPhase("error")
      })
    return () => controller.abort()
  }, [apply])

  async function membership(method: "POST" | "DELETE") {
    if (busy) return
    setBusy(true)
    setNotice(null)
    try {
      const response = await fetch("/api/leagues/membership", {
        method,
        headers: { "content-type": "application/json" },
        body: method === "POST" ? JSON.stringify({ cohort: cohort.trim() || null }) : undefined,
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok && response.status !== 401 && response.status !== 404) {
        setNotice(`That didn't save (HTTP ${response.status}).`)
        return
      }
      apply(response, payload)
    } catch {
      setNotice("Network error — nothing changed.")
    } finally {
      setBusy(false)
    }
  }

  if (phase === "loading") {
    return <p className="text-sm text-muted-foreground">Loading this week&apos;s league…</p>
  }
  if (phase === "unauthenticated") {
    return (
      <p className="text-sm text-muted-foreground">
        Sign in to join a league — standings are tied to your account&apos;s daily XP.
      </p>
    )
  }
  if (phase === "disabled") {
    return <p className="text-sm text-muted-foreground">Leagues aren&apos;t switched on yet.</p>
  }
  if (phase === "error" || !league) {
    return (
      <p role="alert" className="border border-dashed border-error px-3 py-2 text-sm">
        The league couldn&apos;t be loaded. Reload the page to try again.
      </p>
    )
  }

  const cohortField = (
    <div className="max-w-sm space-y-2">
      <Label htmlFor="league-cohort">Cohort (optional)</Label>
      <Input
        id="league-cohort"
        value={cohort}
        maxLength={40}
        placeholder="2027 SA, or your school"
        onChange={(event) => setCohort(event.target.value)}
      />
      <p className="text-xs text-muted-foreground">
        Grouped with others who typed the same cohort; blank groups you by track. Don&apos;t use
        your name.
      </p>
    </div>
  )

  if (!league.opted_in) {
    return (
      <div className="space-y-6">
        <WarrenCallout mood="idle">
          A friendly weekly race: XP from your daily sets counts, everyone starts at zero on Monday,
          and you show up only as an anonymous handle like <em>brisk-otter-417</em>.
        </WarrenCallout>
        <PaperSheet seedKey="league-opt-in" contentClassName="space-y-4">
          <h2 className="font-display text-2xl">Join this week&apos;s league</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Leagues of up to {league.cap}, by cohort or track.</li>
            <li>Only your handle and weekly XP are visible to others — never your name or email.</li>
            <li>Leave any time here or in Settings; you drop out of the standings at once.</li>
          </ul>
          {cohortField}
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={busy} onClick={() => void membership("POST")}>
              {busy ? "Joining…" : "Join the league"}
            </Button>
            {notice ? <span className="text-xs text-muted-foreground">{notice}</span> : null}
          </div>
        </PaperSheet>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            {league.cohort_label} · {formatDay(league.week_start)} – {formatDay(league.week_end)}
          </p>
          <p className="mt-1 text-sm">{league.copy}</p>
        </div>
        {league.you ? (
          <SemanticPill tone="streak">
            #{league.you.rank} of {league.size} · {league.you.xp} XP
          </SemanticPill>
        ) : null}
      </div>

      <div className="border border-border">
        <ol className="divide-y divide-border">
          {league.standings.map((row) => (
            <li
              key={`${row.handle}-${row.rank}`}
              className={
                row.is_you
                  ? "flex items-center gap-3 bg-secondary/60 px-4 py-2.5"
                  : "flex items-center gap-3 px-4 py-2.5"
              }
              aria-current={row.is_you ? "true" : undefined}
            >
              <span className="w-8 font-mono text-sm text-muted-foreground tabular-nums">
                {row.rank}
              </span>
              <span className="flex-1 truncate text-sm">
                {row.handle}
                {row.is_you ? <span className="ml-2 text-xs text-muted-foreground">(you)</span> : null}
              </span>
              {ZONE_LABEL[row.zone] ? (
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  {ZONE_LABEL[row.zone]}
                </span>
              ) : null}
              <span className="w-16 text-right font-mono text-sm tabular-nums">{row.xp} XP</span>
            </li>
          ))}
        </ol>
      </div>

      <p className="text-xs text-muted-foreground">
        XP comes from your daily sets (Progress) and updates hourly. Week resets Monday (
        {league.time_zone}). Promotion and demotion are bragging rights for now — no tiers yet.
      </p>

      <details className="space-y-3 border border-dashed border-border px-4 py-3">
        <summary className="cursor-pointer text-sm">League settings</summary>
        <div className="space-y-4 pt-3">
          {cohortField}
          <p className="text-xs text-muted-foreground">A new cohort applies from next week.</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" disabled={busy} onClick={() => void membership("POST")}>
              Save cohort
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => void membership("DELETE")}>
              Leave the league
            </Button>
            {notice ? <span className="text-xs text-muted-foreground">{notice}</span> : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Reminder and privacy options live in <Link href="/settings" className="underline underline-offset-2">Settings</Link>.
          </p>
        </div>
      </details>
    </div>
  )
}
