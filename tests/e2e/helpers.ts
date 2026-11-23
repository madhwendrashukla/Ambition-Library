import { expect, type Page, type BrowserContext } from "@playwright/test";
import pg from "pg";

pg.types.setTypeParser(1082, (v) => v);
const base = process.env.TEST_PG_BASE ?? "postgresql://postgres@localhost:54322";
const q = process.env.TEST_PG_QUERY ?? "?host=/tmp";
const pool = new pg.Pool({ connectionString: `${base}/al_e2e${q}`, max: 2 });
/** direct DB access (as owner) for arranging data and checking results */
export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
  return (await pool.query(text, params)).rows as T[];
}
export async function sqlVal<T = unknown>(text: string, params: unknown[] = []) {
  const r = await sql(text, params);
  return (r[0] ? Object.values(r[0])[0] : undefined) as T;
}

export const GATE_KEY = "e2egatekey00000000000000";
export const LIB = { lat: 26.889, lng: 80.942 };
export const OWNER = { email: "owner@ambition.in", password: "Owner@123" };
export const DESK = { email: "desk@ambition.in", password: "Desk@1234" };

export async function loginStaff(page: Page, who = OWNER, next?: string) {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  await page.getByRole("tab", { name: /Owner/ }).click();
  await page.locator("input[type=email]").fill(who.email);
  await page.locator("input[type=password]:visible").fill(who.password);
  await page.locator("form:visible").getByRole("button", { name: "Login" }).click();
  await page.waitForURL(/\/admin/);
}
export async function loginStudent(page: Page, phone: string, pin = "1234") {
  await page.goto("/login");
  await page.getByPlaceholder("10 digit number").fill(phone);
  await page.locator("input[type=password]:visible").fill(pin);
  await page.locator("form:visible").getByRole("button", { name: "Login" }).click();
  await page.waitForURL(/\/app/);
}
/** pretend the student's phone has this device id (normally generated once and kept in the browser) */
export async function useDevice(ctx: BrowserContext, id: string) {
  await ctx.addInitScript((d) => localStorage.setItem("al_device_id", d), id);
}
export async function atLibrary(ctx: BrowserContext, metersNorth = 0) {
  await ctx.grantPermissions(["geolocation"]);
  await ctx.setGeolocation({ latitude: LIB.lat + metersNorth / 111195, longitude: LIB.lng });
}
export async function toast(page: Page, text: string | RegExp) {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible();
}
let seq = 0;
export function uniquePhone() {
  return "8" + String(Date.now() % 1e8).padStart(8, "0") + String(seq++ % 10);
}
/** create a ready-to-use student directly in the DB (PIN 1234) */
export async function makeStudent(name: string, opts: { shift?: string; seat?: string | null; startOff?: number; endOff?: number; device?: string | null; paid?: number } = {}) {
  const phone = uniquePhone();
  const [u] = await sql<{ id: string }>("insert into auth.users (email) values ($1) returning id", [`${phone}@students.ambition.app`]);
  await sql("insert into auth.passwords values ($1, 'al#1234#pin')", [`${phone}@students.ambition.app`]);
  await sql("insert into profiles (id, role, full_name) values ($1, 'student', $2)", [u.id, name]);
  const [s] = await sql<{ id: string; qr_token: string; code: string }>("insert into students (user_id, full_name, phone, device_id) values ($1, $2, $3, $4) returning id, qr_token, code", [u.id, name, phone, opts.device ?? null]);
  if (opts.shift !== undefined || opts.seat !== undefined || opts.endOff !== undefined) {
    const [m] = await sql<{ id: string }>(`insert into memberships (student_id, shift_id, seat_id, start_date, end_date, fee, plan_id)
      values ($1, (select id from shifts where name = $2), (select id from seats where label = $3), today_local() + $4::int, today_local() + $5::int, 700,
              (select id from plans where shift_id = (select id from shifts where name = $2) and duration_days = 30)) returning id`,
      [s.id, opts.shift ?? "Full Day", opts.seat ?? null, opts.startOff ?? -2, opts.endOff ?? 27]);
    if (opts.paid) await sql("insert into payments (student_id, membership_id, amount) values ($1, $2, $3)", [s.id, m.id, opts.paid]);
  }
  return { ...s, phone, user_id: u.id };
}
/** fail the test on any uncaught error in the page */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return () => expect(errors, "uncaught page errors").toEqual([]);
}
