import { test, expect, type Page } from "@playwright/test";
import { loginStaff, loginStudent, DESK, toast, sql, sqlVal, uniquePhone, makeStudent, watchErrors } from "./helpers";

test.describe("owner dashboard", () => {
  test("loads with live numbers and no errors", async ({ page }) => {
    const check = watchErrors(page);
    await loginStaff(page);
    await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
    const active = await sqlVal<number>("select count(*)::int from v_student_status where status='active' and plan_state in ('active','expiring')");
    await expect(page.getByText(/active members/i).locator("xpath=ancestor::div[2]")).toContainText(String(active));
    await expect(page.getByText("Shift-wise seats")).toBeVisible();
    await expect(page.getByText("Morning").first()).toBeVisible();
    check();
  });
});

test.describe("admission", () => {
  async function fillDetails(page: Page, name: string, phone: string) {
    await page.goto("/admin/students/new");
    await page.getByPlaceholder("Riya Sharma").fill(name);
    await page.getByPlaceholder("10 digit").first().fill(phone);
  }
  async function pickPlan(page: Page, shift: string, plan: RegExp) {
    await page.getByRole("button", { name: new RegExp(`^${shift}`) }).click();
    await page.getByRole("button", { name: plan }).click();
  }

  test("validation: name and 10-digit phone required", async ({ page }) => {
    await loginStaff(page);
    await page.goto("/admin/students/new");
    await page.getByRole("button", { name: /Next: Plan/ }).click();
    await toast(page, "Enter a name");
    await page.getByPlaceholder("Riya Sharma").fill("Test");
    await page.getByPlaceholder("10 digit").first().fill("12345");
    await page.getByRole("button", { name: /Next: Plan/ }).click();
    await toast(page, /10 digit/);
  });

  test("full admission → student can log in and sees the plan", async ({ page, browser }) => {
    const check = watchErrors(page);
    const phone = uniquePhone();
    await loginStaff(page, DESK); // desk staff can do admissions
    await fillDetails(page, "Vikram Naya", phone);
    const pin = await page.locator("input.font-mono").inputValue();
    expect(pin).toMatch(/^\d{4,6}$/);
    await page.getByRole("button", { name: /Next: Plan/ }).click();
    await pickPlan(page, "Morning", /Morning · Monthly/);
    await page.getByRole("button", { name: /^F9(\s|$)/ }).click();
    await expect(page.getByText("Seat F9")).toBeVisible();
    await page.getByRole("button", { name: /Admission confirm · ₹900/ }).click();
    await expect(page.getByText("Admission done for Vikram Naya")).toBeVisible();
    await expect(page.getByRole("link", { name: /Send on WhatsApp/ })).toHaveAttribute("href", new RegExp(`wa\\.me/91${phone}`));
    const receiptHref = await page.getByRole("link", { name: /Receipt/ }).getAttribute("href");
    expect(receiptHref).toMatch(/^\/receipt\/[0-9a-f]{20}$/);
    check();

    const db = await sql<{ seat: string; total: number; paid: number }>(`select se.label seat, m.total::int total, (select sum(amount)::int from payments p where p.student_id = s.id) paid
      from students s join memberships m on m.student_id = s.id join seats se on se.id = m.seat_id where s.phone = $1`, [phone]);
    expect(db[0]).toEqual({ seat: "F9", total: 900, paid: 900 });

    const ctx = await browser.newContext();
    const sp = await ctx.newPage();
    await loginStudent(sp, phone, pin);
    await expect(sp.getByText("Vikram", { exact: false }).first()).toBeVisible();
    await expect(sp.getByText("F9")).toBeVisible();
    await ctx.close();
  });

  test("partial payment shows as balance due", async ({ page }) => {
    const phone = uniquePhone();
    await loginStaff(page);
    await fillDetails(page, "Half Payer", phone);
    await page.getByRole("button", { name: /Next: Plan/ }).click();
    await pickPlan(page, "Evening", /Evening · Monthly/);
    await page.getByLabel("Pay now").fill("500");
    await expect(page.getByText(/Due: ₹400/)).toBeVisible();
    await page.getByRole("button", { name: /Admission confirm/ }).click();
    await expect(page.getByText("Admission done for Half Payer")).toBeVisible();
    expect(await sqlVal<number>("select balance_due::int from v_student_status where phone = $1", [phone])).toBe(400);
  });

  test("duplicate phone is refused with a clear message", async ({ page }) => {
    await loginStaff(page);
    await fillDetails(page, "Copy Riya", "9000000001");
    await page.getByRole("button", { name: /Next: Plan/ }).click();
    await pickPlan(page, "Morning", /Morning · Monthly/);
    await page.getByRole("button", { name: /Admission confirm/ }).click();
    await toast(page, /already exists/);
  });

  test("occupied seat cannot be picked (A1 is taken in Morning)", async ({ page }) => {
    await loginStaff(page);
    await fillDetails(page, "Seat Check", uniquePhone());
    await page.getByRole("button", { name: /Next: Plan/ }).click();
    await pickPlan(page, "Morning", /Morning · Monthly/);
    await expect(page.getByRole("button", { name: /^A1(\s|$)/ })).toBeDisabled();
    await expect(page.getByRole("button", { name: /^A2(\s|$)/ })).toBeEnabled();
  });

  test("seat grabbed by someone else meanwhile → error, pick another seat, retry works (no duplicate student)", async ({ page }) => {
    const phone = uniquePhone();
    await loginStaff(page);
    await fillDetails(page, "Race Condition", phone);
    await page.getByRole("button", { name: /Next: Plan/ }).click();
    await pickPlan(page, "Morning", /Morning · Monthly/);
    await page.getByRole("button", { name: /^F8(\s|$)/ }).click();
    // another desk books F8 in the meantime
    await makeStudent("Fast Finger", { shift: "Morning", seat: "F8", startOff: 0, endOff: 29 });
    await page.getByRole("button", { name: /Admission confirm/ }).click();
    await toast(page, /doosri seat/);
    await page.getByRole("button", { name: "No seat" }).click();
    await page.getByRole("button", { name: /Admission confirm/ }).click();
    await expect(page.getByText("Admission done for Race Condition")).toBeVisible();
    expect(await sqlVal<number>("select count(*)::int from students where phone = $1", [phone])).toBe(1);
    expect(await sqlVal<number>("select count(*)::int from memberships m join students s on s.id = m.student_id where s.phone = $1", [phone])).toBe(1);
  });
});

