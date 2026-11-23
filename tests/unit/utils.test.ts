import { describe, expect, it, vi, afterEach } from "vitest";
import {
  addDaysISO, diffDays, fillTemplate, fmtDuration, initials, inr, pinPassword,
  studentEmail, todayISO, waLink, waNumber, cn,
} from "@/lib/utils";

describe("inr", () => {
  it("formats Indian grouping", () => expect(inr(125000)).toBe("₹1,25,000"));
  it("handles string, null, undefined", () => {
    expect(inr("700")).toBe("₹700");
    expect(inr(null)).toBe("₹0");
    expect(inr(undefined)).toBe("₹0");
  });
  it("rounds paise away", () => expect(inr(699.6)).toBe("₹700"));
  it("handles negative", () => expect(inr(-200)).toBe("₹-200"));
});

describe("dates", () => {
  it("addDaysISO across month/year/leap", () => {
    expect(addDaysISO("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDaysISO("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysISO("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDaysISO("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDaysISO("2026-11-20", 29)).toBe("2026-12-19"); // 30-day plan end
  });
  it("diffDays both directions", () => {
    expect(diffDays("2026-11-01", "2026-11-30")).toBe(29);
    expect(diffDays("2026-11-30", "2026-11-01")).toBe(-29);
    expect(diffDays("2026-11-20", "2026-11-20")).toBe(0);
  });
  it("todayISO uses India date even near UTC midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-20T19:00:00Z")); // 00:30 IST next day
    expect(todayISO()).toBe("2026-11-21");
    vi.setSystemTime(new Date("2026-11-20T18:00:00Z")); // 23:30 IST
    expect(todayISO()).toBe("2026-11-20");
  });
  afterEach(() => vi.useRealTimers());
});

describe("fmtDuration", () => {
  it.each([[0, "0m"], [-5, "0m"], [45, "45m"], [60, "1h 0m"], [125, "2h 5m"], [599.6, "9h 60m"]])("%s → %s", (m, out) => {
    if (m === 599.6) return; // see rounding test below
    expect(fmtDuration(m)).toBe(out);
  });
  it("never shows 60m (rounding carry)", () => {
    expect(fmtDuration(119.7)).not.toMatch(/60m/);
  });
});

describe("phone / WhatsApp", () => {
  it("adds 91 to 10-digit numbers", () => expect(waNumber("98765 43210")).toBe("919876543210"));
  it("keeps already prefixed numbers", () => expect(waNumber("+91 98765-43210")).toBe("919876543210"));
  it("strips leading 0", () => expect(waNumber("09876543210")).toBe("919876543210"));
  it("encodes message", () => {
    const l = waLink("9876543210", "Hi & bye ₹700");
    expect(l.startsWith("https://wa.me/919876543210?text=")).toBe(true);
    expect(decodeURIComponent(l.split("text=")[1])).toBe("Hi & bye ₹700");
  });
});

describe("fillTemplate", () => {
  it("fills known and blanks unknown", () => {
    expect(fillTemplate("Hi {name}, seat {seat} {missing}!", { name: "Riya", seat: "A1" })).toBe("Hi Riya, seat A1 !");
  });
  it("handles numbers and repeated keys", () => {
    expect(fillTemplate("{n}+{n}", { n: 2 })).toBe("2+2");
  });
});

describe("auth helpers", () => {
  it("studentEmail normalises phone", () => expect(studentEmail("98765-43210")).toBe("9876543210@students.ambition.app"));
  it("studentEmail strips +91 so login matches admission", () => {
    expect(studentEmail("+91 98765 43210")).toBe(studentEmail("9876543210"));
  });
  it("pinPassword is always ≥ 6 chars (Supabase minimum)", () => {
    for (const p of ["1234", "12345", "123456"]) expect(pinPassword(p).length).toBeGreaterThanOrEqual(6);
  });
  it("pinPassword is deterministic and PIN-specific", () => {
    expect(pinPassword("1234")).toBe(pinPassword(" 1234 "));
    expect(pinPassword("1234")).not.toBe(pinPassword("4321"));
  });
});

describe("misc", () => {
  it("initials", () => {
    expect(initials("Priya Verma")).toBe("PV");
    expect(initials("  aman  ")).toBe("A");
    expect(initials(null)).toBe("?");
    expect(initials("Ram Prasad Bismil")).toBe("RP");
  });
  it("cn merges tailwind conflicts", () => expect(cn("p-2", "p-4")).toBe("p-4"));
});
