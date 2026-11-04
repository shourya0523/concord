/**
 * Login gate (DESIGN.md §17), against a server with Neon Auth configured and
 * no session: the landing page and auth pages are public, every other page
 * redirects to sign-in with the way back, and APIs answer 401 JSON.
 */
import { expect, test } from "@playwright/test"

test("the landing page and auth pages stay public", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { level: 1 })).toContainText("You have Concord.")
  await page.goto("/sign-up")
  await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible()
  const health = await page.request.get("/api/health")
  expect(health.status()).toBeLessThan(500)
  expect(health.status()).not.toBe(401)
})

test("the guide, robots.txt and sitemap are public for crawlers", async ({ page, request }) => {
  await page.goto("/guide")
  await expect(page).toHaveURL(/\/guide$/)
  await expect(page.getByRole("heading", { level: 1 })).toContainText("interview guides")
  await page.getByRole("link", { name: "DCF and WACC" }).first().click()
  await expect(page).toHaveURL(/\/guide\/concepts\//)
  await expect(page.getByRole("heading", { level: 1 })).toContainText("DCF")

  const robots = await request.get("/robots.txt", { maxRedirects: 0 })
  expect(robots.status()).toBe(200)
  expect(await robots.text()).toContain("Sitemap:")
  const sitemap = await request.get("/sitemap.xml", { maxRedirects: 0 })
  expect(sitemap.status()).toBe(200)
  expect(await sitemap.text()).toContain("/guide/concepts/")

  const llms = await request.get("/llms.txt", { maxRedirects: 0 })
  expect(llms.status()).toBe(200)
  const llmsText = await llms.text()
  expect(llmsText.startsWith("# Concord")).toBe(true)
  expect(llmsText).toContain("/guide/research/most-asked-interview-topics")
})

test("guide pages lead with lesson answers and carry structured data", async ({ page }) => {
  await page.goto("/guide/concepts/dcf-wacc")
  await expect(page.getByRole("heading", { name: "How to answer in an interview" }).first()).toBeVisible()
  const types = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((nodes) => nodes.map((node) => JSON.parse(node.textContent ?? "{}")["@type"]))
  expect(types).toEqual(expect.arrayContaining(["BreadcrumbList", "LearningResource"]))

  await page.goto("/guide/research/most-asked-interview-topics")
  await expect(page.getByRole("heading", { level: 1 })).toContainText("most-asked")
  await expect(page.getByRole("table").first()).toBeVisible()
})

test("signed-out visitors are sent to sign-in and remembered", async ({ page }) => {
  for (const path of ["/today", "/companies", "/prep/heat", "/achievements"]) {
    await page.goto(path)
    await expect(page).toHaveURL(new RegExp(`/sign-in\\?next=${encodeURIComponent(path)}$`))
  }
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible()
  // Switching to sign-up keeps the way back.
  await expect(page.getByRole("link", { name: "Create an account" })).toHaveAttribute(
    "href",
    "/sign-up?next=%2Fachievements",
  )
})

test("deep links keep their query string", async ({ page }) => {
  await page.goto("/drills?kind=mixed")
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fdrills%3Fkind%3Dmixed$/)
})

test("signed-out API calls get a JSON 401", async ({ request }) => {
  for (const path of ["/api/today", "/api/profile", "/api/prep/heat"]) {
    const res = await request.get(path, { maxRedirects: 0 })
    expect(res.status(), path).toBe(401)
    expect((await res.json()).error.code).toBe("unauthorized")
  }
})

test("a hostile next is ignored", async ({ page }) => {
  await page.goto("/sign-in?next=//evil.example/steal")
  await expect(page.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/sign-up")
})

test("share cards and icons reach signed-out crawlers", async ({ page, request }) => {
  await page.goto("/")
  const meta = (selector: string) => page.locator(selector).first().getAttribute("content")
  expect(await meta('meta[property="og:title"]')).toContain("You have Concord.")
  expect(await meta('meta[name="twitter:card"]')).toBe("summary_large_image")
  const ogImage = await meta('meta[property="og:image"]')
  expect(ogImage).toBeTruthy()
  const icons = await page.locator('link[rel="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]').evaluateAll(
    (links) => links.map((link) => (link as HTMLLinkElement).href),
  )
  expect(icons.length).toBeGreaterThanOrEqual(3)
  for (const url of [ogImage!, ...icons]) {
    const res = await request.get(new URL(url).pathname + new URL(url).search, { maxRedirects: 0 })
    expect(res.status(), url).toBe(200)
  }
})
