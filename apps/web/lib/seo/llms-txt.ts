/**
 * /llms.txt (https://llmstxt.org): a Markdown map of the public site for
 * LLMs and AI agents (SEO/GEO plan step 4). Pure so it can be unit tested;
 * app/llms.txt/route.ts feeds it the live catalog.
 */

type Link = { title: string; path: string; note?: string | null }

export type LlmsTxtInput = {
  base: string
  concepts: Link[]
  modules: Link[]
  firms: Link[]
  research: Link[]
}

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim()

function section(title: string, links: Link[], base: string): string[] {
  if (links.length === 0) return []
  return [
    `## ${title}`,
    "",
    ...links.map((link) => `- [${oneLine(link.title)}](${base}${link.path})${link.note ? `: ${oneLine(link.note)}` : ""}`),
    "",
  ]
}

export function buildLlmsTxt(input: LlmsTxtInput): string {
  const { base } = input
  return [
    "# Concord",
    "",
    "> Concord is interview prep for investment banking (IB) and private equity (PE). It shows what each firm actually asks, grades every practice answer, and drills the technical math (accounting, valuation, DCF, LBO, M&A) in about 12 minutes a day.",
    "",
    "The pages below are public and free to read. They cover the core technical concepts with Concord's own lesson excerpts, study modules, firm-by-firm topic data, and aggregate research on which topics interviews ask most. Practice, grading and the full question bank need a free account.",
    "",
    ...section("Research", input.research, base),
    ...section("Technical concepts", input.concepts, base),
    ...section("Study modules", input.modules, base),
    ...section("Interview prep by firm", input.firms, base),
    "## Optional",
    "",
    `- [All guides](${base}/guide): index of every public guide page`,
    `- [Sitemap](${base}/sitemap.xml)`,
    "",
  ].join("\n")
}
