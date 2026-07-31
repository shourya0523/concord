"use client"

import * as React from "react"
import { useTheme } from "next-themes"

/** Mockups are light-paper only — strip .dark even if system prefers dark. */
export function MockupThemeLock() {
  const { setTheme } = useTheme()

  React.useEffect(() => {
    setTheme("light")
    const root = document.documentElement
    const apply = () => {
      root.classList.remove("dark")
      root.classList.add("light")
      root.style.colorScheme = "light"
    }
    apply()
    const obs = new MutationObserver(() => {
      if (root.classList.contains("dark")) apply()
    })
    obs.observe(root, { attributes: true, attributeFilter: ["class"] })
    return () => obs.disconnect()
  }, [setTheme])

  return null
}
