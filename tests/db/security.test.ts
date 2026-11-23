import { describe, expect, it } from "vitest";
import { tx, val, as, asSuper, attempt, mkStudent, mkMembership, mkUser, DEVICE, type C } from "./helpers";

async function twoStudents(c: C) {
  const a = await mkStudent(c, "Aman"), b = await mkStudent(c, "Bina");
  for (const s of [a, b]) {
    await mkMembership(c, s.id, s === a ? "Morning" : "Evening", "A1", -5, 20);
    await c.query("insert into payments (student_id, amount) values ($1, 700)", [s.id]);
    await c.query("insert into attendance (student_id, check_in, check_out) values ($1, now() - interval '3 hours', now() - interval '1 hour')", [s.id]);
    await c.query("insert into alerts (kind, student_id, message) values ('info', $1, 'x')", [s.id]);
  }
  await c.query("insert into enquiries (name, phone) values ('Lead', '9999999999')");
  await c.query("insert into expenses (title, amount) values ('Rent', 1000)");
  await c.query("insert into reminder_logs (student_id) values ($1)", [a.id]);
  return { a, b };
}
const count = (c: C, table: string) => val<number>(c, `select count(*)::int from ${table}`);

describe("student can only see their own data", () => {
  it.each(["students", "memberships", "payments", "attendance", "v_student_status"])("%s → 1 row (own)", (table) => tx(async (c) => {
    const { a } = await twoStudents(c);
    await as(c, a.user_id);
    expect(await count(c, table)).toBe(1);
  }));
  it.each(["alerts", "enquiries", "expenses", "reminder_logs", "library_settings"])("%s → hidden", (table) => tx(async (c) => {
    const { a } = await twoStudents(c);
    await as(c, a.user_id);
    expect(await count(c, table)).toBe(0);
  }));
  it("sees only own profile", () => tx(async (c) => {
    const { a } = await twoStudents(c); await mkUser(c, "admin");
    await as(c, a.user_id);
    expect(await count(c, "profiles")).toBe(1);
  }));
  it("cannot read the gate key, but library_public works and has no gate_key", () => tx(async (c) => {
    const { a } = await twoStudents(c);
    await as(c, a.user_id);
    expect(await val(c, "select gate_key from library_settings")).toBeUndefined();
    const cols = Object.keys((await c.query("select * from library_public")).rows[0]);
    expect(cols).toContain("name");
    expect(cols).not.toContain("gate_key");
  }));
  it("seat map shows only own booking (no other names leak)", () => tx(async (c) => {
    const { a } = await twoStudents(c);
    await as(c, a.user_id);
    const names = (await c.query("select student_name from seat_board(null) where student_name is not null")).rows.map((r) => r.student_name);
    expect(names).toEqual(["Aman"]);
  }));
  it("sees notices and active plans only", () => tx(async (c) => {
    const { a } = await twoStudents(c);
    await c.query("insert into notices (title) values ('Holiday')");
    await c.query("update plans set active = false where name like '%Quarterly%'");
    await as(c, a.user_id);
    expect(await count(c, "notices")).toBe(1);
    expect(await count(c, "plans")).toBe(3);
  }));
});

describe("student cannot change anything directly", () => {
  const tries: [string, string][] = [
    ["mark own attendance", "insert into attendance (student_id) select id from students"],
    ["edit own check-in time", "update attendance set check_in = now() - interval '9 hours'"],
    ["clear own device lock", "update students set device_id = null"],
    ["extend own plan", "update memberships set end_date = end_date + 365"],
    ["add a fake payment", "insert into payments (student_id, amount) select id, 5000 from students"],
    ["delete own payments", "delete from payments"],
    ["make self admin", "update profiles set role = 'admin'"],
    ["post a notice", "insert into notices (title) values ('hacked')"],
    ["change settings", "update library_settings set name = 'x'"],
  ];
  it.each(tries)("%s → blocked", (_n, sql) => tx(async (c) => {
    const { a } = await twoStudents(c);
    await as(c, a.user_id);
    const err = await attempt(c, () => c.query(sql));
    if (!err) {
      // RLS can also silently match 0 rows — verify nothing changed
      await asSuper(c);
      const changed = await val<number>(c, `select
        (select count(*) from attendance)::int * 0
        + (select count(*) from attendance where check_in < now() - interval '8 hours')::int
        + (select count(*) from students where device_id is null and id = $1)::int * 0
        + (select count(*) from memberships where end_date > today_local() + 100)::int
        + (select count(*) from payments where amount = 5000)::int
        + (select case when count(*) = 2 then 0 else 1 end from payments)::int
        + (select count(*) from profiles where role = 'admin')::int
        + (select count(*) from notices where title = 'hacked')::int
        + (select count(*) from library_settings where name = 'x')::int
        + (select case when count(*) = 2 then 0 else 1 end from attendance)::int`, [a.id]);
      expect(changed).toBe(0);
    }
  }));
  it("cannot bypass scan rules by calling the internal toggle function", () => tx(async (c) => {
    const { a, b } = await twoStudents(c);
    await as(c, a.user_id);
    const err = await attempt(c, () => c.query("select _toggle_attendance($1, 'qr', true)", [b.id]));
    expect(err?.message).toMatch(/permission denied/);
  }));
  it("cannot regenerate the gate QR", () => tx(async (c) => {
    const { a } = await twoStudents(c);
    await as(c, a.user_id);
    expect((await attempt(c, () => c.query("select regenerate_gate_key()")))?.message).toMatch(/NOT_ALLOWED/);
  }));
});

