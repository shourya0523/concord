"use client"

/**
 * Shared cached /api/progress read for Mode B islands — one fetch per page
 * view even when several islands (catalog, roadmap, module peek) mount.
 */

export type ModuleProgressEntry = {
  module_id: string
  /** 0–1 fraction from the API. */
  percent: number
  completed_checkpoint_ids: string[]
}

type ProgressPayload = {
  module_progress?: ModuleProgressEntry[]
}

let progressPromise: Promise<ModuleProgressEntry[]> | null = null

export function fetchModuleProgress(): Promise<ModuleProgressEntry[]> {
  if (!progressPromise) {
    progressPromise = fetch("/api/progress")
      .then(async (response) => {
        if (!response.ok) return [] as ModuleProgressEntry[]
        const payload = (await response.json()) as ProgressPayload
        return payload.module_progress ?? []
      })
      .catch(() => [] as ModuleProgressEntry[])
  }
  return progressPromise
}

const PROGRESS_EVENT = "concord:module-progress"

/**
 * After a checkpoint write: swap the updated entry into the cache and tell
 * other mounted islands (e.g. the hero mastery chip) to re-read it.
 */
export async function publishModuleProgress(entry: ModuleProgressEntry): Promise<void> {
  const current = await fetchModuleProgress()
  progressPromise = Promise.resolve([
    ...current.filter((item) => item.module_id !== entry.module_id),
    entry,
  ])
  window.dispatchEvent(new Event(PROGRESS_EVENT))
}

export function onModuleProgressChange(listener: () => void): () => void {
  window.addEventListener(PROGRESS_EVENT, listener)
  return () => window.removeEventListener(PROGRESS_EVENT, listener)
}

/** Calm integer percent (0–100) for one module; 0 when untracked. */
export function moduleProgressPercent(
  entries: ModuleProgressEntry[],
  moduleId: string,
): number {
  const entry = entries.find((candidate) => candidate.module_id === moduleId)
  return entry ? Math.round(entry.percent * 100) : 0
}
