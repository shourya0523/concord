/**
 * Minimal, safe markdown → AST for lesson bodies (P2.10).
 *
 * Supports the subset curriculum lessons use: ## / ### headings, paragraphs,
 * **bold**, *italic*, `code`, [links](https://…), - / 1. lists, pipe tables,
 * > block quotes and ``` fences. There is no raw HTML: the renderer maps the
 * AST to React elements, so nothing is ever injected with
 * dangerouslySetInnerHTML. Links are limited to http(s), mailto and
 * same-site paths.
 */

export type MarkdownInline =
  | { type: "text"; value: string }
  | { type: "strong"; children: MarkdownInline[] }
  | { type: "em"; children: MarkdownInline[] }
  | { type: "code"; value: string }
  | { type: "link"; href: string; children: MarkdownInline[] }

export type MarkdownBlock =
  | { type: "heading"; level: 2 | 3 | 4; children: MarkdownInline[] }
  | { type: "paragraph"; children: MarkdownInline[] }
  | { type: "list"; ordered: boolean; start: number; items: MarkdownInline[][] }
  | { type: "table"; header: MarkdownInline[][]; rows: MarkdownInline[][][] }
  | { type: "quote"; children: MarkdownInline[] }
  | { type: "code"; value: string }

const SAFE_HREF = /^(https?:\/\/|mailto:|\/(?!\/)|#)/i

/** True when a link target is safe to render as an anchor. */
export function isSafeHref(href: string): boolean {
  return SAFE_HREF.test(href.trim())
}

function pushText(out: MarkdownInline[], value: string) {
  if (!value) return
  const last = out[out.length - 1]
  if (last?.type === "text") last.value += value
  else out.push({ type: "text", value })
}

export function parseInline(source: string): MarkdownInline[] {
  const out: MarkdownInline[] = []
  let i = 0
  while (i < source.length) {
    const rest = source.slice(i)
    if (rest.startsWith("`")) {
      const end = source.indexOf("`", i + 1)
      if (end > i + 1) {
        out.push({ type: "code", value: source.slice(i + 1, end) })
        i = end + 1
        continue
      }
    }
    if (rest.startsWith("**")) {
      const end = source.indexOf("**", i + 2)
      if (end > i + 2) {
        out.push({ type: "strong", children: parseInline(source.slice(i + 2, end)) })
        i = end + 2
        continue
      }
    }
    if (rest.startsWith("*") && rest.length > 1 && !/\s/.test(rest[1]!)) {
      const end = source.indexOf("*", i + 1)
      if (end > i + 1 && !/\s/.test(source[end - 1]!)) {
        out.push({ type: "em", children: parseInline(source.slice(i + 1, end)) })
        i = end + 1
        continue
      }
    }
    if (rest.startsWith("[")) {
      const match = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest)
      if (match) {
        const [whole, label, href] = match
        if (isSafeHref(href!)) {
          out.push({ type: "link", href: href!.trim(), children: parseInline(label!) })
        } else {
          pushText(out, label!)
        }
        i += whole.length
        continue
      }
    }
    pushText(out, source[i]!)
    i += 1
  }
  return out
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "")
  return trimmed.split("|").map((cell) => cell.trim())
}

const TABLE_SEPARATOR = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/

export function parseMarkdown(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n")
  const blocks: MarkdownBlock[] = []
  let paragraph: string[] = []

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: "paragraph", children: parseInline(paragraph.join(" ")) })
      paragraph = []
    }
  }

  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    const trimmed = line.trim()

    if (!trimmed) {
      flushParagraph()
      i += 1
      continue
    }

    if (trimmed.startsWith("```")) {
      flushParagraph()
      const body: string[] = []
      i += 1
      while (i < lines.length && !lines[i]!.trim().startsWith("```")) {
        body.push(lines[i]!)
        i += 1
      }
      blocks.push({ type: "code", value: body.join("\n") })
      i += 1
      continue
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed)
    if (heading) {
      flushParagraph()
      const hashes = heading[1]!.length
      const level = (hashes <= 2 ? 2 : hashes === 3 ? 3 : 4) as 2 | 3 | 4
      blocks.push({ type: "heading", level, children: parseInline(heading[2]!.trim()) })
      i += 1
      continue
    }

    if (trimmed.startsWith("|") && i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1]!.trim())) {
      flushParagraph()
      const header = splitTableRow(trimmed).map(parseInline)
      const rows: MarkdownInline[][][] = []
      i += 2
      while (i < lines.length && lines[i]!.trim().startsWith("|")) {
        const cells = splitTableRow(lines[i]!).map(parseInline)
        while (cells.length < header.length) cells.push([])
        rows.push(cells.slice(0, header.length))
        i += 1
      }
      blocks.push({ type: "table", header, rows })
      continue
    }

    if (trimmed.startsWith(">")) {
      flushParagraph()
      const quoted: string[] = []
      while (i < lines.length && lines[i]!.trim().startsWith(">")) {
        quoted.push(lines[i]!.trim().replace(/^>\s?/, ""))
        i += 1
      }
      blocks.push({ type: "quote", children: parseInline(quoted.join(" ")) })
      continue
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(trimmed)
    const numbered = /^(\d+)[.)]\s+(.*)$/.exec(trimmed)
    if (bullet || numbered) {
      flushParagraph()
      const ordered = Boolean(numbered)
      const start = numbered ? Number(numbered[1]) : 1
      const items: string[] = []
      while (i < lines.length) {
        const current = lines[i]!
        const t = current.trim()
        const b = /^[-*+]\s+(.*)$/.exec(t)
        const n = /^(\d+)[.)]\s+(.*)$/.exec(t)
        if (ordered ? n : b) {
          items.push((ordered ? n![2] : b![1])!)
          i += 1
        } else if (t && /^\s{2,}/.test(current) && items.length > 0) {
          items[items.length - 1] += ` ${t}`
          i += 1
        } else {
          break
        }
      }
      blocks.push({ type: "list", ordered, start, items: items.map(parseInline) })
      continue
    }

    paragraph.push(trimmed)
    i += 1
  }
  flushParagraph()
  return blocks
}

/** Plain text of inline nodes (headings as anchors, a11y labels). */
export function inlineText(nodes: MarkdownInline[]): string {
  return nodes
    .map((node) =>
      node.type === "text" || node.type === "code" ? node.value : inlineText(node.children),
    )
    .join("")
}
