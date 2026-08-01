import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { Button } from "@ibpe/ui/components/button"
import { ResourceLinkList, type ResourceLink } from "@ibpe/ui/components/resource-link-list"

import {
  Annotate,
  PaperSheet,
  ProvenanceChip,
  WarrenCallout,
} from "@/components/paper"
import { TopicHeatIsland } from "@/components/topic-heat-island"
import { WeakTopicFocusBar } from "@/components/weak-topic-focus-bar"
import { getCompanySignals, getFirmBySlugOrId } from "@/lib/data/catalog"
import { getFirmTopicHeat } from "@/lib/data/firms"
import { listConcepts } from "@/lib/data/learning"
import { conceptIdForTopic, topicLabel } from "@/lib/topics"

export const dynamic = "force-dynamic"

type Props = {
  params: Promise<{ firm: string }>
  searchParams: Promise<{ focus?: string | string[]; role?: string | string[] }>
}

function firstParam(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { firm: slug } = await params
  const firm = await getFirmBySlugOrId(slug)
  return {
    title: firm ? `${firm.name} prep · Concord` : "Company prep · Concord",
    description: firm
      ? `Topic heat, over-indexed concepts, and reported occurrence signals for ${firm.name}`
      : "Company prep room",
  }
}

export default async function CompanyRoomPage({ params, searchParams }: Props) {
  const { firm: slug } = await params
  const query = await searchParams
  const focus = firstParam(query.focus)
  const requestedRole = firstParam(query.role)
  const firm = await getFirmBySlugOrId(slug)
  if (!firm) notFound()
  const firmId = firm.id
  const firmSlug = firm.slug

  const [heat, concepts, roleScopeSignals] = await Promise.all([
    getFirmTopicHeat(firmId),
    listConcepts(),
    getCompanySignals({ firmId, topic: focus ?? null, limit: 100 }),
  ])

  const taggedHeat = heat.topics
    .filter((row) => row.topic_id !== "untagged")
    .sort((a, b) => b.intensity - a.intensity || b.sample_size - a.sample_size)
  const topHeat = taggedHeat[0] ?? null
  const totalSamples = taggedHeat.reduce((sum, row) => sum + row.sample_size, 0)

  const overIndexed = concepts.items
    .map((item) => ({
      item,
      relevance: item.concept.firm_relevance[firmId] ?? 0,
    }))
    .filter((entry) => entry.relevance >= 0.5)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 3)

  const conceptSlugById = new Map(
    concepts.items.map((entry) => [entry.concept.id, entry.concept.slug] as const),
  )
  const conceptHrefForTopic = (topic: string | null): string | null => {
    if (!topic) return null
    const conceptId = conceptIdForTopic(topic)
    if (!conceptId) return null
    const conceptSlug = conceptSlugById.get(conceptId)
    return conceptSlug ? `/concepts/${conceptSlug}` : null
  }

  const roleOptions = [
    ...new Set(
      roleScopeSignals.items
        .map((signal) => signal.role?.trim())
        .filter((role): role is string => Boolean(role)),
    ),
  ]
  const selectedRole =
    requestedRole && roleOptions.includes(requestedRole) ? requestedRole : null
  const signals = selectedRole
    ? await getCompanySignals({
        firmId,
        topic: focus ?? null,
        role: selectedRole,
        limit: 10,
      })
    : {
        ...roleScopeSignals,
        items: roleScopeSignals.items.slice(0, 10),
        limit: 10,
      }

  function ragHrefForTopic(topic: string | null | undefined) {
    const params = new URLSearchParams({ firm: firmId })
    if (topic) params.set("topic", topic)
    return `/prep/rag?${params.toString()}`
  }

  function roomHref(next: { focus?: string | null; role?: string | null }) {
    const params = new URLSearchParams()
    const nextFocus = next.focus === undefined ? focus : next.focus
    const nextRole = next.role === undefined ? selectedRole : next.role
    if (nextFocus) params.set("focus", nextFocus)
    if (nextRole) params.set("role", nextRole)
    const search = params.toString()
    return `/companies/${firmSlug}${search ? `?${search}` : ""}`
  }

  const railResources: ResourceLink[] = [
    {
      id: "heat-compare",
      label: "Multi-firm heat compare",
      href: "/prep/heat",
      kind: "internal",
      description: `Line ${firm.name} up against your target set`,
    },
    {
      id: "rag",
      label: `Pseudo-RAG pack for ${firm.name}`,
      href: ragHrefForTopic(topHeat?.topic_id),
      kind: "internal",
      description: "Corpus-grounded pack, frozen at session start",
    },
    ...overIndexed.flatMap(({ item }) =>
      item.resources.slice(0, 2).map((resource) => ({
        id: resource.id,
        label: resource.label,
        href: resource.url,
        kind: resource.kind,
        description: `From ${item.concept.title}`,
      })),
    ),
  ]

  return (
    <div className="space-y-10">
      <header className="space-y-4">
        <div className="space-y-2">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            Company prep
          </p>
          <h1 className="font-display text-4xl leading-[1.05] tracking-tight text-foreground md:text-6xl">
            {firm.name}
          </h1>
          <p className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
            {firm.track ?? "IB / PE"} ·{" "}
            {roleOptions.length > 0
              ? `reported roles: ${roleOptions.slice(0, 2).join(" · ")}`
              : "role mix not yet tagged"}{" "}
            · signals {firm.signals}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href={ragHrefForTopic(focus ?? topHeat?.topic_id)}>
            <Button>Start pseudo-RAG</Button>
          </Link>
          <Link href="/study">
            <Button variant="outline">Adaptive session</Button>
          </Link>
        </div>
        {roleOptions.length > 0 ? (
          <nav className="flex flex-wrap items-center gap-2" aria-label="Role filter">
            <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
              Role filter
            </span>
            <Link
              href={roomHref({ role: null })}
              className={`rounded-full border px-3 py-1 font-mono text-[10px] tracking-wide uppercase transition-colors duration-200 ease-out ${
                selectedRole
                  ? "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                  : "border-foreground/60 text-foreground"
              }`}
            >
              All roles
            </Link>
            {roleOptions.map((role) => (
              <Link
                key={role}
                href={roomHref({ role })}
                className={`rounded-full border px-3 py-1 font-mono text-[10px] tracking-wide uppercase transition-colors duration-200 ease-out ${
                  selectedRole === role
                    ? "border-foreground/60 text-foreground"
                    : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                }`}
              >
                {role}
              </Link>
            ))}
          </nav>
        ) : null}
      </header>

      {topHeat ? (
        <WarrenCallout mood="thinking" bracket>
          {firm.name} over-indexes {topicLabel(topHeat.topic_id)} (n={topHeat.sample_size}) —
          drill those first.
        </WarrenCallout>
      ) : (
        <WarrenCallout mood="idle">
          No tagged topic heat for {firm.name} yet — occurrence volume still counts toward
          readiness, and new signals land with each import.
        </WarrenCallout>
      )}

      <section className="space-y-4" aria-label="Topic heat for this firm">
        <div className="space-y-1">
          <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            Topic heat · this firm
          </h2>
          <p className="font-mono text-[10px] tracking-wide text-muted-foreground/80">
            {taggedHeat.length > 0
              ? `n=${totalSamples} tagged occurrences across ${taggedHeat.length} topics · intensity 0–4 by relative frequency`
              : (heat.note ?? "No tagged occurrences yet.")}
          </p>
        </div>
        <TopicHeatIsland firmIds={[firmId]} compareMode={false} activateTarget="rag" />
        <div className="flex flex-wrap items-center gap-3">
          <Link href={ragHrefForTopic(focus ?? topHeat?.topic_id)}>
            <Button size="sm">
              Start heat-scoped RAG{focus ? ` · ${topicLabel(focus)}` : ""}
            </Button>
          </Link>
          {focus && conceptHrefForTopic(focus) ? (
            <Link href={conceptHrefForTopic(focus) ?? "#"}>
              <Button size="sm" variant="outline">
                Open concept lab
              </Button>
            </Link>
          ) : null}
        </div>
        {focus ? (
          <p className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
            Focus from heat · {topicLabel(focus)}
          </p>
        ) : null}
        <WeakTopicFocusBar focusedId={focus ?? null} />
      </section>

      <section aria-label="Concepts this firm over-indexes">
        <PaperSheet seedKey={`over-index-${firmId}`} torn={false}>
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
              Concepts this firm over-indexes
            </h2>
            <span className="font-mono text-[10px] tracking-wide text-muted-foreground/70 uppercase">
              heat-derived relevance ≥ 50% · top 3
            </span>
          </div>
          {overIndexed.length > 0 ? (
            <ul className="mt-4 divide-y divide-stone/70">
              {overIndexed.map(({ item, relevance }) => (
                <li
                  key={item.concept.id}
                  className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3"
                >
                  <Annotate type="box" padding={3}>
                    <Link
                      href={`/concepts/${item.concept.slug}`}
                      className="font-display text-lg tracking-tight text-foreground underline-offset-4 hover:underline"
                    >
                      {item.concept.title}
                    </Link>
                  </Annotate>
                  {item.topic ? (
                    <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                      {topicLabel(item.topic)}
                    </span>
                  ) : null}
                  <span className="ml-auto font-mono text-[11px] text-muted-foreground tabular-nums">
                    {Math.round(relevance * 100)}% relevance
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No concept clears the 50% relevance bar at {firm.name} yet — firm heat coverage is
              still building. Concept labs stay open from the Learn catalog meanwhile.
            </p>
          )}
        </PaperSheet>
      </section>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="space-y-4" aria-label="Reported signal browser">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                Reported signals · occurrence explorer
              </h2>
              <ProvenanceChip provenance="glassdoor_occurrence" />
            </div>
            <p className="text-sm text-muted-foreground">
              Signals are reported occurrences — teaching answers live in the corpus.
            </p>
            {focus ? (
              <p className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
                Filtered by {topicLabel(focus)} ·{" "}
                <Link
                  href={roomHref({ focus: null })}
                  className="text-foreground underline underline-offset-4"
                >
                  clear topic
                </Link>
              </p>
            ) : null}
            {selectedRole ? (
              <p className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
                Role {selectedRole} ·{" "}
                <Link
                  href={roomHref({ role: null })}
                  className="text-foreground underline underline-offset-4"
                >
                  clear role
                </Link>
              </p>
            ) : null}
          </div>

          {signals.items.length === 0 ? (
            <p className="border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
              {focus
                ? `No reported occurrences tagged ${topicLabel(focus)} at ${firm.name} yet — clear the filter to see everything reported.`
                : selectedRole
                  ? `No reported occurrences tagged ${selectedRole} at ${firm.name} yet — clear the role filter to see everything reported.`
                : `No reported occurrences for ${firm.name} yet. Volume builds with each import.`}
            </p>
          ) : (
            <>
              <ul>
                {signals.items.map((signal) => {
                  const conceptHref = conceptHrefForTopic(signal.topic)
                  const meta = [
                    signal.role,
                    signal.track,
                    signal.round,
                    signal.interview_date,
                  ].filter((part): part is string => Boolean(part))
                  return (
                    <li
                      key={signal.occurrence_id}
                      className="border-b border-stone/60 py-3 first:border-t"
                    >
                      <p className="max-w-2xl text-sm leading-relaxed text-foreground">
                        {signal.question}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        {signal.topic ? (
                          conceptHref ? (
                            <Link
                              href={conceptHref}
                              className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] tracking-wide text-muted-foreground uppercase transition-colors duration-200 ease-out hover:border-foreground/40 hover:text-foreground"
                            >
                              {topicLabel(signal.topic)}
                            </Link>
                          ) : (
                            <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                              {topicLabel(signal.topic)}
                            </span>
                          )
                        ) : null}
                        {meta.length > 0 ? (
                          <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                            {meta.join(" · ")}
                          </span>
                        ) : null}
                        {signal.has_teaching_answer ? (
                          <ProvenanceChip provenance="corpus_matched" />
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
              <p className="font-mono text-[10px] tracking-wide text-muted-foreground/80 uppercase">
                Showing {signals.items.length} of {signals.total} reported occurrences
                {focus ? ` · filter: ${topicLabel(focus)}` : ""}
                {selectedRole ? ` · role: ${selectedRole}` : ""}
              </p>
            </>
          )}
        </section>

        <ResourceLinkList resources={railResources} title="Firm-style resources" />
      </div>
    </div>
  )
}
