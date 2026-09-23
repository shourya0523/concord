"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@ibpe/ui/components/button"

import { SemanticPill } from "@/components/paper"
import {
  detectTimeZone,
  formatHour,
  timeZoneLabel,
  timeZoneOptions,
  urlBase64ToUint8Array,
} from "@/lib/notify/client"

/**
 * Reminders & notifications (plan P6.1, DESIGN §10.14). Timing and channel
 * prefs live on the prep profile and save through the parent's PUT
 * /api/profile (full object); "pause all" and push subscriptions have their
 * own endpoints because they carry side effects.
 */

export type NotificationProfileFields = {
  timezone: string | null
  reminder_hour: number | null
  notify_email: boolean
  notify_push: boolean
  weekly_recap: boolean
  league_opt_in: boolean
}

type PrefsPayload = {
  enabled: boolean
  leagues_enabled: boolean
  paused: boolean
  channels: {
    email: { available: boolean }
    push: {
      available: boolean
      vapid_public_key: string | null
      subscriptions: number
      unlocked: boolean
    }
  }
}

type PushState = "unsupported" | "denied" | "off" | "on" | "working"

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  )
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  const registration = await navigator.serviceWorker.getRegistration("/")
  return registration ? registration.pushManager.getSubscription() : null
}

function Toggle({
  id,
  checked,
  disabled,
  onChange,
  label,
  hint,
}: {
  id: string
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
  label: string
  hint?: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 size-4 accent-[var(--ink,currentColor)] disabled:opacity-50"
      />
      <div className="space-y-0.5">
        <label htmlFor={id} className="text-sm">
          {label}
        </label>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  )
}

