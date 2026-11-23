import { describe, expect, it } from "vitest";
import { tx, one, val, attempt, mkStudent, mkMembership, seatId, shiftId, asSuper } from "./helpers";

describe("seed + settings", () => {
  it("seeds 3 shifts, 60 seats, 6 plans and one settings row", () => tx(async (c) => {
    expect(await val(c, "select count(*)::int from shifts")).toBe(3);
    expect(await val(c, "select count(*)::int from seats")).toBe(60);
    expect(await val(c, "select count(*)::int from plans")).toBe(6);
    expect(await val(c, "select count(*)::int from library_settings")).toBe(1);
  }));
  it("settings table can never get a second row", () => tx(async (c) => {
    expect(await attempt(c, () => c.query("insert into library_settings (id) values (2)"))).toBeTruthy();
  }));
  it("gate key is random and 24 chars", () => tx(async (c) => {
    expect(await val<string>(c, "select gate_key from library_settings")).toMatch(/^[0-9a-f]{24}$/);
  }));
  it("shift must end after it starts", () => tx(async (c) => {
    expect(await attempt(c, () => c.query("insert into shifts (name, start_time, end_time) values ('Bad', '14:00', '10:00')"))).toBeTruthy();
  }));
  it("seed migration can be re-run without duplicating data", () => tx(async (c) => {
    const fs = await import("node:fs");
    const sql = fs.readFileSync(new URL("../../supabase/migrations/0003_seed.sql", import.meta.url), "utf8");
    await c.query(sql);
    expect(await val(c, "select count(*)::int from seats")).toBe(60);
  }));
  it("schema migration can be re-run (safe to apply updates)", () => tx(async (c) => {
    const { migrationSql } = await import("./global-setup");
    expect(await attempt(c, () => c.query(migrationSql("0001_schema.sql")))).toBeNull();
    expect(await attempt(c, () => c.query(migrationSql("0002_storage_cron.sql")))).toBeNull();
    expect(await val(c, "select count(*)::int from cron.job where jobname = 'ambition-auto-checkout'")).toBe(1);
  }));
});

describe("students", () => {
  it("gets code S0001-style and a 24-char QR token", () => tx(async (c) => {
    const s = await mkStudent(c, "Riya");
    expect(s.code).toMatch(/^S\d{4,}$/);
    expect(s.qr_token).toMatch(/^[0-9a-f]{24}$/);
  }));
  it("phone must be unique", () => tx(async (c) => {
    await mkStudent(c, "A", { phone: "9000000001" });
    expect(await attempt(c, () => mkStudent(c, "B", { phone: "9000000001" }))).toBeTruthy();
  }));
  it("status only active/left", () => tx(async (c) => {
    expect(await attempt(c, () => mkStudent(c, "X", { status: "paused" }))).toBeTruthy();
  }));
});

