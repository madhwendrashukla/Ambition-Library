// Turns demo/screens/*.png into captioned 1080p slides and an MP4 for the client.
//   node scripts/demo/build-video.mjs
// Needs ffmpeg (winget install Gyan.FFmpeg) — set FFMPEG=path\to\ffmpeg.exe if it's not on PATH.
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const SCREENS = "demo/screens", SLIDES = "demo/slides", CLIPS = "demo/.clips", OUT = "demo/ambition-library-demo.mp4";
const FFMPEG = process.env.FFMPEG
  || [join(process.env.LOCALAPPDATA ?? "", "Microsoft/WinGet/Links/ffmpeg.exe")].find(existsSync) || "ffmpeg";
const files = readdirSync(SCREENS).filter((f) => f.endsWith(".png"));
const img = (key) => { const f = files.find((x) => x.replace(/^\d+_/, "").replace(/\.png$/, "") === key); if (!f) throw new Error("missing screen: " + key); return pathToFileURL(resolve(SCREENS, f)).href; };

// kind: title | desktop | phone | phones   (secs = how long it stays on screen)
const scenes = [
  { kind: "title", title: "Ambition Library", sub: "Smart management for self-study libraries", chips: ["Seats & shifts", "Fees & receipts", "QR attendance", "Student app"], secs: 4 },
  { kind: "desktop", shot: "login_owner", tag: "Login", title: "One app for owner, staff and students", sub: "Owners and staff sign in with email. Students sign in with their mobile number and a PIN." },
  { kind: "desktop", shot: "dashboard", tag: "Owner dashboard", title: "Your whole library on one live screen", sub: "Who is inside right now, today's and this month's collection, plans ending this week, pending fees and alerts. It updates by itself." },
  { kind: "desktop", shot: "students", tag: "Students", title: "Every student, searchable in a second", sub: "Search by name, phone, code or seat. Filter by shift or plan status: active, expiring, expired." },
  { kind: "desktop", shot: "student_profile", tag: "Student profile", title: "Complete history for each student", sub: "Current plan and days left, study hours, attendance, payments, renewals, seat change, PIN and device reset." },
  { kind: "desktop", shot: "admission_1_details", tag: "New admission · 1/3", title: "New admission in under 2 minutes", sub: "Photo, contact and ID details. Only the last 4 digits of Aadhaar are stored." },
  { kind: "desktop", shot: "admission_2_plan_seat", tag: "New admission · 2/3", title: "Pick shift, plan and a free seat", sub: "Morning and Evening can share a seat, Full Day blocks it. Double booking is impossible." },
  { kind: "desktop", shot: "admission_3_done", tag: "New admission · 3/3", title: "Login and welcome message, ready to send", sub: "One tap sends the student their app link, login, seat and receipt on WhatsApp." },
  { kind: "desktop", shot: "receipt", tag: "Receipts", title: "Professional receipt for every payment", sub: "Numbered receipts with plan, validity and amount, shareable as a link or printable." },
  { kind: "desktop", shot: "seat_map", tag: "Seat map", title: "See free and taken seats, shift by shift", sub: "Green is free, red is taken. Tag seats as window, AC or charging point." },
  { kind: "desktop", shot: "gate_qr_print", tag: "Gate QR", title: "Print one QR code for the entrance", sub: "Students scan it when they arrive and when they leave. No register, no biometric machine." },
  { kind: "phones", shots: ["riya_home", "scan_camera"], tag: "Student app", title: "Students get their own app", sub: "Installs from the browser on any phone. Tap Scan at the gate." },
  { kind: "phone", shot: "scan_in", tag: "QR attendance", title: "Scan once: checked IN", sub: "Seat and shift confirmed instantly. Entries outside the student's shift are flagged for the owner." },
  { kind: "desktop", shot: "dashboard_live", tag: "Live", title: "The owner sees it the same second", sub: "The entry appears on the dashboard without refreshing the page." },
  { kind: "desktop", shot: "attendance", tag: "Attendance", title: "Daily attendance register, automatically", sub: "IN/OUT times and study duration. Export to CSV, manual entry, or scan the student's personal QR at the desk." },
  { kind: "phones", shots: ["scan_cooldown", "scan_wrong_qr"], tag: "Anti-cheat", title: "Double scans and fake QR codes are rejected", sub: "A 2-minute cooldown stops accidental double scans, and only the library's own gate QR works." },
  { kind: "phone", shot: "scan_other_phone", tag: "Anti-cheat", title: "Attendance is locked to the student's phone", sub: "A friend can't mark it from another phone. The owner can reset the device if a student changes phones." },
  { kind: "phone", shot: "scan_out", tag: "QR attendance", title: "Scan again when leaving: OUT", sub: "Study time is recorded. If a student forgets, they're checked out automatically after their shift." },
  { kind: "phones", shots: ["student_home", "student_history"], tag: "Student app", title: "Days left, seat and study hours", sub: "Plan card, weekly study chart, notice board and a monthly attendance calendar." },
  { kind: "phones", shots: ["student_fees", "student_profile_qr"], tag: "Student app", title: "Fees, receipts and a personal QR", sub: "All payments and receipts in one place. The personal QR lets staff mark attendance at the desk." },
  { kind: "desktop", shot: "dues", tag: "Dues & renewals", title: "Renewal reminders in one click", sub: "Plans ending soon, expired plans and pending fees, each with a ready-made WhatsApp reminder." },
  { kind: "desktop", shot: "payments", tag: "Payments", title: "Every rupee accounted for", sub: "Cash, UPI and card totals for any date range, with receipts and a CSV export." },
  { kind: "desktop", shot: "enquiries", tag: "Enquiries", title: "Turn enquiries into admissions", sub: "Track walk-ins and calls, follow-up dates and one-tap WhatsApp or call." },
  { kind: "desktop", shot: "expenses", tag: "Expenses & profit", title: "Know your real monthly profit", sub: "Rent, electricity, salaries and more, subtracted from collections automatically." },
  { kind: "desktop", shot: "notices", tag: "Notices", title: "Announcements straight to every phone", sub: "Holidays, rules and mock tests appear on every student's home screen." },
  { kind: "desktop", shot: "settings_qr", tag: "Settings", title: "Your library, your rules", sub: "Shifts, plans and pricing, brand colour and logo, location check, staff accounts and reminder text." },
  { kind: "desktop", shot: "dashboard_alerts", tag: "Alerts", pos: "bottom", title: "Problems reach the owner immediately", sub: "Expired plans trying to enter, scans from a new phone and out-of-shift entries all raise an alert." },
  { kind: "title", title: "Ambition Library", sub: "Ready to run your library — on any phone, from day one", chips: ["Works on Android & iPhone", "Hosted in India", "No hardware needed"], foot: "Built by ms.dev", secs: 4.5 },
];

