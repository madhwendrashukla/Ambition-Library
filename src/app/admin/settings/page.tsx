"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import QRCode from "qrcode";
import { Plus, Save, MapPin, Printer, RefreshCw, Trash2, Upload } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useAsync, q } from "@/lib/hooks";
import type { LibrarySettings, Plan, Shift } from "@/lib/types";
import { inr } from "@/lib/utils";
import { PageHeader, Skeleton } from "@/components/ui/misc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAdmin } from "@/components/admin/context";
import { createStaff, removeStaff } from "../actions";

const COLORS = ["#2563EB", "#4F46E5", "#0891B2", "#059669", "#DC2626", "#EA580C", "#7C3AED", "#0B1B3F"];

export default function SettingsPage() {
  const { settings, role } = useAdmin();
  if (!settings) return <Skeleton className="h-96" />;
  const admin = role === "admin";
  return (
    <div>
      <PageHeader title="Settings" subtitle={admin ? "Library, shifts, plans, attendance and staff" : "Only an admin can change settings"} />
      <Tabs defaultValue="library">
        <TabsList className="mb-5">
          <TabsTrigger value="library">Library</TabsTrigger>
          <TabsTrigger value="shifts">Shifts</TabsTrigger>
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="attendance">Attendance & QR</TabsTrigger>
          <TabsTrigger value="reminder">Reminder</TabsTrigger>
          <TabsTrigger value="staff">Staff</TabsTrigger>
        </TabsList>
        <TabsContent value="library"><LibraryTab admin={admin} /></TabsContent>
        <TabsContent value="shifts"><ShiftsTab admin={admin} /></TabsContent>
        <TabsContent value="plans"><PlansTab admin={admin} /></TabsContent>
        <TabsContent value="attendance"><AttendanceTab admin={admin} /></TabsContent>
        <TabsContent value="reminder"><ReminderTab admin={admin} /></TabsContent>
        <TabsContent value="staff"><StaffTab admin={admin} /></TabsContent>
      </Tabs>
    </div>
  );
}

function useSettingsForm() {
  const { settings, reload } = useAdmin();
  const [f, setF] = useState<LibrarySettings>(settings!);
  const [busy, setBusy] = useState(false);
  async function save(fields: (keyof LibrarySettings)[]) {
    setBusy(true);
    const patch = Object.fromEntries(fields.map((k) => [k, f[k] === "" ? null : f[k]]));
    const { error } = await supabaseBrowser().from("library_settings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", 1);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    reload();
  }
  return { f, setF, busy, save };
}

