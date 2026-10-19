import Link from "next/link"

import { AchievementShelfIsland } from "@/components/achievement-shelf-island"

export const metadata = {
  title: "Shelf · Concord",
  description: "Achievements as deal tombstones — earned and still to close",
}

export const dynamic = "force-dynamic"

export default function AchievementsPage() {
  return (
    <div className="space-y-8">
      <header>
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          <Link href="/progress" className="hover:underline">
            Progress
          </Link>{" "}
          / Shelf
        </p>
        <h1 className="mt-2 font-display text-4xl tracking-tight md:text-5xl">The shelf</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Banks mark a closed deal with a tombstone. Each milestone you close gets one here; the pencil outlines
          show what&apos;s next and how far you have to go.
        </p>
      </header>
      <AchievementShelfIsland />
    </div>
  )
}
