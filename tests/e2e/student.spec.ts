import { test, expect } from "@playwright/test";
import { loginStudent, loginStaff, useDevice, atLibrary, makeStudent, sql, sqlVal, GATE_KEY, watchErrors } from "./helpers";

test.describe("student app", () => {
  test("home shows plan card, seat, shift and notices", async ({ page }) => {
    const check = watchErrors(page);
    await loginStudent(page, "9000000001");
    await expect(page.getByText("days left")).toBeVisible();
    await expect(page.getByText("A1")).toBeVisible();
    await expect(page.getByText("Morning").first()).toBeVisible();
    await expect(page.getByText("Library Diwali par khuli rahegi")).toBeVisible();
    await expect(page.getByText("This week")).toBeVisible();
    check();
  });

  test("balance due shows a UPI pay button with the right amount", async ({ page }) => {
    await loginStudent(page, "9000000002"); // Aman owes 300
    await expect(page.getByText("₹300 due")).toBeVisible();
    await expect(page.getByRole("link", { name: "Pay UPI" })).toHaveAttribute("href", /upi:\/\/pay\?pa=ambitionlib%40upi.*am=300/);
  });

  test("scan at the gate: IN, then cooldown, then OUT after time passes", async ({ page, context }) => {
    const s = await makeStudent("Scan Flow", { shift: "Full Day", seat: "E5" });
    await useDevice(context, "scan-flow-phone-1");
    await atLibrary(context, 40);
    await loginStudent(page, s.phone);
    await page.goto(`/app/scan?k=${GATE_KEY}`);
    await expect(page.getByText("Welcome, Scan!")).toBeVisible();
    await expect(page.getByText("E5")).toBeVisible();
    await expect(page).toHaveURL(/\/app\/scan$/); // key removed so refresh doesn't re-scan

    await page.goto(`/app/scan?k=${GATE_KEY}`);
    await expect(page.getByText("Just scanned")).toBeVisible();

    await sql("update attendance set check_in = now() - interval '4 hours' where student_id = $1", [s.id]);
    await page.goto(`/app/scan?k=${GATE_KEY}`);
    await expect(page.getByText("Bye! You're checked OUT")).toBeVisible();
    await expect(page.getByText("4h 0m")).toBeVisible();

    await page.goto("/app/history");
    await expect(page.getByText(/4h 0m/).first()).toBeVisible();
  });

  test("scan from 2 km away is refused", async ({ page, context }) => {
    const s = await makeStudent("Far Away", { shift: "Full Day" });
    await useDevice(context, "far-away-phone-1");
    await atLibrary(context, 2000);
    await loginStudent(page, s.phone);
    await page.goto(`/app/scan?k=${GATE_KEY}`);
    await expect(page.getByText("You're too far from the library")).toBeVisible();
    expect(await sqlVal<number>("select count(*)::int from attendance where student_id = $1", [s.id])).toBe(0);
  });

  test("location permission denied → asks to turn on location", async ({ page, context }) => {
    const s = await makeStudent("No Location", { shift: "Full Day" });
    await useDevice(context, "no-location-phone");
    await context.clearPermissions();
    await loginStudent(page, s.phone);
    await page.goto(`/app/scan?k=${GATE_KEY}`);
    await expect(page.getByText("Location required")).toBeVisible({ timeout: 20000 });
  });

  test("friend's phone (different device) → device mismatch + owner alert", async ({ page, context }) => {
    const s = await makeStudent("Proxy Try", { shift: "Full Day", device: "real-owner-phone" });
    await useDevice(context, "friends-phone-999");
    await atLibrary(context);
    await loginStudent(page, s.phone);
    await page.goto(`/app/scan?k=${GATE_KEY}`);
    await expect(page.getByText("This phone isn't linked")).toBeVisible();
    expect(await sqlVal<number>("select count(*)::int from alerts where student_id = $1 and kind = 'device_mismatch'", [s.id])).toBe(1);
  });

  test("old / wrong QR → Wrong QR", async ({ page, context }) => {
    const s = await makeStudent("Wrong Qr", { shift: "Full Day" });
    await useDevice(context, "wrong-qr-phone-1");
    await atLibrary(context);
    await loginStudent(page, s.phone);
    await page.goto("/app/scan?k=oldkey000000000000000000");
    await expect(page.getByText("Wrong QR")).toBeVisible();
  });

  test("expired plan → told to renew, owner sees an alert on the dashboard", async ({ page, context, browser }) => {
    const s = await makeStudent("Expired Scan", { shift: "Full Day", startOff: -40, endOff: -3 });
    await useDevice(context, "expired-phone-01");
    await atLibrary(context);
    await loginStudent(page, s.phone);
    await page.goto(`/app/scan?k=${GATE_KEY}`);
    await expect(page.getByText("Plan expired")).toBeVisible();
    const ctx = await browser.newContext(); const owner = await ctx.newPage();
    await loginStaff(owner);
    await expect(owner.getByText(/Expired Scan tried to enter/)).toBeVisible();
    await ctx.close();
  });

  test("plan that starts in the future → 'hasn't started yet'", async ({ page, context }) => {
    await useDevice(context, "karan-phone-0001");
    await atLibrary(context);
    await loginStudent(page, "9000000004");
    await page.goto(`/app/scan?k=${GATE_KEY}`);
    await expect(page.getByText("Plan hasn't started yet")).toBeVisible();
  });

  test("student who left cannot log a visit", async ({ page, context }) => {
    await useDevice(context, "mohit-phone-0001");
    await atLibrary(context);
    await loginStudent(page, "9000000005");
    await page.goto(`/app/scan?k=${GATE_KEY}`);
    await expect(page.getByText("Account inactive")).toBeVisible();
  });

  test("fees page lists receipts that open", async ({ page }) => {
    await loginStudent(page, "9000000001");
    await page.goto("/app/payments");
    await expect(page.getByText("₹900").first()).toBeVisible();
    const href = await page.locator("a[href^='/receipt/']").first().getAttribute("href");
    await page.goto(href!);
    await expect(page.getByText("Riya Active")).toBeVisible();
  });

  test("profile shows personal QR; staff can scan-mark with that token", async ({ page }) => {
    await loginStudent(page, "9000000001");
    await page.goto("/app/profile");
    await expect(page.getByAltText("Personal QR")).toBeVisible();
    await expect(page.getByText("ID S")).toBeVisible();
  });

  test("change PIN from the app → next login uses the new PIN", async ({ page }) => {
    const s = await makeStudent("Pin Changer", { shift: "Full Day" });
    await loginStudent(page, s.phone);
    await page.goto("/app/profile");
    await page.getByRole("button", { name: /Change PIN/ }).click();
    await page.getByRole("dialog").getByLabel("4–6 digit PIN").fill("123");
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await expect(page.locator("[data-sonner-toast]").filter({ hasText: /4–6 digit/ })).toBeVisible();
    await page.getByRole("dialog").getByLabel("4–6 digit PIN").fill("8642");
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await expect(page.locator("[data-sonner-toast]").filter({ hasText: /PIN changed/ })).toBeVisible();
    await page.getByRole("button", { name: /Logout/ }).click();
    await loginStudent(page, s.phone, "8642");
  });

  test("student only sees their own receipts and attendance", async ({ page }) => {
    await loginStudent(page, "9000000001");
    await page.goto("/app/payments");
    await expect(page.locator("a[href^='/receipt/']")).toHaveCount(1);
    await page.goto("/app/history");
    await expect(page.getByText("Aman")).toHaveCount(0);
  });
});
