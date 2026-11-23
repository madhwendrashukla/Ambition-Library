import { describe, expect, it } from "vitest";
import { tx, val, one, as, attempt, mkStudent, mkMembership, mkUser, type C } from "./helpers";

const nowLocalMinutes = () => { const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })); return d.getHours() * 60 + d.getMinutes(); };

describe("auto_checkout", () => {
  it("closes yesterday's forgotten session", () => tx(async (c) => {
    const s = await mkStudent(c);
    await mkMembership(c, s.id, "Morning", null, -10, 10);
    await c.query("insert into attendance (student_id, att_date, check_in) values ($1, today_local() - 1, (today_local() - 1 + time '07:00') at time zone 'Asia/Kolkata')", [s.id]);
    expect(await val(c, "select auto_checkout()")).toBe(1);
    const r = await one<{ auto_closed: boolean; out_local: string }>(c, "select auto_closed, to_char(check_out at time zone 'Asia/Kolkata', 'HH24:MI') out_local from attendance where student_id = $1", [s.id]);
    expect(r.auto_closed).toBe(true);
    expect(r.out_local).toBe("14:00"); // closed at shift end, not 'now'
  }));
  it("closes a session 30+ min after today's shift ended", () => tx(async (c) => {
    if (nowLocalMinutes() < 35) return; // needs some time after midnight
    await c.query("insert into shifts (name, start_time, end_time, sort) values ('Tiny', '00:00', '00:01', 9)");
    const s = await mkStudent(c);
    await mkMembership(c, s.id, "Tiny", null, -1, 10);
    await c.query("insert into attendance (student_id, check_in) values ($1, (today_local() + time '00:00') at time zone 'Asia/Kolkata')", [s.id]);
    expect(await val(c, "select auto_checkout()")).toBe(1);
  }));
  it("keeps a session open while the shift is running", () => tx(async (c) => {
    await c.query("insert into shifts (name, start_time, end_time, sort) values ('AllDay', '00:00', '23:59', 9)");
    const s = await mkStudent(c);
    await mkMembership(c, s.id, "AllDay", null, -1, 10);
    await c.query("insert into attendance (student_id) values ($1)", [s.id]);
    expect(await val(c, "select auto_checkout()")).toBe(0);
  }));
  it("does NOT instantly close a student who came outside their shift", () => tx(async (c) => {
    if (nowLocalMinutes() < 35) return;
    await c.query("insert into shifts (name, start_time, end_time, sort) values ('Tiny', '00:00', '00:01', 9)");
    const s = await mkStudent(c);
    await mkMembership(c, s.id, "Tiny", null, -1, 10);
    await c.query("insert into attendance (student_id, outside_shift) values ($1, true)", [s.id]); // just walked in
    expect(await val(c, "select auto_checkout()")).toBe(0);
  }));
  it("is idempotent (second run closes nothing)", () => tx(async (c) => {
    const s = await mkStudent(c);
    await c.query("insert into attendance (student_id, att_date, check_in) values ($1, today_local() - 2, now() - interval '2 days')", [s.id]);
    expect(await val(c, "select auto_checkout()")).toBe(1);
    expect(await val(c, "select auto_checkout()")).toBe(0);
  }));
  it("student without any plan: forgotten session still closed next day", () => tx(async (c) => {
    const s = await mkStudent(c);
    await c.query("insert into attendance (student_id, att_date, check_in) values ($1, today_local() - 1, now() - interval '1 day')", [s.id]);
    expect(await val(c, "select auto_checkout()")).toBe(1);
  }));
});

describe("dashboard_stats", () => {
  async function scenario(c: C) {
    const active = await mkStudent(c, "Active"), expiring = await mkStudent(c, "Expiring"), expired = await mkStudent(c, "Expired"), left = await mkStudent(c, "Left");
    await mkMembership(c, active.id, "Morning", "A1", -5, 20, 700);
    await mkMembership(c, expiring.id, "Evening", "A1", -25, 3, 700);
    await mkMembership(c, expired.id, "Full Day", "B1", -40, -2, 1100);
    await mkMembership(c, left.id, "Morning", "C1", -5, 20, 700);
    await c.query("update students set status = 'left' where id = $1", [left.id]);
    await c.query("insert into payments (student_id, amount) values ($1, 700), ($2, 300)", [active.id, expiring.id]);
    await c.query("insert into payments (student_id, amount, paid_at) values ($1, 1100, now() - interval '40 days')", [expired.id]);
    await c.query("insert into attendance (student_id, check_in) values ($1, now() - interval '1 hour')", [active.id]);
    await c.query("insert into attendance (student_id, check_in, check_out) values ($1, now() - interval '3 hours', now() - interval '2 hours')", [expiring.id]);
    await c.query("insert into expenses (title, amount) values ('Bijli', 2500)");
    await c.query("update seats set active = false where label = 'F10'");
    await c.query("insert into alerts (kind, message) values ('info','a'), ('info','b')");
    await c.query("update alerts set seen = true where message = 'b'");
  }
  it("numbers match the data", () => tx(async (c) => {
    await scenario(c);
    await as(c, await mkUser(c, "admin"));
    const s = await val<Record<string, number & { name: string; occupied: number; present: number }[]>>(c, "select dashboard_stats()");
    expect(s.present_now).toBe(1);
    expect(s.today_checkins).toBe(2);
    expect(s.today_collection).toBe(1000);
    expect(s.month_expenses).toBe(2500);
    expect(s.active_members).toBe(2);
    expect(s.expiring_7).toBe(1);
    expect(s.expired).toBe(1);
    expect(s.balance_due).toBe(400); // expiring owes 400, expired paid, left excluded
    expect(s.total_seats).toBe(59);
    expect(s.unseen_alerts).toBe(1);
    const shifts = s.shifts as unknown as { name: string; occupied: number; present: number }[];
    const morning = shifts.find((x) => x.name === "Morning")!;
    expect(morning.occupied).toBe(1); // left student's seat not counted
    expect(morning.present).toBe(1);
    expect(shifts.find((x) => x.name === "Full Day")!.occupied).toBe(1); // A1 (morning+evening) counts once for full-day view
  }));
  it("month collection includes this month only", () => tx(async (c) => {
    await scenario(c);
    await as(c, await mkUser(c, "admin"));
    const s = await val<{ month_collection: number }>(c, "select dashboard_stats()");
    expect(s.month_collection).toBeGreaterThanOrEqual(1000);
    expect(s.month_collection).toBeLessThan(2100);
  }));
  it("student calling it sees no library-wide numbers", () => tx(async (c) => {
    await scenario(c);
    const me = await mkStudent(c, "Curious");
    await as(c, me.user_id);
    const s = await val<{ today_collection: number; active_members: number; unseen_alerts: number }>(c, "select dashboard_stats()");
    expect(s.today_collection).toBe(0);
    expect(s.active_members).toBe(0);
    expect(s.unseen_alerts).toBe(0);
  }));
});

describe("distance_m", () => {
  it("same point = 0, Lucknow→Kanpur ≈ 75 km", () => tx(async (c) => {
    expect(await val(c, "select distance_m(26.85, 80.95, 26.85, 80.95)")).toBe(0);
    const d = await val<number>(c, "select distance_m(26.8467, 80.9462, 26.4499, 80.3319)");
    expect(d).toBeGreaterThan(70000); expect(d).toBeLessThan(80000);
  }));
  it("never throws on rounding at antipodes", () => tx(async (c) => {
    expect(await attempt(c, () => c.query("select distance_m(0, 0, 0, 180)"))).toBeNull();
  }));
});
