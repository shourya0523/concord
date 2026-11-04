/**
 * schema.org JSON-LD builders for public pages (SEO plan step 4). Rendered
 * with <JsonLd> (components/guide/guide-ui.tsx). Absolute URLs come from
 * appBaseUrl(), the same origin as canonicals and the sitemap.
 */
import { appBaseUrl } from "@/lib/notify/config"

const SITE_NAME = "Concord"
const SITE_DESCRIPTION =
  "Interview prep for investment banking and private equity: what each firm asks, graded answers and technical drills."

const abs = (path: string, base = appBaseUrl()) => `${base}${path}`

export function organizationLd(base = appBaseUrl()) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${base}/#organization`,
    name: SITE_NAME,
    url: abs("/", base),
    logo: abs("/icon.png", base),
    description: SITE_DESCRIPTION,
  }
}

export function websiteLd(base = appBaseUrl()) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${base}/#website`,
    name: SITE_NAME,
    url: abs("/", base),
    description: SITE_DESCRIPTION,
    publisher: { "@id": `${base}/#organization` },
    inLanguage: "en",
  }
}

export function learningResourceLd(options: {
  name: string
  description: string | null
  path: string
  course: { name: string; path: string } | null
  base?: string
}) {
  const base = options.base ?? appBaseUrl()
  return {
    "@context": "https://schema.org",
    "@type": "LearningResource",
    name: options.name,
    ...(options.description ? { description: options.description } : {}),
    url: abs(options.path, base),
    learningResourceType: "Lesson",
    educationalUse: "Interview preparation",
    teaches: options.name,
    inLanguage: "en",
    isAccessibleForFree: true,
    publisher: { "@id": `${base}/#organization` },
    ...(options.course
      ? { isPartOf: { "@type": "Course", name: options.course.name, url: abs(options.course.path, base) } }
      : {}),
  }
}

export function courseLd(options: {
  name: string
  description: string
  path: string
  minutes: number
  base?: string
}) {
  const base = options.base ?? appBaseUrl()
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    name: options.name,
    description: options.description,
    url: abs(options.path, base),
    inLanguage: "en",
    isAccessibleForFree: true,
    timeRequired: `PT${options.minutes}M`,
    provider: { "@type": "Organization", name: SITE_NAME, url: abs("/", base) },
  }
}

/** Dataset markup for the topic-frequency research page. */
export function datasetLd(options: { name: string; description: string; path: string; base?: string }) {
  const base = options.base ?? appBaseUrl()
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: options.name,
    description: options.description,
    url: abs(options.path, base),
    creator: { "@type": "Organization", name: SITE_NAME, url: abs("/", base) },
    isAccessibleForFree: true,
  }
}
