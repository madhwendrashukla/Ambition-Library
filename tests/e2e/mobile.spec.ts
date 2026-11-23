import { test, expect, type Page } from "@playwright/test";
import { loginStaff, loginStudent, watchErrors } from "./helpers";

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `page is ${overflow}px wider than the screen`).toBeLessThanOrEqual(1);
}

test.describe("mobile layout (Pixel 7)", () => {
  for (const path of ["/app", "/app/history", "/app/payments", "/app/profile", "/app/scan"]) {
    test(`student ${path} fits the screen`, async ({ page }) => {
      const check = watchErrors(page);
      await loginStudent(page, "9000000001");
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await noHorizontalScroll(page);
      await expect(page.getByRole("link", { name: "Scan", exact: true })).toBeVisible();
      check();
    });
  }
  for (const path of ["/admin", "/admin/students", "/admin/students/new", "/admin/seats", "/admin/dues", "/admin/attendance", "/admin/payments", "/admin/settings"]) {
    test(`owner ${path} fits the screen`, async ({ page }) => {
      const check = watchErrors(page);
      await loginStaff(page);
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await noHorizontalScroll(page);
      check();
    });
  }
  test("owner mobile menu opens and navigates", async ({ page }) => {
    await loginStaff(page);
    await page.getByRole("link", { name: "Dues" }).last().click();
    await expect(page).toHaveURL(/\/admin\/dues/);
  });
  test("login page fits the screen", async ({ page }) => {
    await page.goto("/login");
    await noHorizontalScroll(page);
  });
});
