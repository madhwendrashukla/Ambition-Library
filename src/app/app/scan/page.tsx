"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, LogOut, AlertTriangle, MapPinOff, Smartphone, Clock, XCircle, RotateCcw } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { ScanResult } from "@/lib/types";
import { fmtDate, fmtDuration, fmtTime, getDeviceId } from "@/lib/utils";
import { extractGateKey } from "@/lib/scan";
import { QrScanner } from "@/components/qr-scanner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/misc";
import { useStudent } from "@/components/student/context";

function getLocation(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    const t = setTimeout(() => resolve(null), 8000);
    navigator.geolocation.getCurrentPosition(
      (p) => { clearTimeout(t); resolve({ lat: p.coords.latitude, lng: p.coords.longitude }); },
      () => { clearTimeout(t); resolve(null); },
      { enableHighAccuracy: true, timeout: 7500, maximumAge: 30000 }
    );
  });
}


function ScanInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { reload } = useStudent();
  const [phase, setPhase] = useState<"scan" | "working" | "done">("scan");
  const [res, setRes] = useState<ScanResult | null>(null);
  const busy = useRef(false);

  const run = useCallback(async (key: string | null) => {
    if (busy.current) return;
    busy.current = true;
    setPhase("working");
    if (!key || key === "__personal__") {
      setRes({ ok: false, code: key ? "personal_qr" : "invalid_qr" });
      setPhase("done"); busy.current = false; return;
    }
    const loc = await getLocation();
    const { data, error } = await supabaseBrowser().rpc("scan_gate", { p_gate_key: key, p_device: getDeviceId(), p_lat: loc?.lat ?? null, p_lng: loc?.lng ?? null });
    const r: ScanResult = error ? { ok: false, code: "network" } : (data as ScanResult);
    setRes(r);
    setPhase("done");
    if (navigator.vibrate) navigator.vibrate(r.ok ? 80 : [60, 60, 60]);
    if (r.ok) reload();
    busy.current = false;
  }, [reload]);

  useEffect(() => {
    const k = params.get("k");
    if (k) { router.replace("/app/scan"); run(k); }
  }, [params, router, run]);

  if (phase === "working") return <div className="flex flex-col items-center gap-4 py-24"><Spinner className="size-10" /><p className="font-semibold">Checking…</p></div>;
  if (phase === "done" && res) return <Result r={res} again={() => { setRes(null); setPhase("scan"); }} />;

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h1 className="text-xl font-bold">Scan the gate QR</h1>
        <p className="text-sm text-muted-foreground">IN when you arrive · OUT when you leave — automatically</p>
      </div>
      <div className="overflow-hidden rounded-3xl bg-black ring-4 ring-brand-soft">
        <QrScanner onResult={(t) => run(extractGateKey(t))} paused={phase !== "scan"} />
      </div>
      <ul className="space-y-1.5 rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
        <li>📍 Keep Location ON — scans only work inside the library</li>
        <li>📱 Always scan from this phone (your account is linked to it)</li>
        <li>🔁 Scanned twice by mistake? Wait 2 min and try again</li>
      </ul>
    </div>
  );
}

