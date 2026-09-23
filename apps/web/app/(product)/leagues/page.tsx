import Link from "next/link"
import { notFound } from "next/navigation"

import { LeagueIsland } from "@/components/league-island"
import { isFlagOn } from "@/lib/flags"

export const metadata = {
  title: "Leagues · Concord",
  description: "Opt-in weekly XP league with anonymous handles",
}

export const dynamic = "force-dynamic"

export default function LeaguesPage() {
  if (!isFlagOn("leagues")) notFound()

  return (
    <div className="space-y-8">
      <header>
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          <Link href="/progress" className="hover:underline">
            Progress
          </Link>{" "}
          / Leagues
        </p>
        <h1 className="mt-2 font-display text-4xl tracking-tight md:text-5xl">Weekly league</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Opt-in and anonymous. XP from this week&apos;s daily sets decides the order; readiness
          for your target firms is still what matters most.
        </p>
      </header>
      <LeagueIsland />
    </div>
  )
}
