// Captures every screen of the app for the client demo, using the real app + real data.
//   (dev server running on :3000)   node scripts/demo/capture.mjs
// Sign-in uses one-time sessions minted with the service key (no passwords typed).
// Output: demo/screens/*.png
import { mkdirSync, rmSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { chromium } from "@playwright/test";

process.loadEnvFile(".env.local");
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DOMAIN = process.env.NEXT_PUBLIC_STUDENT_EMAIL_DOMAIN || "students.ambition.app";
const APP = process.env.DEMO_APP_URL || "http://localhost:3000";
const OUT = "demo/screens";
const ADMIN_EMAIL = process.argv[2];
if (!ADMIN_EMAIL) { console.error("usage: node scripts/demo/capture.mjs <admin email>"); process.exit(1); }
const db = createClient(URL_, SVC, { auth: { persistSession: false } });
const NEW_STUDENT = { name: "Riya Sharma", phone: "9876501234", exam: "UPSC CSE" };

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

/** one-time login for an existing user → auth cookies in the same format the app uses */
async function sessionCookies(email) {
  const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error(`generateLink ${email}: ${error.message}`);
  const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data: v, error: ve } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: data.properties.hashed_token });
  if (ve) throw new Error(`verifyOtp ${email}: ${ve.message}`);
  const jar = [];
  const ssr = createServerClient(URL_, ANON, { cookies: { getAll: () => [], setAll: (c) => jar.push(...c) } });
  await ssr.auth.setSession({ access_token: v.session.access_token, refresh_token: v.session.refresh_token });
  const host = new URL(APP).hostname;
  return jar.filter((c) => c.value).map((c) => ({ name: c.name, value: c.value, domain: host, path: "/", sameSite: "Lax" }));
}

const browser = await chromium.launch({
  channel: "chrome", headless: true,
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});
const HIDE = "nextjs-portal, [data-nextjs-toast], #__next-build-watcher { display: none !important; } [data-sonner-toaster] { --offset: 24px; }";

async function ctx(kind, email) {
  const mobile = kind === "mobile";
  const c = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: mobile ? 3 : 1.5, isMobile: mobile, hasTouch: mobile,
    permissions: ["geolocation", "camera"], geolocation: { latitude: 26.8930, longitude: 80.9460 },
    locale: "en-IN", timezoneId: "Asia/Kolkata",
  });
  if (email) await c.addCookies(await sessionCookies(email));
  return c;
}
let n = 0;
async function shot(page, name, { full = false, wait = 1200 } = {}) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.waitForTimeout(wait);
  const file = `${OUT}/${String(++n).padStart(2, "0")}_${name}.png`;
  await page.screenshot({ path: file, fullPage: full });
  console.log("📸", file);
}
async function go(page, path, name, opts) {
  await page.goto(APP + path, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1000); // let React hydrate before we type or click
  if (name) await shot(page, name, opts);
}

// ---------------------------------------------------------------- reset the live-demo student
{
  const { data: old } = await db.from("students").select("id, user_id").eq("phone", NEW_STUDENT.phone).maybeSingle();
  if (old) {
    for (const t of ["attendance", "payments", "reminder_logs", "memberships"]) await db.from(t).delete().eq("student_id", old.id);
    await db.from("alerts").delete().eq("student_id", old.id);
    await db.from("students").delete().eq("id", old.id);
    if (old.user_id) { await db.from("profiles").delete().eq("id", old.user_id); await db.auth.admin.deleteUser(old.user_id); }
  }
  const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 });
  const stray = list.users.find((u) => u.email === `${NEW_STUDENT.phone}@${DOMAIN}`);
  if (stray) { await db.from("profiles").delete().eq("id", stray.id); await db.auth.admin.deleteUser(stray.id); }
}

// ---------------------------------------------------------------- login screens (logged out)
{
  const c = await ctx("desktop"); const p = await c.newPage();
  await go(p, "/login", "login_desktop");
  await p.getByRole("tab", { name: "Owner / Staff" }).click();
  await shot(p, "login_owner", { wait: 500 });
  await c.close();
}

// ---------------------------------------------------------------- owner panel
const admin = await ctx("desktop", ADMIN_EMAIL);
const a = await admin.newPage();
await go(a, "/admin", "dashboard", { wait: 3000 });
await go(a, "/admin/students", "students");
const { data: star } = await db.from("students").select("id").eq("phone", "9710000000").single();
await go(a, `/admin/students/${star.id}`, "student_profile", { wait: 1800 });

