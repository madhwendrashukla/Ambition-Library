"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Receipt, IndianRupee, Download } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useAsync, q } from "@/lib/hooks";
import type { Payment } from "@/lib/types";
import { fmtDate, fmtTime, inr, todayISO } from "@/lib/utils";
import { PageHeader, Skeleton, Empty, StatCard } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export default function PaymentsPage() {
  const sb = supabaseBrowser();
  const [from, setFrom] = useState(todayISO().slice(0, 8) + "01");
  const [to, setTo] = useState(todayISO());
  const { data, loading } = useAsync(() => q<Payment[]>(sb.from("payments").select("*, students(full_name, phone, code)")
    .gte("paid_at", from + "T00:00:00+05:30").lte("paid_at", to + "T23:59:59+05:30").order("paid_at", { ascending: false })), [from, to]);

  const sum = useMemo(() => {
    const by: Record<string, number> = {};
    (data ?? []).forEach((p) => { by[p.mode] = (by[p.mode] ?? 0) + Number(p.amount); });
    return { total: (data ?? []).reduce((a, p) => a + Number(p.amount), 0), by };
  }, [data]);

  function exportCsv() {
    const lines = [["Receipt", "Date", "Student", "Code", "Amount", "Mode", "Note"].join(",")];
    (data ?? []).forEach((p) => lines.push([p.receipt_no, fmtDate(p.paid_at), `"${p.students?.full_name}"`, p.students?.code, p.amount, p.mode, `"${p.note ?? ""}"`].join(",")));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    a.download = `payments-${from}-to-${to}.csv`;
    a.click();
  }

  return (
    <div>
      <PageHeader title="Payments" subtitle="All receipts in one place" actions={<Button variant="outline" onClick={exportCsv}><Download />CSV</Button>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input type="date" className="w-44" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" className="w-44" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total" value={inr(sum.total)} icon={<IndianRupee />} tone="success" hint={`${data?.length ?? 0} payments`} />
        {["cash", "upi", "card"].map((m) => <StatCard key={m} label={m.toUpperCase()} value={inr(sum.by[m] ?? 0)} />)}
      </div>
      {loading ? <Skeleton className="h-96" /> : !data?.length ? <Empty icon={<Receipt />} title="No payments in this range" /> : (
        <Card><ul className="divide-y divide-border">
          {data.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <Link href={`/admin/students/${p.student_id}`} className="font-semibold hover:text-primary">{p.students?.full_name}</Link>
                <p className="text-xs text-muted-foreground">{p.receipt_no} · {fmtDate(p.paid_at)} {fmtTime(p.paid_at)}{p.note ? ` · ${p.note}` : ""}</p>
              </div>
              <Badge variant="muted" className="uppercase">{p.mode}</Badge>
              <p className="w-20 text-right font-extrabold">{inr(p.amount)}</p>
              <Button size="icon" variant="ghost" asChild><a href={`/receipt/${p.public_token}`} target="_blank" rel="noreferrer" aria-label="Receipt"><Receipt /></a></Button>
            </li>
          ))}
        </ul></Card>
      )}
    </div>
  );
}
