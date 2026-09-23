import * as React from "react"

import { cn } from "@ibpe/ui/lib/utils"

import {
  parseMarkdown,
  type MarkdownBlock,
  type MarkdownInline,
} from "@/lib/learn/markdown"

/**
 * Lesson body renderer (P2.10). Parses the safe markdown subset into an AST
 * and maps it to React elements — no raw HTML is ever injected.
 */
export function LessonMarkdown({
  markdown,
  className,
}: {
  markdown: string
  className?: string
}) {
  const blocks = parseMarkdown(markdown)
  return (
    <div className={cn("space-y-3 text-[15px] leading-relaxed text-foreground", className)}>
      {blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
  )
}

function Inline({ nodes }: { nodes: MarkdownInline[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        switch (node.type) {
          case "text":
            return <React.Fragment key={index}>{node.value}</React.Fragment>
          case "strong":
            return (
              <strong key={index} className="font-semibold">
                <Inline nodes={node.children} />
              </strong>
            )
          case "em":
            return (
              <em key={index}>
                <Inline nodes={node.children} />
              </em>
            )
          case "code":
            return (
              <code
                key={index}
                className="rounded-[4px] bg-secondary px-1 py-0.5 font-mono text-[0.85em]"
              >
                {node.value}
              </code>
            )
          case "link": {
            const external = /^https?:/i.test(node.href)
            return (
              <a
                key={index}
                href={node.href}
                className="underline underline-offset-4"
                {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
              >
                <Inline nodes={node.children} />
              </a>
            )
          }
        }
      })}
    </>
  )
}

function Block({ block }: { block: MarkdownBlock }) {
  switch (block.type) {
    case "heading":
      if (block.level === 2) {
        return (
          <h4 className="pt-3 font-display text-xl leading-tight tracking-tight">
            <Inline nodes={block.children} />
          </h4>
        )
      }
      return (
        <h5 className="pt-2 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          <Inline nodes={block.children} />
        </h5>
      )
    case "paragraph":
      return (
        <p>
          <Inline nodes={block.children} />
        </p>
      )
    case "quote":
      return (
        <blockquote className="border-l-2 border-ink bg-secondary/40 px-4 py-2 font-mono text-[13px] leading-relaxed">
          <Inline nodes={block.children} />
        </blockquote>
      )
    case "code":
      return (
        <pre className="overflow-x-auto rounded-[8px] bg-secondary px-3 py-2 font-mono text-xs">
          {block.value}
        </pre>
      )
    case "list": {
      const items = block.items.map((item, index) => (
        <li key={index} className="pl-1">
          <Inline nodes={item} />
        </li>
      ))
      return block.ordered ? (
        <ol start={block.start} className="list-decimal space-y-1.5 pl-6">
          {items}
        </ol>
      ) : (
        <ul className="list-disc space-y-1.5 pl-6">{items}</ul>
      )
    }
    case "table":
      return (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-ink">
                {block.header.map((cell, index) => (
                  <th
                    key={index}
                    scope="col"
                    className="px-2 py-1.5 font-mono text-[10px] font-normal tracking-[0.12em] text-muted-foreground uppercase"
                  >
                    <Inline nodes={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-border align-top">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="px-2 py-1.5">
                      <Inline nodes={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
  }
}
