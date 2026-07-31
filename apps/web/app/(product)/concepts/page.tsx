import Link from "next/link"

import { MetadataPill } from "@ibpe/ui/components/editorial"

import { RoughHover } from "@/components/paper"
import { listConcepts, listLearningModules } from "@/lib/data/learning"
import { topicLabel } from "@/lib/topics"

export const metadata = {
  title: "Concept labs · Concord",
  description: "Diagram-first concept labs inside the learning modules",
}

export const dynamic = "force-dynamic"

export default async function ConceptsPage() {
  const [concepts, modules] = await Promise.all([listConcepts(), listLearningModules()])

  const moduleByConceptId = new Map<string, { slug: string; title: string }>()
  for (const learningModule of modules.items) {
    for (const conceptId of learningModule.concept_ids) {
      if (!moduleByConceptId.has(conceptId)) {
        moduleByConceptId.set(conceptId, {
          slug: learningModule.slug,
          title: learningModule.title,
        })
      }
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          Mode B · Concept labs
        </p>
        <h1 className="mt-2 font-display text-4xl leading-[1.05] tracking-tight md:text-6xl">
          Concept labs
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Atomic deep dives that live inside learning modules — diagram-first, with prerequisite
          notes, resource rails, and a drill path back into the question bank.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <MetadataPill tone="muted">{concepts.source}</MetadataPill>
          <MetadataPill tone="muted">{concepts.items.length} labs</MetadataPill>
        </div>
      </header>

      <ul className="divide-y divide-border border-y border-border">
        {concepts.items.map((item) => {
          const parent = moduleByConceptId.get(item.concept.id)
          return (
            <li key={item.concept.id} className="py-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <Link
                  href={`/concepts/${item.concept.slug}`}
                  className="font-display text-2xl leading-tight tracking-tight"
                >
                  <RoughHover>{item.concept.title}</RoughHover>
                </Link>
                {item.diagrams.length > 0 ? (
                  <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                    diagram
                  </span>
                ) : null}
                <MetadataPill>{(item.concept.domain ?? "both").toUpperCase()}</MetadataPill>
                {item.topic ? <MetadataPill>{topicLabel(item.topic)}</MetadataPill> : null}
              </div>
              {item.concept.summary ? (
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  {item.concept.summary}
                </p>
              ) : null}
              {parent ? (
                <p className="mt-2 font-mono text-[11px] tracking-wide text-muted-foreground">
                  module ·{" "}
                  <Link
                    className="underline underline-offset-4 hover:text-foreground"
                    href={`/learn/${parent.slug}`}
                  >
                    {parent.title}
                  </Link>
                </p>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
