"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ScanLine, Armchair, Clock, CalendarDays, Megaphone, IndianRupee, LogIn } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useAsync, q } from "@/lib/hooks";
import type { Attendance } from "@/lib/types";
import { addDaysISO, fmtDate, fmtDuration, fmtTime, inr, todayISO } from "@/lib/utils";
import { useStudent } from "@/components/student/context";
import { PlanStateBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";

function mins(a: Attendance, now = Date.now()) {
  return Math.max(0, ((a.check_out ? new Date(a.check_out).getTime() : now) - new Date(a.check_in).getTime()) / 60000);
}

export default function StudentHome() {
  const { student, status, lib, loading } = useStudent();
  const sb = supabaseBrowser();
  const from = addDaysISO(todayISO(), -6);
  const att = useAsync(() => student ? q<Attendance[]>(sb.from("attendance").select("*").eq("student_id", student.id).gte("att_date", from).order("check_in", { ascending: false })) : Promise.resolve([]), [student?.id]);
  const notices = useAsync(() => q<{ id: string; title: string; body: string | null; pinned: boolean; created_at: string }[]>(sb.from("notices").select("*").order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(5)));
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(t); }, []);

  if (loading) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-44" /><Skeleton className="h-28" /></div>;
  if (!student) return <p className="text-center text-muted-foreground">Your student record wasn’t found. Please talk to the library desk.</p>;

  const rows = att.data ?? [];
  const open = rows.find((r) => !r.check_out);
  const today = rows.filter((r) => r.att_date === todayISO()).reduce((s, r) => s + mins(r), 0);
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(from, i));
  const perDay = days.map((d) => rows.filter((r) => r.att_date === d).reduce((s, r) => s + mins(r), 0));
  const max = Math.max(240, ...perDay);
  const week = perDay.reduce((a, b) => a + b, 0);
  const hour = new Date().getHours();
  const hi = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const upi = lib?.upi_id && status && status.balance_due > 0
    ? `upi://pay?pa=${encodeURIComponent(lib.upi_id)}&pn=${encodeURIComponent(lib.name)}&am=${status.balance_due}&cu=INR&tn=${encodeURIComponent("Fee " + student.code)}` : null;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">{hi},</p>
        <h1 className="text-2xl font-bold tracking-tight">{student.full_name.split(" ")[0]} 👋</h1>
      </div>

      {/* plan card */}
      <div className="relative overflow-hidden rounded-3xl bg-primary p-5 text-white shadow-lg shadow-primary/20">
        <div className="absolute -right-10 -top-10 size-40 rounded-full bg-white/10" />
        <div className="relative">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium opacity-80">{status?.plan_name ?? "Plan"}</p>
            <span className="rounded-full bg-white/95 px-0.5"><PlanStateBadge state={status?.plan_state ?? "no_plan"} days={status?.days_left} /></span>
          </div>
          <div className="mt-4 flex items-end gap-2">
            <p className="text-5xl font-black leading-none">{status?.days_left != null && status.days_left >= 0 ? status.days_left : 0}</p>
            <p className="pb-1 text-sm opacity-80">days left</p>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2 text-sm">
            <Info icon={<Armchair className="size-4" />} k="Seat" v={status?.seat_label ?? "—"} />
            <Info icon={<Clock className="size-4" />} k="Shift" v={status?.shift_name ?? "—"} />
            <Info icon={<CalendarDays className="size-4" />} k="Valid till" v={status?.end_date ? fmtDate(status.end_date, { year: undefined }) : "—"} />
          </div>
        </div>
      </div>

      {status && status.balance_due > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <div className="flex items-center gap-3"><IndianRupee className="size-5 text-amber-600" /><div><p className="font-semibold text-amber-900">{inr(status.balance_due)} due</p><p className="text-xs text-amber-700">Pay at the desk or via UPI</p></div></div>
          {upi && <Button size="sm" asChild><a href={upi}>Pay UPI</a></Button>}
        </div>
      )}

      {/* today */}
      <Link href="/app/scan" className="flex items-center gap-4 rounded-3xl border border-border p-4 active:bg-muted">
        <div className={`flex size-14 items-center justify-center rounded-2xl ${open ? "bg-emerald-50 text-emerald-600" : "bg-brand-soft text-primary"}`}>
          {open ? <LogIn className="size-7" /> : <ScanLine className="size-7" />}
        </div>
        <div className="flex-1">
          {open ? (
            <><p className="font-semibold">In the library · since {fmtTime(open.check_in)}</p><p className="text-sm text-muted-foreground">Don’t forget to scan the gate QR when you leave</p></>
          ) : (
            <><p className="font-semibold">Scan the gate QR</p><p className="text-sm text-muted-foreground">Today: {fmtDuration(today)} studied</p></>
          )}
        </div>
        {open && <span className="relative flex size-3"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex size-3 rounded-full bg-emerald-500" /></span>}
      </Link>

      {/* week */}
      <div className="rounded-3xl border border-border p-4">
        <div className="mb-4 flex items-baseline justify-between"><p className="font-semibold">This week</p><p className="text-sm text-muted-foreground">{fmtDuration(week)}</p></div>
        <div className="flex items-end gap-2">
          {perDay.map((m, i) => (
            <div key={days[i]} className="flex flex-1 flex-col items-center gap-1.5">
              <div className="flex h-24 w-full items-end"><div className={`w-full rounded-lg ${days[i] === todayISO() ? "bg-primary" : "bg-primary/25"}`} style={{ height: `${Math.max(4, (m / max) * 100)}%` }} title={fmtDuration(m)} /></div>
              <span className="text-[10px] font-semibold text-muted-foreground">{new Date(days[i] + "T00:00:00").toLocaleDateString("en-IN", { weekday: "narrow" })}</span>
            </div>
          ))}
        </div>
      </div>

      {/* notices */}
      {(notices.data ?? []).length > 0 && (
        <div className="space-y-2">
          <p className="flex items-center gap-2 font-semibold"><Megaphone className="size-4 text-primary" />Notice board</p>
          {notices.data!.map((n) => (
            <div key={n.id} className={`rounded-2xl p-4 ${n.pinned ? "bg-brand-soft" : "bg-muted"}`}>
              <p className="font-semibold">{n.title}</p>
              {n.body && <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{n.body}</p>}
              <p className="mt-2 text-[11px] text-muted-foreground">{fmtDate(n.created_at)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Info({ icon, k, v }: { icon: React.ReactNode; k: string; v: string }) {
  return (
    <div className="rounded-2xl bg-white/15 px-3 py-2">
      <p className="flex items-center gap-1 text-[11px] opacity-80">{icon}{k}</p>
      <p className="truncate font-bold">{v}</p>
    </div>
  );
}