describe("seat booking (shift-aware)", () => {
  it("Morning and Evening can share one seat", () => tx(async (c) => {
    const a = await mkStudent(c, "A"), b = await mkStudent(c, "B");
    await mkMembership(c, a.id, "Morning", "A1", 0, 29);
    expect(await attempt(c, () => mkMembership(c, b.id, "Evening", "A1", 0, 29))).toBeNull();
  }));
  it("Full Day blocks a seat already taken in Morning", () => tx(async (c) => {
    const a = await mkStudent(c, "A"), b = await mkStudent(c, "B");
    await mkMembership(c, a.id, "Morning", "A1", 0, 29);
    const e = await attempt(c, () => mkMembership(c, b.id, "Full Day", "A1", 5, 34));
    expect(e?.message).toMatch(/SEAT_TAKEN/);
    expect(e?.message).toContain("A");
  }));
  it("Morning blocks a seat already taken Full Day", () => tx(async (c) => {
    const a = await mkStudent(c, "A"), b = await mkStudent(c, "B");
    await mkMembership(c, a.id, "Full Day", "B2", 0, 29);
    expect((await attempt(c, () => mkMembership(c, b.id, "Morning", "B2", 0, 29)))?.message).toMatch(/SEAT_TAKEN/);
  }));
  it("same shift, back-to-back dates is fine; one day overlap is not", () => tx(async (c) => {
    const a = await mkStudent(c, "A"), b = await mkStudent(c, "B"), d = await mkStudent(c, "D");
    await mkMembership(c, a.id, "Morning", "C3", 0, 9);
    expect(await attempt(c, () => mkMembership(c, b.id, "Morning", "C3", 10, 39))).toBeNull();
    expect((await attempt(c, () => mkMembership(c, d.id, "Morning", "C3", 9, 9)))?.message).toMatch(/SEAT_TAKEN/);
  }));
  it("a student's own renewal can overlap on the same seat", () => tx(async (c) => {
    const a = await mkStudent(c, "A");
    await mkMembership(c, a.id, "Morning", "A1", -20, 9);
    expect(await attempt(c, () => mkMembership(c, a.id, "Morning", "A1", 5, 34))).toBeNull();
  }));
  it("cancelled membership frees the seat", () => tx(async (c) => {
    const a = await mkStudent(c, "A"), b = await mkStudent(c, "B");
    const m = await mkMembership(c, a.id, "Morning", "A1", 0, 29);
    await c.query("update memberships set status = 'cancelled' where id = $1", [m.id]);
    expect(await attempt(c, () => mkMembership(c, b.id, "Morning", "A1", 0, 29))).toBeNull();
  }));
  it("student who LEFT frees the seat (seat map shows it free, so booking must work)", () => tx(async (c) => {
    const a = await mkStudent(c, "A"), b = await mkStudent(c, "B");
    await mkMembership(c, a.id, "Morning", "A1", 0, 29);
    await c.query("update students set status = 'left' where id = $1", [a.id]);
    const board = await one<{ occupied: boolean }>(c, "select occupied from seat_board((select id from shifts where name='Morning')) where label = 'A1'");
    expect(board.occupied).toBe(false);
    expect(await attempt(c, () => mkMembership(c, b.id, "Morning", "A1", 0, 29))).toBeNull();
  }));
  it("moving someone onto an occupied seat is blocked", () => tx(async (c) => {
    const a = await mkStudent(c, "A"), b = await mkStudent(c, "B");
    await mkMembership(c, a.id, "Morning", "A1", 0, 29);
    const m = await mkMembership(c, b.id, "Morning", "A2", 0, 29);
    expect((await attempt(c, () => c.query("update memberships set seat_id = (select id from seats where label='A1') where id = $1", [m.id])))?.message).toMatch(/SEAT_TAKEN/);
  }));
  it("custom shift 10–16 conflicts with Morning, Evening 14–22 touching Morning end does not", () => tx(async (c) => {
    await c.query("insert into shifts (name, start_time, end_time, sort) values ('Mid', '10:00', '16:00', 9)");
    const a = await mkStudent(c, "A"), b = await mkStudent(c, "B"), d = await mkStudent(c, "D");
    await mkMembership(c, a.id, "Morning", "D4", 0, 29);
    expect((await attempt(c, () => mkMembership(c, b.id, "Mid", "D4", 0, 29)))?.message).toMatch(/SEAT_TAKEN/);
    expect(await attempt(c, () => mkMembership(c, d.id, "Evening", "D4", 0, 29))).toBeNull();
  }));
  it("membership without seat is allowed (seat assigned later)", () => tx(async (c) => {
    const a = await mkStudent(c, "A");
    expect(await attempt(c, () => mkMembership(c, a.id, "Morning", null, 0, 29))).toBeNull();
  }));
  it("end date before start date is rejected", () => tx(async (c) => {
    const a = await mkStudent(c, "A");
    expect(await attempt(c, () => mkMembership(c, a.id, "Morning", "A1", 5, 1))).toBeTruthy();
  }));
  it("total = fee + admission − discount", () => tx(async (c) => {
    const a = await mkStudent(c, "A");
    const m = await mkMembership(c, a.id, "Morning", null, 0, 29, 700, { admission_fee: 200, discount: 150 });
    expect(m.total).toBe(750);
  }));
});

