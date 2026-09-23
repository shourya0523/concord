/**
 * Reminder content (plan P6.2 / P6.3) — pure renderers for email (HTML +
 * plain text) and push payloads. Paper-ish and minimal: one column, ink on
 * warm paper, a single CTA, footer with settings + one-click unsubscribe.
 */
import type { NotificationKind } from "./plan"

export type EmailContent = { subject: string; html: string; text: string }

export type PushContent = { title: string; body: string; url: string; tag: string }

export type EmailLinks = {
  appUrl: string
  /** Signed one-click unsubscribe URL; null only when no signing secret is set. */
  unsubscribeUrl: string | null
}

export type DailyReminderData = {
  streak: number
  cardsDue: number
  cardsDoneToday: number
  goal: number | null
}

export type StreakAtRiskData = {
  streak: number
  freezes: number
  cardsDoneToday: number
  goal: number | null
}

export type RecapFirm = {
  name: string
  /** 0–1. */
  readiness: number
  /** Change vs about a week ago in points of 0–1; null when no earlier snapshot. */
  delta: number | null
}

export type WeeklyRecapData = {
  streak: number
  xpWeek: number
  daysGoalMet: number
  firms: RecapFirm[]
  weakestTopic: { label: string; score: number } | null
  nextMock: { firmName: string } | null
}

const INK = "#1f1d1a"
const MUTED = "#6b665d"
const PAPER = "#f7f4ec"
const RULE = "#d9d3c5"

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function joinUrl(appUrl: string, path: string): string {
  return `${appUrl.replace(/\/+$/, "")}${path}`
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`
}

function signedPoints(delta: number): string {
  const points = Math.round(delta * 100)
  if (points === 0) return "±0"
  return points > 0 ? `+${points}` : `${points}`
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

type Layout = {
  preheader: string
  heading: string
  paragraphs: string[]
  /** Pre-escaped HTML block (tables etc.) inserted after the paragraphs. */
  extraHtml?: string
  extraText?: string
  cta: { label: string; path: string }
}

function layout(content: Layout, links: EmailLinks): { html: string; text: string } {
  const ctaUrl = joinUrl(links.appUrl, content.cta.path)
  const settingsUrl = joinUrl(links.appUrl, "/settings")
  const paragraphsHtml = content.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:${INK};">${escapeHtml(p)}</p>`,
    )
    .join("")
  const unsubscribeHtml = links.unsubscribeUrl
    ? ` · <a href="${escapeHtml(links.unsubscribeUrl)}" style="color:${MUTED};">Unsubscribe from emails</a>`
    : ""

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(content.heading)}</title></head>
<body style="margin:0;padding:0;background:${PAPER};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(content.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;border:1px solid ${RULE};background:#fffdf8;">
<tr><td style="padding:28px 28px 8px;font-family:Georgia,'Times New Roman',serif;">
<p style="margin:0 0 6px;font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${MUTED};">Concord</p>
<h1 style="margin:0 0 18px;font-size:26px;line-height:1.2;font-weight:normal;color:${INK};">${escapeHtml(content.heading)}</h1>
${paragraphsHtml}
${content.extraHtml ?? ""}
<p style="margin:22px 0 26px;"><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:${INK};color:${PAPER};text-decoration:none;padding:10px 18px;border-radius:999px;font-family:Helvetica,Arial,sans-serif;font-size:14px;">${escapeHtml(content.cta.label)}</a></p>
</td></tr>
<tr><td style="padding:14px 28px 22px;border-top:1px dashed ${RULE};font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:${MUTED};">
You get this because reminders are on in Concord. <a href="${escapeHtml(settingsUrl)}" style="color:${MUTED};">Reminder settings</a>${unsubscribeHtml}
</td></tr>
</table>
</td></tr>
</table>
</body></html>`

  const textLines = [
    content.heading,
    "",
    ...content.paragraphs.flatMap((p) => [p, ""]),
    ...(content.extraText ? [content.extraText, ""] : []),
    `${content.cta.label}: ${ctaUrl}`,
    "",
    "--",
    `Reminder settings: ${settingsUrl}`,
    ...(links.unsubscribeUrl ? [`Unsubscribe from emails: ${links.unsubscribeUrl}`] : []),
  ]
  return { html, text: textLines.join("\n") }
}

function goalLine(done: number, goal: number | null): string | null {
  if (!goal) return null
  if (done <= 0) return `Today's goal is ${plural(goal, "card")}.`
  const left = Math.max(0, goal - done)
  return `${done} of ${goal} cards done — ${plural(left, "card")} to go.`
}