const css = `
*{box-sizing:border-box;margin:0}body{width:1920px;height:1080px;overflow:hidden;font-family:"Segoe UI",Inter,system-ui,sans-serif;color:#fff;
background:radial-gradient(1200px 700px at 85% 110%,#1d4ed8 0%,transparent 60%),radial-gradient(900px 600px at -10% -20%,#2563eb 0%,transparent 55%),#0b1b3f}
.wrap{position:absolute;inset:0;display:flex;align-items:center;gap:70px;padding:0 90px}
.cap{width:520px;flex:none}.tag{display:inline-block;padding:8px 18px;border-radius:999px;background:rgba(255,255,255,.12);font-size:22px;font-weight:600;letter-spacing:.04em;color:#bfdbfe;margin-bottom:28px}
h1{font-size:58px;line-height:1.08;font-weight:800;letter-spacing:-.02em}.sub{margin-top:26px;font-size:27px;line-height:1.45;color:#cbd5e1}
.brand{position:absolute;left:90px;bottom:44px;font-size:20px;color:#93c5fd;font-weight:600;letter-spacing:.05em;display:flex;align-items:center;gap:12px}
.dot{width:12px;height:12px;border-radius:4px;background:#60a5fa}
.win{flex:1;border-radius:18px;overflow:hidden;background:#fff;box-shadow:0 40px 90px -20px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.08)}
.bar{height:42px;background:#e2e8f0;display:flex;align-items:center;gap:9px;padding:0 18px}.bar i{width:13px;height:13px;border-radius:50%;background:#f87171}.bar i:nth-child(2){background:#fbbf24}.bar i:nth-child(3){background:#34d399}
.url{margin-left:20px;flex:1;height:26px;border-radius:8px;background:#fff;color:#64748b;font-size:15px;display:flex;align-items:center;padding:0 14px}
.win img{display:block;width:100%;height:760px;object-fit:cover;object-position:top}.win.bottom img{object-position:bottom}
.phones{flex:1;display:flex;justify-content:center;gap:70px}.phone{width:400px;height:866px;border-radius:58px;background:#020617;padding:14px;box-shadow:0 40px 90px -20px rgba(0,0,0,.65),0 0 0 2px #334155}
.phone img{width:100%;height:100%;border-radius:46px;object-fit:cover;object-position:top}
.title{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.logo{width:120px;height:120px;border-radius:32px;background:#2563eb;display:flex;align-items:center;justify-content:center;font-size:64px;box-shadow:0 20px 60px -10px #2563eb}
.title h1{font-size:96px;margin-top:40px}.title .sub{font-size:36px;margin-top:20px}.chips{display:flex;gap:18px;margin-top:56px}.chips span{padding:14px 26px;border-radius:999px;background:rgba(255,255,255,.1);font-size:26px;font-weight:600;color:#dbeafe}
.foot{margin-top:70px;font-size:24px;color:#93c5fd;letter-spacing:.06em}`;