function LibraryTab({ admin }: { admin: boolean }) {
  const { f, setF, busy, save } = useSettingsForm();
  const set = (k: keyof LibrarySettings, v: string | number | boolean) => setF({ ...f, [k]: v });

  async function uploadLogo(file: File) {
    const sb = supabaseBrowser();
    const path = `logo-${Date.now()}.${file.name.split(".").pop()}`;
    const { error } = await sb.storage.from("branding").upload(path, file, { upsert: true });
    if (error) return toast.error(error.message);
    const { data } = sb.storage.from("branding").getPublicUrl(path);
    set("logo_url", data.publicUrl);
  }

  return (
    <Card><CardContent className="space-y-5 pt-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Library name"><Input disabled={!admin} value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Tagline"><Input disabled={!admin} value={f.tagline ?? ""} onChange={(e) => set("tagline", e.target.value)} /></Field>
        <Field label="Phone"><Input disabled={!admin} value={f.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field label="Email"><Input disabled={!admin} value={f.email ?? ""} onChange={(e) => set("email", e.target.value)} /></Field>
        <Field label="UPI ID" hint="Shown on receipts and reminders"><Input disabled={!admin} value={f.upi_id ?? ""} onChange={(e) => set("upi_id", e.target.value)} placeholder="library@upi" /></Field>
        <Field label="Receipt prefix"><Input disabled={!admin} value={f.receipt_prefix} onChange={(e) => set("receipt_prefix", e.target.value.toUpperCase())} /></Field>
        <Field label="Address" className="sm:col-span-2"><Textarea disabled={!admin} value={f.address ?? ""} onChange={(e) => set("address", e.target.value)} /></Field>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Brand colour</p>
        <div className="flex flex-wrap items-center gap-2">
          {COLORS.map((c) => (
            <button key={c} disabled={!admin} onClick={() => { set("primary_color", c); document.documentElement.style.setProperty("--brand", c); }}
              className="size-9 rounded-full ring-offset-2 transition-transform hover:scale-110" style={{ background: c, boxShadow: f.primary_color.toLowerCase() === c.toLowerCase() ? `0 0 0 3px white, 0 0 0 5px ${c}` : undefined }} />
          ))}
          <Input type="color" disabled={!admin} className="h-9 w-14 p-1" value={f.primary_color} onChange={(e) => { set("primary_color", e.target.value); document.documentElement.style.setProperty("--brand", e.target.value); }} />
        </div>
      </div>
      <div className="flex items-center gap-4">
        {f.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={f.logo_url} alt="logo" className="size-16 rounded-2xl object-cover ring-1 ring-border" />
        ) : <div className="flex size-16 items-center justify-center rounded-2xl bg-muted text-xs text-muted-foreground">Logo</div>}
        {admin && <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"><Upload className="size-4" />Logo upload<input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} /></label>}
      </div>
      {admin && <Button loading={busy} onClick={() => save(["name", "tagline", "phone", "email", "upi_id", "receipt_prefix", "address", "primary_color", "logo_url"])}><Save />Save</Button>}
    </CardContent></Card>
  );
}

function ShiftsTab({ admin }: { admin: boolean }) {
  const { shifts, reload } = useAdmin();
  const [rows, setRows] = useState<Shift[]>(shifts);
  useEffect(() => setRows(shifts), [shifts]);
  const sb = supabaseBrowser();
  async function saveRow(s: Shift) {
    const { id, ...rest } = s;
    const { error } = id.startsWith("new") ? await sb.from("shifts").insert({ ...rest }) : await sb.from("shifts").update(rest).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`${s.name} saved`); reload();
  }
  const upd = (i: number, patch: Partial<Shift>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <Card><CardContent className="space-y-3 pt-5">
      <p className="text-sm text-muted-foreground">A Full Day shift blocks the seat for all other shifts. Morning + Evening can share the same seat.</p>
      {rows.map((s, i) => (
        <div key={s.id} className="grid items-end gap-3 rounded-2xl border border-border p-3 sm:grid-cols-[2fr_1fr_1fr_auto_auto_auto]">
          <Field label="Name"><Input disabled={!admin} value={s.name} onChange={(e) => upd(i, { name: e.target.value })} /></Field>
          <Field label="Start"><Input disabled={!admin} type="time" value={s.start_time.slice(0, 5)} onChange={(e) => upd(i, { start_time: e.target.value })} /></Field>
          <Field label="End"><Input disabled={!admin} type="time" value={s.end_time.slice(0, 5)} onChange={(e) => upd(i, { end_time: e.target.value })} /></Field>
          <label className="flex h-10 items-center gap-2 text-sm font-semibold"><input disabled={!admin} type="checkbox" checked={s.is_full_day} onChange={(e) => upd(i, { is_full_day: e.target.checked })} />Full day</label>
          <label className="flex h-10 items-center gap-2 text-sm font-semibold"><input disabled={!admin} type="checkbox" checked={s.active} onChange={(e) => upd(i, { active: e.target.checked })} />Active</label>
          {admin && <Button variant="secondary" onClick={() => saveRow(s)}><Save />Save</Button>}
        </div>
      ))}
      {admin && <Button variant="outline" onClick={() => setRows([...rows, { id: "new" + Date.now(), name: "Night", start_time: "22:00", end_time: "23:59", is_full_day: false, sort: rows.length + 1, active: true }])}><Plus />Add shift</Button>}
    </CardContent></Card>
  );
}

