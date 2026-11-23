import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const TZ = "Asia/Kolkata";

export function inr(n: number | string | null | undefined) {
  const v = Number(n ?? 0);
  return "₹" + v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function fmtDate(d: string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions) {
  if (!d) return "—";
  const date = typeof d === "string" && d.length === 10 ? new Date(d + "T00:00:00") : new Date(d);
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: TZ, ...opts });
}

export function fmtTime(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: TZ });
}

export function fmtDuration(mins: number) {
  if (!mins || mins < 0) return "0m";
  const total = Math.round(mins);
  const h = Math.floor(total / 60), m = total % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

/** YYYY-MM-DD for "today" in India */
export function todayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

export function addDaysISO(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function diffDays(fromISO: string, toISO: string) {
  return Math.round((new Date(toISO + "T00:00:00Z").getTime() - new Date(fromISO + "T00:00:00Z").getTime()) / 86400000);
}

export function initials(name?: string | null) {
  return (name ?? "?").split(" ").filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
}

/** Any way people type an Indian mobile (+91, 0 prefix, spaces, dashes) → 10 digits */
export function normalizePhone(phone: string) {
  let d = (phone ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d;
}

/** Indian phone → wa.me format */
export function waNumber(phone: string) {
  const d = normalizePhone(phone);
  return d.length === 10 ? "91" + d : d;
}

export function waLink(phone: string, text: string) {
  return `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`;
}

export function fillTemplate(tpl: string, vars: Record<string, string | number | null | undefined>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

/** student login email derived from phone (students log in with phone + PIN) */
export function studentEmail(phone: string) {
  const domain = process.env.NEXT_PUBLIC_STUDENT_EMAIL_DOMAIN || "students.ambition.app";
  return `${normalizePhone(phone)}@${domain}`;
}

export function getDeviceId() {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("al_device_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("al_device_id", id);
  }
  return id;
}

export const TAG_LABEL: Record<string, string> = {
  window: "🪟 Window",
  ac: "❄️ AC",
  charging: "🔌 Charging",
  door: "🚪 Near door",
  quiet: "🤫 Quiet zone",
};

/** Supabase needs 6+ char passwords; students only remember a 4–6 digit PIN, so we wrap it. */
export function pinPassword(pin: string) {
  return `al#${pin.trim()}#pin`;
}
