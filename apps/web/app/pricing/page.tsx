import type { Metadata } from "next"
import Link from "next/link"

import { cn } from "@ibpe/ui/lib/utils"

import { ConcordLogo } from "@/components/concord-logo"
import { MockupSvgFilters } from "@/components/mockups/svg-filters"
import { getSession } from "@/lib/auth/server"
import { CONTACT_EMAIL, PLANS, planCtaHref } from "@/lib/billing/plans"

/** Public pricing (DESIGN.md §17.4): Individual, Team, Custom. */
export const metadata: Metadata = {
  title: "Pricing",
  description: "Standby is free with daily AI limits, Supersonic is $10 a month, Charter is $5 a seat for teams, and Fleet is custom.",
  alternates: { canonical: "/pricing" },
}

export default async function PricingPage() {
  const signedIn = Boolean((await getSession()).data?.user)

  return (
    <div className="relative min-h-svh bg-paper text-ink">
      <MockupSvgFilters />
      <div className="mx-auto flex w-full max-w-6xl flex-col px-4 py-8 md:px-6 md:py-12">
        <header className="mb-12 flex items-center justify-between gap-3">
          <Link href="/" aria-label="Concord home" className="flex items-center gap-2 transition-opacity hover:opacity-80">
            <ConcordLogo size="sm" priority />
            <span className="hidden font-display text-xl tracking-tight sm:inline">Concord</span>
          </Link>
          <nav aria-label="Account" className="flex items-center gap-1">
            {signedIn ? (
              <Link href="/today" className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink/90">
                Open Concord
              </Link>
            ) : (
              <>
                <Link href="/sign-in" className="rounded-md px-3 py-2 text-sm font-medium underline-offset-4 hover:underline">
                  Sign in
                </Link>
                <Link
                  href="/sign-up"
                  className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink/90"
                >
                  Start prepping
                </Link>
              </>
            )}
          </nav>
        </header>

        <main>
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">Pricing</p>
          <h1 className="mt-2 max-w-2xl font-display text-4xl leading-[1.05] tracking-tight md:text-6xl">
            Free to prep. Pay when your group does.
          </h1>
          <p className="mt-4 max-w-xl text-[15px] text-muted-foreground">
            Practice is free. AI grading, coaching and voice answers have daily free limits.
            Supersonic adds monthly credits. Charter and Fleet can run on your organisation&apos;s own
            OpenRouter key.
          </p>

          <ul className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Plans">
            {PLANS.map((plan) => {
              const href = planCtaHref(plan.id, signedIn)
              const external = href.startsWith("mailto:")
              const label = plan.id === "free" && signedIn ? "Open your plan" : plan.cta
              return (
                <li
                  key={plan.id}
                  data-plan={plan.id}
                  className={cn(
                    "flex flex-col border bg-[#fffdf8] px-5 py-6 md:px-6",
                    plan.featured ? "border-ink shadow-[4px_4px_0_rgb(30_30_30/0.9)]" : "border-border",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">{plan.kind}</p>
                      <h2 className="font-display text-2xl tracking-tight">{plan.name}</h2>
                    </div>
                    {plan.featured ? (
                      <span className="rounded-full border border-ink px-2 py-0.5 font-mono text-[10px] tracking-wide uppercase">
                        Recommended
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{plan.blurb}</p>
                  <p className="mt-6 font-display text-4xl leading-none tracking-tight">{plan.price}</p>
                  <p className="mt-2 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">{plan.cadence}</p>
                  <ul className="mt-6 flex-1 space-y-2 text-sm">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-2">
                        <span aria-hidden className="text-muted-foreground">—</span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  {external ? (
                    <a
                      href={href}
                      className="mt-8 inline-flex h-10 items-center justify-center rounded-[10px] border border-ink px-4 text-sm font-medium hover:bg-ink hover:text-paper"
                    >
                      {label}
                    </a>
                  ) : (
                    <Link
                      href={href}
                      className="mt-8 inline-flex h-10 items-center justify-center rounded-[10px] bg-ink px-4 text-sm font-medium text-paper hover:bg-ink/90"
                    >
                      {label}
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>

          <p className="mt-10 text-sm text-muted-foreground">
            Questions about a plan? Email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-ink underline-offset-4 hover:underline">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </main>
      </div>
    </div>
  )
}