function PlansTab({ admin }: { admin: boolean }) {
  const { plans, shifts, reload } = useAdmin();
  const [rows, setRows] = useState<Plan[]>(plans);
  useEffect(() => setRows(plans), [plans]);
  const sb = supabaseBrowser();
  async function saveRow(p: Plan) {
    const { id, ...rest } = p;
    const payload = { ...rest, price: Number(rest.price), admission_fee: Number(rest.admission_fee), duration_days: Number(rest.duration_days) };
    const { error } = id.startsWith("new") ? await sb.from("plans").insert(payload) : await sb.from("plans").update(payload).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`${p.name} saved`); reload();
  }
  const upd = (i: number, patch: Partial<Plan>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <Card><CardContent className="space-y-3 pt-5">
      {rows.map((p, i) => (
        <div key={p.id} className="grid items-end gap-3 rounded-2xl border border-border p-3 sm:grid-cols-[2fr_1.3fr_1fr_1fr_1fr_auto_auto]">
          <Field label="Plan name"><Input disabled={!admin} value={p.name} onChange={(e) => upd(i, { name: e.target.value })} /></Field>
          <Field label="Shift"><Select disabled={!admin} value={p.shift_id} onChange={(e) => upd(i, { shift_id: e.target.value })}>{shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label="Days"><Input disabled={!admin} type="number" value={p.duration_days} onChange={(e) => upd(i, { duration_days: Number(e.target.value) })} /></Field>
          <Field label="Fee ₹"><Input disabled={!admin} type="number" value={p.price} onChange={(e) => upd(i, { price: Number(e.target.value) })} /></Field>
          <Field label="Admission ₹"><Input disabled={!admin} type="number" value={p.admission_fee} onChange={(e) => upd(i, { admission_fee: Number(e.target.value) })} /></Field>
          <label className="flex h-10 items-center gap-2 text-sm font-semibold"><input disabled={!admin} type="checkbox" checked={p.active} onChange={(e) => upd(i, { active: e.target.checked })} />Active</label>
          {admin && <Button variant="secondary" onClick={() => saveRow(p)}><Save /></Button>}
        </div>
      ))}
      {admin && shifts[0] && <Button variant="outline" onClick={() => setRows([...rows, { id: "new" + Date.now(), name: "New plan", shift_id: shifts[0].id, duration_days: 30, price: 0, admission_fee: 0, active: true }])}><Plus />Add plan</Button>}
      <p className="text-xs text-muted-foreground">Current plans: {plans.filter((p) => p.active).map((p) => `${p.name} ${inr(p.price)}`).join(" · ")}</p>
    </CardContent></Card>
  );
}

function AttendanceTab({ admin }: { admin: boolean }) {
  const { f, setF, busy, save } = useSettingsForm();
  const { reload } = useAdmin();
  const [qr, setQr] = useState<string>("");
  const set = (k: keyof LibrarySettings, v: string | number | boolean | null) => setF({ ...f, [k]: v });
  const link = typeof window !== "undefined" ? `${window.location.origin}/app/scan?k=${f.gate_key}` : "";
  useEffect(() => { if (link) QRCode.toDataURL(link, { width: 360, margin: 1 }).then(setQr); }, [link]);

  function useMyLocation() {
    navigator.geolocation.getCurrentPosition(
      (p) => { setF({ ...f, latitude: Number(p.coords.latitude.toFixed(6)), longitude: Number(p.coords.longitude.toFixed(6)), geofence_enabled: true }); toast.success("Location captured — tap Save"); },
      () => toast.error("Location permission is required"), { enableHighAccuracy: true }
    );
  }
  async function regen() {
    if (!confirm("Creating a new QR will disable the old gate QR. You'll need to print the new one. Continue?")) return;
    const { data, error } = await supabaseBrowser().rpc("regenerate_gate_key");
    if (error) return toast.error(error.message);
    setF({ ...f, gate_key: data as string }); reload(); toast.success("New gate QR ready — print it");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Gate QR</CardTitle><Badge variant="success">Active</Badge></CardHeader>
        <CardContent className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qr && <img src={qr} alt="Gate QR" className="mx-auto size-56 rounded-2xl ring-1 ring-border" />}
          <p className="mt-3 text-sm text-muted-foreground">Laminate it and put it up at the gate. First scan = IN, second = OUT.</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button asChild><Link href="/admin/gate-qr" target="_blank"><Printer />Print</Link></Button>
            {admin && <Button variant="outline" onClick={regen}><RefreshCw />New QR</Button>}
          </div>
        </CardContent>
      </Card>
      <Card><CardHeader><CardTitle>Scan rules</CardTitle></CardHeader><CardContent className="space-y-4">
        <label className="flex items-start gap-3 rounded-xl bg-muted p-3 text-sm">
          <input disabled={!admin} type="checkbox" className="mt-0.5 size-4" checked={f.geofence_enabled} onChange={(e) => set("geofence_enabled", e.target.checked)} />
          <span><b>Location check (geofence)</b><br /><span className="text-muted-foreground">A scan only counts when the phone is near the library — no fake scans from home.</span></span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Latitude"><Input disabled={!admin} value={f.latitude ?? ""} onChange={(e) => set("latitude", e.target.value === "" ? null : Number(e.target.value))} /></Field>
          <Field label="Longitude"><Input disabled={!admin} value={f.longitude ?? ""} onChange={(e) => set("longitude", e.target.value === "" ? null : Number(e.target.value))} /></Field>
        </div>
        {admin && <Button variant="outline" size="sm" onClick={useMyLocation}><MapPin />Use my location (stand inside the library)</Button>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Radius (meter)"><Input disabled={!admin} type="number" value={f.geofence_m} onChange={(e) => set("geofence_m", Number(e.target.value))} /></Field>
          <Field label="Grace before shift (min)"><Input disabled={!admin} type="number" value={f.checkin_grace_min} onChange={(e) => set("checkin_grace_min", Number(e.target.value))} /></Field>
          <Field label="Double-scan cooldown (sec)"><Input disabled={!admin} type="number" value={f.cooldown_sec} onChange={(e) => set("cooldown_sec", Number(e.target.value))} /></Field>
          <Field label="Auto OUT (min after shift)"><Input disabled={!admin} type="number" value={f.auto_checkout_min} onChange={(e) => set("auto_checkout_min", Number(e.target.value))} /></Field>
        </div>
        {admin && <Button loading={busy} onClick={() => save(["geofence_enabled", "latitude", "longitude", "geofence_m", "checkin_grace_min", "cooldown_sec", "auto_checkout_min"])}><Save />Save</Button>}
      </CardContent></Card>
    </div>
  );
}

