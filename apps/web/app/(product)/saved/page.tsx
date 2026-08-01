import { SavedIsland } from "@/components/saved-island"

export const metadata = {
  title: "Saved · Concord",
  description: "Bookmarks, notes, and collections",
}

export default function SavedPage() {
  return (
    <div className="space-y-8">
      <header>
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          Study / Saved
        </p>
        <h1 className="mt-2 font-display text-4xl tracking-tight md:text-5xl">Saved</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Bookmarked questions, notes in your own wording, and collections — with provenance
          attached, never detached from the source.
        </p>
      </header>
      <SavedIsland />
    </div>
  )
}
