import * as React from "react"
import { ArrowUpRight, Link2 } from "lucide-react"

import { cn } from "@ibpe/ui/lib/utils"

export type ResourceLink = {
  id: string
  label: string
  href: string
  kind?: "internal" | "external" | "diagram" | "reading"
  description?: string
}

export type ResourceLinkListProps = {
  resources: ResourceLink[]
  title?: string
  className?: string
}

function ResourceLinkList({
  resources,
  title = "Resources",
  className,
}: ResourceLinkListProps) {
  return (
    <nav
      data-slot="resource-link-list"
      aria-label={title}
      className={cn("w-full", className)}
    >
      <div className="mb-2 flex items-center gap-2 border-b border-border pb-2">
        <Link2 className="size-3.5 text-muted-foreground" aria-hidden />
        <h3 className="font-mono text-[11px] font-normal tracking-wide text-muted-foreground uppercase">
          {title}
        </h3>
      </div>
      <ul className="flex flex-col gap-0 divide-y divide-border/80">
        {resources.map((resource) => {
          const external = resource.kind === "external" || /^https?:/i.test(resource.href)
          return (
            <li key={resource.id}>
              <a
                href={resource.href}
                {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
                className="group flex items-start justify-between gap-3 py-2.5 text-sm transition-colors duration-[var(--duration-micro)] hover:text-foreground"
              >
                <span>
                  <span className="font-medium underline-offset-4 group-hover:underline">
                    {resource.label}
                  </span>
                  {resource.description ? (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {resource.description}
                    </span>
                  ) : null}
                  {resource.kind ? (
                    <span className="mt-1 inline-block font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                      {resource.kind}
                    </span>
                  ) : null}
                </span>
                <ArrowUpRight
                  className="mt-0.5 size-3.5 shrink-0 opacity-40 transition-opacity group-hover:opacity-100"
                  aria-hidden
                />
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

export { ResourceLinkList }