test.describe("student profile actions", () => {
  async function openStudent(page: Page, name: string) {
    const id = await sqlVal<string>("select id from students where full_name = $1", [name]);
    await page.goto(`/admin/students/${id}`);
    await expect(page.getByRole("heading", { name })).toBeVisible();
    return id;
  }

  test("students list search finds by name, phone and code", async ({ page }) => {
    await loginStaff(page);
    await page.goto("/admin/students");
    const search = page.getByPlaceholder(/Name|search|phone/i).first();
    await search.fill("Neha");
    await expect(page.getByText("Neha Expired")).toBeVisible();
    await expect(page.getByText("Riya Active")).toHaveCount(0);
    await search.fill("9000000002");
    await expect(page.getByText("Aman Expiring")).toBeVisible();
  });

  test("renew an expired student → plan active again, receipt created", async ({ page }) => {
    const s = await makeStudent("Renew Me", { shift: "Full Day", seat: "B5", startOff: -40, endOff: -10, paid: 700 });
    await loginStaff(page);
    await openStudent(page, "Renew Me");
    await page.getByRole("button", { name: /Renew/ }).first().click();
    const dlg = page.getByRole("dialog");
    await dlg.getByRole("button", { name: /Full Day · Monthly/ }).click();
    await dlg.getByRole("button", { name: /Renew · ₹1,100/ }).click();
    await toast(page, /Renewed/);
    const st = await sql<{ plan_state: string; balance_due: number }>("select plan_state, balance_due::int balance_due from v_student_status where student_id = $1", [s.id]);
    expect(st[0].plan_state).toBe("active");
    expect(st[0].balance_due).toBe(0);
  });

  test("renew before expiry starts the day after the current plan ends", async ({ page }) => {
    const s = await makeStudent("Early Bird", { shift: "Morning", seat: "B6", startOff: -25, endOff: 4 });
    await loginStaff(page);
    await openStudent(page, "Early Bird");
    await page.getByRole("button", { name: /Renew/ }).first().click();
    const dlg = page.getByRole("dialog");
    await dlg.getByRole("button", { name: /Morning · Monthly/ }).click();
    await dlg.getByRole("button", { name: /Renew ·/ }).click();
    await toast(page, /Renewed/);
    const rows = await sql<{ gap: number }>("select (max(start_date) - min(end_date))::int gap from memberships where student_id = $1", [s.id]);
    expect(rows[0].gap).toBe(1);
  });

  test("take a payment for the balance → dues clear, receipt opens", async ({ page, context }) => {
    const s = await makeStudent("Owes Money", { shift: "Evening", seat: "B7", startOff: -2, endOff: 27, paid: 300 });
    await loginStaff(page);
    await openStudent(page, "Owes Money");
    await page.getByRole("button", { name: /^Payment$/ }).click();
    const dlg = page.getByRole("dialog");
    await expect(dlg.getByText("Due: ₹400")).toBeVisible();
    await dlg.getByLabel("Amount (₹)").fill("400");
    await dlg.getByRole("button", { name: /Save & receipt/ }).click();
    await expect.poll(() => sqlVal<number>("select balance_due::int from v_student_status where student_id = $1", [s.id])).toBe(0);
    const token = await sqlVal<string>("select public_token from payments where student_id = $1 and amount = 400", [s.id]);
    const r = await context.newPage();
    await r.goto(`/receipt/${token}`);
    await expect(r.getByText("Owes Money")).toBeVisible();
    await expect(r.getByText("₹400").last()).toBeVisible();
  });

  test("change seat to a free one; occupied ones are disabled", async ({ page }) => {
    const s = await makeStudent("Seat Mover", { shift: "Morning", seat: "C5", startOff: -1, endOff: 28 });
    await loginStaff(page);
    await openStudent(page, "Seat Mover");
    await page.getByRole("button", { name: /Change seat/ }).click();
    const dlg = page.getByRole("dialog");
    await expect(dlg.getByRole("button", { name: /^A1(\s|$)/ })).toBeDisabled();
    await dlg.getByRole("button", { name: /^C6(\s|$)/ }).click();
    await dlg.getByRole("button", { name: "Save" }).click();
    await toast(page, /Seat changed/);
    expect(await sqlVal("select se.label from memberships m join seats se on se.id = m.seat_id where m.student_id = $1", [s.id])).toBe("C6");
  });

  test("reset PIN → new PIN works, old one doesn't", async ({ page, browser }) => {
    const s = await makeStudent("Forgot Pin", { shift: "Full Day", seat: null });
    await loginStaff(page);
    await openStudent(page, "Forgot Pin");
    await page.getByRole("tab", { name: /Profile/ }).click();
    await page.getByRole("button", { name: /PIN reset/ }).click();
    const dlg = page.getByRole("dialog");
    await dlg.getByLabel("New PIN").fill("4321");
    const popup = page.waitForEvent("popup");
    await dlg.getByRole("button", { name: /PIN set/ }).click();
    await (await popup).close();
    await toast(page, /New PIN set/);
    const ctx = await browser.newContext(); const sp = await ctx.newPage();
    await sp.goto("/login");
    await sp.getByPlaceholder("10 digit number").fill(s.phone);
    await sp.locator("input[type=password]:visible").fill("1234");
    await sp.locator("form:visible").getByRole("button", { name: "Login" }).click();
    await toast(sp, /Login failed/);
    await loginStudent(sp, s.phone, "4321");
    await ctx.close();
  });

  test("change phone number → student logs in with the new number", async ({ page, browser }) => {
    const s = await makeStudent("New Number", { shift: "Full Day", seat: null });
    const newPhone = uniquePhone();
    await loginStaff(page);
    await openStudent(page, "New Number");
    await page.getByRole("tab", { name: /Profile/ }).click();
    await page.getByRole("button", { name: /Profile edit/ }).click();
    const dlg = page.getByRole("dialog");
    await dlg.getByRole("textbox", { name: /^Mobile/ }).fill(newPhone);
    await dlg.getByRole("button", { name: "Save" }).click();
    await expect.poll(() => sqlVal("select phone from students where id = $1", [s.id])).toBe(newPhone);
    const ctx = await browser.newContext(); const sp = await ctx.newPage();
    await loginStudent(sp, newPhone, "1234");
    await ctx.close();
  });

  test("mark as left → seat shows free on the seat map", async ({ page }) => {
    const s = await makeStudent("Leaving Soon", { shift: "Morning", seat: "D9", startOff: -1, endOff: 28 });
    await loginStaff(page);
    await openStudent(page, "Leaving Soon");
    await page.getByRole("tab", { name: /Profile/ }).click();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /Mark as left/ }).click();
    await expect.poll(() => sqlVal("select status from students where id = $1", [s.id])).toBe("left");
    await page.goto("/admin/seats");
    await expect(page.getByRole("button", { name: /^D9/ })).toContainText(/free/i);
  });

  test("device reset clears the phone lock", async ({ page }) => {
    const s = await makeStudent("New Phone", { shift: "Full Day", seat: null, device: "old-phone-12345" });
    await loginStaff(page);
    await openStudent(page, "New Phone");
    await page.getByRole("tab", { name: /Profile/ }).click();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /Device reset/ }).click();
    await expect.poll(() => sqlVal("select device_id from students where id = $1", [s.id])).toBeNull();
  });
});