function html(s) {
  const cap = `<div class="cap"><div class="tag">${s.tag}</div><h1>${s.title}</h1><p class="sub">${s.sub}</p></div>`;
  let body;
  if (s.kind === "title") body = `<div class="title"><div class="logo">📚</div><h1>${s.title}</h1><p class="sub">${s.sub}</p><div class="chips">${s.chips.map((c) => `<span>${c}</span>`).join("")}</div>${s.foot ? `<p class="foot">${s.foot}</p>` : ""}</div>`;
  else if (s.kind === "desktop") body = `<div class="wrap">${cap}<div class="win ${s.pos ?? ""}"><div class="bar"><i></i><i></i><i></i><div class="url">ambitionlibrary.in</div></div><img src="${img(s.shot)}"></div></div><div class="brand"><span class="dot"></span>AMBITION LIBRARY</div>`;
  else body = `<div class="wrap">${cap}<div class="phones">${(s.shots ?? [s.shot]).map((k) => `<div class="phone"><img src="${img(k)}"></div>`).join("")}</div></div><div class="brand"><span class="dot"></span>AMBITION LIBRARY</div>`;
  return `<!doctype html><meta charset="utf-8"><style>${css}</style>${body}`;
}

rmSync(SLIDES, { recursive: true, force: true }); rmSync(CLIPS, { recursive: true, force: true });
rmSync(OUT, { force: true });
mkdirSync(SLIDES, { recursive: true }); mkdirSync(CLIPS, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
for (const [i, s] of scenes.entries()) {
  const h = resolve(SLIDES, `${String(i + 1).padStart(2, "0")}.html`);
  writeFileSync(h, html(s));
  await page.goto(pathToFileURL(h).href, { waitUntil: "load" });
  await page.screenshot({ path: h.replace(/\.html$/, ".png") });
  console.log("🖼 ", i + 1, s.title);
}
await browser.close();

// each slide → clip with a slow zoom and fades, then join
const FPS = 30, list = [];
for (const [i, s] of scenes.entries()) {
  const secs = s.secs ?? 5.5, frames = Math.round(secs * FPS);
  const png = resolve(SLIDES, `${String(i + 1).padStart(2, "0")}.png`), clip = resolve(CLIPS, `${i}.mp4`);
  const zoom = s.kind === "title" ? 0.00025 : 0.0004;
  // single still in → zoompan emits exactly `frames` frames (looping the input would multiply that)
  execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-i", png, "-frames:v", String(frames),
    "-vf", `zoompan=z='1+${zoom}*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1920x1080:fps=${FPS},fade=t=in:st=0:d=0.45,fade=t=out:st=${secs - 0.45}:d=0.45,format=yuv420p`,
    "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-r", String(FPS), clip]);
  list.push(`file '${clip.replace(/\\/g, "/")}'`);
  process.stdout.write(`🎞  clip ${i + 1}/${scenes.length}\r`);
}
writeFileSync(resolve(CLIPS, "list.txt"), list.join("\n"));
execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", resolve(CLIPS, "list.txt"), "-c", "copy", "-movflags", "+faststart", OUT]);
rmSync(CLIPS, { recursive: true, force: true });
console.log(`\n✅ Video: ${OUT}  (${scenes.reduce((t, s) => t + (s.secs ?? 5.5), 0)} s)`);
