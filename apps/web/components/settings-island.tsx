"use client"

import * as React from "react"

import { Button } from "@ibpe/ui/components/button"
import { Input } from "@ibpe/ui/components/input"
import { Label } from "@ibpe/ui/components/label"

import {
  NotificationSettings,
  type NotificationProfileFields,
} from "@/components/notification-settings"
import { SemanticPill, Warren } from "@/components/paper"

/**
 * Prep profile form (Settings, §10.14) — utilitarian. Prefills from
 * GET /api/profile, saves through PUT /api/profile, and only shows the
 * "Saved" confirmation after the PUT succeeds (state-confirmed reactions).
 *
 * PUT /api/profile replaces the whole profile object, so every save sends the
 * last saved profile (including fields this form does not edit, e.g. the
 * reminder prefs below and anything newer than this component) merged with
 * the edited fields.
 */

type Track = "IB" | "PE" | "Both"

type Profile = NotificationProfileFields & {
  modes: Array<"company_prep" | "concept_learn">
  track: Track | null
  role: string | null
  interview_date: string | null
  availability_minutes: number | null
  focus_prompt: string | null
  updated_at?: string | null
  [key: string]: unknown
}

type ProfilePayload = {
  profile: Profile
  source: string
  note?: string
}

type Phase = "loading" | "ready" | "unauthenticated" | "error"

export function SettingsProfileIsland() {
  const [phase, setPhase] = React.useState<Phase>("loading")
  const [saved, setSaved] = React.useState<Profile | null>(null)
  const [modes, setModes] = React.useState<Array<"company_prep" | "concept_learn">>([])
  const [track, setTrack] = React.useState<Track>("IB")
  const [role, setRole] = React.useState("")
  const [interviewDate, setInterviewDate] = React.useState("")
  const [availability, setAvailability] = React.useState("")
  const [focusPrompt, setFocusPrompt] = React.useState("")
  const [typing, setTyping] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [savedTick, setSavedTick] = React.useState(false)
  const [notice, setNotice] = React.useState<string | null>(null)

  React.useEffect(() => {
    const controller = new AbortController()
    fetch("/api/profile", { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) {
          setPhase("unauthenticated")
          return
        }
        if (!response.ok) {
          setPhase("error")
          return
        }
        const payload = (await response.json()) as ProfilePayload
        setSaved(payload.profile)
        setModes(payload.profile.modes)
        setTrack(payload.profile.track ?? "IB")
        setRole(payload.profile.role ?? "")
        setInterviewDate(payload.profile.interview_date ?? "")
        setAvailability(
          payload.profile.availability_minutes === null
            ? ""
            : String(payload.profile.availability_minutes),
        )
        setFocusPrompt(payload.profile.focus_prompt ?? "")
        setPhase("ready")
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        setPhase("error")
      })
    return () => controller.abort()
  }, [])

  /** PUT the full profile: last saved state + `patch`. Returns the saved profile. */
  const putProfile = React.useCallback(
    async (patch: Partial<Profile>): Promise<Profile | "unauthenticated" | string> => {
      const base: Record<string, unknown> = { ...(saved ?? {}) }
      delete base.updated_at
      try {
        const response = await fetch("/api/profile", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...base, ...patch }),
        })
        if (response.status === 401) return "unauthenticated"
        if (!response.ok) return `HTTP ${response.status}`
        const payload = (await response.json()) as ProfilePayload
        setSaved(payload.profile)
        return payload.profile
      } catch {
        return "the network request failed"
      }
    },
    [saved],
  )

  async function save() {
    if (saving) return
    setSaving(true)
    setNotice(null)
    const result = await putProfile({
      modes,
      track,
      role: role.trim() || null,
      interview_date: interviewDate || null,
      availability_minutes: Number.parseInt(availability, 10) || null,
      focus_prompt: focusPrompt.trim() || null,
    })
    setSaving(false)
    if (result === "unauthenticated") {
      setPhase("unauthenticated")
      return
    }
    if (typeof result === "string") {
      setNotice(`Profile could not be saved (${result}).`)
      return
    }
    setSavedTick(true)
    window.setTimeout(() => setSavedTick(false), 2000)
  }

  const saveNotificationPrefs = React.useCallback(
    async (patch: Partial<NotificationProfileFields>) => {
      const result = await putProfile(patch)
      if (result === "unauthenticated") setPhase("unauthenticated")
      return typeof result !== "string"
    },
    [putProfile],
  )

  if (phase === "loading") {
    return <p className="text-sm text-muted-foreground">Loading your saved profile…</p>
  }

  if (phase === "unauthenticated") {
    return (
      <p className="text-sm text-muted-foreground">
        Sign in to edit your prep profile — it saves to your account.
      </p>
    )
  }

  if (phase === "error") {
    return (
      <p role="alert" className="border border-dashed border-error px-3 py-2 text-sm">
        Your saved profile couldn&apos;t be read. Reload the page to try again.
      </p>
    )
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <span className="text-sm text-muted-foreground">Track</span>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Track">
          {(["IB", "PE", "Both"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={track === value}
              onClick={() => setTrack(value)}
              className={
                track === value
                  ? "rounded-full bg-ink px-3 py-1.5 text-sm text-paper"
                  : "rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground"
              }
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="settings-role">Role</Label>
          <Input
            id="settings-role"
            value={role}
            placeholder="Investment Banking Analyst"
            onChange={(event) => setRole(event.target.value)}
            onFocus={() => setTyping(true)}
            onBlur={() => setTyping(false)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="settings-availability">Daily minutes</Label>
          <Input
            id="settings-availability"
            type="number"
            min={10}
            max={480}
            value={availability}
            placeholder="45"
            onChange={(event) => setAvailability(event.target.value)}
            onFocus={() => setTyping(true)}
            onBlur={() => setTyping(false)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="settings-interview-date">Interview date</Label>
          <Input
            id="settings-interview-date"
            type="date"
            value={interviewDate}
            onChange={(event) => setInterviewDate(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="settings-focus">Focus prompt (optional)</Label>
          <Input
            id="settings-focus"
            value={focusPrompt}
            placeholder="Superday — accounting + paper LBO"
            onChange={(event) => setFocusPrompt(event.target.value)}
            onFocus={() => setTyping(true)}
            onBlur={() => setTyping(false)}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Warren mood="idle" userFocused={typing} size={40} />
        <Button disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save profile"}
        </Button>
        {savedTick ? <SemanticPill tone="success">Saved</SemanticPill> : null}
        {notice ? (
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {notice}
          </span>
        ) : null}
      </div>

      {saved ? (
        <div className="space-y-3 border-t border-dashed border-border pt-5">
          <h3 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            Reminders &amp; notifications
          </h3>
          <NotificationSettings profile={saved} onSave={saveNotificationPrefs} />
        </div>
      ) : null}
    </div>
  )
}