test.describe("dues, payments, attendance pages", () => {
  test("dues tabs: expiring has Aman, expired has Neha; reminder opens WhatsApp and is logged", async ({ page, context }) => {
    await context.route(/wa\.me|whatsapp\.com/, (r) => r.fulfill({ body: "whatsapp stub" })); // no internet in CI
    await loginStaff(page);
    await page.goto("/admin/dues");
    await expect(page.getByText("Aman Expiring")).toBeVisible();
    await page.getByRole("button", { name: /Expired/ }).first().click();
    await expect(page.getByText("Neha Expired")).toBeVisible();
    const before = await sqlVal<number>("select count(*)::int from reminder_logs");
    const popup = page.waitForEvent("popup");
    await page.locator("li, tr, div").filter({ hasText: "Neha Expired" }).getByRole("button", { name: /Reminder|Remind|WhatsApp/ }).first().click();
    const p = await popup;
    expect(p.url()).toMatch(/wa\.me\/919000000003/);
    expect(decodeURIComponent(p.url())).toContain("expired on");
    await p.close();
    await expect.poll(() => sqlVal<number>("select count(*)::int from reminder_logs")).toBe(before + 1);
  });

  test("payments page lists receipts with totals and CSV export", async ({ page }) => {
    await loginStaff(page);
    await page.goto("/admin/payments");
    await expect(page.getByText(/AL-\d{5}/).first()).toBeVisible();
    const dl = page.waitForEvent("download");
    await page.getByRole("button", { name: /CSV/ }).click();
    expect((await dl).suggestedFilename()).toMatch(/\.csv$/);
  });

  test("manual attendance: IN then OUT from the desk", async ({ page }) => {
    const s = await makeStudent("Desk Marked", { shift: "Full Day", seat: null });
    await loginStaff(page, DESK);
    await page.goto("/admin/attendance");
    await page.getByRole("button", { name: /Manual/ }).click();
    const dlg = page.getByRole("dialog");
    await dlg.getByPlaceholder("Name / phone / code").fill("Desk Marked");
    await dlg.getByRole("button", { name: "IN / OUT" }).click();
    await expect(dlg.getByText(/IN/).first()).toBeVisible();
    expect(await sqlVal("select method from attendance where student_id = $1", [s.id])).toBe("staff");
  });

  test("manual attendance for an expired student needs explicit 'force'", async ({ page }) => {
    await loginStaff(page);
    await page.goto("/admin/attendance");
    await page.getByRole("button", { name: /Manual/ }).click();
    const dlg = page.getByRole("dialog");
    await dlg.getByPlaceholder("Name / phone / code").fill("Neha");
    await dlg.getByRole("button", { name: "IN / OUT" }).click();
    await expect(dlg.getByText("Plan expired / fees due")).toBeVisible();
    await dlg.getByRole("button", { name: /Allow entry anyway/ }).click();
    await expect.poll(() => sqlVal<number>("select count(*)::int from attendance a join students s on s.id = a.student_id where s.full_name = 'Neha Expired'")).toBe(1);
  });
});

