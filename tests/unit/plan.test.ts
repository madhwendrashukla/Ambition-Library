import { describe, expect, it, vi } from "vitest";
vi.mock("@/components/admin/context", () => ({ useAdmin: () => ({}) }));
vi.mock("@/lib/supabase/client", () => ({ supabaseBrowser: () => ({}) }));
import { total, emptyPlan } from "@/components/admin/plan-form";
import { reminderText } from "@/components/admin/reminder";
import type { LibrarySettings, StudentStatus } from "@/lib/types";

describe("plan total", () => {
  it("fee + admission − discount", () => expect(total({ ...emptyPlan("2026-11-20"), fee: 700, admission_fee: 200, discount: 100 })).toBe(800));
  it("never negative", () => expect(total({ ...emptyPlan("2026-11-20"), fee: 700, admission_fee: 0, discount: 1000 })).toBe(0));
  it("handles string inputs from forms", () => expect(total({ ...emptyPlan("2026-11-20"), fee: "700" as unknown as number, admission_fee: "200" as unknown as number, discount: "0" as unknown as number })).toBe(900));
});

const base: StudentStatus = {
  student_id: "s", code: "S0001", full_name: "Priya Verma", phone: "9800002222", photo_path: null, status: "active",
  admission_date: "2026-10-01", device_id: null, membership_id: "m", start_date: "2026-10-27", end_date: "2026-11-25",
  shift_id: "x", shift_name: "Morning", start_time: "06:00", end_time: "14:00", is_full_day: false, seat_id: "y", seat_label: "A2",
  plan_id: "p", plan_name: "Monthly", days_left: 5, plan_state: "expiring", balance_due: 0, last_reminded_at: null,
};
const cfg = { name: "Ambition Library", upi_id: "amb@upi", reminder_template: "Hello {name}, {library} plan {verb} on {end_date}. Seat {seat}. {due} UPI {upi}" } as LibrarySettings;

describe("reminderText", () => {
  it("upcoming expiry uses 'expires' and first name", () => {
    vi.setSystemTime(new Date("2026-11-20T06:00:00Z"));
    const t = reminderText(base, cfg);
    expect(t).toContain("Hello Priya,");
    expect(t).toContain("plan expires on");
    expect(t).toContain("Seat A2");
    expect(t).not.toContain("{");
  });
  it("expired uses 'expired' and shows due", () => {
    vi.setSystemTime(new Date("2026-11-30T06:00:00Z"));
    const t = reminderText({ ...base, balance_due: 450 }, cfg);
    expect(t).toContain("plan expired on");
    expect(t).toContain("₹450");
  });
  it("works without settings / seat", () => {
    const t = reminderText({ ...base, seat_label: null }, null);
    expect(t).toContain("Priya");
  });
});
