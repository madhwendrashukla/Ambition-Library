"use client";
import { supabaseBrowser } from "@/lib/supabase/client";
import { fillTemplate, fmtDate, todayISO, waLink } from "@/lib/utils";
import type { LibrarySettings, StudentStatus } from "@/lib/types";

export function reminderText(s: StudentStatus, cfg: LibrarySettings | null) {
  const expired = s.end_date ? s.end_date < todayISO() : false;
  return fillTemplate(cfg?.reminder_template ?? "Hello {name}, your plan {verb} on {end_date}.", {
    name: s.full_name.split(" ")[0],
    library: cfg?.name ?? "Library",
    shift: s.shift_name ?? "-",
    seat: s.seat_label ?? "-",
    end_date: fmtDate(s.end_date),
    verb: expired ? "expired" : "expires",
    upi: cfg?.upi_id ?? "",
    due: s.balance_due > 0 ? `₹${s.balance_due}` : "",
  });
}

/** opens WhatsApp with the reminder pre-filled and logs it */
export async function sendReminder(s: StudentStatus, cfg: LibrarySettings | null) {
  window.open(waLink(s.phone, reminderText(s, cfg)), "_blank");
  await supabaseBrowser().from("reminder_logs").insert({ student_id: s.student_id, membership_id: s.membership_id, channel: "whatsapp" });
}
