"use client";
import { Receipt, ExternalLink } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useAsync, q } from "@/lib/hooks";
import type { Membership, Payment } from "@/lib/types";
import { fmtDate, inr } from "@/lib/utils";
import { useStudent } from "@/components/student/context";
import { Badge } from "@/components/ui/badge";
import { Empty, Skeleton } from "@/components/ui/misc";

export default function FeesPage() {
  const { student, status } = useStudent();
  const sb = supabaseBrowser();
  const pays = useAsync(() => student ? q<Payment[]>(sb.from("payments").select("*").eq("student_id", student.id).order("paid_at", { ascending: false })) : Promise.resolve([]), [student?.id]);
  const mems = useAsync(() => student ? q<Membership[]>(sb.from("memberships").select("*, shifts(name), seats(label), plans(name)").eq("student_id", student.id).eq("status", "active").order("start_date", { ascending: false })) : Promise.resolve([]), [student?.id]);
  const paid = (pays.data ?? []).reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-muted p-4"><p className="text-xs font-semibold text-muted-foreground">Total paid</p><p className="text-2xl font-bold">{inr(paid)}</p></div>
        <div className={`rounded-2xl p-4 ${status && status.balance_due > 0 ? "bg-amber-50" : "bg-emerald-50"}`}><p className="text-xs font-semibold text-muted-foreground">Due</p><p className="text-2xl font-bold">{inr(status?.balance_due ?? 0)}</p></div>
      </div>

      <section>
        <h2 className="mb-2 font-bold">Receipts</h2>
        {pays.loading ? <Skeleton className="h-32" /> : (pays.data ?? []).length === 0 ? <Empty icon={<Receipt />} title="No payments yet" /> : (
          <ul className="divide-y divide-border rounded-3xl border border-border">
            {pays.data!.map((p) => (
              <li key={p.id}>
                <a href={`/receipt/${p.public_token}`} target="_blank" className="flex items-center justify-between px-4 py-3 active:bg-muted">
                  <div><p className="font-semibold">{inr(p.amount)} <span className="text-xs font-medium uppercase text-muted-foreground">· {p.mode}</span></p><p className="text-xs text-muted-foreground">{p.receipt_no} · {fmtDate(p.paid_at)}</p></div>
                  <ExternalLink className="size-4 text-muted-foreground" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-bold">Plans</h2>
        <ul className="space-y-2">
          {(mems.data ?? []).map((m) => (
            <li key={m.id} className="rounded-2xl border border-border p-4">
              <div className="flex items-center justify-between"><p className="font-semibold">{m.plans?.name ?? "Custom plan"}</p><Badge variant="muted">{inr(m.total)}</Badge></div>
              <p className="mt-1 text-sm text-muted-foreground">{m.shifts?.name} · Seat {m.seats?.label ?? "—"}</p>
              <p className="text-sm text-muted-foreground">{fmtDate(m.start_date)} – {fmtDate(m.end_date)}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
