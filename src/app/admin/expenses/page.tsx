"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Wallet, TrendingUp, TrendingDown } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useAsync, q } from "@/lib/hooks";
import { fmtDate, inr, todayISO } from "@/lib/utils";
import { PageHeader, Skeleton, Empty, StatCard } from "@/components/ui/misc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface Expense { id: string; title: string; category: string; amount: number; spent_on: string; note: string | null }
const CATS = ["rent", "electricity", "internet", "salary", "maintenance", "marketing", "other"];

export default function ExpensesPage() {
  const sb = supabaseBrowser();
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const start = month + "-01";
  const end = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).toLocaleDateString("en-CA");
  const exp = useAsync(() => q<Expense[]>(sb.from("expenses").select("*").gte("spent_on", start).lte("spent_on", end).order("spent_on", { ascending: false })), [month]);
  const income = useAsync(async () => {
    const rows = await q<{ amount: number }[]>(sb.from("payments").select("amount").gte("paid_at", start + "T00:00:00+05:30").lte("paid_at", end + "T23:59:59+05:30"));
    return rows.reduce((a, r) => a + Number(r.amount), 0);
  }, [month]);
  const [f, setF] = useState({ title: "", category: "rent", amount: "", spent_on: todayISO() });
  const [busy, setBusy] = useState(false);

  const spent = (exp.data ?? []).reduce((a, e) => a + Number(e.amount), 0);
  const profit = (income.data ?? 0) - spent;

  async function add() {
    if (!f.title || !Number(f.amount)) return toast.error("Enter title and amount");
    setBusy(true);
    const { error } = await sb.from("expenses").insert({ ...f, amount: Number(f.amount) });
    setBusy(false);
    if (error) return toast.error(error.message);
    setF({ ...f, title: "", amount: "" }); exp.reload(true);
  }

  return (
    <div>
      <PageHeader title="Expenses & profit" subtitle="Money in, money out — the month's real profit" actions={<Input type="month" className="w-44" value={month} onChange={(e) => setMonth(e.target.value)} />} />
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Collection" value={inr(income.data ?? 0)} icon={<TrendingUp />} tone="success" />
        <StatCard label="Expenses" value={inr(spent)} icon={<TrendingDown />} tone="danger" />
        <StatCard label="Profit" value={inr(profit)} icon={<Wallet />} tone={profit >= 0 ? "success" : "danger"} />
      </div>
      <Card className="mb-6"><CardContent className="grid gap-3 pt-5 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] sm:items-end">
        <Field label="Expense"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="December rent" /></Field>
        <Field label="Category"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATS.map((c) => <option key={c} value={c}>{c}</option>)}</Select></Field>
        <Field label="Amount"><Input type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Date"><Input type="date" value={f.spent_on} onChange={(e) => setF({ ...f, spent_on: e.target.value })} /></Field>
        <Button loading={busy} onClick={add}><Plus />Add</Button>
      </CardContent></Card>
      {exp.loading ? <Skeleton className="h-48" /> : !exp.data?.length ? <Empty icon={<Wallet />} title="No expenses this month" /> : (
        <Card><ul className="divide-y divide-border">
          {exp.data.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1"><p className="font-semibold">{e.title}</p><p className="text-xs text-muted-foreground">{fmtDate(e.spent_on)}</p></div>
              <Badge variant="muted" className="capitalize">{e.category}</Badge>
              <p className="w-24 text-right font-extrabold">{inr(e.amount)}</p>
              <Button size="icon" variant="ghost" className="text-red-600" onClick={async () => { await sb.from("expenses").delete().eq("id", e.id); exp.reload(true); }} aria-label="Delete"><Trash2 /></Button>
            </li>
          ))}
        </ul></Card>
      )}
    </div>
  );
}
