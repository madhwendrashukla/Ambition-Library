"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight, CalendarCheck } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useAsync, q } from "@/lib/hooks";
import type { Attendance } from "@/lib/types";
import { fmtDate, fmtDuration, fmtTime, todayISO } from "@/lib/utils";
import { useStudent } from "@/components/student/context";
import { Badge } from "@/components/ui/badge";
import { Empty, Skeleton } from "@/components/ui/misc";

export default function HistoryPage() {
  const { student } = useStudent();
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const sb = supabaseBrowser();
  const start = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const { data, loading } = useAsync(() => student ? q<Attendance[]>(sb.from("attendance").select("*").eq("student_id", student.id).gte("att_date", start).lte("att_date", end).order("check_in", { ascending: false })) : Promise.resolve([]), [student?.id, month]);
  const shift = (d: number) => { const dt = new Date(Date.UTC(y, m - 1 + d, 1)); setMonth(dt.toISOString().slice(0, 7)); };

  const rows = data ?? [];
  const minsOf = (a: Attendance) => Math.max(0, ((a.check_out ? new Date(a.check_out).getTime() : Date.now()) - new Date(a.check_in).getTime()) / 60000);
  const total = rows.reduce((s, r) => s + minsOf(r), 0);
  const daysPresent = new Set(rows.map((r) => r.att_date)).size;
  const byDay = rows.reduce<Record<string, Attendance[]>>((acc, r) => { (acc[r.att_date] ||= []).push(r); return acc; }, {});
  const daysInMonth = Number(end.slice(8));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <button onClick={() => shift(-1)} className="rounded-xl p-2 hover:bg-muted" aria-label="Previous month"><ChevronLeft /></button>
        <h1 className="text-lg font-bold">{new Date(start + "T00:00:00").toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</h1>
        <button onClick={() => shift(1)} disabled={month >= todayISO().slice(0, 7)} className="rounded-xl p-2 hover:bg-muted disabled:opacity-30" aria-label="Next month"><ChevronRight /></button>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat k="Days present" v={String(daysPresent)} />
        <Stat k="Total study" v={fmtDuration(total)} />
        <Stat k="Avg / day" v={fmtDuration(daysPresent ? total / daysPresent : 0)} />
      </div>
      {/* heat strip */}
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: daysInMonth }, (_, i) => {
          const d = `${month}-${String(i + 1).padStart(2, "0")}`;
          const mm = (byDay[d] ?? []).reduce((s, r) => s + minsOf(r), 0);
          const lvl = mm === 0 ? "bg-muted text-muted-foreground" : mm < 180 ? "bg-primary/30" : mm < 360 ? "bg-primary/60 text-white" : "bg-primary text-white";
          return <div key={d} title={fmtDuration(mm)} className={`flex aspect-square items-center justify-center rounded-lg text-[11px] font-semibold ${lvl}`}>{i + 1}</div>;
        })}
      </div>
      {loading ? <Skeleton className="h-40" /> : rows.length === 0 ? <Empty icon={<CalendarCheck />} title="No entries this month" /> : (
        <ul className="divide-y divide-border rounded-3xl border border-border">
          {Object.entries(byDay).map(([d, list]) => (
            <li key={d} className="px-4 py-3">
              <div className="flex items-center justify-between"><p className="font-semibold">{fmtDate(d, { weekday: "short", year: undefined })}</p><p className="text-sm font-semibold text-primary">{fmtDuration(list.reduce((s, r) => s + minsOf(r), 0))}</p></div>
              {list.map((a) => (
                <p key={a.id} className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  {fmtTime(a.check_in)} → {a.check_out ? fmtTime(a.check_out) : <Badge variant="success">Inside now</Badge>}
                  {a.auto_closed && <Badge variant="muted">Auto OUT</Badge>}
                  {a.outside_shift && <Badge variant="warning">Outside shift</Badge>}
                </p>
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return <div className="rounded-2xl bg-muted p-3"><p className="text-lg font-bold">{v}</p><p className="text-[11px] font-semibold text-muted-foreground">{k}</p></div>;
}
