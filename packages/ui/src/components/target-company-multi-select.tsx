"use client"

import * as React from "react"
import { Check, ChevronsUpDown, X } from "lucide-react"

import { Button } from "@ibpe/ui/components/button"
import { cn } from "@ibpe/ui/lib/utils"

export type TargetCompany = {
  id: string
  name: string
  track?: "IB" | "PE" | "Banking" | string
}

export type TargetCompanyMultiSelectProps = {
  companies: TargetCompany[]
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  className?: string
}

/**
 * Multi-select for company prep targets. Stub popover list — Wave 2 may swap to Command.
 */
function TargetCompanyMultiSelect({
  companies,
  value,
  onChange,
  placeholder = "Select target firms",
  className,
}: TargetCompanyMultiSelectProps) {
  const [open, setOpen] = React.useState(false)
  const selected = companies.filter((c) => value.includes(c.id))

  function toggle(id: string) {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id))
    } else {
      onChange([...value, id])
    }
  }

  return (
    <div data-slot="target-company-multi-select" className={cn("relative w-full max-w-md", className)}>
      <Button
        type="button"
        variant="outline"
        className="h-auto min-h-9 w-full justify-between gap-2 px-2.5 py-1.5 font-normal"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex flex-wrap gap-1.5">
          {selected.length === 0 ? (
            <span className="text-muted-foreground">{placeholder}</span>
          ) : (
            selected.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs"
              >
                {c.name}
                <button
                  type="button"
                  className="rounded-full p-0.5 hover:bg-background"
                  aria-label={`Remove ${c.name}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggle(c.id)
                  }}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))
          )}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
      </Button>

      {open ? (
        <ul
          role="listbox"
          aria-multiselectable
          className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-[12px] border border-border bg-popover p-1 shadow-md"
        >
          {companies.map((company) => {
            const active = value.includes(company.id)
            return (
              <li key={company.id} role="option" aria-selected={active}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-sm transition-colors duration-[var(--duration-micro)]",
                    active ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                  )}
                  onClick={() => toggle(company.id)}
                >
                  <Check
                    className={cn("size-4", active ? "opacity-100" : "opacity-0")}
                    aria-hidden
                  />
                  <span className="flex-1">{company.name}</span>
                  {company.track ? (
                    <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                      {company.track}
                    </span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

export { TargetCompanyMultiSelect }
