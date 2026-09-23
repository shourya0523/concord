"use client"

import * as React from "react"

import { cn } from "@ibpe/ui/lib/utils"

/**
 * Fill-in-the-blank finance diagram (plan P7.2).
 *
 * Renders an `interactive-json` diagram (InteractiveDiagramSchema in
 * @ibpe/contracts — mirrored structurally here so packages/ui stays
 * dependency-free) as an SVG flow with numbered blank slots, plus an
 * accessible form of native <select> controls, one per blank. "Check
 * answers" grades every blank, marks each correct / incorrect in both the
 * SVG and the form, and announces the score through a polite live region.
 *
 * No animation is used, so it is reduced-motion safe by construction; the
 * only transitions are colour changes guarded by `motion-safe:`.
 */

export type FillBlankDiagramBlank = {
  answer: string
  options: string[]
  explain?: string
}

export type FillBlankDiagramNode = {
  id: string
  label: string
  x: number
  y: number
  blank?: FillBlankDiagramBlank
}

export type FillBlankDiagramEdge = { from: string; to: string; label?: string }

export type FillBlankDiagram = {
  prompt: string
  nodes: FillBlankDiagramNode[]
  edges: FillBlankDiagramEdge[]
}

export type FillBlankResult = {
  correct: number
  total: number
  /** node id → answered correctly */
  results: Record<string, boolean>
}

export type DiagramFillBlankProps = {
  diagram: FillBlankDiagram
  title?: string
  /** Plain-language description of the finished diagram (screen readers). */
  a11yDescription?: string
  className?: string
  /** Called after every "Check answers". */
  onCheck?: (result: FillBlankResult) => void
}

const NODE_W = 196
const NODE_H = 46
const BLANK_NODE_H = 74
const PAD = 24

