import Link from "next/link"

import { MetadataPill } from "@ibpe/ui/components/editorial"

import { RoughHover } from "@/components/paper"
import { listConcepts, listLearningModules } from "@/lib/data/learning"
import { topicLabel } from "@/lib/topics"

export const metadata = {
  title: "Concept labs · Concord",
  description:
    "Diagram-led concept labs for IB and PE — open a topic, learn it deeply, then practise.",
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
          Learn · Concept labs
        </p>
        <h1 className="mt-2 font-display text-4xl leading-[1.05] tracking-tight md:text-6xl">
          Concept labs
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          One topic at a time — usually with a diagram — so you can explain the
          idea clearly. Labs sit inside modules; from here you can jump back to
          practice questions.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          {concepts.items.length}{" "}
          {concepts.items.length === 1 ? "lab" : "labs"}
          {concepts.source === "stub"
            ? " · starter set (database not connected)"
            : ""}
        </p>
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
                <p className="mt-2 text-xs text-muted-foreground">
                  In module ·{" "}
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
