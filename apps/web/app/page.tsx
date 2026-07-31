import Link from "next/link"

import { Button } from "@ibpe/ui/components/button"

export default function HomePage() {
  return (
    <main className="min-h-svh bg-[#111] px-4 py-6 text-[#111] md:px-10 md:py-10">
      <article className="mx-auto flex min-h-[calc(100svh-3rem)] max-w-5xl flex-col justify-between border border-black bg-[#f7f1e4] px-6 py-8 shadow-[6px_6px_0_0_rgba(255,255,255,0.12)] md:px-12 md:py-12">
        <header className="flex items-center justify-between text-sm">
          <span className="font-semibold">Concord</span>
          <Link href="/sign-in" className="underline-offset-4 hover:underline">
            Neon Auth sign in
          </Link>
        </header>
        <div className="py-16 md:py-24">
          <p className="mb-4 text-xs text-[#666]">Interview preparation, drawn clearly.</p>
          <h1 className="max-w-4xl text-5xl font-semibold leading-[0.98] tracking-tight md:text-7xl">
            Learn the concept.
            <br />
            Practise where it matters.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-[#555]">
            Firm occurrence signals shape what to practise. Published teaching answers and concept
            labs shape what to learn. The two sources never get confused.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/onboarding">
              <Button size="lg">Start company prep</Button>
            </Link>
            <Link href="/learn">
              <Button size="lg" variant="outline">
                Browse Learn modules
              </Button>
            </Link>
            <Link href="/plan">
              <Button size="lg" variant="ghost">
                Open study plan
              </Button>
            </Link>
          </div>
        </div>
        <p className="text-xs leading-relaxed text-[#666]">
          Teaching corpus: curated public sources and validated enrichment. Glassdoor: directional
          firm-signal only.
        </p>
      </article>
    </main>
  )
}
