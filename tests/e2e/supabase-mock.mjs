// Test double for Supabase used ONLY by the E2E tests.
// Implements the bits the app uses: Auth (password login, admin user API), a PostgREST subset
// (select with embeds, filters, order, insert/update/delete, rpc) and a dummy Storage.
// Queries run on a real Postgres with the real migrations and RLS: a request with a user token
// runs as role `authenticated` with that user's id, the service key runs as owner, no token = anon.
import http from "node:http";
import pg from "pg";

const PORT = Number(process.env.MOCK_PORT ?? 54321);
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "service-test-key";
const DB = process.env.E2E_DB_URL ?? "postgresql://postgres@localhost:54322/al_e2e?host=/tmp";
pg.types.setTypeParser(1082, (v) => v);
const pool = new pg.Pool({ connectionString: DB, max: 8 });

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (sub, email) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub, email, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 86400 })}.sig`;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

function who(req) {
  const tok = (req.headers.authorization || "").replace(/^Bearer /i, "");
  if (tok === SERVICE_KEY) return { role: "service" };
  try {
    const p = JSON.parse(Buffer.from(tok.split(".")[1], "base64url"));
    if (p.sub) return { role: "user", sub: p.sub };
  } catch { /* anon */ }
  return { role: "anon" };
}

let COLS = null;
async function cols() {
  if (COLS) return COLS;
  const { rows } = await pool.query("select table_name t, column_name c from information_schema.columns where table_schema='public'");
  COLS = {}; for (const r of rows) (COLS[r.t] ||= new Set()).add(r.c);
  return COLS;
}
const sing = (t) => t.replace(/s$/, "");
const qi = (s) => '"' + String(s).replace(/"/g, "") + '"';
function splitTop(s) {
  const out = []; let depth = 0, cur = "";
  for (const ch of s) { if (ch === "(") depth++; if (ch === ")") depth--; if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch; }
  if (cur) out.push(cur); return out.map((x) => x.trim()).filter(Boolean);
}
function parseSelect(s) {
  const plain = [], embeds = [];
  for (const part of splitTop(s || "*")) {
    const m = part.match(/^(?:(\w+):)?(\w+)(?:!\w+)?\((.*)\)$/s);
    if (m) embeds.push({ alias: m[1] || m[2], table: m[2], select: m[3] }); else plain.push(part);
  }
  return { plain, embeds };
}
function cond(col, raw, params) {
  const i = raw.indexOf("."); const op = raw.slice(0, i); const v = raw.slice(i + 1);
  const c = `t.${qi(col)}`;
  const p = (x) => { params.push(x); return `$${params.length}`; };
  switch (op) {
    case "eq": return `${c}::text = ${p(v)}`;
    case "neq": return `${c}::text <> ${p(v)}`;
    case "gt": case "gte": case "lt": case "lte": return `${c} ${{ gt: ">", gte: ">=", lt: "<", lte: "<=" }[op]} ${p(v)}`;
    case "is": return `${c} is ${v === "null" ? "null" : v === "true" ? "true" : "false"}`;
    case "in": return `${c}::text = any(${p(v.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, "")))})`;
    case "ilike": case "like": return `${c}::text ilike ${p(v.replace(/\*/g, "%"))}`;
    case "not": { const [op2, ...rest] = v.split("."); return `not (${cond(col, op2 + "." + rest.join("."), params)})`; }
    default: throw Object.assign(new Error("mock: unsupported filter " + op), { status: 400 });
  }
}
async function selectRows(db, table, sel, where = [], params = [], order = null, limit = null, offset = null) {
  const C = await cols();
  const { plain, embeds } = parseSelect(sel);
  const fields = plain.length === 0 || plain.includes("*") ? "t.*" : plain.map((f) => `t.${qi(f.split(":").pop())}`).concat(embeds.length ? ["t.*"] : []).join(", ");
  let sql = `select ${fields} from public.${qi(table)} t`;
  if (where.length) sql += " where " + where.join(" and ");
  if (order) sql += " order by " + order;
  if (limit) sql += ` limit ${Number(limit)}`;
  if (offset) sql += ` offset ${Number(offset)}`;
  const { rows } = await db.query(sql, params);
  for (const e of embeds) {
    const fk = `${sing(e.table)}_id`, back = `${sing(table)}_id`;
    for (const r of rows) {
      if (C[table]?.has(fk)) r[e.alias] = r[fk] == null ? null : (await selectRows(db, e.table, e.select, ["t.id::text = $1"], [String(r[fk])]))[0] ?? null;
      else if (C[e.table]?.has(back)) r[e.alias] = await selectRows(db, e.table, e.select, [`t.${qi(back)}::text = $1`], [String(r.id)]);
    }
  }
  if (plain.length && !plain.includes("*")) {
    const keep = new Set([...plain.map((f) => f.split(":").pop()), ...embeds.map((e) => e.alias)]);
    for (const r of rows) for (const k of Object.keys(r)) if (!keep.has(k)) delete r[k];
  }
  return rows;
}

async function asCaller(w, fn) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    if (w.role === "user") {
      await c.query("set local role authenticated");
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: w.sub, role: "authenticated" })]);
    } else if (w.role === "anon") await c.query("set local role anon");
    const r = await fn(c);
    await c.query("commit");
    return r;
  } catch (e) { await c.query("rollback"); throw e; } finally { c.release(); }
}

function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  res.writeHead(status, { "content-type": isBuf ? "image/png" : "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "content-range", ...headers });
  res.end(body === undefined ? "" : isBuf ? body : JSON.stringify(body));
}
const userJson = (id, email) => ({ id, email, aud: "authenticated", role: "authenticated", app_metadata: { provider: "email" }, user_metadata: {}, email_confirmed_at: new Date().toISOString(), created_at: new Date().toISOString() });
const pgErr = (e) => ({ code: e.code, message: e.message, details: e.detail ?? null, hint: e.hint ?? null });

http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204);
  const url = new URL(req.url, "http://x");
  const chunks = []; for await (const ch of req) chunks.push(ch);
  const rawBuf = Buffer.concat(chunks);
  const isJson = (req.headers["content-type"] || "").includes("json");
  let body = {};
  if (isJson && rawBuf.length) body = JSON.parse(rawBuf.toString());
  const w = who(req);
  try {
    // ---------------- Auth ----------------
    if (url.pathname === "/auth/v1/token") {
      const { rows } = await pool.query("select u.id, u.email, p.pw from auth.users u left join auth.passwords p on p.email = u.email where lower(u.email) = lower($1)", [body.email ?? ""]);
      if (!rows[0] || rows[0].pw !== body.password) return send(res, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
      return send(res, 200, { access_token: jwt(rows[0].id, rows[0].email), token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "r-" + rows[0].id, user: userJson(rows[0].id, rows[0].email) });
    }
    if (url.pathname === "/auth/v1/user") {
      if (w.role !== "user") return send(res, 401, { code: 401, msg: "no session" });
      const { rows } = await pool.query("select id, email from auth.users where id = $1", [w.sub]);
      if (!rows[0]) return send(res, 401, { code: 401, msg: "user gone" });
      if (req.method === "PUT") {
        if (body.password) {
          if (String(body.password).length < 6) return send(res, 422, { code: 422, error_code: "weak_password", msg: "Password should be at least 6 characters." });
          await pool.query("insert into auth.passwords (email, pw) values ($1, $2) on conflict (email) do update set pw = excluded.pw", [rows[0].email, body.password]);
        }
      }
      return send(res, 200, userJson(rows[0].id, rows[0].email));
    }
    if (url.pathname.startsWith("/auth/v1/logout")) return send(res, 204);
    const adm = url.pathname.match(/^\/auth\/v1\/admin\/users(?:\/([\w-]+))?$/);
    if (adm) {
      if (w.role !== "service") return send(res, 403, { code: 403, msg: "service role required" });
      const id = adm[1];
      if (req.method === "POST") {
        if (!body.password || String(body.password).length < 6) return send(res, 422, { code: 422, error_code: "weak_password", msg: "Password should be at least 6 characters." });
        const ex = await pool.query("select 1 from auth.users where lower(email) = lower($1)", [body.email]);
        if (ex.rowCount) return send(res, 422, { code: 422, error_code: "email_exists", msg: "A user with this email address has already been registered" });
        const { rows } = await pool.query("insert into auth.users (email) values (lower($1)) returning id, email", [body.email]);
        await pool.query("insert into auth.passwords (email, pw) values ($1, $2)", [rows[0].email, body.password]);
        return send(res, 200, userJson(rows[0].id, rows[0].email));
      }
      if (req.method === "PUT" && id) {
        const { rows } = await pool.query("select email from auth.users where id = $1", [id]);
        if (!rows[0]) return send(res, 404, { code: 404, msg: "User not found" });
        let email = rows[0].email;
        if (body.email && body.email.toLowerCase() !== email) {
          const ex = await pool.query("select 1 from auth.users where lower(email) = lower($1)", [body.email]);
          if (ex.rowCount) return send(res, 422, { code: 422, error_code: "email_exists", msg: "A user with this email address has already been registered" });
          await pool.query("update auth.users set email = lower($1) where id = $2", [body.email, id]);
          await pool.query("update auth.passwords set email = lower($1) where email = $2", [body.email, email]);
          email = body.email.toLowerCase();
        }
        if (body.password) await pool.query("insert into auth.passwords (email, pw) values ($1, $2) on conflict (email) do update set pw = excluded.pw", [email, body.password]);
        return send(res, 200, userJson(id, email));
      }
      if (req.method === "DELETE" && id) {
        const { rows } = await pool.query("delete from auth.users where id = $1 returning email", [id]);
        if (rows[0]) await pool.query("delete from auth.passwords where email = $1", [rows[0].email]);
        return send(res, 200, {});
      }
      if (req.method === "GET") {
        const { rows } = await pool.query("select id, email from auth.users order by created_at");
        return send(res, 200, { users: rows.map((r) => userJson(r.id, r.email)), aud: "authenticated" });
      }
    }

    // ---------------- Storage (accepts uploads, serves a 1px image) ----------------
    if (url.pathname.startsWith("/storage/v1/object/sign/")) {
      if (req.method === "GET") return send(res, 200, PNG);
      return send(res, 200, { signedURL: url.pathname.replace("/storage/v1", "") + "?token=t" });
    }
    if (url.pathname.startsWith("/storage/v1/object/")) {
      if (req.method === "GET") return send(res, 200, PNG);
      if (w.role === "anon") return send(res, 403, { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" });
      return send(res, 200, { Key: url.pathname.replace("/storage/v1/object/", ""), Id: "x" });
    }
    if (url.pathname.startsWith("/realtime/")) return send(res, 404, {});

    // ---------------- RPC ----------------
    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/);
    if (rpc) {
      const fn = rpc[1];
      const { rows: [p] } = await pool.query("select proretset, proargnames, (select array_agg(format_type(t, null) order by o) from unnest(proargtypes) with ordinality u(t, o)) types from pg_proc where proname = $1 and pronamespace = 'public'::regnamespace order by pronargs desc limit 1", [fn]);
      if (!p) return send(res, 404, { code: "PGRST202", message: `Could not find the function public.${fn}` });
      const params = [], args = [];
      (p.proargnames || []).forEach((n, i) => { if (n in body) { params.push(body[n]); args.push(`${n} => $${params.length}::${p.types[i]}`); } });
      const sql = p.proretset ? `select * from public.${fn}(${args.join(",")})` : `select public.${fn}(${args.join(",")}) as r`;
      const out = await asCaller(w, (c) => c.query(sql, params));
      return send(res, 200, p.proretset ? out.rows : out.rows[0]?.r ?? null);
    }

    // ---------------- Tables ----------------
    const tm = url.pathname.match(/^\/rest\/v1\/(\w+)$/);
    if (tm) {
      const table = tm[1];
      const params = [], where = [];
      let order = null, limit = null, offset = null, sel = "*";
      for (const [k, v] of url.searchParams) {
        if (k === "select") sel = v;
        else if (k === "order") order = v.split(",").map((o) => { const [c, d, n] = o.split("."); return `t.${qi(c)} ${d === "desc" ? "desc" : "asc"}${n === "nullslast" ? " nulls last" : n === "nullsfirst" ? " nulls first" : ""}`; }).join(", ");
        else if (k === "limit") limit = v;
        else if (k === "offset") offset = v;
        else if (["columns", "on_conflict"].includes(k)) continue;
        else where.push(cond(k, v, params));
      }
      const single = (req.headers.accept || "").includes("vnd.pgrst.object");
      const wantRows = (req.headers.prefer || "").includes("return=representation");
      if (req.method === "GET" || req.method === "HEAD") {
        const rows = await asCaller(w, (c) => selectRows(c, table, sel, where, params, order, limit, offset));
        if (single) return rows.length === 1 ? send(res, 200, rows[0]) : send(res, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `The result contains ${rows.length} rows` });
        return send(res, 200, rows, { "content-range": `0-${Math.max(0, rows.length - 1)}/${rows.length}` });
      }
      if (req.method === "POST") {
        const list = Array.isArray(body) ? body : [body];
        const out = await asCaller(w, async (c) => {
          const acc = [];
          for (const r of list) {
            const ks = Object.keys(r).filter((k) => r[k] !== undefined);
            const q = `insert into public.${qi(table)} (${ks.map(qi).join(",")}) values (${ks.map((_, i) => `$${i + 1}`).join(",")}) returning *`;
            acc.push((await c.query(q, ks.map((k) => r[k]))).rows[0]);
          }
          return selectAfter(c, table, sel, acc);
        });
        if (!wantRows) return send(res, 201);
        return send(res, 201, single ? out[0] : out);
      }
      if (req.method === "PATCH") {
        const ks = Object.keys(body);
        const base = params.length;
        const set = ks.map((k, i) => `${qi(k)} = $${base + i + 1}`).join(", ");
        const out = await asCaller(w, async (c) => {
          const rows = (await c.query(`update public.${qi(table)} t set ${set} ${where.length ? "where " + where.join(" and ") : ""} returning *`, [...params, ...ks.map((k) => body[k])])).rows;
          return selectAfter(c, table, sel, rows);
        });
        if (!wantRows) return send(res, 204);
        if (single) return out.length === 1 ? send(res, 200, out[0]) : send(res, 406, { code: "PGRST116", message: "0 rows" });
        return send(res, 200, out);
      }
      if (req.method === "DELETE") {
        await asCaller(w, (c) => c.query(`delete from public.${qi(table)} t ${where.length ? "where " + where.join(" and ") : ""}`, params));
        return send(res, 204);
      }
    }
    send(res, 404, { message: "mock: unknown " + url.pathname });
  } catch (e) {
    if (e.status) return send(res, e.status, { message: e.message });
    const status = e.code === "42501" ? 403 : e.code === "23505" ? 409 : 400;
    if (process.env.MOCK_LOG) console.error(req.method, req.url, e.message);
    send(res, status, pgErr(e));
  }
}).listen(PORT, () => console.log(`supabase mock on :${PORT} → ${DB}`));

async function selectAfter(c, table, sel, rows) {
  if (!rows.length || !sel || sel === "*") return rows;
  const ids = rows.map((r) => r.id).filter(Boolean);
  if (!ids.length) return rows;
  return selectRows(c, table, sel, [`t.id::text = any($1)`], [ids.map(String)]);
}
