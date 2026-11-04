# SEO + GEO plan for Concord (apps/web)

_Research date: 2026-11-04. Site: https://concord-umber.vercel.app_

> **Status (2026-11-04):** Steps 1–4 shipped. Step 4: lesson excerpts with
> interview answers on concept pages, JSON-LD, `/llms.txt`, and the original-data
> page `/guide/research/most-asked-interview-topics`. Steps 1, 2 and 3 shipped (step 3: breadcrumb JSON-LD,
> module ↔ module links, landing → top guides footer, CI link audit in
> `e2e/seo-links-gate.spec.ts`). Public pages live under
> `/guide` (hub, `/guide/concepts/[slug]`, `/guide/modules/[slug]`,
> `/guide/firms/[firm]`) rather than opening the in-app URLs, because the app
> pages call signed-in APIs from the browser. Plus `robots.txt` and `sitemap.xml`.
> Spec: DESIGN.md §17.4.

**SEO** means ranking in Google and Bing. **GEO** (generative engine
optimisation, also called AEO) means getting ChatGPT, Perplexity, Gemini,
Google AI Overviews and Claude to **cite** Concord in their answers.
Both depend on the same thing: public pages that crawlers can read.

## 1. Where we are now (audit)

| Check | Status | Where |
|---|---|---|
| Site metadata (title, description, OG, Twitter) | ✅ Good | `apps/web/app/layout.tsx` |
| OG/Twitter images, icons, manifest | ✅ | `apps/web/app/*` file conventions |
| **Public, crawlable content** | ❌ Only `/`, `/sign-in`, `/sign-up` | `apps/web/lib/auth/gate.ts` (`PUBLIC_EXACT`) |
| `robots.txt` | ❌ 404 in prod | none |
| `sitemap.xml` | ❌ 404 in prod | none |
| `llms.txt` | ❌ | none |
| JSON-LD structured data | ❌ | none |
| Per-page `generateMetadata` on `/concepts/[slug]`, `/companies/[firm]` | ⚠️ Pages exist but are behind login | `apps/web/app/(product)/…` |
| Internal cross-links | ⚠️ Present (concept→concept, firm→concept, concept→module) but invisible to crawlers | same |

**The main blocker:** the login gate (DESIGN.md §17) redirects every page
except the landing page to `/sign-in`. Google and AI crawlers only see one
page. No tool or tag fixes that. We need public pages first.

## 2. Plan, in priority order

### Step 1: Public content surface (biggest win)

Make read-only, public versions of the content we own:

| Public route | Content | Gated part (keep behind login) |
|---|---|---|
| `/concepts/[slug]` | Concept explainer, related concepts, sample questions | Grading, progress, saved |
| `/companies/[firm]` | What topics this firm tests, topic heat summary | Full question room, drills |
| `/questions/[id]` (new, optional) | Question + short model answer | Graded attempts, full answer |
| `/learn`, `/learn/[module]` | Module overviews | Lessons, progress |

How: either add these prefixes to the public list in `lib/auth/gate.ts`
and render a signed-out variant, or (cleaner) create an `app/(public)/`
route group. Keep a "Sign up to get graded" call to action on every page.