export function NotificationSettings({
  profile,
  onSave,
}: {
  profile: NotificationProfileFields
  /** Merge into the saved profile and PUT it; resolves true on success. */
  onSave: (patch: Partial<NotificationProfileFields>) => Promise<boolean>
}) {
  const [prefs, setPrefs] = React.useState<PrefsPayload | null>(null)
  const [prefsError, setPrefsError] = React.useState(false)
  const detected = React.useMemo(() => detectTimeZone(), [])

  const [timezone, setTimezone] = React.useState(profile.timezone ?? detected ?? "UTC")
  const [reminderHour, setReminderHour] = React.useState<number | null>(profile.reminder_hour)
  const [notifyEmail, setNotifyEmail] = React.useState(profile.notify_email)
  const [weeklyRecap, setWeeklyRecap] = React.useState(profile.weekly_recap)
  const [leagueOptIn, setLeagueOptIn] = React.useState(profile.league_opt_in)
  const [pushState, setPushState] = React.useState<PushState>("off")
  const [saving, setSaving] = React.useState(false)
  const [savedTick, setSavedTick] = React.useState(false)
  const [notice, setNotice] = React.useState<string | null>(null)

  React.useEffect(() => {
    const controller = new AbortController()
    fetch("/api/notifications/prefs", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          setPrefsError(true)
          return
        }
        setPrefs((await response.json()) as PrefsPayload)
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        setPrefsError(true)
      })
    return () => controller.abort()
  }, [])

  React.useEffect(() => {
    let cancelled = false
    const resolve = async (): Promise<PushState> => {
      if (!pushSupported()) return "unsupported"
      if (Notification.permission === "denied") return "denied"
      const subscription = await currentSubscription().catch(() => null)
      return subscription && profile.notify_push ? "on" : "off"
    }
    void resolve().then((state) => {
      if (!cancelled) setPushState(state)
    })
    return () => {
      cancelled = true
    }
  }, [profile.notify_push])

  const dirty =
    timezone !== profile.timezone ||
    reminderHour !== profile.reminder_hour ||
    notifyEmail !== profile.notify_email ||
    weeklyRecap !== profile.weekly_recap ||
    leagueOptIn !== profile.league_opt_in

  function flashSaved() {
    setSavedTick(true)
    window.setTimeout(() => setSavedTick(false), 2000)
  }

  async function save() {
    if (saving) return
    setSaving(true)
    setNotice(null)
    const ok = await onSave({
      timezone,
      reminder_hour: reminderHour,
      notify_email: notifyEmail,
      weekly_recap: weeklyRecap,
      league_opt_in: leagueOptIn,
    })
    setSaving(false)
    if (ok) flashSaved()
    else setNotice("Reminder settings could not be saved.")
  }

  async function setPaused(paused: boolean) {
    setNotice(null)
    try {
      const response = await fetch("/api/notifications/prefs", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paused }),
      })
      if (!response.ok) {
        setNotice(`Could not ${paused ? "pause" : "resume"} reminders (HTTP ${response.status}).`)
        return
      }
      setPrefs((await response.json()) as PrefsPayload)
      flashSaved()
    } catch {
      setNotice("Network error — reminders unchanged.")
    }
  }

  async function enablePush() {
    const key = prefs?.channels.push.vapid_public_key
    if (!key) return
    setPushState("working")
    setNotice(null)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== "granted") {
        setPushState(permission === "denied" ? "denied" : "off")
        return
      }
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" })
      await navigator.serviceWorker.ready
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        }))
      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      })
      if (!response.ok) {
        await subscription.unsubscribe().catch(() => undefined)
        setPushState("off")
        setNotice(
          response.status === 409
            ? "This browser is linked to another account's reminders."
            : `Push could not be enabled (HTTP ${response.status}).`,
        )
        return
      }
      const ok = await onSave({ notify_push: true })
      setPushState(ok ? "on" : "off")
      if (ok) flashSaved()
    } catch (error) {
      setPushState("off")
      setNotice(error instanceof Error ? `Push could not be enabled: ${error.message}` : "Push could not be enabled.")
    }
  }

  async function disablePush() {
    setPushState("working")
    setNotice(null)
    try {
      const subscription = await currentSubscription()
      if (subscription) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        }).catch(() => undefined)
        await subscription.unsubscribe().catch(() => undefined)
      }
      const ok = await onSave({ notify_push: false })
      setPushState(ok ? "off" : "on")
      if (ok) flashSaved()
    } catch {
      setPushState("on")
      setNotice("Push could not be turned off.")
    }
  }

  if (prefs && !prefs.enabled) {
    return (
      <p className="text-sm text-muted-foreground">
        Reminders are not switched on for this deployment yet.
      </p>
    )
  }

  const paused = prefs?.paused ?? false
  const push = prefs?.channels.push
  const zones = timeZoneOptions(timezone, detected, profile.timezone)

  let pushHint: React.ReactNode = "A short nudge on this device at your reminder time."
  let pushDisabled = paused
  if (pushState === "unsupported") {
    pushHint = "This browser doesn't support web push. On iPhone, add Concord to your Home Screen first."
    pushDisabled = true
  } else if (pushState === "denied") {
    pushHint = "Notifications are blocked for this site in your browser settings."
    pushDisabled = true
  } else if (push && !push.available) {
    pushHint = "Push delivery isn't configured on this deployment yet."
    pushDisabled = true
  } else if (push && !push.unlocked && pushState !== "on") {
    pushHint = "Unlocks after your first completed daily set."
    pushDisabled = true
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border border-dashed border-border px-3 py-2">
        <div>
          <p className="text-sm">{paused ? "All reminders are paused" : "Reminders are on"}</p>
          <p className="text-xs text-muted-foreground">
            {paused
              ? "Nothing will be sent until you resume. Your settings are kept."
              : "At most two a day, never after you've met your daily goal."}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!prefs}
          onClick={() => void setPaused(!paused)}
        >
          {paused ? "Resume all" : "Pause all"}
        </Button>
      </div>

      <div className={paused ? "space-y-5 opacity-60" : "space-y-5"}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm">
            <span className="text-muted-foreground">Daily reminder</span>
            <select
              value={reminderHour === null ? "off" : String(reminderHour)}
              onChange={(event) =>
                setReminderHour(event.target.value === "off" ? null : Number(event.target.value))
              }
              className="w-full border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground"
            >
              <option value="off">Off</option>
              {HOURS.map((hour) => (
                <option key={hour} value={hour}>
                  {formatHour(hour)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="text-muted-foreground">Timezone</span>
            <select
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              className="w-full border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground"
            >
              {zones.map((zone) => (
                <option key={zone} value={zone}>
                  {timeZoneLabel(zone)}
                  {zone === detected ? " — detected" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
        {profile.timezone === null && detected ? (
          <p className="text-xs text-muted-foreground">
            Detected {timeZoneLabel(detected)} from this browser — save to use it for reminders and
            streak days.
          </p>
        ) : null}

        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm text-muted-foreground">Channels</legend>
          <Toggle
            id="notify-email"
            checked={notifyEmail}
            onChange={setNotifyEmail}
            label="Email"
            hint={
              prefs && !prefs.channels.email.available
                ? "Email delivery isn't configured on this deployment yet — your choice is saved."
                : "Daily reminder and streak-at-risk nudges. One-click unsubscribe in every email."
            }
          />
          <div className="flex flex-wrap items-center gap-3">
            <Toggle
              id="notify-push"
              checked={pushState === "on"}
              disabled={pushDisabled || pushState === "working" || !prefs}
              onChange={(next) => void (next ? enablePush() : disablePush())}
              label={pushState === "working" ? "Push (working…)" : "Push on this device"}
              hint={pushHint}
            />
          </div>
          <Toggle
            id="weekly-recap"
            checked={weeklyRecap}
            onChange={setWeeklyRecap}
            label="Weekly recap (Sunday evening, email)"
            hint="Readiness change per target firm, weakest topic, streak and a suggested mock."
          />
        </fieldset>

        {prefs?.leagues_enabled ? (
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm text-muted-foreground">Leagues</legend>
            <Toggle
              id="league-opt-in"
              checked={leagueOptIn}
              onChange={setLeagueOptIn}
              label="Join the weekly XP league"
              hint={
                <>
                  You appear only as an anonymous handle — never your name or email.{" "}
                  <Link href="/leagues" className="underline underline-offset-2">
                    See standings
                  </Link>
                </>
              }
            />
          </fieldset>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={saving || !dirty} onClick={() => void save()}>
          {saving ? "Saving…" : "Save reminders"}
        </Button>
        {savedTick ? <SemanticPill tone="success">Saved</SemanticPill> : null}
        {notice ? (
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {notice}
          </span>
        ) : null}
        {prefsError ? (
          <span className="text-xs text-muted-foreground">
            Delivery status unavailable — settings still save.
          </span>
        ) : null}
      </div>
    </div>
  )
}
