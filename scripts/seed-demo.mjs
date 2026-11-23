// Demo data (12 students, plans, payments, 2 weeks of attendance) — for demo/testing only
//   node scripts/seed-demo.mjs
// PIN for all demo students: 1234
import { createClient } from "@supabase/supabase-js";
try { process.loadEnvFile(".env.local"); } catch {}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const domain = process.env.NEXT_PUBLIC_STUDENT_EMAIL_DOMAIN || "students.ambition.app";
if (!url || !key) { console.error("Env missing"); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });

const names = ["Aarav Mishra", "Priya Verma", "Rohit Yadav", "Sneha Gupta", "Aman Tiwari", "Kavya Singh", "Vikas Pandey", "Neha Srivastava", "Rahul Maurya", "Anjali Dubey", "Saurabh Shukla", "Pooja Chaurasia"];
const exams = ["UPSC CSE", "UPPSC", "SSC CGL", "NEET", "JEE", "Bank PO", "CA Foundation"];
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

const { data: shifts } = await db.from("shifts").select("*").order("sort");
const { data: plans } = await db.from("plans").select("*");
const { data: seats } = await db.from("seats").select("*").order("label");
if (!shifts?.length || !plans?.length) { console.error("Run the migrations + seed SQL first"); process.exit(1); }

let seatIdx = 0;
for (let i = 0; i < names.length; i++) {
  const phone = String(9800000000 + i * 1111);
  const email = `${phone}@${domain}`;
  let { data: au, error } = await db.auth.admin.createUser({ email, password: "al#1234#pin", email_confirm: true });
  if (error) { const { data: l } = await db.auth.admin.listUsers({ perPage: 1000 }); au = { user: l.users.find((u) => u.email === email) }; }
  const uid = au.user.id;
  await db.from("profiles").upsert({ id: uid, role: "student", full_name: names[i] });
  const { data: st, error: se } = await db.from("students").upsert({ user_id: uid, full_name: names[i], phone, exam_target: exams[i % exams.length], admission_date: addDays(-40 + i) }, { onConflict: "phone" }).select().single();
  if (se) { console.error(se.message); continue; }

  const shift = shifts[i % 3];
  const plan = plans.find((p) => p.shift_id === shift.id && p.duration_days === 30) ?? plans[0];
  // mix of states: active, expiring, expired
  const startOffset = i % 4 === 0 ? -35 : i % 4 === 1 ? -26 : -10;
  const start = addDays(startOffset), end = addDays(startOffset + plan.duration_days - 1);
  const seat = seats[seatIdx++ % seats.length];
  const { data: mem, error: me } = await db.from("memberships").insert({ student_id: st.id, plan_id: plan.id, shift_id: shift.id, seat_id: seat.id, start_date: start, end_date: end, fee: plan.price, admission_fee: plan.admission_fee, discount: 0 }).select().single();
  if (me) { console.error(names[i], me.message); continue; }
  const paid = i % 5 === 0 ? Number(plan.price) / 2 : Number(plan.price) + Number(plan.admission_fee);
  await db.from("payments").insert({ student_id: st.id, membership_id: mem.id, amount: paid, mode: i % 2 ? "upi" : "cash", paid_at: new Date(start + "T10:00:00+05:30").toISOString() });

  // attendance for last 14 days
  const rows = [];
  for (let d = 13; d >= 1; d--) {
    if (Math.random() < 0.2) continue;
    const day = addDays(-d);
    if (day < start || day > end) continue;
    const [sh] = shift.start_time.split(":").map(Number);
    const inT = new Date(`${day}T${String(sh).padStart(2, "0")}:${String(Math.floor(Math.random() * 40)).padStart(2, "0")}:00+05:30`);
    const outT = new Date(inT.getTime() + (4 + Math.random() * 4) * 3600_000);
    rows.push({ student_id: st.id, att_date: day, check_in: inT.toISOString(), check_out: outT.toISOString(), method: "qr" });
  }
  if (rows.length) await db.from("attendance").insert(rows);
  console.log(`✓ ${names[i]}  ${phone} / PIN 1234`);
}
await db.from("notices").insert([{ title: "Library stays open on Diwali 🪔", body: "Normal timings. Please keep noise low.", pinned: true }, { title: "New AC section", body: "AC has been installed in rows A–C.", pinned: false }]);
console.log("Demo data ready ✅");