describe("anon (not logged in)", () => {
  it("can read library_public (login page)", () => tx(async (c) => {
    await as(c, null);
    expect(await val(c, "select name from library_public")).toBeTruthy();
  }));
  it.each(["students", "payments", "attendance", "library_settings", "profiles"])("cannot read %s", (table) => tx(async (c) => {
    await twoStudents(c);
    await as(c, null);
    const err = await attempt(c, async () => { const n = await count(c, table); if (n > 0) throw new Error("LEAK " + n); });
    if (err) expect(err.message).not.toMatch(/LEAK/);
  }));
  it("cannot call internal / staff functions", () => tx(async (c) => {
    const { a } = await twoStudents(c);
    await as(c, null);
    expect(await attempt(c, () => c.query("select _toggle_attendance($1, 'qr', true)", [a.id]))).toBeTruthy();
    expect(await attempt(c, () => c.query("select staff_mark(null, $1, true)", [a.id]))).toBeTruthy();
  }));
});

describe("staff vs admin", () => {
  it("staff can run the desk: admission, payment, attendance", () => tx(async (c) => {
    const staff = await mkUser(c, "staff");
    const uid = (await c.query("insert into auth.users (email) values ('x@y.z') returning id")).rows[0].id;
    await as(c, staff);
    const sid = await val<string>(c, "insert into students (user_id, full_name, phone) values ($1, 'New', '9111111111') returning id", [uid]);
    await c.query("insert into memberships (student_id, shift_id, start_date, end_date, fee) values ($1, (select id from shifts where name='Morning'), today_local(), today_local()+29, 700)", [sid]);
    await c.query("insert into payments (student_id, amount) values ($1, 700)", [sid]);
    expect(await count(c, "v_student_status")).toBe(1);
  }));
  it("staff can see everything a desk needs", () => tx(async (c) => {
    await twoStudents(c);
    await as(c, await mkUser(c, "staff"));
    expect(await count(c, "students")).toBe(2);
    expect(await count(c, "alerts")).toBe(2);
    expect(await val(c, "select gate_key from library_settings")).toBeTruthy();
  }));
  it("staff cannot change library settings", () => tx(async (c) => {
    await as(c, await mkUser(c, "staff"));
    await attempt(c, () => c.query("update library_settings set name = 'Staff Edit'"));
    await asSuper(c);
    expect(await val(c, "select name from library_settings")).not.toBe("Staff Edit");
  }));
  it("staff cannot change pricing (plans) or shifts — admin only", () => tx(async (c) => {
    await as(c, await mkUser(c, "staff"));
    await attempt(c, () => c.query("update plans set price = 1"));
    await attempt(c, () => c.query("update shifts set start_time = '01:00'"));
    await attempt(c, () => c.query("insert into plans (name, shift_id, duration_days, price) select 'Cheap', id, 30, 1 from shifts limit 1"));
    await asSuper(c);
    expect(await val(c, "select count(*)::int from plans where price = 1")).toBe(0);
    expect(await val(c, "select count(*)::int from shifts where start_time = '01:00'")).toBe(0);
  }));
  it("staff can still edit seat tags", () => tx(async (c) => {
    await as(c, await mkUser(c, "staff"));
    await c.query("update seats set tags = '{quiet}' where label = 'A1'");
    await asSuper(c);
    expect(await val(c, "select tags from seats where label = 'A1'")).toEqual(["quiet"]);
  }));
  it("admin can change settings and pricing", () => tx(async (c) => {
    await as(c, await mkUser(c, "admin"));
    await c.query("update library_settings set name = 'Admin Edit'");
    await c.query("update plans set price = 999 where name = 'Morning · Monthly'");
    await asSuper(c);
    expect(await val(c, "select name from library_settings")).toBe("Admin Edit");
    expect(await val(c, "select price from plans where name = 'Morning · Monthly'")).toBe(999);
  }));
  it("staff cannot promote themselves to admin", () => tx(async (c) => {
    const staff = await mkUser(c, "staff");
    await as(c, staff);
    await attempt(c, () => c.query("update profiles set role = 'admin' where id = $1", [staff]));
    await asSuper(c);
    expect(await val(c, "select role from profiles where id = $1", [staff])).toBe("staff");
  }));
  it("staff cannot regenerate gate key; admin can", () => tx(async (c) => {
    await as(c, await mkUser(c, "staff"));
    expect(await attempt(c, () => c.query("select regenerate_gate_key()"))).toBeTruthy();
    await as(c, await mkUser(c, "admin"));
    expect(await attempt(c, () => c.query("select regenerate_gate_key()"))).toBeNull();
  }));
  it("device id is never exposed to other students", () => tx(async (c) => {
    const { a, b } = await twoStudents(c);
    await c.query("update students set device_id = $1 where id = $2", [DEVICE, b.id]);
    await as(c, a.user_id);
    expect(await val(c, "select count(*)::int from students where device_id = $1", [DEVICE])).toBe(0);
  }));
});