describe("payments + receipts", () => {
  it("receipt numbers are sequential with prefix", () => tx(async (c) => {
    const a = await mkStudent(c, "A");
    const r1 = await val<string>(c, "insert into payments (student_id, amount) values ($1, 500) returning receipt_no", [a.id]);
    const r2 = await val<string>(c, "insert into payments (student_id, amount) values ($1, 200) returning receipt_no", [a.id]);
    expect(r1).toMatch(/^AL-\d{5}$/);
    expect(Number(r2.slice(3))).toBe(Number(r1.slice(3)) + 1);
  }));
  it("changing the prefix in settings applies to new receipts", () => tx(async (c) => {
    const a = await mkStudent(c, "A");
    await c.query("update library_settings set receipt_prefix = 'AMB'");
    expect(await val<string>(c, "insert into payments (student_id, amount) values ($1, 500) returning receipt_no", [a.id])).toMatch(/^AMB-\d{5}$/);
  }));
  it("zero/negative amount and unknown mode are rejected", () => tx(async (c) => {
    const a = await mkStudent(c, "A");
    expect(await attempt(c, () => c.query("insert into payments (student_id, amount) values ($1, 0)", [a.id]))).toBeTruthy();
    expect(await attempt(c, () => c.query("insert into payments (student_id, amount) values ($1, -5)", [a.id]))).toBeTruthy();
    expect(await attempt(c, () => c.query("insert into payments (student_id, amount, mode) values ($1, 5, 'paytm')", [a.id]))).toBeTruthy();
  }));
  it("public receipt token is unguessable (20 chars) and unique", () => tx(async (c) => {
    const a = await mkStudent(c, "A");
    for (let i = 0; i < 20; i++) await c.query("insert into payments (student_id, amount) values ($1, 10)", [a.id]);
    expect(await val(c, "select count(distinct public_token)::int from payments")).toBe(20);
    expect(await val<string>(c, "select public_token from payments limit 1")).toMatch(/^[0-9a-f]{20}$/);
  }));
});

describe("v_student_status", () => {
  const st = (c: Parameters<Parameters<typeof tx>[0]>[0], id: string) => one<{ plan_state: string; days_left: number | null; balance_due: number; seat_label: string | null; last_reminded_at: string | null; end_date: string }>(c, "select * from v_student_status where student_id = $1", [id]);
  it("no_plan", () => tx(async (c) => { const a = await mkStudent(c); expect((await st(c, a.id)).plan_state).toBe("no_plan"); }));
  it("active (> 7 days left)", () => tx(async (c) => { const a = await mkStudent(c); await mkMembership(c, a.id, "Morning", "A1", -1, 20); const s = await st(c, a.id); expect(s.plan_state).toBe("active"); expect(s.days_left).toBe(20); expect(s.seat_label).toBe("A1"); }));
  it("expiring at exactly 7 days", () => tx(async (c) => { const a = await mkStudent(c); await mkMembership(c, a.id, "Morning", null, -20, 7); expect((await st(c, a.id)).plan_state).toBe("expiring"); }));
  it("expiring on last day (0 days left)", () => tx(async (c) => { const a = await mkStudent(c); await mkMembership(c, a.id, "Morning", null, -29, 0); const s = await st(c, a.id); expect(s.plan_state).toBe("expiring"); expect(s.days_left).toBe(0); }));
  it("expired yesterday", () => tx(async (c) => { const a = await mkStudent(c); await mkMembership(c, a.id, "Morning", null, -30, -1); const s = await st(c, a.id); expect(s.plan_state).toBe("expired"); expect(s.days_left).toBe(-1); }));
  it("upcoming", () => tx(async (c) => { const a = await mkStudent(c); await mkMembership(c, a.id, "Morning", null, 3, 32); expect((await st(c, a.id)).plan_state).toBe("upcoming"); }));
  it("early renewal: shows the current plan, not the future one", () => tx(async (c) => {
    const a = await mkStudent(c); await mkMembership(c, a.id, "Morning", null, -25, 4); await mkMembership(c, a.id, "Morning", null, 5, 34);
    const s = await st(c, a.id); expect(s.days_left).toBe(4);
  }));
  it("expired + renewed with a gap: shows the upcoming plan, not 'expired'", () => tx(async (c) => {
    const a = await mkStudent(c); await mkMembership(c, a.id, "Morning", null, -40, -10); await mkMembership(c, a.id, "Morning", null, 2, 31);
    expect((await st(c, a.id)).plan_state).toBe("upcoming");
  }));
  it("balance = billed − paid; cancelled plans are not billed", () => tx(async (c) => {
    const a = await mkStudent(c);
    await mkMembership(c, a.id, "Morning", null, 0, 29, 700, { admission_fee: 200 });
    await mkMembership(c, a.id, "Morning", null, 30, 59, 700, { status: "cancelled" });
    await c.query("insert into payments (student_id, amount) values ($1, 500)", [a.id]);
    expect((await st(c, a.id)).balance_due).toBe(400);
  }));
  it("overpayment shows as negative balance (advance)", () => tx(async (c) => {
    const a = await mkStudent(c);
    await mkMembership(c, a.id, "Morning", null, 0, 29, 700);
    await c.query("insert into payments (student_id, amount) values ($1, 1000)", [a.id]);
    expect((await st(c, a.id)).balance_due).toBe(-300);
  }));
  it("last_reminded_at picks the latest reminder", () => tx(async (c) => {
    const a = await mkStudent(c);
    await c.query("insert into reminder_logs (student_id, sent_at) values ($1, now() - interval '3 days'), ($1, now() - interval '1 day')", [a.id]);
    const s = await st(c, a.id);
    expect(new Date(s.last_reminded_at!).getTime()).toBeGreaterThan(Date.now() - 2 * 86400000);
  }));
});

