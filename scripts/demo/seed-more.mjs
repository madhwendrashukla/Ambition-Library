// Extra demo data for the client demo: 36 more students, today's live attendance,
// enquiries, expenses, alerts and notices. Safe to run once after scripts/seed-demo.mjs.
//   node scripts/demo/seed-more.mjs
// All demo students: PIN 1234. Phones 97100000xx.
import { createClient } from "@supabase/supabase-js";
try { process.loadEnvFile(".env.local"); } catch {}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const domain = process.env.NEXT_PUBLIC_STUDENT_EMAIL_DOMAIN || "students.ambition.app";
if (!url || !key) { console.error("Env missing"); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });

const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const addDays = (n) => { const d = new Date(today + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const at = (day, hh, mm) => new Date(`${day}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+05:30`).toISOString();
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

const names = ["Aditya Srivastava", "Shreya Mishra", "Harsh Vardhan", "Ishita Rawat", "Manish Kushwaha", "Ritika Saxena", "Deepak Chauhan", "Tanvi Agarwal",
  "Arjun Rajput", "Nikita Bajpai", "Siddharth Jaiswal", "Muskan Fatima", "Vivek Nigam", "Khushi Awasthi", "Abhishek Patel", "Simran Kaur",
  "Ravi Shankar", "Aisha Khan", "Gaurav Tripathi", "Pallavi Dixit", "Kunal Verma", "Sakshi Pathak", "Ankit Rastogi", "Nandini Sinha",
  "Yash Bhardwaj", "Divya Mehrotra", "Utkarsh Singh", "Shivani Yadav", "Prateek Gupta", "Megha Sharma", "Rohan Kapoor", "Aditi Pandey",
  "Sameer Ansari", "Jyoti Kumari", "Akash Mourya", "Bhavna Rai"];
const exams = ["UPSC CSE", "UPPSC PCS", "SSC CGL", "NEET", "JEE Main", "Bank PO", "CA Foundation", "CTET", "RRB NTPC", "UP Police"];

await db.from("library_settings").update({
  tagline: "Self Study Library · Lucknow", phone: "9876543210", upi_id: "ambitionlibrary@upi",
  address: "2nd Floor, Kapoorthala Complex, Aliganj, Lucknow 226024", auto_checkout_min: 30,
}).eq("id", 1);

const { data: shifts } = await db.from("shifts").select("*").order("sort");
const { data: plans } = await db.from("plans").select("*");
const { data: seats } = await db.from("seats").select("*").order("row_no").order("col_no");
if (!shifts?.length || !plans?.length) { console.error("Run the migrations first"); process.exit(1); }
const { data: taken } = await db.from("memberships").select("seat_id").eq("status", "active");
const free = seats.filter((s) => !taken.some((t) => t.seat_id === s.id));

let made = 0;
for (let i = 0; i < names.length; i++) {
  const phone = "97100000" + String(i).padStart(2, "0");
  const email = `${phone}@${domain}`;
  let { data: au, error } = await db.auth.admin.createUser({ email, password: "al#1234#pin", email_confirm: true });
  if (error) { const { data: l } = await db.auth.admin.listUsers({ perPage: 1000 }); au = { user: l.users.find((u) => u.email === email) }; }
  const uid = au.user.id;
  await db.from("profiles").upsert({ id: uid, role: "student", full_name: names[i] });
  const { data: st, error: se } = await db.from("students").upsert({
    user_id: uid, full_name: names[i], phone, exam_target: exams[i % exams.length], gender: i % 2 ? "Female" : "Male",
    guardian_name: "Mr. " + names[i].split(" ")[1], admission_date: addDays(-60 + i),
  }, { onConflict: "phone" }).select().single();
  if (se) { console.error(se.message); continue; }
  const { count: hasMem } = await db.from("memberships").select("id", { count: "exact", head: true }).eq("student_id", st.id);
  if (hasMem) continue; // already seeded

  const shift = shifts[i % 5 === 4 ? 2 : i % 2];            // mostly Morning/Evening, some Full Day
  const quarterly = i % 6 === 0;
  const plan = plans.find((p) => p.shift_id === shift.id && p.duration_days === (quarterly ? 90 : 30)) ?? plans[0];
  // states: most active, a few expiring this week, a few expired
  const startOffset = i % 9 === 0 ? -34 : i % 7 === 0 ? -25 : quarterly ? -40 : -Math.floor(rnd() * 20);
  const start = addDays(startOffset), end = addDays(startOffset + plan.duration_days - 1);
  const seat = free[i % free.length];
  const { data: mem, error: me } = await db.from("memberships").insert({
    student_id: st.id, plan_id: plan.id, shift_id: shift.id, seat_id: seat.id, start_date: start, end_date: end,
    fee: plan.price, admission_fee: plan.admission_fee, discount: i % 8 === 3 ? 100 : 0,
  }).select().single();
  if (me) { console.error(names[i], me.message); continue; }
  const total = Number(plan.price) + Number(plan.admission_fee) - (i % 8 === 3 ? 100 : 0);
  const partial = i % 5 === 2;
  const payDay = start < addDays(-21) ? addDays(-Math.floor(rnd() * 20)) : start; // most money lands this month
  await db.from("payments").insert({
    student_id: st.id, membership_id: mem.id, amount: partial ? Math.round(total / 2) : total,
    mode: pick(["upi", "upi", "cash", "card"]), paid_at: at(i % 6 === 1 ? today : payDay, 9 + (i % 8), 10 + i),
    note: start === today ? "Admission" : null,
  });

  // past attendance
  const [sh] = shift.start_time.split(":").map(Number);
  const rows = [];
  for (let d = 20; d >= 1; d--) {
    const day = addDays(-d);
    if (day < start || day > end || rnd() < 0.18) continue;
    const inT = at(day, sh, Math.floor(rnd() * 45));
    rows.push({ student_id: st.id, att_date: day, check_in: inT, check_out: new Date(new Date(inT).getTime() + (4.5 + rnd() * 3.5) * 3600_000).toISOString(), method: rnd() < 0.08 ? "staff" : "qr" });
  }
  // today: morning / full-day students who are in the library right now
  if (end >= today && start <= today && shift.name !== "Evening" && i % 4 !== 3) {
    rows.push({ student_id: st.id, att_date: today, check_in: at(today, sh, 5 + Math.floor(rnd() * 50)), method: "qr" });
  }
  if (rows.length) await db.from("attendance").insert(rows);
  made++;
  console.log(`✓ ${names[i].padEnd(20)} ${phone}  ${shift.name.padEnd(8)} ${plan.name}`);
}

const { count: enq } = await db.from("enquiries").select("id", { count: "exact", head: true });
if (!enq) {
  await db.from("enquiries").insert([
    { name: "Rahul Bhatt", phone: "9935012345", preferred_shift_id: shifts[0].id, source: "walk-in", status: "new", note: "Wants a window seat", follow_up_on: today },
    { name: "Swati Chaudhary", phone: "9415023456", preferred_shift_id: shifts[1].id, source: "instagram", status: "follow_up", note: "Will visit with parents on Sunday", follow_up_on: addDays(1) },
    { name: "Mohit Shukla", phone: "8840034567", preferred_shift_id: shifts[2].id, source: "referral", status: "follow_up", note: "Referred by Aditya Srivastava", follow_up_on: addDays(2) },
    { name: "Farah Naaz", phone: "7007045678", preferred_shift_id: shifts[0].id, source: "google", status: "new", note: "Asked about AC section" },
    { name: "Nitin Kumar", phone: "9696056789", preferred_shift_id: shifts[1].id, source: "call", status: "converted", note: "Joined Evening batch" },
    { name: "Preeti Singh", phone: "9161067890", preferred_shift_id: shifts[0].id, source: "walk-in", status: "lost", note: "Found a library closer to home" },
  ]);
}
const { count: exp } = await db.from("expenses").select("id", { count: "exact", head: true });
if (!exp) {
  const m1 = today.slice(0, 8) + "01";
  await db.from("expenses").insert([
    { title: "Building rent", category: "rent", amount: 18000, spent_on: m1 },
    { title: "Electricity bill", category: "electricity", amount: 4250, spent_on: addDays(-6) },
    { title: "Wi-Fi (200 Mbps)", category: "internet", amount: 999, spent_on: addDays(-12) },
    { title: "Caretaker salary", category: "salary", amount: 8000, spent_on: m1 },
    { title: "RO water service", category: "maintenance", amount: 650, spent_on: addDays(-3) },
    { title: "Instagram ads", category: "marketing", amount: 1200, spent_on: addDays(-9) },
  ]);
}
const { count: al } = await db.from("alerts").select("id", { count: "exact", head: true });
if (!al) {
  await db.from("alerts").insert([
    { kind: "expired_entry", message: "Rohit Yadav tried to enter — plan expired / fees due" },
    { kind: "device_mismatch", message: "Kunal Verma scanned from a new phone — device reset needed?" },
    { kind: "outside_shift", message: "Simran Kaur came outside their shift (Morning)" },
  ]);
}
await db.from("notices").insert({ title: "Weekly mock test every Sunday 📝", body: "Free UPSC & SSC mock tests, 10 AM in the discussion room. Register at the desk.", pinned: false });

console.log(`\nAdded ${made} students + enquiries, expenses, alerts. ✅`);
