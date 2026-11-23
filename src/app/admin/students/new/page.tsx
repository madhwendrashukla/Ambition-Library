"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronLeft, MessageCircle, Receipt, ShieldCheck, UserRound } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { compressImage } from "@/lib/hooks";
import { createStudent } from "../../actions";
import { todayISO, waLink, inr, fmtDate, cn, normalizePhone } from "@/lib/utils";
import { PageHeader } from "@/components/ui/misc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { CameraCapture } from "@/components/admin/camera";
import { PlanForm, emptyPlan, total, type PlanValues } from "@/components/admin/plan-form";
import { useAdmin } from "@/components/admin/context";

const genPin = () => String(Math.floor(100000 + Math.random() * 900000));

export default function NewAdmission() {
  const sb = supabaseBrowser();
  const router = useRouter();
  const { settings, shifts } = useAdmin();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [idDoc, setIdDoc] = useState<Blob | null>(null);
  const [consent, setConsent] = useState(false);
  const [d, setD] = useState({
    full_name: "", phone: "", email: "", gender: "", dob: "", address: "", guardian_name: "", guardian_phone: "",
    exam_target: "", id_type: "aadhaar", id_last4: "", admission_date: todayISO(), notes: "", pin: genPin(),
  });
  const [plan, setPlan] = useState<PlanValues>(emptyPlan(todayISO()));
  const [done, setDone] = useState<{ id: string; code: string; receipt?: string } | null>(null);
  // if the student row was created but the plan step failed (e.g. seat just got taken), reuse it on retry
  const [created, setCreated] = useState<{ id: string; code: string } | null>(null);
  const set = (k: keyof typeof d, v: string) => setD((p) => ({ ...p, [k]: v }));

  function nextFromDetails() {
    if (!d.full_name.trim()) return toast.error("Enter a name");
    if (d.phone.length !== 10) return toast.error("Enter a 10-digit mobile number");
    if (idDoc && !consent) return toast.error("Tick the consent box to store the ID");
    setStep(2);
  }

  async function submit() {
    if (!plan.plan_id) return toast.error("Choose a plan");
    setBusy(true);
    try {
      let student = created;
      if (!student) {
        const res = await createStudent({ ...d, pin: d.pin });
        if (!res.ok) throw new Error(res.error);
        student = res.data;
        setCreated(student);
      }
      const sid = student.id;

      // photo + ID upload (compressed)
      const patch: Record<string, string> = {};
      if (photo) {
        const path = `${sid}/photo.jpg`;
        const { error } = await sb.storage.from("student-files").upload(path, await compressImage(photo, 600), { upsert: true, contentType: "image/jpeg" });
        if (!error) patch.photo_path = path;
      }
      if (idDoc) {
        const path = `${sid}/id.jpg`;
        const { error } = await sb.storage.from("student-files").upload(path, await compressImage(idDoc, 1200), { upsert: true, contentType: "image/jpeg" });
        if (!error) patch.id_doc_path = path;
      }
      if (Object.keys(patch).length) { await sb.from("students").update(patch).eq("id", sid); setPhoto(null); setIdDoc(null); }

      const { data: mem, error: mErr } = await sb.from("memberships").insert({
        student_id: sid, plan_id: plan.plan_id, shift_id: plan.shift_id, seat_id: plan.seat_id,
        start_date: plan.start_date, end_date: plan.end_date, fee: plan.fee, admission_fee: plan.admission_fee, discount: plan.discount,
      }).select("id").single();
      if (mErr) throw new Error(mErr.message.replace("SEAT_TAKEN: ", "") + " — choose another seat");

      let receipt: string | undefined;
      if (plan.pay_now > 0) {
        const { data: pay, error: pErr } = await sb.from("payments").insert({
          student_id: sid, membership_id: mem.id, amount: plan.pay_now, mode: plan.mode, note: "Admission",
        }).select("public_token").single();
        if (pErr) throw new Error(pErr.message);
        receipt = pay.public_token;
      }
      setDone({ ...student, receipt });
      setStep(3);
      toast.success("Admission done 🎉");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const shiftName = shifts.find((s) => s.id === plan.shift_id)?.name;
  const appUrl = typeof window !== "undefined" ? window.location.origin : "";
  const welcome = done ? [
    `Hello ${d.full_name.split(" ")[0]} 🙏 Welcome to ${settings?.name ?? "Library"}!`,
    ``,
    `🪑 Seat: ${plan.seat_label ?? "-"} · ${shiftName ?? ""}`,
    `📅 Valid: ${fmtDate(plan.start_date)} – ${fmtDate(plan.end_date)}`,
    ``,
    `📱 App: ${appUrl}/login`,
    `Login: ${d.phone} · PIN: ${d.pin}`,
    `Scan the QR at the gate every day to mark entry/exit.`,
    done.receipt ? `\n🧾 Receipt: ${appUrl}/receipt/${done.receipt}` : "",
  ].join("\n") : "";

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/students" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground"><ChevronLeft className="size-4" />Students</Link>
      <PageHeader title="New admission" subtitle="Student ready in 2 minutes" />

      <div className="mb-6 flex items-center gap-2">
        {["Details", "Plan & seat", "Done"].map((label, i) => (
          <div key={label} className="flex flex-1 items-center gap-2">
            <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold", step > i + 1 ? "bg-green-500 text-white" : step === i + 1 ? "bg-primary text-white" : "bg-muted text-muted-foreground")}>
              {step > i + 1 ? <Check className="size-4" /> : i + 1}
            </div>
            <span className={cn("hidden text-sm font-semibold sm:block", step === i + 1 ? "text-foreground" : "text-muted-foreground")}>{label}</span>
            {i < 2 && <div className="h-0.5 flex-1 rounded bg-border" />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <Card><CardContent className="space-y-6 pt-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Live photo</p>
              <CameraCapture value={photo} onChange={setPhoto} label="Student photo" />
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">ID proof (optional)</p>
              <CameraCapture value={idDoc} onChange={setIdDoc} facing="environment" label="ID card" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name *"><Input value={d.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="Riya Sharma" /></Field>
            <Field label="Mobile *"><Input inputMode="numeric" value={d.phone} onChange={(e) => set("phone", normalizePhone(e.target.value).slice(0, 10))} placeholder="10 digit" /></Field>
            <Field label="Email"><Input type="email" value={d.email} onChange={(e) => set("email", e.target.value)} /></Field>
            <Field label="Preparing for (exam)"><Input value={d.exam_target} onChange={(e) => set("exam_target", e.target.value)} placeholder="UPSC, SSC, NEET…" /></Field>
            <Field label="Gender"><Select value={d.gender} onChange={(e) => set("gender", e.target.value)}><option value="">—</option><option>Female</option><option>Male</option><option>Other</option></Select></Field>
            <Field label="Date of birth"><Input type="date" value={d.dob} onChange={(e) => set("dob", e.target.value)} /></Field>
            <Field label="Guardian name"><Input value={d.guardian_name} onChange={(e) => set("guardian_name", e.target.value)} /></Field>
            <Field label="Guardian mobile"><Input inputMode="numeric" value={d.guardian_phone} onChange={(e) => set("guardian_phone", normalizePhone(e.target.value).slice(0, 10))} /></Field>
            <Field label="Address" className="sm:col-span-2"><Textarea value={d.address} onChange={(e) => set("address", e.target.value)} /></Field>
            <Field label="ID type"><Select value={d.id_type} onChange={(e) => set("id_type", e.target.value)}><option value="aadhaar">Aadhaar (masked)</option><option value="college_id">College ID</option><option value="dl">Driving licence</option><option value="voter">Voter ID</option><option value="other">Other</option></Select></Field>
            <Field label="Last 4 digits of ID" hint="We don't store the full Aadhaar number"><Input inputMode="numeric" maxLength={4} value={d.id_last4} onChange={(e) => set("id_last4", e.target.value.replace(/\D/g, ""))} placeholder="XXXX" /></Field>
            <Field label="Admission date"><Input type="date" value={d.admission_date} onChange={(e) => set("admission_date", e.target.value)} /></Field>
            <Field label="Login PIN" hint="Student logs in to the app with this PIN + mobile"><Input value={d.pin} maxLength={6} onChange={(e) => set("pin", e.target.value.replace(/\D/g, ""))} className="font-mono tracking-[0.3em]" /></Field>
          </div>
          {idDoc && (
            <label className="flex items-start gap-3 rounded-xl bg-brand-soft p-3 text-sm">
              <input type="checkbox" className="mt-1 size-4 accent-[var(--brand)]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span><ShieldCheck className="mr-1 inline size-4 text-primary" />The student has given permission to store a photo of their ID for library records. For Aadhaar, take only a masked copy (only the last 4 digits visible).</span>
            </label>
          )}
          <div className="flex justify-end"><Button size="lg" onClick={nextFromDetails}>Next: Plan & seat</Button></div>
        </CardContent></Card>
      )}

      {step === 2 && (
        <Card><CardContent className="space-y-6 pt-5">
          <div className="flex items-center gap-3 rounded-xl bg-muted p-3">
            <UserRound className="size-5 text-primary" /><p className="text-sm"><b>{d.full_name}</b> · {d.phone}</p>
            {!created && <button className="ml-auto text-sm font-semibold text-primary" onClick={() => setStep(1)}>Edit</button>}
          </div>
          <PlanForm value={plan} onChange={setPlan} withAdmissionFee />
          <div className="flex items-center justify-between gap-3">
            <Button variant="outline" onClick={() => setStep(1)} disabled={!!created}>Back</Button>
            <Button size="lg" loading={busy} onClick={submit} disabled={!plan.plan_id}>Admission confirm · {inr(total(plan))}</Button>
          </div>
        </CardContent></Card>
      )}

      {step === 3 && done && (
        <Card><CardContent className="pt-8 text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-green-500 text-white shadow-lg shadow-green-500/30"><Check className="size-8" /></div>
          <h2 className="text-2xl font-extrabold">Admission done for {d.full_name}</h2>
          <p className="mt-1 text-muted-foreground">Code {done.code} · Seat {plan.seat_label ?? "—"} · {shiftName}</p>
          <div className="mx-auto mt-6 max-w-sm rounded-2xl bg-muted p-4 text-left text-sm">
            <p className="font-semibold">Student login</p>
            <p className="mt-1">Mobile: <b>{d.phone}</b></p>
            <p>PIN: <b className="font-mono tracking-widest">{d.pin}</b></p>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button variant="whatsapp" asChild><a href={waLink(d.phone, welcome)} target="_blank" rel="noreferrer"><MessageCircle />Send on WhatsApp</a></Button>
            {done.receipt && <Button variant="outline" asChild><a href={`/receipt/${done.receipt}`} target="_blank" rel="noreferrer"><Receipt />Receipt</a></Button>}
            <Button variant="secondary" onClick={() => router.push(`/admin/students/${done.id}`)}>View profile</Button>
            <Button variant="ghost" onClick={() => { window.location.reload(); }}>Next admission</Button>
          </div>
        </CardContent></Card>
      )}
    </div>
  );
}