function ReminderTab({ admin }: { admin: boolean }) {
  const { f, setF, busy, save } = useSettingsForm();
  return (
    <Card><CardContent className="space-y-4 pt-5">
      <Field label="WhatsApp reminder message" hint="Variables: {name} {library} {shift} {seat} {end_date} {verb} {upi} {due}">
        <Textarea disabled={!admin} rows={7} value={f.reminder_template} onChange={(e) => setF({ ...f, reminder_template: e.target.value })} />
      </Field>
      {admin && <Button loading={busy} onClick={() => save(["reminder_template"])}><Save />Save</Button>}
    </CardContent></Card>
  );
}

function StaffTab({ admin }: { admin: boolean }) {
  const sb = supabaseBrowser();
  const { data, reload } = useAsync(() => q<{ id: string; role: string; full_name: string | null }[]>(sb.from("profiles").select("id, role, full_name").in("role", ["admin", "staff"])));
  const [f, setF] = useState({ full_name: "", email: "", password: "", role: "staff" as "staff" | "admin" });
  const [busy, setBusy] = useState(false);
  async function add() {
    setBusy(true);
    const r = await createStaff(f);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success("Staff account created"); setF({ full_name: "", email: "", password: "", role: "staff" }); reload(true);
  }
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Team</CardTitle></CardHeader><CardContent>
        <ul className="divide-y divide-border">
          {(data ?? []).map((p) => (
            <li key={p.id} className="flex items-center justify-between py-2.5">
              <div><p className="font-semibold">{p.full_name ?? "—"}</p><Badge variant={p.role === "admin" ? "default" : "muted"} className="capitalize">{p.role}</Badge></div>
              {admin && p.role !== "admin" && <Button size="icon" variant="ghost" className="text-red-600" onClick={async () => { if (!confirm("Remove?")) return; const r = await removeStaff(p.id); if (!r.ok) toast.error(r.error); else reload(true); }} aria-label="Remove"><Trash2 /></Button>}
            </li>
          ))}
        </ul>
      </CardContent></Card>
      {admin && (
        <Card><CardHeader><CardTitle>Add staff</CardTitle></CardHeader><CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Staff can handle admissions, payments and attendance. Settings/pricing are admin-only.</p>
          <Field label="Name"><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
          <Field label="Email"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Password"><Input type="text" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
          <Field label="Role"><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as "staff" | "admin" })}><option value="staff">Staff</option><option value="admin">Admin</option></Select></Field>
          <Button loading={busy} onClick={add}><Plus />Create</Button>
        </CardContent></Card>
      )}
    </div>
  );
}
