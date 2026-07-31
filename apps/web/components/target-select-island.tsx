"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { TargetCompanyMultiSelect } from "@ibpe/ui/components/target-company-multi-select"
import type { TargetCompany } from "@ibpe/ui/components/target-company-multi-select"

const STORAGE_KEY = "ibpe.targetFirms"

type FirmCatalogPayload = {
  items: Array<{ id: string; slug: string; name: string; track: string | null; signals: number }>
}

let catalogCache: TargetCompany[] | null = null
let catalogPromise: Promise<TargetCompany[]> | null = null

/** Firm options from the real catalog API (43 firms + occurrence volumes). */
export function fetchFirmOptions(): Promise<TargetCompany[]> {
  if (catalogCache) return Promise.resolve(catalogCache)
  if (!catalogPromise) {
    catalogPromise = fetch("/api/firms")
      .then(async (response) => {
        if (!response.ok) return [] as TargetCompany[]
        const payload = (await response.json()) as FirmCatalogPayload
        catalogCache = payload.items.map((firm) => ({
          id: firm.id,
          name: firm.name,
          track: firm.track ?? undefined,
        }))
        return catalogCache
      })
      .catch(() => [] as TargetCompany[])
  }
  return catalogPromise
}

export function readStoredTargets(): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as string[]
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : []
  } catch {
    return []
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

/**
 * Persisted multi-select over the real firm catalog. Suggested defaults are
 * the two highest-signal firms — an explicit suggestion, never a silent
 * "all firms" fallback (DESIGN.md guardrail 15).
 */
export function TargetSelectIsland({ value, onChange, className, syncSearchParam }: Props) {
  const router = useRouter()
  const [companies, setCompanies] = React.useState<TargetCompany[]>([])
  const [internal, setInternal] = React.useState<string[]>(value ?? [])

  React.useEffect(() => {
    let cancelled = false
    void fetchFirmOptions().then((options) => {
      if (!cancelled) setCompanies(options)
    })
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    if (value) {
      setInternal(value)
      return
    }
    const controller = new AbortController()
    fetch("/api/targets", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return null
        return (await response.json()) as { target_set?: { firm_ids?: string[] } }
      })
      .then((payload) => {
        const ids = payload?.target_set?.firm_ids
        const stored = readStoredTargets()
        const next = ids?.length ? ids : stored
        if (next.length > 0) {
          setInternal(next)
          writeStoredTargets(next)
          onChange?.(next)
          return
        }
        // Explicit suggestion: two highest-signal firms from the catalog.
        void fetchFirmOptions().then((options) => {
          const suggested = options.slice(0, 2).map((firm) => firm.id)
          if (suggested.length === 0) return
          setInternal(suggested)
          writeStoredTargets(suggested)
          onChange?.(suggested)
        })
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
      companies={companies}
      value={internal}
      onChange={handleChange}
      className={className}
      placeholder={
        companies.length === 0 ? "Loading firm catalog…" : "Select target firms"
      }
    />
  )
}
