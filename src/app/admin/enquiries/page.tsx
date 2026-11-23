"use client";
import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, PhoneCall, MessageCircle } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useAsync, q } from "@/lib/hooks";
import { fmtDate, waLink, todayISO, cn, normalizePhone } from "@/lib/utils";
import { PageHeader, Skeleton, Empty } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAdmin } from "@/components/admin/context";

interface Enq { id: string; name: string; phone: string; preferred_shift_id: string | null; source: string | null; note: string | null; status: string; follow_up_on: string | null; created_at: string }
const STATUS: Record<string, { label: string; v: "default" | "warning" | "success" | "muted" }> = {
  new: { label: "New", v: "default" }, follow_up: { label: "Follow-up", v: "warning" }, converted: { label: "Joined", v: "success" }, lost: { label: "Lost", v: "muted" },
};

export default function EnquiriesPage() {
  const sb = supabaseBrowser();
  const { shifts, settings } = useAdmin();
  const [filter, setFilter] = useState("open");
  const [open, setOpen] = useState(false);
  const { data, loading, reload } = useAsync(() => q<Enq[]>(sb.from("enquiries").select("*").order("created_at", { ascending: false })));
  const list = (data ?? []).filter((e) => filter === "all" ? true : filter === "open" ? ["new", "follow_up"].includes(e.status) : e.status === filter);
  const today = todayISO();

  async function setStatus(id: string, status: string) {
    await sb.from("enquiries").update({ status }).eq("id", id);
    reload(true);
  }

  return (
    <div>
      <PageHeader title="Enquiries" subtitle="Walk-in / call leads — follow up to fill empty seats" actions={<Button onClick={() => setOpen(true)}><Plus />Add enquiry</Button>} />
      <div className="mb-4 flex gap-2 overflow-x-auto">
        {[["open", "Open"], ["converted", "Joined"], ["lost", "Lost"], ["all", "All"]].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={cn("rounded-full px-3.5 py-1.5 text-sm font-semibold", filter === k ? "bg-primary text-white" : "bg-white ring-1 ring-border")}>{l}</button>
        ))}
      </div>
      {loading ? <Skeleton className="h-80" /> : !list.length ? <Empty icon={<PhoneCall />} title="No enquiries" action={<Button onClick={() => setOpen(true)}>Add your first enquiry</Button>} /> : (
        <Card><ul className="divide-y divide-border">
          {list.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{e.name} <Badge variant={STATUS[e.status].v} className="ml-1">{STATUS[e.status].label}</Badge></p>
                <p className="text-xs text-muted-foreground">{e.phone} · {shifts.find((s) => s.id === e.preferred_shift_id)?.name ?? "Shift —"} · {fmtDate(e.created_at)}
                  {e.follow_up_on && <span className={e.follow_up_on <= today ? " font-semibold text-amber-700" : ""}> · Follow-up {fmtDate(e.follow_up_on)}</span>}</p>
                {e.note && <p className="mt-1 text-sm text-slate-600">{e.note}</p>}
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" asChild><a href={`tel:${e.phone}`} aria-label="Call"><PhoneCall /></a></Button>
                <Button size="icon" variant="ghost" asChild><a href={waLink(e.phone, `Hello ${e.name.split(" ")[0]} 🙏 from ${settings?.name ?? ""}. You had asked about a seat — seats are available now. When would you like to visit?`)} target="_blank" rel="noreferrer" aria-label="WhatsApp"><MessageCircle /></a></Button>
                {e.status !== "converted" && <Button size="sm" variant="secondary" asChild><Link href="/admin/students/new" onClick={() => setStatus(e.id, "converted")}>Admission</Link></Button>}
                {["new", "follow_up"].includes(e.status) && <Button size="sm" variant="ghost" onClick={() => setStatus(e.id, "lost")}>Lost</Button>}
              </div>
            </li>
          ))}
        </ul></Card>
      )}
      <Dialog open={open} onOpenChange={setOpen}>{open && <EnquiryForm onDone={() => { setOpen(false); reload(true); }} />}</Dialog>
    </div>
  );
}

function EnquiryForm({ onDone }: { onDone: () => void }) {
  const sb = supabaseBrowser();
  const { shifts } = useAdmin();
  const [f, setF] = useState({ name: "", phone: "", preferred_shift_id: "", source: "walk-in", note: "", follow_up_on: "" });
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!f.name || f.phone.length < 10) return toast.error("Enter name and phone");
    setBusy(true);
    const { error } = await sb.from("enquiries").insert({ ...f, preferred_shift_id: f.preferred_shift_id || null, follow_up_on: f.follow_up_on || null, status: f.follow_up_on ? "follow_up" : "new" });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Enquiry saved"); onDone();
  }
  return (
    <DialogContent title="New enquiry">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Phone"><Input inputMode="numeric" value={f.phone} onChange={(e) => setF({ ...f, phone: normalizePhone(e.target.value).slice(0, 10) })} /></Field>
        <Field label="Shift"><Select value={f.preferred_shift_id} onChange={(e) => setF({ ...f, preferred_shift_id: e.target.value })}><option value="">—</option>{shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Source"><Select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}><option value="walk-in">Walk-in</option><option value="call">Call</option><option value="instagram">Instagram</option><option value="referral">Referral</option><option value="google">Google</option></Select></Field>
        <Field label="Follow-up date"><Input type="date" value={f.follow_up_on} onChange={(e) => setF({ ...f, follow_up_on: e.target.value })} /></Field>
        <Field label="Note" className="sm:col-span-2"><Textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
      <Button className="mt-5 w-full" loading={busy} onClick={save}>Save</Button>
    </DialogContent>
  );
}
