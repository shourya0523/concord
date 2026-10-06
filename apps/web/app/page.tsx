import type { Metadata } from "next"

import { LandingHeader, PaperConcordeLanding } from "@/components/landing/paper-concorde"

/** Public landing (DESIGN.md §17): one scroll from index card to boarding pass. */
export const metadata: Metadata = {
  title: { absolute: "Concord · Interview prep for IB and PE" },
  description: "Concord is interview prep for investment banking and private equity. It only takes about 12 minutes a day.",
}

export default function HomePage() {
  return (
    <>
      <LandingHeader />
      <main>
        <PaperConcordeLanding />
      </main>
    </>
  )
}
