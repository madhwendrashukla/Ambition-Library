import { describe, expect, it } from "vitest";
import { tx, val, one, as, asSuper, attempt, mkStudent, mkMembership, mkUser, scan, setLocalTime, DEVICE, type Stu, type C } from "./helpers";

const LAT = 26.889, LNG = 80.942;
const M_PER_DEG = (Math.PI / 180) * 6371000;
async function geofence(c: C, on = true, radius = 150) {
  await asSuper(c);
  await c.query("update library_settings set geofence_enabled = $1, latitude = $2, longitude = $3, geofence_m = $4", [on, LAT, LNG, radius]);
}
async function readyStudent(c: C, shift = "Full Day", name = "Riya"): Promise<Stu> {
  const s = await mkStudent(c, name);
  await mkMembership(c, s.id, shift, "A1", -5, 20);
  return s;
}
const alerts = (c: C, id: string, kind: string) => val<number>(c, "select count(*)::int from alerts where student_id = $1 and kind = $2", [id, kind]);
const openRows = (c: C, id: string) => val<number>(c, "select count(*)::int from attendance where student_id = $1 and check_out is null", [id]);

describe("scan_gate: who / which QR", () => {
  it("staff account scanning → not_student", () => tx(async (c) => {
    const staff = await mkUser(c, "staff");
    await as(c, staff);
    const key = await (async () => { await asSuper(c); const k = await val<string>(c, "select gate_key from library_settings"); await as(c, staff); return k; })();
    expect((await val<{ code: string }>(c, "select scan_gate($1, $2)", [key, DEVICE])).code).toBe("not_student");
  }));
  it("logged-out (anon) → not_student", () => tx(async (c) => {
    await as(c, null);
    expect((await val<{ code: string }>(c, "select scan_gate('x', $1)", [DEVICE])).code).toBe("not_student");
  }));
  it.each([["wrong key", "abc123abc123"], ["empty", ""], ["null", null]])("%s → invalid_qr", (_n, key) => tx(async (c) => {
    const s = await readyStudent(c);
    expect((await scan(c, s, { key })).code).toBe("invalid_qr");
  }));
  it("old key stops working after admin regenerates the gate QR", () => tx(async (c) => {
    const s = await readyStudent(c);
    const admin = await mkUser(c, "admin");
    const old = await val<string>(c, "select gate_key from library_settings");
    await as(c, admin);
    const fresh = await val<string>(c, "select regenerate_gate_key()");
    expect(fresh).not.toBe(old);
    expect((await scan(c, s, { key: old })).code).toBe("invalid_qr");
    expect((await scan(c, s, { key: fresh })).ok).toBe(true);
  }));
});

describe("scan_gate: device binding", () => {
  it.each([["missing", null], ["too short", "abc"]])("device id %s → device_required", (_n, device) => tx(async (c) => {
    const s = await readyStudent(c);
    expect((await scan(c, s, { device })).code).toBe("device_required");
  }));
  it("first scan locks the phone to the account", () => tx(async (c) => {
    const s = await readyStudent(c);
    expect((await scan(c, s)).ok).toBe(true);
    expect(await val(c, "select device_id from students where id = $1", [s.id])).toBe(DEVICE);
  }));
  it("another phone → device_mismatch + owner alert, no attendance", () => tx(async (c) => {
    const s = await readyStudent(c);
    await scan(c, s);
    await c.query("update attendance set check_out = check_in where student_id = $1", [s.id]);
    const r = await scan(c, s, { device: "friend-phone-9999" });
    expect(r.code).toBe("device_mismatch");
    expect(await alerts(c, s.id, "device_mismatch")).toBe(1);
    expect(await val(c, "select count(*)::int from attendance where student_id = $1", [s.id])).toBe(1);
  }));
  it("after staff resets device, the new phone works", () => tx(async (c) => {
    const s = await readyStudent(c);
    await c.query("update students set device_id = 'old-phone-00000' where id = $1", [s.id]);
    const staff = await mkUser(c, "staff");
    await as(c, staff); await c.query("select reset_device($1)", [s.id]);
    expect((await scan(c, s, { device: "new-phone-11111" })).ok).toBe(true);
  }));
  it("a student cannot reset their own device", () => tx(async (c) => {
    const s = await readyStudent(c);
    await as(c, s.user_id);
    expect((await attempt(c, () => c.query("select reset_device($1)", [s.id])))?.message).toMatch(/NOT_ALLOWED/);
  }));
});

