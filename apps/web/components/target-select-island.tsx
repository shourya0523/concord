"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { TargetCompanyMultiSelect } from "@ibpe/ui/components/target-company-multi-select"

import { DEFAULT_TARGET_IDS, TARGET_COMPANIES } from "@/lib/mock-data"

const STORAGE_KEY = "ibpe.targetFirms"

export function readStoredTargets(): string[] {
  if (typeof window === "undefined") return DEFAULT_TARGET_IDS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_TARGET_IDS
    const parsed = JSON.parse(raw) as string[]
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_TARGET_IDS
  } catch {
    return DEFAULT_TARGET_IDS
  }
}

export function writeStoredTargets(ids: string[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
}

type Props = {
  value?: string[]
  onChange?: (next: string[]) => void
  className?: string
  /** When set, syncs selection into the URL search param `firms` */
  syncSearchParam?: boolean
}

export function TargetSelectIsland({ value, onChange, className, syncSearchParam }: Props) {
  const router = useRouter()
  const [internal, setInternal] = React.useState<string[]>(value ?? DEFAULT_TARGET_IDS)

  React.useEffect(() => {
    if (value) {
      setInternal(value)
      return
    }
    const controller = new AbortController()
    setInternal(readStoredTargets())
    fetch("/api/targets", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return null
        return (await response.json()) as { target_set?: { firm_ids?: string[] } }
      })
      .then((payload) => {
        const ids = payload?.target_set?.firm_ids
        if (!ids?.length) return
        setInternal(ids)
        writeStoredTargets(ids)
        onChange?.(ids)
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.warn("[targets] Could not load saved targets", error)
        }
      })
    return () => controller.abort()
  }, [value])

  function handleChange(next: string[]) {
    setInternal(next)
    writeStoredTargets(next)
    onChange?.(next)
    if (next.length > 0) {
      void fetch("/api/targets", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          firm_ids: next,
          primary_firm_id: next[0] ?? null,
        }),
      }).then((response) => {
        if (!response.ok && response.status !== 401) {
          console.warn(`[targets] Save failed with HTTP ${response.status}`)
        }
      })
    }
    if (syncSearchParam) {
      const params = new URLSearchParams(window.location.search)
      if (next.length) params.set("firms", next.join(","))
      else params.delete("firms")
      router.replace(`?${params.toString()}`, { scroll: false })
    }
  }

  return (
    <TargetCompanyMultiSelect
      companies={TARGET_COMPANIES}
      value={internal}
      onChange={handleChange}
      className={className}
      placeholder="Select target firms"
    />
  )
}