function Result({ r, again }: { r: ScanResult; again: () => void }) {
  const { lib } = useStudent();
  let tone: "ok" | "out" | "warn" | "bad" = "bad";
  let icon: React.ReactNode = <XCircle className="size-14" />;
  let title = "Scan failed";
  let body: React.ReactNode = null;

  if (r.ok && r.action === "in") {
    tone = r.outside_shift ? "warn" : "ok"; icon = <CheckCircle2 className="size-14" />;
    title = `Welcome, ${r.name?.split(" ")[0]}!`;
    body = (
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <Pill k="IN" v={fmtTime(r.check_in)} /><Pill k="Seat" v={r.seat ?? "—"} /><Pill k="Shift" v={r.shift ?? "—"} />
        </div>
        {r.outside_shift && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">This isn’t your shift time. Your entry has been noted — the desk has been informed.</p>}
        {r.days_left != null && r.days_left <= 5 && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Your plan ends {r.days_left === 0 ? "today" : `in ${r.days_left} days`} ({fmtDate(r.end_date)}). Please renew on time.</p>}
      </div>
    );
  } else if (r.ok && r.action === "out") {
    tone = "out"; icon = <LogOut className="size-14" />;
    title = "Bye! You're checked OUT";
    body = <div className="grid grid-cols-3 gap-2"><Pill k="IN" v={fmtTime(r.check_in)} /><Pill k="OUT" v={fmtTime(r.check_out)} /><Pill k="Study time" v={fmtDuration(r.minutes ?? 0)} /></div>;
  } else {
    const map: Record<string, [React.ReactNode, string, string]> = {
      expired: [<AlertTriangle key="i" className="size-14" />, "Plan expired", `Your plan expired${r.end_date ? " on " + fmtDate(r.end_date) : ""}. Renew at the desk${lib?.upi_id ? ` or pay via UPI (${lib.upi_id})` : ""}.`],
      not_started: [<Clock key="i" className="size-14" />, "Plan hasn't started yet", `Your new plan starts ${r.start_date ? "on " + fmtDate(r.start_date) : "soon"}. Until then, please talk to the desk.`],
      device_mismatch: [<Smartphone key="i" className="size-14" />, "This phone isn't linked", "Your account is linked to another phone. Use that phone, or if you changed phones, ask the desk for a 'device reset'."],
      device_required: [<Smartphone key="i" className="size-14" />, "Device ID not found", "Turn off private/incognito mode in your browser and try again."],
      location_required: [<MapPinOff key="i" className="size-14" />, "Location required", "Turn on Location on your phone and allow it in the browser, then scan again."],
      too_far: [<MapPinOff key="i" className="size-14" />, "You're too far from the library", `You're about ${r.distance_m} m from the library. Come inside the library and scan.`],
      cooldown: [<Clock key="i" className="size-14" />, "Just scanned", `To avoid a double scan, try again after ${r.wait_sec ?? 60} sec.`],
      invalid_qr: [<XCircle key="i" className="size-14" />, "Wrong QR", "This isn't the library's gate QR (or it's outdated). Scan the QR at the gate."],
      personal_qr: [<XCircle key="i" className="size-14" />, "This is your personal QR", "The personal QR is for desk staff. Please scan the QR at the gate."],
      inactive: [<XCircle key="i" className="size-14" />, "Account inactive", "Your account isn't active. Please talk to the desk."],
      not_student: [<XCircle key="i" className="size-14" />, "Not a student account", "This login can't scan."],
      network: [<XCircle key="i" className="size-14" />, "Internet issue", "Check your internet and try again."],
    };
    const m = map[r.code ?? "network"] ?? map.network;
    icon = m[0]; title = m[1]; body = <p className="text-muted-foreground">{m[2]}</p>;
    tone = r.code === "cooldown" ? "warn" : "bad";
  }

  const ring = { ok: "bg-emerald-50 text-emerald-600", out: "bg-brand-soft text-primary", warn: "bg-amber-50 text-amber-600", bad: "bg-red-50 text-red-600" }[tone];
  return (
    <div className="flex flex-col items-center py-8 text-center">
      <div className={`mb-5 flex size-28 items-center justify-center rounded-full ${ring} pop-in`}>{icon}</div>
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <div className="mt-4 w-full">{body}</div>
      <div className="mt-8 flex w-full gap-3">
        <Button variant="outline" className="h-12 flex-1" onClick={again}><RotateCcw />Scan again</Button>
        <Button className="h-12 flex-1" asChild><Link href="/app">Home</Link></Button>
      </div>
    </div>
  );
}

function Pill({ k, v }: { k: string; v: string }) {
  return <div className="rounded-2xl bg-muted px-3 py-3"><p className="text-[11px] font-semibold uppercase text-muted-foreground">{k}</p><p className="text-lg font-bold">{v}</p></div>;
}

export default function ScanPage() {
  return <Suspense fallback={null}><ScanInner /></Suspense>;
}