// live admission
await go(a, "/admin/students/new");
await a.getByLabel("Full name *").fill(NEW_STUDENT.name);
await a.getByLabel("Mobile *").fill(NEW_STUDENT.phone);
await a.getByLabel("Email").fill("riya.sharma@example.com");
await a.getByLabel("Preparing for (exam)").fill(NEW_STUDENT.exam);
await a.getByLabel("Guardian name").fill("Mr. Anil Sharma");
await a.getByLabel("Login PIN").fill("1234");
await a.getByLabel("Full name *").blur();
await a.evaluate(() => window.scrollTo(0, 330));
await shot(a, "admission_1_details", { wait: 600 });
await a.evaluate(() => window.scrollTo(0, 0));
await a.getByRole("button", { name: /Next: Plan/ }).click();
await a.getByRole("button", { name: /^Morning/ }).click();
await a.getByRole("button", { name: /Morning · Monthly/ }).click();
await a.waitForTimeout(1500);
const seat = a.locator("button:not([disabled])").filter({ hasText: /^[A-F]\d{1,2}🪟?$/ }).first();
await seat.click();
await shot(a, "admission_2_plan_seat", { wait: 800 });
await a.getByRole("button", { name: /Admission confirm/ }).click();
await a.getByText(`Admission done for ${NEW_STUDENT.name}`).waitFor({ timeout: 30000 });
await shot(a, "admission_3_done", { wait: 800 });

const { data: riya } = await db.from("students").select("id, qr_token").eq("phone", NEW_STUDENT.phone).single();
const { data: riyaPay } = await db.from("payments").select("public_token").eq("student_id", riya.id).single();
await go(a, `/receipt/${riyaPay.public_token}`, "receipt", { wait: 800 });

await go(a, "/admin/seats", "seat_map", { wait: 1800 });
await go(a, "/admin/dues", "dues");
await go(a, "/admin/payments", "payments");
await go(a, "/admin/enquiries", "enquiries");
await go(a, "/admin/expenses", "expenses", { wait: 1500 });
await go(a, "/admin/notices", "notices");
await go(a, "/admin/settings");
await a.getByRole("tab", { name: "Attendance & QR" }).click();
await shot(a, "settings_qr", { wait: 1500 });
await go(a, "/admin/gate-qr", "gate_qr_print", { wait: 1500 });

// ---------------------------------------------------------------- student app (mobile)
{
  const c = await ctx("mobile"); const p = await c.newPage();
  await go(p, "/login", "student_login");
  await c.close();
}
const veteran = await ctx("mobile", `9710000000@${DOMAIN}`);
const v = await veteran.newPage();
await go(v, "/app", "student_home", { wait: 1800 });
await go(v, "/app/history", "student_history", { wait: 1500 });
await go(v, "/app/payments", "student_fees");
await go(v, "/app/profile", "student_profile_qr", { wait: 1500 });

const { data: cfg } = await db.from("library_settings").select("gate_key").eq("id", 1).single();
const fresh = await ctx("mobile", `${NEW_STUDENT.phone}@${DOMAIN}`);
const r = await fresh.newPage();
await go(r, "/app", "riya_home", { wait: 1500 });
await go(r, "/app/scan", "scan_camera", { wait: 2500 });
await go(r, `/app/scan?k=${cfg.gate_key}`);
await r.getByText(/Welcome, |Scan failed|Plan /).first().waitFor({ timeout: 30000 });
await shot(r, "scan_in", { wait: 800 });

// owner sees it live
await go(a, "/admin", "dashboard_live", { wait: 3000 });
await go(a, "/admin/attendance", "attendance", { wait: 1500 });

await go(r, `/app/scan?k=${cfg.gate_key}`);
await r.getByText(/Just scanned|Bye!/).first().waitFor({ timeout: 30000 });
await shot(r, "scan_cooldown", { wait: 600 });
await go(r, "/app/scan?k=not-our-library", "scan_wrong_qr", { wait: 1500 });

console.log("⏳ waiting out the 2-minute double-scan cooldown for the OUT scan…");
await r.waitForTimeout(125_000);
await go(r, `/app/scan?k=${cfg.gate_key}`);
await r.getByText(/Bye!|Just scanned/).first().waitFor({ timeout: 30000 });
await shot(r, "scan_out", { wait: 800 });

// a friend's phone can't mark Riya's attendance
const friend = await ctx("mobile", `${NEW_STUDENT.phone}@${DOMAIN}`);
const f = await friend.newPage();
await go(f, `/app/scan?k=${cfg.gate_key}`);
await f.getByText(/linked|Just scanned|Welcome/).first().waitFor({ timeout: 30000 });
await shot(f, "scan_other_phone", { wait: 600 });

await go(a, "/admin", "dashboard_alerts", { full: true, wait: 3000 });

await browser.close();
console.log("\n✅ Screens saved to", OUT);
