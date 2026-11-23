import fs from "node:fs";
import path from "node:path";
import pg from "pg";

/** Fresh throw-away database: Supabase stub + real migrations + fixed E2E data. */
export default async function globalSetup() {
  const base = process.env.TEST_PG_BASE ?? "postgresql://postgres@localhost:54322";
  const q = process.env.TEST_PG_QUERY ?? "?host=/tmp";
  const admin = new pg.Client({ connectionString: `${base}/postgres${q}` });
  await admin.connect();
  await admin.query("drop database if exists al_e2e with (force)");
  await admin.query("create database al_e2e");
  await admin.end();
  const c = new pg.Client({ connectionString: `${base}/al_e2e${q}` });
  await c.connect();
  await c.query("set client_min_messages = warning");
  const root = path.resolve(__dirname, "../..");
  await c.query(fs.readFileSync(path.join(root, "tests/db/supabase-stub.sql"), "utf8"));
  for (const f of fs.readdirSync(path.join(root, "supabase/migrations")).filter((x) => x.endsWith(".sql")).sort()) {
    let sql = fs.readFileSync(path.join(root, "supabase/migrations", f), "utf8");
    if (f.startsWith("0002")) sql = sql.replace(/create extension if not exists pg_cron;/i, "");
    await c.query(sql);
  }
  await c.query(fs.readFileSync(path.join(__dirname, "seed.sql"), "utf8"));
  await c.end();
}
