"use client"

import * as React from "react"
import { useTheme } from "next-themes"

/** Mockups are light-paper only — system/dark must not leak. */
export function MockupThemeLock() {
  const { theme, setTheme } = useTheme()
  const previous = React.useRef<string | undefined>(undefined)
  const locked = React.useRef(false)

  React.useEffect(() => {
    if (locked.current) return
    locked.current = true
    previous.current = theme
    setTheme("light")
    document.documentElement.classList.remove("dark")
    document.documentElement.classList.add("light")
    return () => {
      if (previous.current && previous.current !== "light") {
        setTheme(previous.current)
      }
    }
    // Intentionally once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setTheme])

  return null
}