> ⚠️ **Content rights:** publish only original content (our concept
> explainers, synthesised answers) and sources cleared in
> `reports/license-review.md`. Do **not** publish raw scraped Glassdoor
> text on public pages. Show aggregates instead ("Goldman asks DCF
> questions often").

### Step 2: Technical SEO basics (about 1 day, all built into Next.js)

1. `app/robots.ts`: allow public routes, disallow `/api`, `/admin`,
   `/mockups`, `/ds`, and app-only pages. Point to the sitemap. Decide
   per AI bot (`GPTBot`, `OAI-SearchBot`, `PerplexityBot`, `ClaudeBot`,
   `Google-Extended`). Allowing the *search* bots (`OAI-SearchBot`,
   `PerplexityBot`) is needed for GEO citations.
2. `app/sitemap.ts`: build from the DB (concepts, firms, modules) with
   `lastModified`. Split it with `generateSitemaps` past 50k URLs.
3. `generateMetadata` on every public dynamic page: unique title,
   description, `alternates.canonical`, and a per-page OG image
   (`opengraph-image.tsx` with `ImageResponse`).
4. Add `noindex` metadata to `/mockups`, `/ds`, `/admin`.
5. Proxy matcher: make sure `/robots.txt`, `/sitemap.xml` and `/llms.txt`
   are never redirected. They already pass, because `STATIC_FILE` in
   `gate.ts` covers `.txt` and `.xml`. Add a test.
6. Core Web Vitals: check with Lighthouse and Vercel Speed Insights.

### Step 3: Cross-linking (internal links)

Already present: concept → related concepts, concept → parent module,
firm → concepts. Gaps to close:

- **Concept → firms** ("Firms that ask about LBOs"). This is the reverse
  of the firm → concept link, so every firm page gets links back from concepts.
- **Breadcrumbs** on every public page (Home › Learn › Module › Concept),
  plus `BreadcrumbList` JSON-LD.
- **Hub pages:** `/concepts` and `/companies` as full A–Z indexes, so no
  page is more than 3 clicks from home.
- **Landing page → hubs:** link the top concepts and firms from `/`.
- **Descriptive anchor text** ("how to walk through a DCF", not "click here").
- **Automated guard:** a script (or Playwright e2e test) that crawls the
  built site and fails CI on orphan pages (0 inbound links), broken
  internal links, or pages more than 3 clicks deep. Tools: `linkinator`
  (npm, free) or a short custom crawler.

### Step 4: GEO (getting cited by AI)

What the 2026 evidence supports:

- **Answer-first writing.** Start each concept page with a 2–3 sentence
  direct answer. Use clear H2 question headings, short lists and tables,
  and concrete numbers. LLMs quote passages that make sense on their own.
- **Original data.** Things like "Top 10 topics asked at bulge-bracket
  superdays (n = X questions)" are what AI engines and journalists cite.
  Concord's question bank is a real advantage here.
- **`llms.txt`** at the site root: a Markdown summary plus links to hubs.
  Lighthouse now has an audit for it. It's cheap, but the payoff is not proven.
- **Being mentioned elsewhere.** AI engines rely heavily on third-party
  sources: Reddit (r/FinancialCareers, r/investmentbanking), Wall Street
  Oasis, YouTube, university finance club resource lists, Product Hunt.
- **JSON-LD** (`Organization`, `WebSite`, `BreadcrumbList`, `FAQPage` or
  `QAPage`, `DefinedTerm` for concepts, `Course` for modules). It's good
  for rich results in Google. Note: an Ahrefs study (Aug 2025–Mar 2026,
  1,885 pages) found **no meaningful lift in AI citations** from schema
  alone. Do it for SEO, not as a GEO lever.
- **Freshness.** Show "Updated <date>" on pages and keep `lastModified`
  in the sitemap accurate.

## 3. Tools

### Free (start here)

| Tool | Use |
|---|---|
| **Google Search Console** | Indexing, queries, sitemap submission, AI Overviews impressions |
| **Bing Webmaster Tools** | Indexing + **AI Performance** report (Copilot citations); also feeds ChatGPT search |
| **Ahrefs Webmaster Tools** (free, verified site) | Site Audit (170+ issues) + **Internal Link Opportunities** report |
| **Screaming Frog SEO Spider** (free ≤500 URLs) | Crawl audit: orphans, broken links, click depth, canonicals |
| **Lighthouse / PageSpeed Insights** | Performance, SEO and `llms.txt` audits |
| **Google Rich Results Test / validator.schema.org** | Validate JSON-LD |
| **Vercel Web Analytics** (already on Vercel) | Referrers from `chatgpt.com`, `perplexity.ai`, `gemini.google.com` |
| `linkinator` (npm) | CI broken-link and crawl check |

### Paid: GEO visibility tracking (choose one later)

| Tool | Entry price (vendor-stated, 2026) | Notes |
|---|---|---|
| **Otterly.ai** | ~$29/mo (15 prompts) | Cheapest; ChatGPT, AI Overviews, Perplexity, Copilot |
| **Ahrefs Brand Radar** | Included in Ahrefs plans (5+ prompts); add-on from $50/mo | Good if you buy Ahrefs for SEO anyway |
| **Semrush AI Visibility Toolkit** | ~$99/mo per domain (25 prompts) | Bundled with a full SEO suite |
| **Peec AI** | mid-tier | Strong multilingual and competitor benchmarking |
| **Profound** | enterprise | Most complete; overkill for us now |

### Paid: internal-linking automation

Ahrefs Site Audit (Link Opportunities), Sitebulb, Linkbot, InLinks.
Most auto-insert tools target WordPress. For a Next.js app, putting the
links in our page templates (Step 3) is better and free.

## 4. How to run it (cadence)

1. **Week 1:** Steps 1–2 shipped. Verify the domain in GSC + Bing WMT and
   submit the sitemap.
2. **Week 2:** Step 3 cross-links + CI link check. Run a Screaming Frog crawl
   and fix orphan or deep pages.
3. **Week 3:** `llms.txt`, JSON-LD, answer-first rewrite of the top 20
   concepts. Publish one original data piece.
4. **Ongoing (monthly):** GSC/Bing review, Ahrefs Webmaster Tools audit,
   a manual or Otterly check of ~20 target prompts (e.g. "best IB interview
   prep tool", "how to answer walk me through a DCF") in ChatGPT, Perplexity
   and Gemini. Track citations and referral traffic.

### Metrics

- Indexed pages (GSC), impressions/clicks for non-brand queries
- Orphan pages = 0, max click depth ≤ 3, broken internal links = 0
- AI referral sessions (Vercel Analytics), citation share on tracked prompts
- Sign-ups from public pages (conversion per landing route)
