"use client";
import Link from "next/link";
import { use, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, Phone, MessageCircle, RefreshCw, IndianRupee, Armchair, BellRing, KeyRound, Smartphone, UserX, UserCheck, Receipt, FileText, CalendarClock } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useAsync, q, useSignedUrl } from "@/lib/hooks";
import type { Attendance, Membership, Payment, Student, StudentStatus } from "@/lib/types";
import { addDaysISO, fmtDate, fmtTime, fmtDuration, inr, todayISO, waLink, diffDays, normalizePhone } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, PlanStateBadge } from "@/components/ui/badge";
import { Skeleton, Empty } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { StudentAvatar } from "@/components/admin/student-avatar";
import { PaymentDialog } from "@/components/admin/payment-dialog";
import { PlanForm, emptyPlan, total, type PlanValues } from "@/components/admin/plan-form";
import { SeatPicker } from "@/components/admin/seat-picker";
import { sendReminder } from "@/components/admin/reminder";
import { useAdmin } from "@/components/admin/context";
import { resetStudentPin, syncStudentLogin } from "../../actions";

export default function StudentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const sb = supabaseBrowser();
  const { settings } = useAdmin();

  const st = useAsync(() => q<Student>(sb.from("students").select("*").eq("id", id).single()), [id]);
  const status = useAsync(() => q<StudentStatus>(sb.from("v_student_status").select("*").eq("student_id", id).single()), [id]);
  const mems = useAsync(() => q<Membership[]>(sb.from("memberships").select("*, shifts(name), seats(label), plans(name)").eq("student_id", id).order("start_date", { ascending: false })), [id]);
  const pays = useAsync(() => q<Payment[]>(sb.from("payments").select("*").eq("student_id", id).order("paid_at", { ascending: false })), [id]);
  const att = useAsync(() => q<Attendance[]>(sb.from("attendance").select("*").eq("student_id", id).order("check_in", { ascending: false }).limit(60)), [id]);

  const [payOpen, setPayOpen] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [seatOpen, setSeatOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const idUrl = useSignedUrl(st.data?.id_doc_path);

  const refresh = () => { st.reload(true); status.reload(true); mems.reload(true); pays.reload(true); att.reload(true); };
  const s = st.data, ss = status.data;

  if (st.loading || !s) return <Skeleton className="h-[70vh]" />;

  const monthStart = todayISO().slice(0, 8) + "01";
  const monthMins = (att.data ?? []).filter((a) => a.att_date >= monthStart && a.check_out)
    .reduce((m, a) => m + (new Date(a.check_out!).getTime() - new Date(a.check_in).getTime()) / 60000, 0);
  const daysPresent = new Set((att.data ?? []).filter((a) => a.att_date >= monthStart).map((a) => a.att_date)).size;
  const span = ss?.start_date && ss?.end_date ? diffDays(ss.start_date, ss.end_date) + 1 : 0;
  const used = ss?.start_date ? Math.min(span, Math.max(0, diffDays(ss.start_date, todayISO()) + 1)) : 0;

  async function toggleLeft() {
    const next = s!.status === "active" ? "left" : "active";
    const { error } = await sb.from("students").update({ status: next }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(next === "left" ? "Student marked as 'Left'" : "Student is active again");
    refresh();
  }

  async function resetDevice() {
    const { error } = await sb.rpc("reset_device", { p_student: id });
    if (error) return toast.error(error.message);
    toast.success("Device reset — the next scan will register the new phone");
    refresh();
  }

  return (
    <div className="space-y-6">
      <Link href="/admin/students" className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground"><ChevronLeft className="size-4" />Students</Link>

      <Card><CardContent className="flex flex-col gap-5 pt-5 sm:flex-row sm:items-center">
        <StudentAvatar name={s.full_name} path={s.photo_path} size={84} className="ring-4 ring-brand-soft" />
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight">{s.full_name}</h1>
            {s.status === "left" ? <Badge variant="muted">Left</Badge> : ss && <PlanStateBadge state={ss.plan_state} days={ss.days_left} />}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{s.code} · {s.phone}{s.exam_target ? ` · ${s.exam_target}` : ""} · Admission {fmtDate(s.admission_date)}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild><a href={`tel:${s.phone}`}><Phone />Call</a></Button>
            <Button size="sm" variant="whatsapp" asChild><a href={waLink(s.phone, `Hello ${s.full_name.split(" ")[0]},`)} target="_blank" rel="noreferrer"><MessageCircle />WhatsApp</a></Button>
          </div>
        </div>
        {ss && ss.balance_due > 0 && (
          <div className="rounded-2xl bg-amber-50 p-4 text-center ring-1 ring-amber-200">
            <p className="text-xs font-semibold uppercase text-amber-700">Due</p>
            <p className="text-2xl font-extrabold text-amber-800">{inr(ss.balance_due)}</p>
            <Button size="sm" className="mt-2" onClick={() => setPayOpen(true)}>Collect payment</Button>
          </div>
        )}
      </CardContent></Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Current plan</CardTitle></CardHeader>
          <CardContent>
            {!ss?.membership_id ? (
              <Empty icon={<CalendarClock />} title="No plan" action={<Button onClick={() => setRenewOpen(true)}>Add plan</Button>} />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Info label="Shift" value={ss.shift_name} />
                  <Info label="Seat" value={ss.seat_label ?? "—"} />
                  <Info label="Start" value={fmtDate(ss.start_date)} />
                  <Info label="End" value={fmtDate(ss.end_date)} />
                </div>
                <div className="mt-5">
                  <div className="mb-1.5 flex justify-between text-xs font-semibold text-muted-foreground"><span>{used}/{span} days</span><span>{ss.days_left != null && ss.days_left >= 0 ? `${ss.days_left} days left` : "Expired"}</span></div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${ss.plan_state === "expired" ? "bg-red-500" : ss.plan_state === "expiring" ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${span ? (used / span) * 100 : 0}%` }} /></div>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button onClick={() => setRenewOpen(true)}><RefreshCw />Renew</Button>
                  <Button variant="outline" onClick={() => setPayOpen(true)}><IndianRupee />Payment</Button>
                  <Button variant="outline" onClick={() => setSeatOpen(true)}><Armchair />Change seat</Button>
                  <Button variant="whatsapp" onClick={async () => { await sendReminder(ss, settings); status.reload(true); }}><BellRing />Reminder</Button>
                </div>
                {ss.last_reminded_at && <p className="mt-2 text-xs text-muted-foreground">Last reminder: {fmtDate(ss.last_reminded_at)} {fmtTime(ss.last_reminded_at)}</p>}
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>This month</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <Info label="Days present" value={String(daysPresent)} big />
            <Info label="Study time" value={fmtDuration(monthMins)} big />
            <Info label="Device" value={s.device_id ? "Registered" : "Not set"} />
            <Info label="Login" value={s.user_id ? "Active" : "—"} />
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="attendance">
        <TabsList>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
        </TabsList>

        <TabsContent value="attendance" className="mt-4">
          <Card><CardContent className="pt-5">
            {!att.data?.length ? <Empty title="No attendance yet" /> : (
              <ul className="divide-y divide-border">
                {att.data.map((a) => {
                  const mins = a.check_out ? (new Date(a.check_out).getTime() - new Date(a.check_in).getTime()) / 60000 : null;
                  return (
                    <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <div><p className="font-semibold">{fmtDate(a.att_date, { weekday: "short", day: "numeric", month: "short" })}</p>
                        <p className="text-xs text-muted-foreground">{fmtTime(a.check_in)} → {a.check_out ? fmtTime(a.check_out) : "inside now"}{a.auto_closed ? " (auto)" : ""}</p></div>
                      <div className="flex items-center gap-2">
                        {a.outside_shift && <Badge variant="warning">Outside shift</Badge>}
                        {a.method === "staff" && <Badge variant="muted">Staff</Badge>}
                        <span className="w-16 text-right font-semibold">{mins != null ? fmtDuration(mins) : <Badge variant="success">IN</Badge>}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <Card><CardContent className="pt-5">
            {!pays.data?.length ? <Empty title="No payments" action={<Button onClick={() => setPayOpen(true)}>Collect payment</Button>} /> : (
              <ul className="divide-y divide-border">
                {pays.data.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div><p className="font-semibold">{inr(p.amount)} <span className="font-normal uppercase text-muted-foreground">· {p.mode}</span></p>
                      <p className="text-xs text-muted-foreground">{p.receipt_no} · {fmtDate(p.paid_at)} {fmtTime(p.paid_at)}{p.note ? ` · ${p.note}` : ""}</p></div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" asChild><a href={`/receipt/${p.public_token}`} target="_blank" rel="noreferrer"><Receipt />Receipt</a></Button>
                      <Button size="sm" variant="ghost" asChild><a href={waLink(s.phone, `Hello ${s.full_name.split(" ")[0]}, we've received your payment of ${inr(p.amount)} 🙏\nReceipt: ${window.location.origin}/receipt/${p.public_token}`)} target="_blank" rel="noreferrer"><MessageCircle /></a></Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="plans" className="mt-4">
          <Card><CardContent className="pt-5">
            {!mems.data?.length ? <Empty title="No plans" /> : (
              <ul className="divide-y divide-border">
                {mems.data.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                    <div>
                      <p className="font-semibold">{m.plans?.name ?? m.shifts?.name} {m.seats?.label && <Badge variant="outline" className="ml-1">{m.seats.label}</Badge>} {m.status === "cancelled" && <Badge variant="muted">Cancelled</Badge>}</p>
                      <p className="text-xs text-muted-foreground">{fmtDate(m.start_date)} – {fmtDate(m.end_date)} · Total {inr(m.total)}{m.discount > 0 ? ` (discount ${inr(m.discount)})` : ""}</p>
                    </div>
                    {m.status === "active" && (
                      <Button size="sm" variant="ghost" className="text-red-600" onClick={async () => {
                        if (!confirm("Cancel this plan? The seat will be freed.")) return;
                        const { error } = await sb.from("memberships").update({ status: "cancelled" }).eq("id", m.id);
                        if (error) toast.error(error.message); else { toast.success("Plan cancelled"); refresh(); }
                      }}>Cancel</Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="profile" className="mt-4">
          <Card><CardContent className="space-y-5 pt-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <Info label="Email" value={s.email ?? "—"} />
              <Info label="Gender" value={s.gender ?? "—"} />
              <Info label="DOB" value={fmtDate(s.dob)} />
              <Info label="Guardian" value={s.guardian_name ? `${s.guardian_name} · ${s.guardian_phone ?? ""}` : "—"} />
              <Info label="ID" value={s.id_type ? `${s.id_type.toUpperCase()} ${s.id_last4 ? "XXXX-" + s.id_last4 : ""}` : "—"} />
              <Info label="Address" value={s.address ?? "—"} />
            </div>
            {s.notes && <p className="rounded-xl bg-muted p-3 text-sm">{s.notes}</p>}
            {idUrl && <a href={idUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-primary"><FileText className="size-4" />View ID proof</a>}
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <Button variant="outline" onClick={() => setEditOpen(true)}>Profile edit</Button>
              <Button variant="outline" onClick={() => setPinOpen(true)}><KeyRound />PIN reset</Button>
              <Button variant="outline" onClick={resetDevice} disabled={!s.device_id}><Smartphone />Device reset</Button>
              <Button variant="outline" className={s.status === "active" ? "text-red-600" : "text-green-700"} onClick={toggleLeft}>
                {s.status === "active" ? <><UserX />Mark as left</> : <><UserCheck />Mark as active</>}
              </Button>
            </div>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      <PaymentDialog open={payOpen} onOpenChange={setPayOpen} studentId={id} membershipId={ss?.membership_id} due={ss?.balance_due} onDone={refresh} />
      {ss && <RenewDialog open={renewOpen} onOpenChange={setRenewOpen} status={ss} studentId={id} onDone={refresh} />}
      {ss?.membership_id && <SeatDialog open={seatOpen} onOpenChange={setSeatOpen} status={ss} studentId={id} onDone={refresh} />}
      <EditDialog open={editOpen} onOpenChange={setEditOpen} student={s} onDone={refresh} />
      <PinDialog open={pinOpen} onOpenChange={setPinOpen} student={s} />
    </div>
  );
}

function Info({ label, value, big }: { label: string; value?: string | null; big?: boolean }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={big ? "mt-1 text-2xl font-extrabold" : "mt-0.5 text-sm font-semibold"}>{value ?? "—"}</p>
    </div>
  );
}

function RenewDialog({ open, onOpenChange, status, studentId, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; status: StudentStatus; studentId: string; onDone: () => void }) {
  const sb = supabaseBrowser();
  const { settings } = useAdmin();
  const today = todayISO();
  const grace = 3;
  const start = status.end_date && diffDays(status.end_date, today) <= grace ? addDaysISO(status.end_date, 1) : today;
  const [v, setV] = useState<PlanValues>(() => ({ ...emptyPlan(start), shift_id: status.shift_id, seat_id: status.seat_id, seat_label: status.seat_label ?? undefined }));
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!v.plan_id) return toast.error("Choose a plan");
    setBusy(true);
    const { data: m, error } = await sb.from("memberships").insert({
      student_id: studentId, plan_id: v.plan_id, shift_id: v.shift_id, seat_id: v.seat_id,
      start_date: v.start_date, end_date: v.end_date, fee: v.fee, admission_fee: v.admission_fee, discount: v.discount, note: "Renewal",
    }).select("id").single();
    if (error) { setBusy(false); return toast.error(error.message.replace("SEAT_TAKEN: ", "")); }
    if (v.pay_now > 0) {
      const { error: pe } = await sb.from("payments").insert({ student_id: studentId, membership_id: m.id, amount: v.pay_now, mode: v.mode, note: "Renewal" });
      if (pe) toast.error(pe.message);
    }
    setBusy(false);
    toast.success(`Renewed · ${settings?.name ?? ""}`);
    onOpenChange(false);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Plan renew" description={status.end_date ? `Current plan till ${fmtDate(status.end_date)}` : undefined} className="sm:max-w-2xl">
        <PlanForm value={v} onChange={setV} studentId={studentId} />
        <Button className="mt-6 w-full" size="lg" loading={busy} onClick={save} disabled={!v.plan_id}>Renew · {inr(total(v))}</Button>
      </DialogContent>
    </Dialog>
  );
}

function SeatDialog({ open, onOpenChange, status, studentId, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; status: StudentStatus; studentId: string; onDone: () => void }) {
  const sb = supabaseBrowser();
  const [seat, setSeat] = useState<string | null>(status.seat_id);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const { error } = await sb.from("memberships").update({ seat_id: seat }).eq("id", status.membership_id!);
    setBusy(false);
    if (error) return toast.error(error.message.replace("SEAT_TAKEN: ", ""));
    toast.success("Seat changed");
    onOpenChange(false); onDone();
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Change seat" description={`${status.shift_name} shift`} className="sm:max-w-2xl">
        <SeatPicker shiftId={status.shift_id} date={status.start_date && status.start_date > todayISO() ? status.start_date : todayISO()} until={status.end_date ?? undefined} value={seat} onChange={(id) => setSeat(id)} allowStudentId={studentId} />
        <Button className="mt-6 w-full" loading={busy} onClick={save}>Save</Button>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ open, onOpenChange, student, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; student: Student; onDone: () => void }) {
  const sb = supabaseBrowser();
  const [f, setF] = useState({ ...student });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Student, v: string) => setF((p) => ({ ...p, [k]: v }));
  async function save() {
    setBusy(true);
    const phoneChanged = f.phone !== student.phone;
    const { error } = await sb.from("students").update({
      full_name: f.full_name, phone: f.phone, email: f.email || null, gender: f.gender || null, dob: f.dob || null,
      address: f.address || null, guardian_name: f.guardian_name || null, guardian_phone: f.guardian_phone || null,
      exam_target: f.exam_target || null, notes: f.notes || null,
    }).eq("id", student.id);
    if (!error && phoneChanged) await syncStudentLogin(student.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Profile updated"); onOpenChange(false); onDone();
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Profile edit">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name"><Input value={f.full_name} onChange={(e) => set("full_name", e.target.value)} /></Field>
          <Field label="Mobile" hint="Changing this also changes the login number"><Input value={f.phone} onChange={(e) => set("phone", normalizePhone(e.target.value).slice(0, 10))} /></Field>
          <Field label="Email"><Input value={f.email ?? ""} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="Exam"><Input value={f.exam_target ?? ""} onChange={(e) => set("exam_target", e.target.value)} /></Field>
          <Field label="Gender"><Select value={f.gender ?? ""} onChange={(e) => set("gender", e.target.value)}><option value="">—</option><option>Female</option><option>Male</option><option>Other</option></Select></Field>
          <Field label="DOB"><Input type="date" value={f.dob ?? ""} onChange={(e) => set("dob", e.target.value)} /></Field>
          <Field label="Guardian"><Input value={f.guardian_name ?? ""} onChange={(e) => set("guardian_name", e.target.value)} /></Field>
          <Field label="Guardian mobile"><Input value={f.guardian_phone ?? ""} onChange={(e) => set("guardian_phone", e.target.value)} /></Field>
          <Field label="Address" className="sm:col-span-2"><Textarea value={f.address ?? ""} onChange={(e) => set("address", e.target.value)} /></Field>
          <Field label="Notes" className="sm:col-span-2"><Textarea value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></Field>
        </div>
        <Button className="mt-5 w-full" loading={busy} onClick={save}>Save</Button>
      </DialogContent>
    </Dialog>
  );
}

function PinDialog({ open, onOpenChange, student }: { open: boolean; onOpenChange: (o: boolean) => void; student: Student }) {
  const [pin, setPin] = useState(() => String(Math.floor(100000 + Math.random() * 900000)));
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const r = await resetStudentPin(student.id, pin);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success("New PIN set");
    window.open(waLink(student.phone, `Hello ${student.full_name.split(" ")[0]}, your new login PIN: ${pin}\nLogin: ${window.location.origin}/login`), "_blank");
    onOpenChange(false);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Login PIN reset" description={`${student.full_name} · ${student.phone}`}>
        <Field label="New PIN"><Input value={pin} maxLength={6} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} className="font-mono text-lg tracking-[0.4em]" /></Field>
        <Button className="mt-5 w-full" loading={busy} onClick={save}>Set PIN and send on WhatsApp</Button>
      </DialogContent>
    </Dialog>
  );
}
