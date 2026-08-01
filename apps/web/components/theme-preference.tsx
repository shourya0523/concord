"use client"

import * as React from "react"
import { useTheme } from "next-themes"

/**
 * Visible theme control for Settings (§10.14). Product stays cream-paper /
 * black-chrome in both themes — "dark" deepens the chrome workspace only.
 * Hotkey `d` remains available via ThemeProvider.
 */
export function ThemePreference() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const active = mounted ? (theme ?? "system") : "system"
  const resolved = mounted ? (resolvedTheme ?? "light") : "light"

  return (
    <div className="space-y-3">
      <p className="max-w-xl text-sm text-muted-foreground">
        Cream paper and black ink stay readable in every theme. Dark only deepens the chrome
        workspace around the document. Press{" "}
        <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[11px]">
          d
        </kbd>{" "}
        anywhere (outside inputs) to flip light/dark.
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Theme preference">
        {(
          [
            { id: "light", label: "Light" },
            { id: "dark", label: "Dark chrome" },
            { id: "system", label: "System" },
          ] as const
        ).map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={active === option.id}
            onClick={() => setTheme(option.id)}
            className={
              active === option.id
                ? "rounded-full bg-ink px-3 py-1.5 text-sm text-paper"
                : "rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground"
            }
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
        Resolved · {resolved}
      </p>
    </div>
  )
}
