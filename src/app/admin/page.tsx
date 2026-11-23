"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Users, UserCheck, IndianRupee, TrendingUp, Clock, AlertTriangle, BellRing, Wallet, UserPlus, ScanLine, LogIn, LogOut, ShieldAlert } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useAsync, q } from "@/lib/hooks";
import { inr, fmtTime, fmtDate, todayISO, cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatCard, Skeleton, Avatar, Empty } from "@/components/ui/misc";
import { useAdmin } from "@/components/admin/context";

interface Stats {
  present_now: number; today_checkins: number; today_collection: number; month_collection: number; month_expenses: number;
  active_members: number; expiring_7: number; expired: number; balance_due: number; total_seats: number; unseen_alerts: number;
  shifts: { id: string; name: string; is_full_day: boolean; occupied: number; present: number }[];
}
interface Activity { id: string; check_in: string; check_out: string | null; outside_shift: boolean; method: string; auto_closed: boolean; students: { full_name: string; code: string } | null }
interface Alert { id: number; kind: string; message: string; created_at: string; seen: boolean }

export default function Dashboard() {
  const sb = supabaseBrowser();
  const { settings } = useAdmin();
  const [live, setLive] = useState(false);

  const stats = useAsync(async () => {
    await sb.rpc("auto_checkout"); // safety net if pg_cron is not enabled
    return q<Stats>(sb.rpc("dashboard_stats"));
  });
  const activity = useAsync(() => q<Activity[]>(sb.from("attendance")
    .select("id, check_in, check_out, outside_shift, method, auto_closed, students(full_name, code)")
    .eq("att_date", todayISO()).order("check_in", { ascending: false }).limit(20)));
  const alerts = useAsync(() => q<Alert[]>(sb.from("alerts").select("*").eq("seen", false).order("created_at", { ascending: false }).limit(10)));

  useEffect(() => {
    const ch = sb.channel("dashboard-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, () => { stats.reload(true); activity.reload(true); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "payments" }, () => stats.reload(true))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "alerts" }, (p: { new: Alert }) => {
        toast.warning(p.new.message);
        alerts.reload(true); stats.reload(true);
      })
      .subscribe((status: string) => setLive(status === "SUBSCRIBED"));
    return () => { sb.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sb]);

  async function markSeen() {
    await sb.from("alerts").update({ seen: true }).eq("seen", false);
    alerts.reload(true); stats.reload(true);
  }

  const s = stats.data;
  const hour = Number(new Date().toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{fmtDate(new Date(), { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{greet} 👋</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            {settings?.name ?? "Library"} · <span className={cn("inline-flex items-center gap-1.5 font-semibold", live ? "text-green-600" : "text-slate-400")}><span className={cn("size-2 rounded-full", live ? "bg-green-500" : "bg-slate-300")} />{live ? "Live" : "Connecting…"}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link href="/admin/attendance?scan=1"><ScanLine />Scan student</Link></Button>
          <Button asChild><Link href="/admin/students/new"><UserPlus />New admission</Link></Button>
        </div>
      </div>

      {!s ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="In library now" value={s.present_now} live icon={<UserCheck />} tone="success" hint={`${s.today_checkins} came today`} />
          <StatCard label="Active members" value={s.active_members} icon={<Users />} hint={`${s.total_seats} seats`} />
          <StatCard label="Today's collection" value={inr(s.today_collection)} icon={<IndianRupee />} tone="success" />
          <StatCard label="This month" value={inr(s.month_collection)} icon={<TrendingUp />} hint={`Expenses ${inr(s.month_expenses)}`} />
          <Link href="/admin/dues?tab=expiring"><StatCard label="Ending in 7 days" value={s.expiring_7} icon={<Clock />} tone="warning" hint="Send renewal reminders" /></Link>
          <Link href="/admin/dues?tab=expired"><StatCard label="Expired" value={s.expired} icon={<AlertTriangle />} tone="danger" hint="Fees due / not renewed" /></Link>
          <StatCard label="Pending payments" value={inr(s.balance_due)} icon={<Wallet />} tone="warning" />
          <StatCard label="Alerts" value={s.unseen_alerts} icon={<BellRing />} tone={s.unseen_alerts ? "danger" : "default"} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Shift-wise seats</CardTitle><Link href="/admin/seats" className="text-sm font-semibold text-primary">Seat map →</Link></CardHeader>
          <CardContent className="space-y-5">
            {!s ? <Skeleton className="h-32" /> : s.shifts.map((sh) => {
              const pct = s.total_seats ? Math.round((sh.occupied / s.total_seats) * 100) : 0;
              return (
                <div key={sh.id}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="font-semibold">{sh.name}</span>
                    <span className="text-muted-foreground"><b className="text-foreground">{sh.occupied}</b>/{s.total_seats} booked · <span className="text-green-600">{sh.present} present</span></span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{s.total_seats - sh.occupied} seats free</p>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader><CardTitle>Live entry / exit</CardTitle><Link href="/admin/attendance" className="text-sm font-semibold text-primary">View all →</Link></CardHeader>
          <CardContent>
            {activity.loading ? <Skeleton className="h-48" /> : !activity.data?.length ? (
              <Empty icon={<ScanLine />} title="No scans yet today" hint="When students scan the gate QR, it will show here live." />
            ) : (
              <ul className="divide-y divide-border">
                {activity.data.map((a) => {
                  const out = !!a.check_out;
                  return (
                    <li key={a.id} className="flex items-center gap-3 py-2.5">
                      <Avatar name={a.students?.full_name} size={36} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{a.students?.full_name}</p>
                        <p className="text-xs text-muted-foreground">{a.students?.code} · {a.method === "staff" ? "Marked by staff" : "QR scan"}{a.auto_closed ? " · auto out" : ""}</p>
                      </div>
                      {a.outside_shift && <Badge variant="warning">Outside shift</Badge>}
                      <div className="text-right">
                        <Badge variant={out ? "muted" : "success"}>{out ? <LogOut className="size-3" /> : <LogIn className="size-3" />}{out ? "OUT" : "IN"}</Badge>
                        <p className="mt-0.5 text-xs text-muted-foreground">{fmtTime(out ? a.check_out : a.check_in)}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {!!alerts.data?.length && (
        <Card className="border-red-200">
          <CardHeader><CardTitle className="flex items-center gap-2"><ShieldAlert className="size-5 text-red-600" />Alerts</CardTitle><Button size="sm" variant="ghost" onClick={markSeen}>Mark all seen</Button></CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {alerts.data.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-3 rounded-xl bg-red-50/60 px-3 py-2 text-sm">
                  <span>{a.message}</span><span className="shrink-0 text-xs text-muted-foreground">{fmtTime(a.created_at)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
