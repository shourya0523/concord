import Link from "next/link"
import { notFound } from "next/navigation"

import { Button } from "@ibpe/ui/components/button"
import { CompanyRoomHeader } from "@ibpe/ui/components/company-concept-headers"
import { MetadataPill } from "@ibpe/ui/components/editorial"
import { ResourceLinkList } from "@ibpe/ui/components/resource-link-list"

import { TopicHeatIsland } from "@/components/topic-heat-island"
import { WeakTopicFocusBar } from "@/components/weak-topic-focus-bar"
import {
  FIRMS,
  WEAK_TOPICS,
  getFirm,
  resourcesForConcept,
} from "@/lib/mock-data"

type Props = {
  params: Promise<{ firm: string }>
  searchParams: Promise<{ focus?: string }>
}

export async function generateStaticParams() {
  return FIRMS.map((f) => ({ firm: f.slug }))
}

export async function generateMetadata({ params }: Props) {
  const { firm: slug } = await params
  const firm = getFirm(slug)
  return {
    title: firm ? `${firm.name} prep · IBPE` : "Company prep · IBPE",
    description: firm
      ? `Topic heat and pseudo-RAG entry for ${firm.name}`
      : "Company prep room",
  }
}

export default async function CompanyRoomPage({ params, searchParams }: Props) {
  const { firm: slug } = await params
  const { focus } = await searchParams
  const firm = getFirm(slug)
  if (!firm) notFound()

  const resources = [
    ...resourcesForConcept("concept_lbo").slice(0, 1),
    {
      id: "heat",
      label: "Multi-firm heat compare",
      href: "/prep/heat",
      kind: "internal" as const,
      description: "Compare this firm against your target set",
    },
    {
      id: "rag",
      label: "Start pseudo-RAG for this firm",
      href: "/prep/rag",
      kind: "internal" as const,
    },
  ]

  return (
    <div className="space-y-10">
      <CompanyRoomHeader
        companyName={firm.name}
        track={firm.tracks[0]}
        role="Analyst / Associate"
        subtitle="Visible topic heat from firm occurrence signals, with weakness overlay and grounded prep entry."
        weakTopics={WEAK_TOPICS.map((t) => t.label)}
        actions={
          <>
            <Link href="/prep/rag">
              <Button>Start pseudo-RAG</Button>
            </Link>
            <Link href="/study">
              <Button variant="outline">Adaptive session</Button>
            </Link>
          </>
        }
      />

      {focus ? (
        <p className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
          Focus from heat · <MetadataPill tone="lime">{focus}</MetadataPill>
        </p>
      ) : null}

      <section className="space-y-4">
        <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          Topic heat · this firm
        </h2>
        <TopicHeatIsland firmIds={[firm.id]} compareMode={false} />
        <WeakTopicFocusBar focusedId={focus ?? null} />
      </section>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="space-y-3">
          <h2 className="font-display text-3xl tracking-tight">How this room works</h2>
          <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            Glassdoor occurrence heat tells you which themes show up in reported interviews at{" "}
            {firm.name}. Teaching answers come from the GitHub corpus and validated enrichment —
            never scraped answer text. Use weak-topic chips to auto-focus the next drill.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            {FIRMS.filter((f) => f.id !== firm.id)
              .slice(0, 4)
              .map((f) => (
                <Link
                  key={f.id}
                  href={`/companies/${f.slug}`}
                  className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:border-lime/40 hover:text-foreground"
                >
                  {f.name}
                </Link>
              ))}
          </div>
        </section>
        <ResourceLinkList resources={resources} title="Room resources" />
      </div>
    </div>
  )
}
