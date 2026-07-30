import Link from "next/link"

import { Button } from "@ibpe/ui/components/button"

export default function HomePage() {
  return (
    <main className="relative min-h-svh overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_10%_-10%,color-mix(in_oklch,var(--lime)_18%,transparent),transparent_50%),linear-gradient(160deg,var(--background),color-mix(in_oklch,var(--ink)_6%,var(--background)))]"
      />
      <div className="relative z-[1] mx-auto flex min-h-svh max-w-5xl flex-col justify-center px-6 py-16 md:py-24">
        <p className="mb-4 font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
          IBPE
        </p>
        <h1 className="font-display max-w-3xl text-5xl leading-[1.02] tracking-tight md:text-7xl">
          Editorial Finance Terminal
        </h1>
        <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-muted-foreground md:text-[17px]">
          Company prep with visible topic heat and grounded pseudo-RAG. Concept labs with diagrams
          and resources. Teaching answers from corpus — firm signals stay signals.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/onboarding">
            <Button size="lg">Start company prep</Button>
          </Link>
          <Link href="/concepts/leveraged-buyouts">
            <Button size="lg" variant="outline">
              Open concept lab
            </Button>
          </Link>
          <Link href="/dashboard">
            <Button size="lg" variant="ghost">
              Dashboard
            </Button>
          </Link>
        </div>
        <p className="mt-10 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          <Link href="/ds" className="underline-offset-4 hover:underline">
            Design system catalogue
          </Link>
          {" · "}
          <Link href="/sign-in" className="underline-offset-4 hover:underline">
            Neon Auth
          </Link>
        </p>
      </div>
    </main>
  )
}
