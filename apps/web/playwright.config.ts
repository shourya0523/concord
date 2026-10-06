/* eslint-disable turbo/no-undeclared-env-vars -- e2e harness, never a build input */
import { defineConfig, devices } from "@playwright/test"

/**
 * End-to-end tests run the real app in stub mode (no DATABASE_URL, no Neon
 * Auth → in-memory store, `dev_stub_user`). One worker: the in-memory store
 * is shared by every test, so they run in order.
 *
 *   npm run build -w @ibpe/web && npm run e2e -w @ibpe/web
 *
 * E2E_BASE_URL points at an already-running server instead of starting one.
 * PLAYWRIGHT_CHROMIUM_EXECUTABLE uses a preinstalled Chromium.
 */
const PORT = Number(process.env.E2E_PORT ?? 3210)
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 1000 },
    launchOptions: executablePath ? { executablePath } : {},
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next start -p ${PORT}`,
        url: `${baseURL}/today`,
        timeout: 180_000,
        reuseExistingServer: !process.env.CI,
        env: { DATABASE_URL: "", NEON_AUTH_BASE_URL: "" },
      },
})
