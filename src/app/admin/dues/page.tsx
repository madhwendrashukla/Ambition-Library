"use client";
import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BellRing, CheckCircle2, MessageCircle } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useAsync, q } from "@/lib/hooks";
import type { StudentStatus } from "@/lib/types";
import { fmtDate, inr, cn } from "@/lib/utils";
import { PageHeader, Skeleton, Empty } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, PlanStateBadge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { StudentAvatar } from "@/components/admin/student-avatar";
import { sendReminder } from "@/components/admin/reminder";
import { useAdmin } from "@/components/admin/context";

function DuesInner() {
  const sb = supabaseBrowser();
  const params = useSearchParams();
  const { settings, shifts } = useAdmin();
  const [tab, setTab] = useState(params.get("tab") ?? "expiring");
  const [shift, setShift] = useState("");
  const [days, setDays] = useState(7);
  const { data, loading, reload } = useAsync(() => q<StudentStatus[]>(sb.from("v_student_status").select("*").eq("status", "active").order("end_date")));

  const lists = useMemo(() => {
    const all = (data ?? []).filter((s) => !shift || s.shift_id === shift);
    return {
      expiring: all.filter((s) => s.days_left != null && s.days_left >= 0 && s.days_left <= days),
      expired: all.filter((s) => s.plan_state === "expired"),
      balance: all.filter((s) => s.balance_due > 0).sort((a, b) => b.balance_due - a.balance_due),
    };
  }, [data, shift, days]);
  const list = lists[tab as keyof typeof lists] ?? [];

  const tabs = [
    { k: "expiring", label: `Next ${days} days`, n: lists.expiring.length, tone: "text-amber-600" },
    { k: "expired", label: "Expired", n: lists.expired.length, tone: "text-red-600" },
    { k: "balance", label: "Payment due", n: lists.balance.length, tone: "text-amber-700" },
  ];

  return (
    <div>
      <PageHeader title="Dues & renewals" subtitle="Whose plan is ending — 1-click WhatsApp reminder" />
      <div className="mb-4 grid grid-cols-3 gap-2">
        {tabs.map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)} className={cn("rounded-2xl border p-3 text-left transition-all", tab === t.k ? "border-primary bg-brand-soft ring-2 ring-primary/15" : "border-border bg-white")}>
            <p className={cn("text-2xl font-extrabold", t.tone)}>{t.n}</p>
            <p className="text-xs font-semibold text-muted-foreground">{t.label}</p>
          </button>
        ))}
      </div>
      <div className="mb-4 flex gap-2">
        <Select className="w-44" value={shift} onChange={(e) => setShift(e.target.value)}>
          <option value="">All shifts</option>{shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        {tab === "expiring" && (
          <Select className="w-36" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={3}>3 days</option><option value={7}>7 days</option><option value={15}>15 days</option><option value={30}>30 days</option>
          </Select>
        )}
      </div>

      {loading ? <Skeleton className="h-96" /> : list.length === 0 ? (
        <Empty icon={<CheckCircle2 />} title="All clear 🎉" hint="No students in this list." />
      ) : (
        <Card><ul className="divide-y divide-border">
          {list.map((s) => {
            const remindedToday = s.last_reminded_at && new Date(s.last_reminded_at).toDateString() === new Date().toDateString();
            return (
              <li key={s.student_id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
                <Link href={`/admin/students/${s.student_id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <StudentAvatar name={s.full_name} path={s.photo_path} size={40} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{s.full_name}</p>
                    <p className="text-xs text-muted-foreground">{s.shift_name ?? "—"}{s.seat_label ? ` · Seat ${s.seat_label}` : ""} · till {fmtDate(s.end_date)}</p>
                  </div>
                </Link>
                <div className="flex items-center gap-2">
                  <PlanStateBadge state={s.plan_state} days={s.days_left} />
                  {s.balance_due > 0 && <Badge variant="warning">{inr(s.balance_due)}</Badge>}
                </div>
                <Button size="sm" variant={remindedToday ? "outline" : "whatsapp"} onClick={async () => { await sendReminder(s, settings); reload(true); }}>
                  {remindedToday ? <><CheckCircle2 />Sent</> : <><MessageCircle />Reminder</>}
                </Button>
              </li>
            );
          })}
        </ul></Card>
      )}
      <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><BellRing className="size-3.5" />Reminder opens the message in WhatsApp — you just tap Send. Automatic WhatsApp (API) can be added later.</p>
    </div>
  );
}

export default function DuesPage() {
  return <Suspense><DuesInner /></Suspense>;
}