describe("scan_gate: geofence", () => {
  it("disabled → works without location", () => tx(async (c) => {
    const s = await readyStudent(c); await geofence(c, false);
    expect((await scan(c, s)).ok).toBe(true);
  }));
  it("enabled but no coordinates saved → check skipped", () => tx(async (c) => {
    const s = await readyStudent(c);
    await c.query("update library_settings set geofence_enabled = true, latitude = null, longitude = null");
    expect((await scan(c, s)).ok).toBe(true);
  }));
  it("enabled + location denied → location_required", () => tx(async (c) => {
    const s = await readyStudent(c); await geofence(c);
    expect((await scan(c, s)).code).toBe("location_required");
  }));
  it("2 km away → too_far with distance", () => tx(async (c) => {
    const s = await readyStudent(c); await geofence(c);
    const r = await scan(c, s, { lat: LAT + 2000 / M_PER_DEG, lng: LNG });
    expect(r.code).toBe("too_far");
    expect(r.distance_m).toBeGreaterThan(1990);
    expect(r.distance_m).toBeLessThan(2010);
  }));
  it("149 m inside, 151 m outside (radius 150)", () => tx(async (c) => {
    const s = await readyStudent(c); await geofence(c);
    expect((await scan(c, s, { lat: LAT + 151 / M_PER_DEG, lng: LNG })).code).toBe("too_far");
    expect((await scan(c, s, { lat: LAT + 149 / M_PER_DEG, lng: LNG })).ok).toBe(true);
  }));
  it("east-west distance also counts (longitude)", () => tx(async (c) => {
    const s = await readyStudent(c); await geofence(c);
    expect((await scan(c, s, { lat: LAT, lng: LNG + 0.01 })).code).toBe("too_far"); // ~1 km
  }));
});

describe("scan_gate: IN / OUT / cooldown", () => {
  it("IN returns seat, shift and days left; row saved as qr", () => tx(async (c) => {
    const s = await readyStudent(c);
    const r = await scan(c, s);
    expect(r).toMatchObject({ ok: true, action: "in", seat: "A1", shift: "Full Day", days_left: 20 });
    expect(await val(c, "select method from attendance where student_id = $1", [s.id])).toBe("qr");
  }));
  it("immediate second scan → cooldown (no accidental OUT)", () => tx(async (c) => {
    const s = await readyStudent(c);
    await scan(c, s);
    const r = await scan(c, s);
    expect(r.code).toBe("cooldown");
    expect(r.wait_sec).toBeGreaterThan(0);
    expect(r.wait_sec).toBeLessThanOrEqual(120);
    expect(await openRows(c, s.id)).toBe(1);
  }));
  it("scan after 3 h → OUT with minutes", () => tx(async (c) => {
    const s = await readyStudent(c);
    await c.query("update students set device_id = $2 where id = $1", [s.id, DEVICE]);
    await c.query("insert into attendance (student_id, check_in) values ($1, now() - interval '3 hours')", [s.id]);
    const r = await scan(c, s);
    expect(r).toMatchObject({ ok: true, action: "out" });
    expect(r.minutes).toBe(180);
    expect(await openRows(c, s.id)).toBe(0);
  }));
  it("second visit same day → new IN session", () => tx(async (c) => {
    const s = await readyStudent(c);
    await c.query("insert into attendance (student_id, check_in, check_out) values ($1, now() - interval '5 hours', now() - interval '2 hours')", [s.id]);
    expect((await scan(c, s)).action).toBe("in");
    expect(await val(c, "select count(*)::int from attendance where student_id = $1", [s.id])).toBe(2);
  }));
  it("cooldown also applies right after an OUT", () => tx(async (c) => {
    const s = await readyStudent(c);
    await c.query("insert into attendance (student_id, check_in, check_out) values ($1, now() - interval '3 hours', now() - interval '30 seconds')", [s.id]);
    expect((await scan(c, s)).code).toBe("cooldown");
  }));
  it("open session from yesterday is closed at shift end and today's IN starts fresh", () => tx(async (c) => {
    const s = await readyStudent(c); // Full Day 06–22
    await c.query("insert into attendance (student_id, att_date, check_in) values ($1, today_local() - 1, (today_local() - 1 + time '07:00') at time zone 'Asia/Kolkata')", [s.id]);
    const r = await scan(c, s);
    expect(r.action).toBe("in");
    const y = await one<{ auto_closed: boolean; mins: number }>(c, "select auto_closed, extract(epoch from check_out - check_in)/60 as mins from attendance where student_id = $1 and att_date = today_local() - 1", [s.id]);
    expect(y.auto_closed).toBe(true);
    expect(y.mins).toBe(15 * 60); // 07:00 → 22:00
  }));
  it("came yesterday after shift end and forgot OUT → counted as 4 h, not 0", () => tx(async (c) => {
    const s = await readyStudent(c);
    await c.query("insert into attendance (student_id, att_date, check_in, outside_shift) values ($1, today_local() - 1, (today_local() - 1 + time '22:30') at time zone 'Asia/Kolkata', true)", [s.id]);
    await scan(c, s);
    expect(await val<number>(c, "select extract(epoch from check_out - check_in)/60 from attendance where student_id = $1 and att_date = today_local() - 1", [s.id])).toBe(240);
  }));
});

