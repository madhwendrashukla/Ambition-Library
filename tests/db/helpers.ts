import pg from "pg";
import { TEST_URL } from "./env";

pg.types.setTypeParser(1082, (v) => v); // date → 'YYYY-MM-DD'
pg.types.setTypeParser(1700, (v) => Number(v)); // numeric → number
export const pool = new pg.Pool({ connectionString: TEST_URL, max: 4 });
export type C = pg.PoolClient;

/** Every test runs inside a transaction that is rolled back → tests never see each other's data. */
export async function tx<T>(fn: (c: C) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("set local client_min_messages = warning");
    return await fn(c);
  } finally {
    await c.query("rollback").catch(() => {});
    c.release();
  }
}

export async function one<T = Record<string, unknown>>(c: C, sql: string, params: unknown[] = []): Promise<T> {
  const r = await c.query(sql, params);
  return r.rows[0] as T;
}
export async function val<T = unknown>(c: C, sql: string, params: unknown[] = []): Promise<T> {
  const r = await c.query(sql, params);
  return r.rows[0] ? (Object.values(r.rows[0])[0] as T) : (undefined as T);
}

/** Switch the session to a logged-in Supabase user (RLS applies). */
export async function as(c: C, userId: string | null) {
  await c.query("reset role");
  if (userId === null) {
    await c.query("set local role anon");
    await c.query("select set_config('request.jwt.claims', '', true)");
  } else {
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
  }
}
export async function asSuper(c: C) {
  await c.query("reset role");
  await c.query("select set_config('request.jwt.claims', '', true)");
}

/** Savepoint wrapper: lets a test expect an error without aborting the whole transaction. */
export async function attempt(c: C, fn: () => Promise<unknown>): Promise<Error | null> {
  await c.query("savepoint sp");
  try { await fn(); await c.query("release savepoint sp"); return null; }
  catch (e) { await c.query("rollback to savepoint sp"); return e as Error; }
}

let n = 0;
export async function mkUser(c: C, role: "admin" | "staff" | "student", name = role) {
  await asSuper(c); // fixtures are created with full rights
  const id = (await one<{ id: string }>(c, "insert into auth.users (email) values ($1) returning id", [`${role}${Date.now()}${n++}@t.in`])).id;
  await c.query("insert into public.profiles (id, role, full_name) values ($1, $2, $3)", [id, role, name]);
  return id;
}

export interface Stu { id: string; user_id: string; qr_token: string; code: string; phone: string }
export async function mkStudent(c: C, name = "Test Student", opts: { device?: string | null; status?: string; phone?: string } = {}): Promise<Stu> {
  await asSuper(c);
  const uid = await mkUser(c, "student", name);
  const phone = opts.phone ?? String(7000000000 + Math.floor(Math.random() * 999999999)).slice(0, 10);
  return one<Stu>(c,
    "insert into public.students (user_id, full_name, phone, device_id, status) values ($1,$2,$3,$4,$5) returning id, user_id, qr_token, code, phone",
    [uid, name, phone, opts.device === undefined ? null : opts.device, opts.status ?? "active"]);
}

export async function shiftId(c: C, name: string) { return val<string>(c, "select id from public.shifts where name = $1", [name]); }
export async function seatId(c: C, label: string) { return val<string>(c, "select id from public.seats where label = $1", [label]); }

/** Membership with dates relative to library "today" (offsets in days). */
export async function mkMembership(c: C, studentId: string, shift: string, seat: string | null, startOff: number, endOff: number, fee = 700, extra: { admission_fee?: number; discount?: number; status?: string } = {}) {
  return one<{ id: string; total: number }>(c,
    `insert into public.memberships (student_id, shift_id, seat_id, start_date, end_date, fee, admission_fee, discount, status)
     values ($1, (select id from public.shifts where name = $2), (select id from public.seats where label = $3),
             public.today_local() + $4::int, public.today_local() + $5::int, $6, $7, $8, $9) returning id, total`,
    [studentId, shift, seat, startOff, endOff, fee, extra.admission_fee ?? 0, extra.discount ?? 0, extra.status ?? "active"]);
}

export const DEVICE = "device-aaaa-1111";
export async function gateKey(c: C) { return val<string>(c, "select gate_key from public.library_settings where id = 1"); }

export interface Scan { ok: boolean; code?: string; action?: string; minutes?: number; wait_sec?: number; distance_m?: number; outside_shift?: boolean; seat?: string; shift?: string; days_left?: number; end_date?: string; name?: string }
export async function scan(c: C, s: Stu, o: { key?: string | null; device?: string | null; lat?: number | null; lng?: number | null } = {}) {
  await as(c, s.user_id);
  const key = o.key === undefined ? await valAsSuper(c, "select gate_key from public.library_settings where id = 1", s.user_id) : o.key;
  const r = await val<Scan>(c, "select public.scan_gate($1, $2, $3, $4)", [key, o.device === undefined ? DEVICE : o.device, o.lat ?? null, o.lng ?? null]);
  await asSuper(c);
  return r;
}
async function valAsSuper(c: C, sql: string, back: string) {
  await asSuper(c); const v = await val<string>(c, sql); await as(c, back); return v;
}

/** Freeze the library clock (only inside the current test transaction). */
export async function setLocalTime(c: C, hhmm: string) {
  await asSuper(c);
  await c.query(`create or replace function public.now_local_time() returns time language sql stable as $$ select time '${hhmm}' $$`);
}