function normalise(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[−‒–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

/** Grade answers (node id → chosen option) against the diagram's blanks. */
export function gradeFillBlank(
  diagram: FillBlankDiagram,
  answers: Record<string, string | undefined>
): FillBlankResult {
  const results: Record<string, boolean> = {}
  let correct = 0
  let total = 0
  for (const node of diagram.nodes) {
    if (!node.blank) continue
    total += 1
    const given = answers[node.id]
    const ok = typeof given === "string" && normalise(given) === normalise(node.blank.answer)
    results[node.id] = ok
    if (ok) correct += 1
  }
  return { correct, total, results }
}

const LINE_H = 15

/**
 * Deterministic option order per blank (authors usually list the answer
 * first). Seeded by node id so server and client render the same order.
 */
export function orderedOptions(nodeId: string, options: string[]): string[] {
  const score = (option: string) => {
    let hash = 2166136261
    for (const char of `${nodeId}:${option}`) {
      hash ^= char.codePointAt(0)!
      hash = Math.imul(hash, 16777619)
    }
    return hash >>> 0
  }
  return [...options].sort((a, b) => score(a) - score(b) || a.localeCompare(b))
}

function nodeLines(node: FillBlankDiagramNode): string[] {
  return wrapLabel(node.label, node.blank ? 30 : 28)
}

function nodeHeight(node: FillBlankDiagramNode) {
  const extra = Math.max(0, nodeLines(node).length - 1) * LINE_H
  return (node.blank ? BLANK_NODE_H : NODE_H) + extra
}

/** Point where the segment from the node centre towards (tx, ty) leaves the box. */
function boxExit(node: FillBlankDiagramNode, tx: number, ty: number) {
  const dx = tx - node.x
  const dy = ty - node.y
  if (dx === 0 && dy === 0) return { x: node.x, y: node.y }
  const hw = NODE_W / 2
  const hh = nodeHeight(node) / 2
  const scale = Math.min(
    dx === 0 ? Number.POSITIVE_INFINITY : hw / Math.abs(dx),
    dy === 0 ? Number.POSITIVE_INFINITY : hh / Math.abs(dy)
  )
  return { x: node.x + dx * scale, y: node.y + dy * scale }
}

/** Greedy word wrap for SVG labels (SVG text does not wrap by itself). */
function wrapLabel(label: string, maxChars: number): string[] {
  const words = label.split(/\s+/)
  const lines: string[] = []
  let line = ""
  for (const word of words) {
    if (!line) line = word
    else if ((line + " " + word).length <= maxChars) line += " " + word
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines.slice(0, 3)
}

function DiagramFillBlank({
  diagram,
  title = "Diagram quiz",
  a11yDescription,
  className,
  onCheck,
}: DiagramFillBlankProps) {
  const reactId = React.useId()
  const baseId = `fill-blank-${reactId.replace(/:/g, "")}`
  const blanks = React.useMemo(
    () => diagram.nodes.filter((node) => node.blank),
    [diagram.nodes]
  )
  const blankNumber = React.useMemo(
    () => new Map(blanks.map((node, index) => [node.id, index + 1])),
    [blanks]
  )
  const nodesById = React.useMemo(
    () => new Map(diagram.nodes.map((node) => [node.id, node])),
    [diagram.nodes]
  )
  const [answers, setAnswers] = React.useState<Record<string, string>>({})
  const [result, setResult] = React.useState<FillBlankResult | null>(null)
  const selectRefs = React.useRef(new Map<string, HTMLSelectElement>())

  const xs = diagram.nodes.map((node) => node.x)
  const minX = Math.min(...xs) - NODE_W / 2 - PAD
  const maxX = Math.max(...xs) + NODE_W / 2 + PAD
  const halfHeights = diagram.nodes.map((node) => nodeHeight(node) / 2)
  const minY = Math.min(...diagram.nodes.map((node, i) => node.y - halfHeights[i]!)) - PAD
  const maxY = Math.max(...diagram.nodes.map((node, i) => node.y + halfHeights[i]!)) + PAD
  const width = maxX - minX
  const height = maxY - minY

  const answeredCount = blanks.filter((node) => answers[node.id]).length

  function choose(nodeId: string, value: string) {
    setAnswers((current) => ({ ...current, [nodeId]: value }))
    // A changed answer invalidates that blank's mark until re-checked.
    setResult((current) => {
      if (!current || !(nodeId in current.results)) return current
      const results = { ...current.results }
      delete results[nodeId]
      return { ...current, results }
    })
  }

  function check() {
    const graded = gradeFillBlank(diagram, answers)
    setResult(graded)
    onCheck?.(graded)
  }

  function reset() {
    setAnswers({})
    setResult(null)
    const first = blanks[0]
    if (first) selectRefs.current.get(first.id)?.focus()
  }

  function focusBlank(nodeId: string) {
    selectRefs.current.get(nodeId)?.focus()
  }

  const statusFor = (nodeId: string): "correct" | "incorrect" | null => {
    if (!result || !(nodeId in result.results)) return null
    return result.results[nodeId] ? "correct" : "incorrect"
  }

  const allCorrect = result !== null && result.total > 0 && result.correct === result.total

  return (
    <figure
      data-slot="diagram-fill-blank"
      className={cn(
        "bg-card border-border w-full overflow-hidden rounded-[16px] border",
        className
      )}
      aria-labelledby={`${baseId}-title`}
    >
      <figcaption className="border-border flex items-center justify-between gap-3 border-b px-3 py-2">
        <span
          id={`${baseId}-title`}
          className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase"
        >
          {title}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">
          fill in · {answeredCount}/{blanks.length}
        </span>
      </figcaption>

      <div className="space-y-4 p-4">
        <p id={`${baseId}-prompt`} className="text-sm leading-relaxed text-foreground">
          {diagram.prompt}
        </p>

        <div className="overflow-x-auto">
          <svg
            viewBox={`${minX} ${minY} ${width} ${height}`}
            className="mx-auto h-auto w-full min-w-[34rem] max-w-full"
            role="img"
            aria-labelledby={`${baseId}-title ${baseId}-svgdesc`}
          >
            <desc id={`${baseId}-svgdesc`}>
              {a11yDescription ??
                `${diagram.prompt} ${blanks.length} blanks, answered with the form below the diagram.`}
            </desc>
            <defs>
              <marker
                id={`${baseId}-arrow`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--ink)" />
              </marker>
            </defs>

            {diagram.edges.map((edge, index) => {
              const from = nodesById.get(edge.from)
              const to = nodesById.get(edge.to)
              if (!from || !to) return null
              const start = boxExit(from, to.x, to.y)
              const end = boxExit(to, from.x, from.y)
              const midX = (start.x + end.x) / 2
              const midY = (start.y + end.y) / 2
              return (
                <g key={`${edge.from}-${edge.to}-${index}`} aria-hidden="true">
                  <line
                    x1={start.x}
                    y1={start.y}
                    x2={end.x}
                    y2={end.y}
                    stroke="var(--ink)"
                    strokeWidth={1.4}
                    markerEnd={`url(#${baseId}-arrow)`}
                  />
                  {edge.label ? (
                    <g>
                      <rect
                        x={midX - edge.label.length * 3.4 - 6}
                        y={midY - 10}
                        width={edge.label.length * 6.8 + 12}
                        height={20}
                        rx={6}
                        fill="var(--background)"
                        stroke="var(--border)"
                      />
                      <text
                        x={midX}
                        y={midY + 4}
                        textAnchor="middle"
                        fontSize={11}
                        fontFamily="var(--font-mono), ui-monospace, monospace"
                        fill="var(--muted-foreground)"
                      >
                        {edge.label}
                      </text>
                    </g>
                  ) : null}
                </g>
              )
            })}

            {diagram.nodes.map((node) => {
              const h = nodeHeight(node)
              const status = statusFor(node.id)
              const number = blankNumber.get(node.id)
              const chosen = answers[node.id]
              const stroke =
                status === "correct"
                  ? "var(--success)"
                  : status === "incorrect"
                    ? "var(--error)"
                    : "var(--ink)"
              const lines = nodeLines(node)
              const labelTop = node.blank
                ? node.y - h / 2 + 18
                : node.y - ((lines.length - 1) * LINE_H) / 2 + 4
              return (
                <g
                  key={node.id}
                  aria-hidden="true"
                  onClick={node.blank ? () => focusBlank(node.id) : undefined}
                  className={node.blank ? "cursor-pointer" : undefined}
                >
                  <rect
                    x={node.x - NODE_W / 2}
                    y={node.y - h / 2}
                    width={NODE_W}
                    height={h}
                    rx={10}
                    fill="var(--card)"
                    stroke={stroke}
                    strokeWidth={status ? 2.2 : 1.4}
                  />
                  {lines.map((line, index) => (
                    <text
                      key={index}
                      x={node.x}
                      y={labelTop + index * LINE_H}
                      textAnchor="middle"
                      fontSize={12.5}
                      fill="var(--foreground)"
                      fontFamily="var(--font-sans), ui-sans-serif, system-ui, sans-serif"
                    >
                      {line}
                    </text>
                  ))}
                  {node.blank ? (
                    <g>
                      <rect
                        x={node.x - 62}
                        y={node.y + h / 2 - 30}
                        width={124}
                        height={22}
                        rx={6}
                        fill={
                          status === "correct"
                            ? "var(--success)"
                            : status === "incorrect"
                              ? "var(--error)"
                              : "var(--background)"
                        }
                        fillOpacity={status ? 0.16 : 1}
                        stroke={stroke}
                        strokeDasharray={chosen ? undefined : "4 3"}
                      />
                      <text
                        x={node.x}
                        y={node.y + h / 2 - 15}
                        textAnchor="middle"
                        fontSize={12}
                        fontFamily="var(--font-mono), ui-monospace, monospace"
                        fill="var(--foreground)"
                      >
                        {chosen
                          ? `${status === "correct" ? "✓ " : status === "incorrect" ? "✗ " : ""}${chosen}`
                          : `blank ${number}`}
                      </text>
                    </g>
                  ) : null}
                </g>
              )
            })}
          </svg>
        </div>

        <form
          className="space-y-3"
          aria-describedby={`${baseId}-prompt`}
          onSubmit={(event) => {
            event.preventDefault()
            check()
          }}
        >
          <ol className="grid gap-3 sm:grid-cols-2">
            {blanks.map((node) => {
              const number = blankNumber.get(node.id)!
              const status = statusFor(node.id)
              const selectId = `${baseId}-blank-${node.id}`
              const feedbackId = `${selectId}-feedback`
              return (
                <li
                  key={node.id}
                  className={cn(
                    "border-border rounded-[10px] border px-3 py-2 motion-safe:transition-colors",
                    status === "correct" && "border-[var(--success)]",
                    status === "incorrect" && "border-[var(--error)]"
                  )}
                >
                  <label
                    htmlFor={selectId}
                    className="block font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase"
                  >
                    Blank {number}
                  </label>
                  <span className="block text-sm text-foreground">{node.label}</span>
                  <select
                    id={selectId}
                    ref={(element) => {
                      if (element) selectRefs.current.set(node.id, element)
                      else selectRefs.current.delete(node.id)
                    }}
                    value={answers[node.id] ?? ""}
                    onChange={(event) => choose(node.id, event.target.value)}
                    aria-invalid={status === "incorrect" ? true : undefined}
                    aria-describedby={status ? feedbackId : undefined}
                    className="border-input bg-background focus-visible:ring-ring mt-1.5 w-full rounded-[8px] border px-2 py-1.5 font-mono text-sm focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <option value="">Choose…</option>
                    {orderedOptions(node.id, node.blank!.options).map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  {status ? (
                    <p
                      id={feedbackId}
                      className={cn(
                        "mt-1.5 text-xs leading-relaxed",
                        status === "correct"
                          ? "text-[var(--success-foreground)]"
                          : "text-[var(--error-foreground)]"
                      )}
                    >
                      <span className="font-medium">
                        {status === "correct"
                          ? "Correct."
                          : `Not quite — answer: ${node.blank!.answer}.`}
                      </span>{" "}
                      {node.blank!.explain ?? ""}
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ol>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="bg-primary text-primary-foreground focus-visible:ring-ring inline-flex h-8 items-center rounded-full px-4 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
              disabled={answeredCount === 0}
            >
              Check answers
            </button>
            <button
              type="button"
              onClick={reset}
              className="border-border focus-visible:ring-ring inline-flex h-8 items-center rounded-full border px-4 text-sm focus-visible:ring-2 focus-visible:outline-none"
            >
              Reset
            </button>
            <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
              {result
                ? allCorrect
                  ? `All ${result.total} blanks correct.`
                  : `${result.correct} of ${result.total} correct${
                      answeredCount < blanks.length
                        ? ` · ${blanks.length - answeredCount} unanswered`
                        : ""
                    }.`
                : null}
            </p>
          </div>
        </form>
      </div>
    </figure>
  )
}

export { DiagramFillBlank }
