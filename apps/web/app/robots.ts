import type { MetadataRoute } from "next"

import { appBaseUrl } from "@/lib/notify/config"

/**
 * Crawl policy (docs/research/seo-geo-plan.md). Public content is "/" and
 * "/guide/*"; the rest of the app is behind login and redirects to sign-in,
 * so crawlers are kept off it. AI search crawlers (OAI-SearchBot,
 * PerplexityBot, ClaudeBot, …) fall under "*" so Concord can be cited.
 */
export default function robots(): MetadataRoute.Robots {
  const base = appBaseUrl()
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin", "/mockups", "/ds", "/auth/", "/sign-in", "/sign-up"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  }
}
