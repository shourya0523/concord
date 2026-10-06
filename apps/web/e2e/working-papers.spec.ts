/**
 * Working Papers end to end (DESIGN.md §16): the daily morning pack, the
 * ceremony budget (FILED stamp, tally mark, business card), the drill
 * session sheet, the tombstone shelf, league tables and the weekly recap —
 * against the real app in stub mode.
 */
import { expect, test, type Page } from "@playwright/test"

const LADDER = /Intern|Analyst I{1,3}|Associate I{1,3}|Vice President|Director|Managing Director/

const ANSWER =
  "Lead with the answer: net income falls by the after-tax amount, cash from operations adds back the " +
  "non-cash depreciation, so cash rises by the tax shield. Enterprise value discounts unlevered free " +
  "cash flow at WACC."

function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on("pageerror", (err) => errors.push(err.message))
  page.on("console", (msg) => {
    if (msg.type() !== "error") return
    const text = msg.text()
    // Stub mode answers some optional endpoints with 503 by design.
    if (/Failed to load resource/.test(text)) return
    errors.push(text)
  })
  return errors
}

test.describe.configure({ mode: "serial" })

test("morning pack: answer every card, the pack is stamped FILED", async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto("/today")
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible()

  const start = page.getByRole("button", { name: /start today's set|continue today's set/i })
  await expect(start).toBeVisible()
  await start.click()

  for (let step = 0; step < 20; step += 1) {
    if (await page.getByTestId("morning-pack-filed").isVisible()) break
    const textarea = page.locator("textarea")
    const drillInput = page.locator("input[name=drill-answer]")
    const next = page.getByRole("button", { name: /next card|finish set/i })
    await expect(textarea.or(drillInput).or(page.getByTestId("morning-pack-filed")).first()).toBeVisible()
    if (await page.getByTestId("morning-pack-filed").isVisible()) break

    if (await textarea.isVisible()) {
      // Question cards sit on index-card stock.
      await expect(page.locator('[data-paper-stock="index"]').first()).toBeVisible()
      await textarea.fill(ANSWER)
      await page.getByRole("button", { name: "Submit answer" }).click()
    } else {
      // Numeric drills sit on the ledger pad.
      await expect(page.locator('[data-paper-stock="ledger"]').first()).toBeVisible()
      await drillInput.fill("10")
      await page.getByRole("button", { name: /check answer/i }).click()
    }
    await expect(next).toBeVisible({ timeout: 60_000 })
    await expect(page.getByTestId("activity-margin").first()).toBeVisible()
    await next.click()
  }

  await expect(page.getByTestId("morning-pack-filed")).toBeVisible()
  await expect(page.getByTestId("filed-stamp").first()).toBeVisible()
  // Routine wins never fire the paper burst; only a level-up memo may.
  await expect(page.getByTestId("promotion-memo")).toHaveCount(0)
  expect(errors).toEqual([])
})

test("today shows the tally calendar and the business card", async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto("/today")
  const calendar = page.getByTestId("tally-calendar")
  await expect(calendar).toBeVisible()
  await expect(page.getByTestId("streak-current")).toHaveText(/^[1-9]\d*$/)
  // One ink stroke per goal day; today's mark is labelled.
  await expect(calendar.locator('path[data-mark="goal"]').first()).toBeVisible()
  await expect(calendar.getByText("today")).toBeVisible()

  await expect(page.getByTestId("business-card")).toBeVisible()
  await expect(page.getByTestId("career-title")).toHaveText(LADDER)
  await expect(page.getByTestId("filed-stamp")).toBeVisible()
  expect(errors).toEqual([])
})

test("five drills close on a session sheet", async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto("/drills")
  await page.getByRole("button", { name: "Mixed drill" }).click()
  for (let i = 0; i < 5; i += 1) {
    const input = page.locator("input[name=drill-answer]")
    await expect(input).toBeVisible()
    await expect(page.locator('[data-paper-stock="ledger"]').first()).toBeVisible()
    await input.fill(String(100 + i))
    await page.getByRole("button", { name: /check answer/i }).click()
    if (i < 4) {
      await expect(page.getByTestId("drill-result")).toBeVisible()
      await page.getByRole("button", { name: /next drill/i }).click()
    }
  }
  const sheet = page.getByTestId("drill-session-summary")
  await expect(sheet).toBeVisible()
  await expect(sheet).toContainText("5 drills")
  await sheet.getByRole("button", { name: "Another five" }).click()
  await expect(sheet).toHaveCount(0)
  await expect(page.locator("input[name=drill-answer]")).toBeVisible()
  expect(errors).toEqual([])
})

test("the shelf shows closed tombstones and pencil outlines with distance left", async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto("/achievements")
  await expect(page.getByRole("heading", { name: "The shelf" })).toBeVisible()
  await expect(page.getByTestId("tombstone").first()).toBeVisible()
  await expect(page.getByTestId("tombstone").first()).toContainText("matter of record only")
  const locked = page.getByTestId("tombstone-locked")
  await expect(locked.first()).toBeVisible()
  await expect(locked.filter({ hasText: /to go|proficient/ }).first()).toBeVisible()
  expect(errors).toEqual([])
})

test("progress carries the weekly recap and the career title", async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto("/progress")
  const recap = page.getByTestId("weekly-recap")
  await expect(recap).toBeVisible({ timeout: 60_000 })
  await expect(recap.getByText("Goal days")).toBeVisible()
  await expect(recap.getByLabel(/goal met/).first()).toBeVisible()
  await expect(page.getByTestId("progress-career-title")).toHaveText(LADDER)
  expect(errors).toEqual([])
})

test("joining a league places you in a tier on the league table", async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto("/leagues")
  const join = page.getByRole("button", { name: /join the league/i })
  const tier = page.getByTestId("league-tier")
  await expect(join.or(tier)).toBeVisible()
  if (await join.isVisible()) await join.click()
  await expect(tier).toHaveText("Boutique")
  await expect(page.getByRole("list", { name: "League tiers" })).toContainText("Elite Boutique")
  await expect(page.getByText("(you)")).toBeVisible()
  expect(errors).toEqual([])
})
