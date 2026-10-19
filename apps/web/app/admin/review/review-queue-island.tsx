"use client"

import * as React from "react"

import { Button } from "@ibpe/ui/components/button"
import { cn } from "@ibpe/ui/lib/utils"

import { diffLines } from "@/lib/admin/proposals"
import type { ProposalItem, ProposalListResponse } from "@/lib/api/admin-schemas"

const STATUSES = ["pending", "applied", "rejected", "approved", "all"] as const
const KINDS = ["", "rubric", "question", "answer", "diagram", "lesson", "occurrence"] as const
const PAGE = 20

function pretty(value: unknown): string {
  if (value === undefined) return ""
  if (typeof value === "string") return value
  return JSON.stringify(value, null, 2)
}

function preview(value: unknown, max = 160): string {
  const text = typeof value === "string" ? value : JSON.stringify(value)
  if (text === undefined) return "—"
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function TextDiff({ before, after }: { before: string; after: string }) {
  const lines = diffLines(before, after)
  return (
    <pre className="max-h-80 overflow-auto rounded-[8px] border border-border bg-background p-2 font-mono text-[11px] leading-relaxed">
      {lines.map((line, index) => (
        <div
          key={index}
          className={cn(
            "whitespace-pre-wrap",
            line.op === "add" && "bg-[color-mix(in_oklab,var(--success)_18%,transparent)]",
            line.op === "del" &&
              "bg-[color-mix(in_oklab,var(--error)_18%,transparent)] line-through decoration-1",
          )}
        >
          <span aria-hidden className="mr-2 select-none text-muted-foreground">
            {line.op === "add" ? "+" : line.op === "del" ? "−" : " "}
          </span>
          <span className="sr-only">
            {line.op === "add" ? "added: " : line.op === "del" ? "removed: " : ""}
          </span>
          {line.text || " "}
        </div>
      ))}
    </pre>
  )
}

function ProposalDiff({ item }: { item: ProposalItem }) {
  const current = item.current_json
  const proposal = item.proposal_json
  const currentText =
    typeof current === "string"
      ? current
      : current && typeof current === "object" && "body" in current && typeof proposal === "string"
        ? String((current as { body: unknown }).body)
        : null
  if (typeof proposal === "string" && (currentText !== null || current === null)) {
    return <TextDiff before={currentText ?? ""} after={proposal} />
  }
  if (item.diff.length === 0) {
    return <p className="text-xs text-muted-foreground">No difference from the current value.</p>
  }
  return (
    <div className="max-h-80 overflow-auto">
      <table className="w-full border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-ink">
            <th scope="col" className="px-2 py-1 font-mono font-normal text-muted-foreground">path</th>
            <th scope="col" className="px-2 py-1 font-mono font-normal text-muted-foreground">current</th>
            <th scope="col" className="px-2 py-1 font-mono font-normal text-muted-foreground">proposed</th>
          </tr>
        </thead>
        <tbody>
          {item.diff.map((entry) => (
            <tr key={entry.path} className="border-b border-border align-top">
              <td className="px-2 py-1 font-mono">
                {entry.path}
                <span className="ml-1 text-muted-foreground">({entry.change})</span>
              </td>
              <td className="px-2 py-1 text-[color:var(--error-foreground)]">
                {entry.change === "added" ? "—" : preview(entry.before)}
              </td>
              <td className="px-2 py-1 text-[color:var(--success-foreground)]">
                {entry.change === "removed" ? "—" : preview(entry.after)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ProposalCard({
  item,
  onDecided,
}: {
  item: ProposalItem
  onDecided: (item: ProposalItem, message: string) => void
}) {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(() => pretty(item.proposal_json))
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const pending = item.status === "pending"
  const noteId = `note-${item.id}`
  const draftId = `draft-${item.id}`

  function parsedDraft(): { ok: true; value: unknown } | { ok: false } {
    if (typeof item.proposal_json === "string") return { ok: true, value: draft }
    try {
      return { ok: true, value: JSON.parse(draft) }
    } catch {
      setError("Edited proposal is not valid JSON.")
      return { ok: false }
    }
  }

  async function send(action: "approve" | "reject" | "edit") {
    setError(null)
    let proposal: unknown
    if (action === "edit" || (action === "approve" && editing)) {
      const parsed = parsedDraft()
      if (!parsed.ok) return
      proposal = parsed.value
    }
    setBusy(action)
    try {
      const response = await fetch("/api/admin/proposals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          id: item.id,
          ...(proposal !== undefined ? { proposal_json: proposal } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      })
      const payload = (await response.json()) as
        | { item: ProposalItem; message: string }
        | { error: { message: string } }
      if (!response.ok || "error" in payload) {
        setError("error" in payload ? payload.error.message : `Request failed (${response.status})`)
        return
      }
      setEditing(false)
      onDecided(payload.item, payload.message)
    } catch {
      setError("Request failed — check the connection and try again.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <li className="space-y-3 rounded-[12px] border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            {item.target_kind} · {item.field}
            {item.confidence !== null ? ` · confidence ${item.confidence.toFixed(2)}` : ""}
            {item.auto_approved ? " · auto" : ""}
          </p>
          <h3 className="mt-1 font-mono text-sm break-all">{item.target_id}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {item.model ?? "no model"} · {item.prompt_version ?? "no prompt version"} ·{" "}
            {item.created_at ? new Date(item.created_at).toLocaleString() : ""}
            {item.review_task ? ` · task ${item.review_task.status}` : ""}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase",
            item.status === "pending" && "border-ink",
            item.status === "applied" && "border-[var(--success)] text-[var(--success-foreground)]",
            item.status === "rejected" && "border-[var(--error)] text-[var(--error-foreground)]",
          )}
        >
          {item.status}
        </span>
      </div>

      <div className="space-y-1">
        <p className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
          Diff · current ({item.current_source}) → proposed
        </p>
        <ProposalDiff item={item} />
      </div>

      {item.plan_error ? (
        <p className="text-xs text-[color:var(--error-foreground)]" role="note">
          Cannot apply as-is: {item.plan_error}. Edit the proposal or reject it.
        </p>
      ) : null}
      {item.review_note ? (
        <p className="text-xs text-muted-foreground">
          Note{item.reviewer ? ` (${item.reviewer})` : ""}: {item.review_note}
        </p>
      ) : null}

      {pending ? (
        <div className="space-y-2">
          {editing ? (
            <div className="space-y-1">
              <label
                htmlFor={draftId}
                className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase"
              >
                Edit proposal {typeof item.proposal_json === "string" ? "(text)" : "(JSON)"}
              </label>
              <textarea
                id={draftId}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={Math.min(18, Math.max(6, draft.split("\n").length))}
                className="w-full rounded-[8px] border border-input bg-background p-2 font-mono text-xs"
                spellCheck={false}
              />
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={noteId} className="sr-only">
              Review note
            </label>
            <input
              id={noteId}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Review note (optional)"
              className="h-8 min-w-[12rem] flex-1 rounded-[8px] border border-input bg-background px-2 text-sm"
            />
            <Button size="sm" disabled={busy !== null} onClick={() => void send("approve")}>
              {busy === "approve" ? "Applying…" : editing ? "Approve edit" : "Approve"}
            </Button>
            {editing ? (
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void send("edit")}>
                {busy === "edit" ? "Saving…" : "Save edit"}
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void send("reject")}>
              {busy === "reject" ? "Rejecting…" : "Reject"}
            </Button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p className="text-xs text-[color:var(--error-foreground)]" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  )
}

/** Client review queue: filters, paginated proposals, approve / edit / reject. */
export function ReviewQueueIsland() {
  const [status, setStatus] = React.useState<(typeof STATUSES)[number]>("pending")
  const [kind, setKind] = React.useState<(typeof KINDS)[number]>("")
  const [query, setQuery] = React.useState("")
  const [submittedQuery, setSubmittedQuery] = React.useState("")
  const [minConfidence, setMinConfidence] = React.useState("")
  const [offset, setOffset] = React.useState(0)
  const [data, setData] = React.useState<ProposalListResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [flash, setFlash] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams({ status, limit: String(PAGE), offset: String(offset) })
    if (kind) params.set("target_kind", kind)
    if (submittedQuery) params.set("q", submittedQuery)
    if (minConfidence) params.set("min_confidence", minConfidence)
    setLoading(true)
    setError(null)
    fetch(`/api/admin/proposals?${params.toString()}`)
      .then(async (response) => {
        const payload = (await response.json()) as ProposalListResponse | { error: { message: string } }
        if (cancelled) return
        if (!response.ok || "error" in payload) {
          setError("error" in payload ? payload.error.message : `Request failed (${response.status})`)
          setData(null)
        } else {
          setData(payload)
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load proposals.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [status, kind, submittedQuery, minConfidence, offset])

  function onDecided(updated: ProposalItem, message: string) {
    setFlash(`${message} · ${updated.target_kind} ${updated.target_id}`)
    setData((current) => {
      if (!current) return current
      const stillVisible = status === "all" || updated.status === status
      const items = stillVisible
        ? current.items.map((item) => (item.id === updated.id ? updated : item))
        : current.items.filter((item) => item.id !== updated.id)
      const counts = { ...current.counts }
      const before = current.items.find((item) => item.id === updated.id)?.status
      if (before && before !== updated.status) {
        counts[before] = Math.max(0, (counts[before] ?? 1) - 1)
        counts[updated.status] = (counts[updated.status] ?? 0) + 1
      }
      return { ...current, items, counts, total: stillVisible ? current.total : Math.max(0, current.total - 1) }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 border-b border-border pb-4">
        <div role="tablist" aria-label="Status" className="flex flex-wrap gap-1">
          {STATUSES.map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={status === value}
              onClick={() => {
                setStatus(value)
                setOffset(0)
              }}
              className={cn(
                "rounded-full border px-3 py-1 font-mono text-[11px] tracking-[0.1em] uppercase",
                status === value ? "border-ink bg-ink text-paper" : "border-border",
              )}
            >
              {value}
              {value !== "all" && data?.counts[value] !== undefined ? ` · ${data.counts[value]}` : ""}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Kind
          <select
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as (typeof KINDS)[number])
              setOffset(0)
            }}
            className="h-8 rounded-[8px] border border-input bg-background px-2 text-sm text-foreground"
          >
            {KINDS.map((value) => (
              <option key={value} value={value}>
                {value || "all kinds"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Min confidence
          <select
            value={minConfidence}
            onChange={(event) => {
              setMinConfidence(event.target.value)
              setOffset(0)
            }}
            className="h-8 rounded-[8px] border border-input bg-background px-2 text-sm text-foreground"
          >
            <option value="">any</option>
            <option value="0.5">≥ 0.5</option>
            <option value="0.7">≥ 0.7</option>
            <option value="0.9">≥ 0.9</option>
          </select>
        </label>
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            setSubmittedQuery(query.trim())
            setOffset(0)
          }}
        >
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Search target / field / text
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-8 w-56 rounded-[8px] border border-input bg-background px-2 text-sm text-foreground"
            />
          </label>
          <Button size="sm" variant="outline" type="submit">
            Search
          </Button>
        </form>
      </div>

      <p role="status" aria-live="polite" className="min-h-5 text-sm text-muted-foreground">
        {flash ?? (loading ? "Loading proposals…" : data ? `${data.total} proposal${data.total === 1 ? "" : "s"}` : "")}
      </p>
      {error ? (
        <p role="alert" className="text-sm text-[color:var(--error-foreground)]">
          {error}
        </p>
      ) : null}
      {data?.note ? <p className="text-sm text-muted-foreground">{data.note}</p> : null}

      {data && data.items.length === 0 && !loading ? (
        <p className="rounded-[12px] border border-dashed border-border p-6 text-sm text-muted-foreground">
          Nothing in this view. The queue is clear.
        </p>
      ) : null}

      <ul className="space-y-4">
        {data?.items.map((item) => (
          <ProposalCard key={`${item.id}-${item.status}`} item={item} onDecided={onDecided} />
        ))}
      </ul>

      {data && data.total > PAGE ? (
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE))}
          >
            Previous
          </Button>
          <span className="font-mono text-xs text-muted-foreground">
            {offset + 1}–{Math.min(offset + PAGE, data.total)} of {data.total}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={offset + PAGE >= data.total}
            onClick={() => setOffset(offset + PAGE)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  )
}
