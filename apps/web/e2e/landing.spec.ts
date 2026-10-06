/**
 * Landing (DESIGN.md §17): the hero line and its call to action, the scroll
 * stage down to the boarding pass, tearing the stub into sign-up, and the
 * still frames served to reduced-motion visitors.
 */
import { expect, test, type Page } from "@playwright/test"

function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on("pageerror", (err) => errors.push(err.message))
  page.on("console", (msg) => {
    if (msg.type() === "error" && !/Failed to load resource/.test(msg.text())) errors.push(msg.text())
  })
  return errors
}

test("hero says what Concord is and offers a way in", async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto("/")
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/CS has LeetCode\.\s*You have Concord\./)
  await expect(page.getByTestId("landing-stage")).toBeVisible()

  const header = page.getByRole("banner")
  await expect(header.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in")
  await expect(header.getByRole("link", { name: "Start prepping" })).toHaveAttribute("href", "/sign-up")
  await expect(page.getByRole("main").getByRole("link", { name: "Start prepping" }).first()).toBeVisible()
  expect(errors).toEqual([])
})

test("scrolling folds the card into a plane and lands on the boarding pass", async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto("/")
  const stage = page.getByTestId("landing-stage")
  const fold = () => stage.evaluate((el) => Number(getComputedStyle(el).getPropertyValue("--fold") || 0))
  expect(await fold()).toBe(0)

  // Halfway through the fold scene.
  await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>("[data-testid=landing-stage]")!
    window.scrollTo(0, (el.offsetHeight - window.innerHeight) * 0.16)
  })
  await expect.poll(fold).toBeGreaterThan(0.3)

  const pass = page.getByTestId("boarding-pass")
  await pass.scrollIntoViewIfNeeded()
  await expect(page.getByRole("heading", { name: "Would love to have you on board!" })).toBeVisible()
  await pass.getByRole("link", { name: "Start prepping" }).click()
  await expect(page).toHaveURL(/\/sign-up/)
  expect(errors).toEqual([])
})

test.describe("reduced motion", () => {
  test("shows the same scenes as still frames", async ({ page }) => {
    const errors = watchErrors(page)
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.goto("/")
    await expect(page.getByRole("heading", { level: 1 })).toContainText("You have Concord.")
    await expect(page.getByTestId("landing-stage")).toHaveCount(0)
    for (const line of ["See what each firm actually asks.", "Get every answer graded.", "Drill the math until it's automatic."]) {
      await expect(page.getByText(line)).toBeVisible()
    }
    await expect(page.getByText("It only takes about 12 minutes a day.")).toBeVisible()
    await expect(page.getByTestId("boarding-pass")).toBeVisible()
    expect(errors).toEqual([])
  })
})