export function renderDailyReminder(data: DailyReminderData, links: EmailLinks): EmailContent {
  const due = data.cardsDue
  const subject =
    due > 0 ? `${plural(due, "card")} due today` : "Your daily set is ready"
  const paragraphs = [
    due > 0
      ? `${plural(due, "review card")} ${due === 1 ? "is" : "are"} due — a short set keeps them from slipping.`
      : "A short set today keeps your recall warm before interviews.",
    goalLine(data.cardsDoneToday, data.goal),
    data.streak > 0
      ? `Current streak: ${plural(data.streak, "day")}.`
      : "Finish today's goal to start a streak.",
  ].filter((p): p is string => Boolean(p))
  const body = layout(
    {
      preheader: subject,
      heading: "Today's set is waiting",
      paragraphs,
      cta: { label: "Start today's set", path: "/today" },
    },
    links,
  )
  return { subject, ...body }
}

export function renderStreakAtRisk(data: StreakAtRiskData, links: EmailLinks): EmailContent {
  const subject = `Keep your ${data.streak}-day streak`
  const paragraphs = [
    `You're on a ${plural(data.streak, "day")} streak and today's goal isn't met yet.`,
    goalLine(data.cardsDoneToday, data.goal),
    data.freezes > 0
      ? `You have ${plural(data.freezes, "streak freeze")} banked, but a few cards now is better than spending one.`
      : "No freezes banked — a few cards before midnight keeps it alive.",
  ].filter((p): p is string => Boolean(p))
  const body = layout(
    {
      preheader: subject,
      heading: "Your streak is at risk",
      paragraphs,
      cta: { label: "Finish today's goal", path: "/today" },
    },
    links,
  )
  return { subject, ...body }
}

export function renderWeeklyRecap(data: WeeklyRecapData, links: EmailLinks): EmailContent {
  const lead = data.firms.find((firm) => firm.delta !== null)
  const subject =
    lead && lead.delta !== null
      ? `Your week: ${lead.name} readiness ${pct(lead.readiness)} (${signedPoints(lead.delta)})`
      : "Your week in Concord"

  const paragraphs = [
    `${plural(data.daysGoalMet, "day")} with the goal met, ${data.xpWeek} XP this week, streak ${plural(data.streak, "day")}.`,
    data.weakestTopic
      ? `Weakest topic: ${data.weakestTopic.label} (${pct(data.weakestTopic.score)} mastery) — it leads next week's reviews.`
      : null,
    data.nextMock
      ? `Suggested next: run the ${data.nextMock.firmName} mock in the simulator.`
      : "Suggested next: one full mock in the simulator.",
  ].filter((p): p is string => Boolean(p))

  let extraHtml = ""
  let extraText = ""
  if (data.firms.length > 0) {
    const rows = data.firms
      .map(
        (firm) =>
          `<tr><td style="padding:6px 0;border-bottom:1px solid ${RULE};font-size:14px;color:${INK};">${escapeHtml(firm.name)}</td>` +
          `<td align="right" style="padding:6px 0;border-bottom:1px solid ${RULE};font-size:14px;color:${INK};">${pct(firm.readiness)}</td>` +
          `<td align="right" style="padding:6px 0 6px 12px;border-bottom:1px solid ${RULE};font-size:13px;color:${MUTED};">${firm.delta === null ? "new" : escapeHtml(signedPoints(firm.delta))}</td></tr>`,
      )
      .join("")
    extraHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 8px;font-family:Helvetica,Arial,sans-serif;"><tr><th align="left" style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:${MUTED};font-weight:normal;padding-bottom:4px;">Target firm</th><th align="right" style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:${MUTED};font-weight:normal;">Readiness</th><th align="right" style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:${MUTED};font-weight:normal;">7d</th></tr>${rows}</table>`
    extraText = [
      "Readiness by target firm (7-day change):",
      ...data.firms.map(
        (firm) =>
          `- ${firm.name}: ${pct(firm.readiness)} (${firm.delta === null ? "new" : signedPoints(firm.delta)})`,
      ),
    ].join("\n")
  }

  const body = layout(
    {
      preheader: subject,
      heading: "Your week in review",
      paragraphs,
      extraHtml,
      extraText,
      cta: data.nextMock
        ? { label: "Book the mock", path: "/simulator" }
        : { label: "Open Progress", path: "/progress" },
    },
    links,
  )
  return { subject, ...body }
}

export function renderPush(
  kind: Exclude<NotificationKind, "weekly_recap">,
  data: { streak: number; cardsDue?: number; cardsDoneToday: number; goal: number | null },
): PushContent {
  if (kind === "streak_at_risk") {
    return {
      title: `Keep your ${data.streak}-day streak`,
      body:
        data.goal && data.cardsDoneToday > 0
          ? `${Math.max(0, data.goal - data.cardsDoneToday)} cards left today.`
          : "Today's goal isn't met yet — a few cards keeps it alive.",
      url: "/today",
      tag: "concord-streak",
    }
  }
  const due = data.cardsDue ?? 0
  return {
    title: due > 0 ? `${plural(due, "card")} due today` : "Your daily set is ready",
    body:
      data.streak > 0
        ? `Streak: ${plural(data.streak, "day")}. A short set keeps it going.`
        : "A short set keeps your recall warm.",
    url: "/today",
    tag: "concord-daily",
  }
}
