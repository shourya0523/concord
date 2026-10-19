import type { Metadata } from "next"

import { LandingHeader, PaperConcordeLanding } from "@/components/landing/paper-concorde"

/** Public landing (DESIGN.md §17): one scroll from index card to boarding pass. */
export const metadata: Metadata = {
  title: { absolute: "Concord · Interview prep for IB and PE" },
  alternates: { canonical: "/" },
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
