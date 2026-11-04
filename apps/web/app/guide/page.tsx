import type { Metadata } from "next"

import { Breadcrumbs, GuideSection, LinkList } from "@/components/guide/guide-ui"
import { guidePaths, publicConcepts, publicFirms, publicModules } from "@/lib/seo/public-content"

export const revalidate = 3600

export const metadata: Metadata = {
  title: "IB and PE interview guides",
  description:
    "Free investment banking and private equity interview guides: technical concepts (DCF, LBO, accounting, valuation), study modules, and what each firm tends to ask.",
  alternates: { canonical: guidePaths.hub },
}

export default async function GuideHubPage() {
  const [concepts, modules, firms] = await Promise.all([publicConcepts(), publicModules(), publicFirms()])

  return (
    <div className="space-y-12">
      <header className="space-y-3">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Guides" }]} currentPath={guidePaths.hub} />
        <h1 className="font-display text-4xl leading-[1.05] tracking-tight md:text-6xl">
          IB and PE interview guides
        </h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          Investment banking and private equity interviews test a small set of technical concepts again and again.
          Start with a concept, follow a module end to end, or see which topics a specific firm tends to ask about.
        </p>
      </header>

      <GuideSection title="Technical concepts" id="concepts">
        <LinkList
          items={concepts.map((concept) => ({
            href: guidePaths.concept(concept.slug),
            label: concept.title,
            note: concept.domain ? concept.domain.toUpperCase() : undefined,
          }))}
        />
      </GuideSection>

      <GuideSection title="Study modules" id="modules">
        <LinkList
          items={modules.map((learningModule) => ({
            href: guidePaths.module(learningModule.slug),
            label: learningModule.title,
            note: `${learningModule.estimated_minutes} min`,
          }))}
        />
      </GuideSection>

      {firms.length > 0 ? (
        <GuideSection title="Interview prep by firm" id="firms">
          <LinkList
            items={firms.map((firm) => ({
              href: guidePaths.firm(firm.slug),
              label: `${firm.name} interview prep`,
              note: firm.track ?? undefined,
            }))}
          />
        </GuideSection>
      ) : null}
    </div>
  )
}