describe("scan_gate: plan rules", () => {
  it("expired plan → expired + alert, no attendance", () => tx(async (c) => {
    const s = await mkStudent(c, "Late Payer");
    await mkMembership(c, s.id, "Full Day", "A1", -40, -1);
    const r = await scan(c, s);
    expect(r.code).toBe("expired");
    expect(r.end_date).toBeTruthy();
    expect(await alerts(c, s.id, "expired_entry")).toBe(1);
    expect(await val(c, "select count(*)::int from attendance where student_id = $1", [s.id])).toBe(0);
  }));
  it("no plan at all → expired", () => tx(async (c) => {
    const s = await mkStudent(c);
    expect((await scan(c, s)).code).toBe("expired");
  }));
  it("plan ending today still allows entry", () => tx(async (c) => {
    const s = await mkStudent(c);
    await mkMembership(c, s.id, "Full Day", null, -29, 0);
    expect((await scan(c, s)).ok).toBe(true);
  }));
  it("plan starting tomorrow → not_started (not 'plan expired')", () => tx(async (c) => {
    const s = await mkStudent(c);
    await mkMembership(c, s.id, "Full Day", null, 1, 30);
    expect((await scan(c, s)).code).toBe("not_started");
  }));
  it("cancelled plan does not count", () => tx(async (c) => {
    const s = await mkStudent(c);
    await mkMembership(c, s.id, "Full Day", null, -5, 20, 700, { status: "cancelled" });
    expect((await scan(c, s)).code).toBe("expired");
  }));
  it("student marked LEFT → inactive", () => tx(async (c) => {
    const s = await readyStudent(c);
    await c.query("update students set status = 'left' where id = $1", [s.id]);
    expect((await scan(c, s)).code).toBe("inactive");
  }));
});

describe("scan_gate: shift window", () => {
  it.each([
    ["Morning", "07:00", false], ["Morning", "05:40", false], ["Morning", "05:20", true],
    ["Morning", "14:00", false], ["Morning", "15:30", true], ["Evening", "13:45", false],
    ["Evening", "09:00", true], ["Evening", "21:59", false], ["Full Day", "23:30", false],
  ])("%s plan, scan at %s → outside_shift=%s", (shift, time, outside) => tx(async (c) => {
    const s = await readyStudent(c, shift as string);
    await setLocalTime(c, time as string);
    const r = await scan(c, s);
    expect(r.ok).toBe(true);
    expect(r.outside_shift).toBe(outside);
    expect(await alerts(c, s.id, "outside_shift")).toBe(outside ? 1 : 0);
  }));
  it("grace setting is respected (0 min grace)", () => tx(async (c) => {
    const s = await readyStudent(c, "Morning");
    await c.query("update library_settings set checkin_grace_min = 0");
    await setLocalTime(c, "05:50");
    expect((await scan(c, s)).outside_shift).toBe(true);
  }));
});

describe("staff_mark (desk fallback)", () => {
  it("by personal QR token: IN then OUT, method staff", () => tx(async (c) => {
    const s = await readyStudent(c);
    const staff = await mkUser(c, "staff");
    await as(c, staff);
    expect((await val<{ action: string }>(c, "select staff_mark($1)", [s.qr_token])).action).toBe("in");
    await asSuper(c);
    await c.query("update attendance set check_in = now() - interval '2 hours' where student_id = $1", [s.id]);
    await as(c, staff);
    expect((await val<{ action: string }>(c, "select staff_mark($1)", [s.qr_token])).action).toBe("out");
    await asSuper(c);
    expect(await val(c, "select method from attendance where student_id = $1", [s.id])).toBe("staff");
  }));
  it("by student id (manual tap)", () => tx(async (c) => {
    const s = await readyStudent(c);
    await as(c, await mkUser(c, "admin"));
    expect((await val<{ ok: boolean }>(c, "select staff_mark(null, $1)", [s.id])).ok).toBe(true);
  }));
  it("unknown token → not_found", () => tx(async (c) => {
    await as(c, await mkUser(c, "staff"));
    expect((await val<{ code: string }>(c, "select staff_mark('nope')")).code).toBe("not_found");
  }));
  it("expired student: refused, but staff can force entry", () => tx(async (c) => {
    const s = await mkStudent(c);
    await mkMembership(c, s.id, "Full Day", null, -40, -1);
    await as(c, await mkUser(c, "staff"));
    expect((await val<{ code: string }>(c, "select staff_mark($1)", [s.qr_token])).code).toBe("expired");
    expect((await val<{ ok: boolean }>(c, "select staff_mark($1, null, true)", [s.qr_token])).ok).toBe(true);
  }));
  it("force bypasses cooldown", () => tx(async (c) => {
    const s = await readyStudent(c);
    await as(c, await mkUser(c, "staff"));
    await c.query("select staff_mark($1)", [s.qr_token]);
    expect((await val<{ code: string }>(c, "select staff_mark($1)", [s.qr_token])).code).toBe("cooldown");
    expect((await val<{ action: string }>(c, "select staff_mark($1, null, true)", [s.qr_token])).action).toBe("out");
  }));
  it("students cannot use staff_mark", () => tx(async (c) => {
    const s = await readyStudent(c);
    await as(c, s.user_id);
    expect((await attempt(c, () => c.query("select staff_mark($1)", [s.qr_token])))?.message).toMatch(/NOT_ALLOWED/);
  }));
});
