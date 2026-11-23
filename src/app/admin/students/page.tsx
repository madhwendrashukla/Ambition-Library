"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, UserPlus, Users, ChevronRight } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useAsync, q } from "@/lib/hooks";
import type { StudentStatus } from "@/lib/types";
import { fmtDate, inr, cn } from "@/lib/utils";
import { PageHeader, Skeleton, Empty } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { PlanStateBadge, Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { StudentAvatar } from "@/components/admin/student-avatar";
import { useAdmin } from "@/components/admin/context";

const FILTERS = [
  ["all", "All"], ["active", "Active"], ["expiring", "Expiring"], ["expired", "Expired"], ["no_plan", "No plan"], ["left", "Left"],
] as const;

export default function StudentsPage() {
  const sb = supabaseBrowser();
  const { shifts } = useAdmin();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [shift, setShift] = useState("");
  const { data, loading } = useAsync(() => q<StudentStatus[]>(sb.from("v_student_status").select("*").order("full_name")));

  const list = useMemo(() => (data ?? []).filter((s) => {
    const t = search.toLowerCase().trim();
    if (t && !(s.full_name.toLowerCase().includes(t) || s.phone.includes(t) || s.code.toLowerCase().includes(t) || (s.seat_label ?? "").toLowerCase() === t)) return false;
    if (shift && s.shift_id !== shift) return false;
    if (filter === "left") return s.status === "left";
    if (s.status === "left") return false;
    if (filter === "all") return true;
    if (filter === "active") return s.plan_state === "active" || s.plan_state === "expiring";
    return s.plan_state === filter;
  }), [data, search, filter, shift]);

  const count = (f: string) => (data ?? []).filter((s) => f === "all" ? s.status === "active" : f === "left" ? s.status === "left" : s.status === "active" && (f === "active" ? ["active", "expiring"].includes(s.plan_state) : s.plan_state === f)).length;

  return (
    <div>
      <PageHeader title="Students" subtitle={`${count("all")} active students`} actions={<Button asChild><Link href="/admin/students/new"><UserPlus />New admission</Link></Button>} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Name, phone, code or seat (A1)…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select className="sm:w-44" value={shift} onChange={(e) => setShift(e.target.value)}>
          <option value="">All shifts</option>
          {shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </div>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)} className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold", filter === k ? "bg-primary text-white" : "bg-white ring-1 ring-border text-slate-600")}>
            {label} <span className="opacity-70">{count(k)}</span>
          </button>
        ))}
      </div>

      {loading ? <Skeleton className="h-96" /> : list.length === 0 ? (
        <Empty icon={<Users />} title="No students found" hint="Change the filter or add a new admission." action={<Button asChild><Link href="/admin/students/new">New admission</Link></Button>} />
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_1fr_24px] gap-4 border-b border-border bg-muted/50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid">
            <span>Student</span><span>Shift · Seat</span><span>Valid till</span><span>Status</span><span>Due</span><span />
          </div>
          <ul className="divide-y divide-border">
            {list.map((s) => (
              <li key={s.student_id}>
                <Link href={`/admin/students/${s.student_id}`} className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 hover:bg-muted/40 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_24px] md:gap-4 md:px-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <StudentAvatar name={s.full_name} path={s.photo_path} size={40} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{s.full_name}</p>
                      <p className="text-xs text-muted-foreground">{s.code} · {s.phone}</p>
                      <p className="mt-1 text-xs text-muted-foreground md:hidden">{s.shift_name ?? "—"}{s.seat_label ? ` · ${s.seat_label}` : ""}</p>
                    </div>
                  </div>
                  <div className="hidden text-sm md:block">{s.shift_name ?? "—"}{s.seat_label && <Badge variant="outline" className="ml-2">{s.seat_label}</Badge>}</div>
                  <div className="hidden text-sm md:block">{fmtDate(s.end_date)}</div>
                  <div className="flex flex-col items-end gap-1 md:items-start">
                    {s.status === "left" ? <Badge variant="muted">Left</Badge> : <PlanStateBadge state={s.plan_state} days={s.days_left} />}
                    {s.balance_due > 0 && <span className="text-xs font-semibold text-amber-700 md:hidden">Due {inr(s.balance_due)}</span>}
                  </div>
                  <div className={cn("hidden text-sm font-semibold md:block", s.balance_due > 0 ? "text-amber-700" : "text-muted-foreground")}>{s.balance_due > 0 ? inr(s.balance_due) : "—"}</div>
                  <ChevronRight className="hidden size-4 text-muted-foreground md:block" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
