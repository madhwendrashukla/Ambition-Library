import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { ADMIN_URL, DB_NAME, TEST_URL } from "./env";

const MIG = path.resolve(__dirname, "../../supabase/migrations");
export function migrationSql(file: string) {
  let sql = fs.readFileSync(path.join(MIG, file), "utf8");
  // plain Postgres has no pg_cron extension; the stub provides cron.schedule instead
  if (file.startsWith("0002")) sql = sql.replace(/create extension if not exists pg_cron;/i, "");
  return sql;
}
export const MIGRATIONS = fs.readdirSync(MIG).filter((f) => f.endsWith(".sql")).sort();

export default async function setup() {
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`drop database if exists ${DB_NAME} with (force)`);
  await admin.query(`create database ${DB_NAME}`);
  await admin.end();

  const c = new pg.Client({ connectionString: TEST_URL });
  await c.connect();
  await c.query("set client_min_messages = warning");
  await c.query(fs.readFileSync(path.join(__dirname, "supabase-stub.sql"), "utf8"));
  for (const f of MIGRATIONS) {
    try { await c.query(migrationSql(f)); }
    catch (e) { throw new Error(`Migration ${f} failed: ${(e as Error).message}`); }
  }
  await c.end();
}
