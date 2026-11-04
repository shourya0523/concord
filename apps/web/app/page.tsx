import type { Metadata } from "next"

import { GuideLinksFooter } from "@/components/guide/guide-links-footer"
import { LandingHeader, PaperConcordeLanding } from "@/components/landing/paper-concorde"

/** Public landing (DESIGN.md §17): one scroll from index card to boarding pass. */
export const metadata: Metadata = {
  title: { absolute: "Concord · Interview prep for IB and PE" },
  alternates: { canonical: "/" },
}

/** The guide footer reads the catalog; refresh hourly like the guide (ISR). */
export const revalidate = 3600

export default function HomePage() {
  return (
    <>
      <LandingHeader />
      <main>
        <PaperConcordeLanding />
      </main>
      <GuideLinksFooter />
    </>
  )
}
