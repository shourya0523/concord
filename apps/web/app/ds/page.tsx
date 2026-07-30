"use client"

import * as React from "react"

import { Button } from "@ibpe/ui/components/button"
import { CompanyRoomHeader, ConceptLabHeader } from "@ibpe/ui/components/company-concept-headers"
import { DiagramCanvas } from "@ibpe/ui/components/diagram-canvas"
import {
  EditorialHeading,
  MetadataPill,
  MetricDisplay,
} from "@ibpe/ui/components/editorial"
import { PseudoRagCitationCard } from "@ibpe/ui/components/pseudo-rag-citation-card"
import { ResourceLinkList } from "@ibpe/ui/components/resource-link-list"
import { TargetCompanyMultiSelect } from "@ibpe/ui/components/target-company-multi-select"
import { TopicHeatmap } from "@ibpe/ui/components/topic-heatmap"
import { WeakTopicChip } from "@ibpe/ui/components/weak-topic-chip"

const DEMO_FIRMS = [
  { id: "gs", label: "Goldman" },
  { id: "ms", label: "Morgan Stanley" },
  { id: "bx", label: "Blackstone" },
]

const DEMO_TOPICS = [
  { id: "lbo", label: "LBO" },
  { id: "dcf", label: "DCF" },
  { id: "ma", label: "M&A" },
]

const DEMO_CELLS = [
  { firmId: "gs", firmLabel: "Goldman", topicId: "lbo", topicLabel: "LBO", intensity: 2 as const },
  {
    firmId: "gs",
    firmLabel: "Goldman",
    topicId: "dcf",
    topicLabel: "DCF",
    intensity: 4 as const,
    weak: true,
  },
  { firmId: "gs", firmLabel: "Goldman", topicId: "ma", topicLabel: "M&A", intensity: 3 as const },
  { firmId: "ms", firmLabel: "Morgan Stanley", topicId: "lbo", topicLabel: "LBO", intensity: 1 as const },
  { firmId: "ms", firmLabel: "Morgan Stanley", topicId: "dcf", topicLabel: "DCF", intensity: 3 as const },
  {
    firmId: "ms",
    firmLabel: "Morgan Stanley",
    topicId: "ma",
    topicLabel: "M&A",
    intensity: 4 as const,
    weak: true,
  },
  { firmId: "bx", firmLabel: "Blackstone", topicId: "lbo", topicLabel: "LBO", intensity: 4 as const },
  { firmId: "bx", firmLabel: "Blackstone", topicId: "dcf", topicLabel: "DCF", intensity: 2 as const },
  { firmId: "bx", firmLabel: "Blackstone", topicId: "ma", topicLabel: "M&A", intensity: 1 as const },
]

const DEMO_COMPANIES = [
  { id: "gs", name: "Goldman Sachs", track: "IB" as const },
  { id: "ms", name: "Morgan Stanley", track: "IB" as const },
  { id: "bx", name: "Blackstone", track: "PE" as const },
  { id: "kkr", name: "KKR", track: "PE" as const },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-border space-y-4 border-t pt-10">
      <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </section>
  )
}

export default function DesignSystemCataloguePage() {
  const [targets, setTargets] = React.useState<string[]>(["gs", "bx"])

  return (
    <main className="mx-auto max-w-5xl px-6 py-12 md:py-16">
      <EditorialHeading eyebrow="packages/ui · catalogue" as="h1">
        Editorial Finance Terminal
      </EditorialHeading>
      <p className="mt-3 max-w-2xl text-[15px] text-muted-foreground">
        Design-system demo only. Feature pages (dashboard, study, company rooms) belong to{" "}
        <code className="font-mono text-xs">ibpe-frontend</code>. Press{" "}
        <kbd className="font-mono text-xs">d</kbd> to toggle dark mode.
      </p>

      <div className="mt-8 flex flex-wrap gap-2">
        <Button>Primary lime</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <MetadataPill tone="lime">acid-lime</MetadataPill>
        <MetadataPill>metadata</MetadataPill>
      </div>

      <Section title="Metrics">
        <div className="grid gap-8 sm:grid-cols-3">
          <MetricDisplay label="Bank depth" value="3,492" hint="Glassdoor questions" />
          <MetricDisplay label="Weak topics" value="4" hint="Auto-focus queue" />
          <MetricDisplay label="Readiness" value="72%" hint="Composite" />
        </div>
      </Section>

      <Section title="Company / concept headers">
        <CompanyRoomHeader
          companyName="Goldman Sachs"
          track="IB"
          role="Investment Banking Analyst"
          subtitle="Topic heat + pseudo-RAG prep for selected targets."
          weakTopics={["DCF", "Accounting"]}
          actions={<Button size="sm">Start prep</Button>}
        />
        <ConceptLabHeader
          conceptName="Leveraged buyouts"
          domain="PE"
          masteryLabel="Developing"
          subtitle="Sources & uses, returns bridges, and credit constraints."
          actions={
            <Button size="sm" variant="outline">
              Open diagram
            </Button>
          }
        />
      </Section>

      <Section title="Target company multi-select">
        <TargetCompanyMultiSelect
          companies={DEMO_COMPANIES}
          value={targets}
          onChange={setTargets}
        />
      </Section>

      <Section title="Topic heatmap">
        <TopicHeatmap firms={DEMO_FIRMS} topics={DEMO_TOPICS} cells={DEMO_CELLS} />
      </Section>

      <Section title="Weak-topic chips">
        <div className="flex flex-wrap gap-2">
          <WeakTopicChip label="DCF" severity="high" focused />
          <WeakTopicChip label="LBO returns" severity="medium" />
          <WeakTopicChip label="Accounting" severity="low" />
        </div>
      </Section>

      <Section title="Pseudo-RAG citation">
        <PseudoRagCitationCard
          title="Walk me through an LBO"
          excerpt="Sources and uses, debt schedule, and returns to equity at exit."
          whyRetrieved="Matches selected PE targets × weak topic LBO; high corpus confidence."
          provenance="github-corpus"
          score={0.91}
        />
      </Section>

      <Section title="Resource links">
        <ResourceLinkList
          resources={[
            {
              id: "1",
              label: "LBO model walkthrough",
              href: "/ds",
              kind: "internal",
              description: "Concept lab deep link",
            },
            {
              id: "2",
              label: "Damodaran — leverage",
              href: "https://example.com",
              kind: "external",
            },
          ]}
        />
      </Section>

      <Section title="Diagram canvas">
        <DiagramCanvas
          title="Sources & uses"
          source={`flowchart LR
  Equity --> HoldCo
  Debt --> HoldCo
  HoldCo --> Target`}
          reducedMotionFallback={
            <p className="text-sm text-muted-foreground">
              Static sources & uses summary (reduced motion).
            </p>
          }
        />
      </Section>
    </main>
  )
}
