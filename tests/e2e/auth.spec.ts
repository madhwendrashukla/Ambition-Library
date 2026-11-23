import { test, expect } from "@playwright/test";
import { loginStaff, loginStudent, OWNER, DESK, GATE_KEY, useDevice, atLibrary, toast, sql, watchErrors } from "./helpers";

test.describe("login & access control", () => {
  test("login page shows the library name from the database", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Ambition Library" })).toBeVisible();
    await expect(page.getByText("The right place to study")).toBeVisible();
  });

  test("wrong PIN is rejected and stays on login", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("10 digit number").fill("9000000001");
    await page.locator("input[type=password]:visible").fill("9999");
    await page.locator("form:visible").getByRole("button", { name: "Login" }).click();
    await toast(page, /Login failed/);
    await expect(page).toHaveURL(/\/login/);
  });

  test("unknown phone number is rejected", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("10 digit number").fill("9123456789");
    await page.locator("input[type=password]:visible").fill("1234");
    await page.locator("form:visible").getByRole("button", { name: "Login" }).click();
    await toast(page, /Login failed/);
  });

  test("wrong owner password is rejected", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("tab", { name: /Owner/ }).click();
    await page.locator("input[type=email]").fill(OWNER.email);
    await page.locator("input[type=password]:visible").fill("nope-nope");
    await page.locator("form:visible").getByRole("button", { name: "Login" }).click();
    await toast(page, /Login failed/);
  });

  test("student phone pasted as +91 … still logs in", async ({ page }) => {
    await page.goto("/login");
    const phone = page.getByPlaceholder("10 digit number");
    await phone.click();
    await page.evaluate(() => navigator.clipboard?.writeText?.("+91 90000 00001").catch(() => {}));
    await phone.fill("+91 90000 00001");
    await expect(phone).toHaveValue("9000000001");
    await page.locator("input[type=password]:visible").fill("1234");
    await page.locator("form:visible").getByRole("button", { name: "Login" }).click();
    await page.waitForURL(/\/app/);
  });

  test("student lands on /app and cannot open /admin", async ({ page }) => {
    const check = watchErrors(page);
    await loginStudent(page, "9000000001");
    await expect(page.getByText("Riya", { exact: false }).first()).toBeVisible();
    await page.goto("/admin/students");
    await expect(page).toHaveURL(/\/app$/);
    check();
  });

  test("owner lands on /admin and /app redirects back to /admin", async ({ page }) => {
    await loginStaff(page);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("logged-out deep link → login → back to the same page", async ({ page }) => {
    await page.goto("/admin/payments");
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fpayments/);
    await page.getByRole("tab", { name: /Owner/ }).click();
    await page.locator("input[type=email]").fill(OWNER.email);
    await page.locator("input[type=password]:visible").fill(OWNER.password);
    await page.locator("form:visible").getByRole("button", { name: "Login" }).click();
    await page.waitForURL(/\/admin\/payments/);
  });

  test("gate QR opened with phone camera while logged out → login → attendance marked", async ({ page, context }) => {
    const [s] = await sql<{ phone: string }>("select phone from students where full_name = 'Pooja Desk'");
    await useDevice(context, "pooja-phone-0001");
    await atLibrary(context);
    await page.goto(`/app/scan?k=${GATE_KEY}`);
    await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fscan%3Fk%3D/);
    await page.getByPlaceholder("10 digit number").fill(s.phone);
    await page.locator("input[type=password]:visible").fill("1234");
    await page.locator("form:visible").getByRole("button", { name: "Login" }).click();
    await expect(page.getByText(/Welcome, Pooja/)).toBeVisible();
  });

  test("account without a profile does not loop between /admin and /app", async ({ page }) => {
    await sql("insert into auth.users (email) values ('ghost@ambition.in') on conflict do nothing");
    await sql("insert into auth.passwords values ('ghost@ambition.in', 'Ghost@123') on conflict do nothing");
    await page.goto("/login");
    await page.getByRole("tab", { name: /Owner/ }).click();
    await page.locator("input[type=email]").fill("ghost@ambition.in");
    await page.locator("input[type=password]:visible").fill("Ghost@123");
    await page.locator("form:visible").getByRole("button", { name: "Login" }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
    await toast(page, /setup adhoora/);
  });

  test("logout (owner and student)", async ({ page }) => {
    await loginStaff(page, DESK);
    await page.getByRole("button", { name: /Logout/ }).first().click();
    await page.waitForURL(/\/login/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
    await loginStudent(page, "9000000001");
    await page.goto("/app/profile");
    await page.getByRole("button", { name: /Logout/ }).click();
    await page.waitForURL(/\/login/);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login/);
  });
});
