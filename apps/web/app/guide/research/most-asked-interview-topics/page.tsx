import type { Metadata } from "next"
import Link from "next/link"

import { Breadcrumbs, GuideSection, JsonLd, SignUpCta } from "@/components/guide/guide-ui"
import { FIRM_TOPIC_MIN_REPORTS, guidePaths, topicFrequency, type TopicFrequency } from "@/lib/seo/public-content"
import { datasetLd } from "@/lib/seo/structured-data"
import { conceptSlugForTopic, topicLabel } from "@/lib/topics"

export const revalidate = 3600

const TITLE = "The most-asked IB and PE interview topics"
const PATH = guidePaths.topicFrequency

const pct = (share: number) => (share > 0 && share < 0.005 ? "<1%" : `${Math.round(share * 100)}%`)

/** Topic label for mid-sentence use: "Valuation / DCF" → "valuation / DCF", "LBO" stays. */
const inSentence = (topic: string) => {
  const label = topicLabel(topic)
  return /^[A-Z][a-z]/.test(label) ? label[0]!.toLowerCase() + label.slice(1) : label
}

/** One-sentence finding, written from the data so it never goes stale. */
function headline(data: TopicFrequency): string | null {
  const [first, second] = data.rows
  if (!first) return null
  const technical = data.rows.find((row) => row.topic !== "behavioral")
  const parts = [
    `Across ${data.taggedReports.toLocaleString("en-US")} tagged interview reports from ${data.firmCount} banks and funds, ` +
      `${inSentence(first.topic)} questions make up ${pct(first.share)}` +
      (second ? `, followed by ${inSentence(second.topic)} at ${pct(second.share)}.` : "."),
  ]
  if (technical && technical !== first && technical !== second) {
    parts.push(` The most-asked technical topic is ${inSentence(technical.topic)}.`)
  }
  return parts.join("")
}

export async function generateMetadata(): Promise<Metadata> {
  const data = await topicFrequency()
  const description =
    headline(data) ?? "Which technical topics investment banking and private equity interviews ask most, by firm."
  return {
    title: TITLE,
    description,
    alternates: { canonical: PATH },
    openGraph: { title: TITLE, description, type: "article", url: PATH },
  }
}

function TopicLink({ topic }: { topic: string }) {
  const slug = conceptSlugForTopic(topic)
  return slug ? (
    <Link href={guidePaths.concept(slug)} className="font-medium underline underline-offset-4">
      {topicLabel(topic)}
    </Link>
  ) : (
    <span className="font-medium">{topicLabel(topic)}</span>
  )
}

export default async function TopicFrequencyPage() {
  const data = await topicFrequency()
  const summary = headline(data)

  return (
    <article className="space-y-10">
      <JsonLd
        data={datasetLd({
          name: TITLE,
          description: summary ?? "Topic frequency in IB and PE interviews, aggregated across firms.",
          path: PATH,
        })}
      />
      <header className="space-y-3">
        <Breadcrumbs
          items={[{ label: "Guides", href: guidePaths.hub }, { label: "Most-asked topics" }]}
          currentPath={PATH}
        />
        <h1 className="font-display text-4xl leading-[1.05] tracking-tight md:text-6xl">{TITLE}</h1>
        <p className="max-w-2xl text-[17px] leading-relaxed">
          {summary ?? "Topic data is being refreshed. Check back soon."}
        </p>
      </header>

      {data.rows.length > 0 ? (
        <GuideSection title="Share of interview reports by topic">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
                  <th scope="col" className="py-2 pr-4 font-normal">Topic</th>
                  <th scope="col" className="py-2 pr-4 text-right font-normal">Share</th>
                  <th scope="col" className="py-2 pr-4 text-right font-normal">Reports</th>
                  <th scope="col" className="py-2 text-right font-normal">Firms with {FIRM_TOPIC_MIN_REPORTS}+ reports</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.topic} className="border-b border-border/70">
                    <th scope="row" className="py-2.5 pr-4 font-normal">
                      <TopicLink topic={row.topic} />
                    </th>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{pct(row.share)}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{row.reports.toLocaleString("en-US")}</td>
                    <td className="py-2.5 text-right tabular-nums">{row.firmsAskingOften}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GuideSection>
      ) : null}

      {data.byFirm.length > 0 ? (
        <GuideSection title="Most-asked technical topic at each firm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
                  <th scope="col" className="py-2 pr-4 font-normal">Firm</th>
                  <th scope="col" className="py-2 pr-4 font-normal">Top technical topic</th>
                  <th scope="col" className="py-2 text-right font-normal">Share of its technical reports</th>
                </tr>
              </thead>
              <tbody>
                {data.byFirm.map((entry) => (
                  <tr key={entry.firm.id} className="border-b border-border/70">
                    <th scope="row" className="py-2.5 pr-4 font-normal">
                      <Link href={guidePaths.firm(entry.firm.slug)} className="underline underline-offset-4">
                        {entry.firm.name}
                      </Link>
                    </th>
                    <td className="py-2.5 pr-4">
                      <TopicLink topic={entry.topic} />
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{pct(entry.share)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GuideSection>
      ) : null}

      <GuideSection title="Method">
        <div className="max-w-2xl space-y-2 text-[15px] leading-relaxed text-muted-foreground">
          <p>
            Concord collects interview reports that candidates post about their own investment banking and private
            equity interviews ({data.totalReports.toLocaleString("en-US")} reports across {data.firmCount} firms).
            Each question is tagged to a topic by keyword rules. Reports that match no topic are left out, so shares
            are of the {data.taggedReports.toLocaleString("en-US")} tagged reports.
          </p>
          <p>
            “Firms with {FIRM_TOPIC_MIN_REPORTS}+ reports” counts the firms where at least {FIRM_TOPIC_MIN_REPORTS} reports
            were on that topic. Numbers refresh hourly as new reports come in. Only counts are shown; question text
            stays in the app.
          </p>
        </div>
      </GuideSection>

      <SignUpCta href="/sign-up">
        See the actual questions behind these numbers for your target firms, and practise them with graded answers.
      </SignUpCta>
    </article>
  )
}
