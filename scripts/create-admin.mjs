// Create the first admin (library owner):
//   npm run create-admin                       → asks for email, name and password (password is hidden)
//   node scripts/create-admin.mjs owner@email.com "StrongPass123" "Owner Name"
import { createClient } from "@supabase/supabase-js";
import readline from "node:readline";
try { process.loadEnvFile(".env.local"); } catch {}

function ask(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); else if (s.includes("\n") || s.includes("\r")) rl.output.write("\n"); else rl.output.write("*"); };
    rl.question(question, (a) => { rl.close(); resolve(a.trim()); });
  });
}

let [email, password, name] = process.argv.slice(2);
if (!email) email = await ask("Owner email: ");
if (!name) name = (await ask("Owner name: ")) || "Owner";
while (!password) {
  const p1 = await ask("Password (min 8 characters): ", true);
  if (p1.length < 8) { console.log("Too short, try again."); continue; }
  const p2 = await ask("Repeat password: ", true);
  if (p1 !== p2) { console.log("Passwords don't match, try again."); continue; }
  password = p1;
}
if (!email || !password) { console.error('Usage: node scripts/create-admin.mjs <email> <password> "<name>"'); process.exit(1); }
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local"); process.exit(1); }

const db = createClient(url, key, { auth: { persistSession: false } });
let userId;
const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } });
if (error) {
  if (!/already/i.test(error.message)) { console.error(error.message); process.exit(1); }
  const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 });
  userId = list.users.find((u) => u.email === email)?.id;
  await db.auth.admin.updateUserById(userId, { password });
} else userId = data.user.id;

const { error: e2 } = await db.from("profiles").upsert({ id: userId, role: "admin", full_name: name });
if (e2) { console.error(e2.message); process.exit(1); }
console.log(`✅ Admin ready: ${email}  →  /login (Staff tab)`);
