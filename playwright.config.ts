import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const env = {
  NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-test-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-test-key",
  NEXT_PUBLIC_STUDENT_EMAIL_DOMAIN: "students.ambition.app",
  NEXT_DIST_DIR: ".next-e2e",
};

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "tests/e2e/report" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    timezoneId: "Asia/Kolkata",
    locale: "en-IN",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH, args: ["--no-sandbox"] } : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile\.spec/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec/ },
  ],
  webServer: [
    { command: "node tests/e2e/supabase-mock.mjs", port: 54321, reuseExistingServer: false, env: { SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY } },
    { command: process.env.E2E_SKIP_BUILD ? `next start -p ${PORT}` : `next build && next start -p ${PORT}`, port: PORT, timeout: 300_000, reuseExistingServer: false, env },
  ],
});
