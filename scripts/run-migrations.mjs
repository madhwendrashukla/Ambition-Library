// Run the SQL migrations in supabase/migrations against your Supabase database.
//   1. Supabase → Connect → Session pooler → copy the connection string
//   2. Add it to .env.local as DATABASE_URL=... (with your DB password filled in)
//   3. npm run migrate              (or `npm run migrate -- 0004` to run just one file)
// Each file runs in its own transaction; it stops at the first error.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

try { process.loadEnvFile(".env.local"); } catch {}
const url = process.env.DATABASE_URL;
if (!url) { console.error("Add DATABASE_URL to .env.local first (Supabase → Connect → Session pooler)."); process.exit(1); }

const dir = "supabase/migrations";
// optional: only run files whose name starts with this (e.g. `npm run migrate -- 0004`)
const only = process.argv[2];
const files = readdirSync(dir).filter((f) => f.endsWith(".sql") && (!only || f.startsWith(only))).sort();
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  console.log("Connected to the database.");
  for (const f of files) {
    process.stdout.write(`→ ${f} … `);
    try {
      await client.query("begin");
      await client.query(readFileSync(join(dir, f), "utf8"));
      await client.query("commit");
      console.log("done");
    } catch (e) {
      await client.query("rollback").catch(() => {});
      console.log("FAILED");
      console.error(`   ${e.message}`);
      process.exit(1);
    }
  }
  console.log("✅ All migrations applied.");
} catch (e) {
  console.error("Could not connect:", e.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