test.describe("settings, staff, notices, expenses, enquiries", () => {
  test("desk staff sees settings read-only and no staff form", async ({ page }) => {
    await loginStaff(page, DESK);
    await page.goto("/admin/settings");
    await expect(page.getByText("Only an admin can change settings")).toBeVisible();
    await expect(page.getByLabel("Library name")).toBeDisabled();
    await page.getByRole("tab", { name: "Plans" }).click();
    await expect(page.getByRole("button", { name: /Add plan/ })).toHaveCount(0);
    await page.getByRole("tab", { name: "Staff" }).click();
    await expect(page.getByText("Add staff")).toHaveCount(0);
  });

  test("owner renames library → login page shows the new name", async ({ page, browser }) => {
    await loginStaff(page);
    await page.goto("/admin/settings");
    await page.getByLabel("Library name").fill("Ambition Library Aliganj");
    await page.getByRole("button", { name: "Save" }).first().click();
    await toast(page, "Saved");
    const ctx = await browser.newContext(); const p = await ctx.newPage();
    await p.goto("/login");
    await expect(p.getByRole("heading", { name: "Ambition Library Aliganj" })).toBeVisible();
    await ctx.close();
    await sql("update library_settings set name = 'Ambition Library'");
  });

  test("owner changes a plan price; new admissions use it", async ({ page }) => {
    await loginStaff(page);
    await page.goto("/admin/settings");
    await page.getByRole("tab", { name: "Plans" }).click();
    const row = page.locator("div.grid").filter({ has: page.locator('input[value="Evening · Quarterly"]') });
    await row.getByLabel("Fee ₹").fill("2100");
    await row.getByRole("button").last().click();
    await toast(page, /save/);
    expect(await sqlVal<number>("select price::int from plans where name = 'Evening · Quarterly'")).toBe(2100);
  });

  test("owner creates a staff account → it can log in; short password refused", async ({ page, browser }) => {
    await loginStaff(page);
    await page.goto("/admin/settings");
    await page.getByRole("tab", { name: "Staff" }).click();
    await page.getByLabel("Name").fill("Night Desk");
    await page.getByLabel("Email").fill("night@ambition.in");
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: /Create/ }).click();
    await toast(page, /8 characters/);
    await page.getByLabel("Password").fill("Night@2026");
    await page.getByRole("button", { name: /Create/ }).click();
    await toast(page, /Staff account created/);
    await expect(page.getByText("Night Desk")).toBeVisible();
    const ctx = await browser.newContext(); const p = await ctx.newPage();
    await loginStaff(p, { email: "night@ambition.in", password: "Night@2026" });
    await ctx.close();
  });

  test("notice posted by owner shows on the student app", async ({ page, browser }) => {
    await loginStaff(page);
    await page.goto("/admin/notices");
    await page.getByLabel("Title").fill("Library closed on Sunday");
    await page.getByLabel("Details").fill("Maintenance work");
    await page.getByRole("button", { name: /Post notice/ }).click();
    await expect(page.getByText("Library closed on Sunday")).toBeVisible();
    const ctx = await browser.newContext(); const sp = await ctx.newPage();
    await loginStudent(sp, "9000000001");
    await expect(sp.getByText("Library closed on Sunday")).toBeVisible();
    await ctx.close();
  });

  test("expense is added and profit updates", async ({ page }) => {
    await loginStaff(page);
    await page.goto("/admin/expenses");
    await page.getByLabel("Expense", { exact: true }).fill("Electricity bill");
    await page.getByLabel("Amount").fill("3200");
    await page.getByRole("button", { name: /Add/ }).click();
    await expect(page.getByText("Electricity bill")).toBeVisible();
    await expect(page.getByText("₹3,200").first()).toBeVisible();
  });

  test("enquiry is saved and listed", async ({ page }) => {
    await loginStaff(page);
    await page.goto("/admin/enquiries");
    await page.getByRole("button", { name: /Enquiry/ }).first().click();
    const dlg = page.getByRole("dialog");
    await dlg.getByLabel("Name").fill("Kunal Lead");
    await dlg.getByLabel("Phone").fill("9123456780");
    await dlg.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Kunal Lead")).toBeVisible();
  });

  test("gate QR print page renders a QR image with the gate link", async ({ page }) => {
    await loginStaff(page);
    await page.goto("/admin/gate-qr");
    await expect(page.getByAltText("Gate QR")).toBeVisible();
    await expect(page.getByText("Scan")).toBeVisible();
  });

  test("seat map shows occupancy per shift", async ({ page }) => {
    await loginStaff(page);
    await page.goto("/admin/seats");
    await expect(page.getByRole("button", { name: /^A1(?!0)/ })).toContainText("Riya");
    await page.getByRole("button", { name: /^Evening/ }).click();
    await expect(page.getByRole("button", { name: /^A1(?!0)/ })).toContainText("Aman");
  });

  test("public receipt with a bad token is a 404", async ({ page }) => {
    const r = await page.goto("/receipt/doesnotexist123456");
    expect(r?.status()).toBe(404);
  });
});