describe("seat_board", () => {
  it("is shift-aware and date-aware", () => tx(async (c) => {
    const a = await mkStudent(c, "Morning Wala");
    await mkMembership(c, a.id, "Morning", "E5", 0, 9);
    const q = (shift: string, off = 0) => one<{ occupied: boolean; student_name: string | null }>(c,
      "select occupied, student_name from seat_board((select id from shifts where name=$1), today_local() + $2::int) where label='E5'", [shift, off]);
    expect((await q("Morning")).occupied).toBe(true);
    expect((await q("Morning")).student_name).toBe("Morning Wala");
    expect((await q("Evening")).occupied).toBe(false);
    expect((await q("Full Day")).occupied).toBe(true);
    expect((await q("Morning", 10)).occupied).toBe(false); // after plan ends
  }));
  it("with an end date, a seat booked later in that period shows as taken", () => tx(async (c) => {
    const a = await mkStudent(c, "Next Week");
    await mkMembership(c, a.id, "Morning", "F1", 7, 36);
    const q = (until: number) => one<{ occupied: boolean }>(c,
      "select occupied from seat_board((select id from shifts where name='Morning'), today_local(), today_local() + $1::int) where label='F1'", [until]);
    expect((await q(0)).occupied).toBe(false);  // free today
    expect((await q(29)).occupied).toBe(true);  // but not for a 30-day plan
    expect((await q(6)).occupied).toBe(false);  // a 1-week plan fits
  }));
  it("returns every seat in row/col order", () => tx(async (c) => {
    const labels = (await c.query("select label from seat_board(null)")).rows.map((r) => r.label);
    expect(labels.length).toBe(60);
    expect(labels.slice(0, 3)).toEqual(["A1", "A2", "A3"]);
    expect(labels.at(-1)).toBe("F10");
  }));
  it("unused helpers exist", () => tx(async (c) => {
    await asSuper(c);
    expect(await seatId(c, "A1")).toBeTruthy();
    expect(await shiftId(c, "Morning")).toBeTruthy();
  }));
});

describe("attendance constraints", () => {
  it("only one open session per student", () => tx(async (c) => {
    const a = await mkStudent(c);
    await c.query("insert into attendance (student_id) values ($1)", [a.id]);
    expect(await attempt(c, () => c.query("insert into attendance (student_id) values ($1)", [a.id]))).toBeTruthy();
  }));
  it("check-out cannot be before check-in", () => tx(async (c) => {
    const a = await mkStudent(c);
    expect(await attempt(c, () => c.query("insert into attendance (student_id, check_in, check_out) values ($1, now(), now() - interval '1 hour')", [a.id]))).toBeTruthy();
  }));
});
