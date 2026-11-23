"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ScanLine, Download, Search, LogIn, LogOut, UserCheck } from "lucide-react";
import { extractStudentToken } from "@/lib/scan";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useAsync, q } from "@/lib/hooks";
import type { Attendance, ScanResult, StudentStatus } from "@/lib/types";
import { fmtTime, fmtDuration, todayISO, cn } from "@/lib/utils";
import { PageHeader, Skeleton, Empty } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { QrScanner } from "@/components/qr-scanner";
import { StudentAvatar } from "@/components/admin/student-avatar";

type Row = Attendance & { students: { full_name: string; code: string; photo_path: string | null } | null };

function AttendanceInner() {
  const sb = supabaseBrowser();
  const params = useSearchParams();
  const [date, setDate] = useState(todayISO());
  const [onlyIn, setOnlyIn] = useState(false);
  const [scanOpen, setScanOpen] = useState(params.get("scan") === "1");
  const [manualOpen, setManualOpen] = useState(false);

  const list = useAsync(() => q<Row[]>(sb.from("attendance").select("*, students(full_name, code, photo_path)").eq("att_date", date).order("check_in", { ascending: false })), [date]);

  useEffect(() => {
    const ch = sb.channel("att-page").on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, () => list.reload(true)).subscribe();
    return () => { sb.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sb, date]);

  const rows = useMemo(() => (list.data ?? []).filter((r) => !onlyIn || !r.check_out), [list.data, onlyIn]);
  const inside = (list.data ?? []).filter((r) => !r.check_out).length;
  const unique = new Set((list.data ?? []).map((r) => r.student_id)).size;

  function exportCsv() {
    const lines = [["Code", "Name", "Date", "In", "Out", "Minutes", "Method", "Outside shift"].join(",")];
    (list.data ?? []).forEach((r) => {
      const mins = r.check_out ? Math.round((new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 60000) : "";
      lines.push([r.students?.code, `"${r.students?.full_name}"`, r.att_date, fmtTime(r.check_in), r.check_out ? fmtTime(r.check_out) : "", mins, r.method, r.outside_shift ? "yes" : ""].join(","));
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    a.download = `attendance-${date}.csv`;
    a.click();
  }

  return (
    <div>
      <PageHeader title="Attendance" subtitle={`${unique} students came · ${inside} inside now`}
        actions={<>
          <Button variant="outline" onClick={() => setManualOpen(true)}><UserCheck />Manual</Button>
          <Button onClick={() => setScanOpen(true)}><ScanLine />Student QR scan</Button>
        </>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input type="date" className="w-44" value={date} onChange={(e) => setDate(e.target.value)} />
        <button onClick={() => setOnlyIn(false)} className={cn("rounded-full px-3.5 py-1.5 text-sm font-semibold", !onlyIn ? "bg-primary text-white" : "bg-white ring-1 ring-border")}>All ({list.data?.length ?? 0})</button>
        <button onClick={() => setOnlyIn(true)} className={cn("rounded-full px-3.5 py-1.5 text-sm font-semibold", onlyIn ? "bg-primary text-white" : "bg-white ring-1 ring-border")}>Inside now ({inside})</button>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={exportCsv}><Download />CSV</Button>
      </div>

      {list.loading ? <Skeleton className="h-96" /> : rows.length === 0 ? (
        <Empty icon={<ScanLine />} title="No entries on this day" />
      ) : (
        <Card><ul className="divide-y divide-border">
          {rows.map((r) => {
            const mins = r.check_out ? (new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 60000 : (Date.now() - new Date(r.check_in).getTime()) / 60000;
            return (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <StudentAvatar name={r.students?.full_name} path={r.students?.photo_path} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{r.students?.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    <LogIn className="mr-0.5 inline size-3" />{fmtTime(r.check_in)}
                    {r.check_out && <> · <LogOut className="mr-0.5 inline size-3" />{fmtTime(r.check_out)}</>}
                    {r.method === "staff" && " · staff"}{r.auto_closed && " · auto out"}
                  </p>
                </div>
                {r.outside_shift && <Badge variant="warning" className="hidden sm:inline-flex">Outside shift</Badge>}
                <div className="text-right">
                  {r.check_out ? <Badge variant="muted">OUT</Badge> : <Badge variant="success">IN</Badge>}
                  <p className="mt-0.5 text-xs font-semibold">{fmtDuration(mins)}</p>
                </div>
                {!r.check_out && (
                  <Button size="sm" variant="ghost" onClick={async () => {
                    const { data, error } = await sb.rpc("staff_mark", { p_student: r.student_id, p_force: true });
                    if (error) toast.error(error.message); else if ((data as ScanResult).ok) toast.success(`${r.students?.full_name} OUT`);
                  }}>OUT</Button>
                )}
              </li>
            );
          })}
        </ul></Card>
      )}

      <Dialog open={scanOpen} onOpenChange={setScanOpen}>
        {scanOpen && <StaffScanner />}
      </Dialog>
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        {manualOpen && <ManualMark />}
      </Dialog>
    </div>
  );
}

function ResultCard({ r, onForce }: { r: ScanResult; onForce?: () => void }) {
  const good = r.ok;
  const msg: Record<string, string> = {
    expired: "Plan expired / fees due", not_started: "Plan hasn't started yet", not_found: "QR not recognised", inactive: "Student is marked 'left'",
    cooldown: `Just scanned — wait ${r.wait_sec ?? ""} sec`,
  };
  return (
    <div className={cn("mt-4 rounded-2xl p-4 text-center", good ? (r.action === "in" ? "bg-green-50" : "bg-blue-50") : "bg-red-50")}>
      <p className="text-lg font-extrabold">{r.name ?? ""}</p>
      {good ? (
        <p className={cn("text-2xl font-black", r.action === "in" ? "text-green-600" : "text-primary")}>
          {r.action === "in" ? `IN ✓ ${r.seat ? "· Seat " + r.seat : ""}` : `OUT ✓ · ${fmtDuration(r.minutes ?? 0)}`}
        </p>
      ) : <p className="font-bold text-red-600">{msg[r.code ?? ""] ?? r.code}</p>}
      {r.outside_shift && <p className="mt-1 text-sm text-amber-700">Entry outside shift</p>}
      {(r.code === "expired" || r.code === "not_started") && onForce && <Button size="sm" variant="outline" className="mt-3" onClick={onForce}>Allow entry anyway</Button>}
    </div>
  );
}

function StaffScanner() {
  const sb = supabaseBrowser();
  const [res, setRes] = useState<ScanResult | null>(null);
  const [lastToken, setLastToken] = useState("");
  const [resultToken, setResultToken] = useState("");
  const [busy, setBusy] = useState(false);

  async function handle(text: string, force = false) {
    const token = force ? text : extractStudentToken(text);
    if (!token) { toast.error("This is not a student QR — student app → Profile → My QR"); return; }
    if (busy || (!force && token === lastToken)) return;
    setBusy(true); setLastToken(token); setResultToken(token);
    const { data, error } = await sb.rpc("staff_mark", { p_token: token, p_force: force });
    setBusy(false);
    if (error) return toast.error(error.message);
    setRes(data as ScanResult);
    if (navigator.vibrate) navigator.vibrate(80);
    setTimeout(() => setLastToken(""), 4000);
  }

  return (
    <DialogContent title="Student QR scan" description="Student shows My QR in the app, you scan it">
      <QrScanner onResult={(t) => handle(t)} paused={busy} />
      {res && <ResultCard r={res} onForce={() => handle(resultToken, true)} />}
    </DialogContent>
  );
}

function ManualMark() {
  const sb = supabaseBrowser();
  const [term, setTerm] = useState("");
  const { data } = useAsync(() => q<StudentStatus[]>(sb.from("v_student_status").select("*").eq("status", "active").order("full_name")));
  const [res, setRes] = useState<ScanResult | null>(null);
  const list = (data ?? []).filter((s) => !term || s.full_name.toLowerCase().includes(term.toLowerCase()) || s.phone.includes(term) || s.code.toLowerCase().includes(term.toLowerCase())).slice(0, 8);
  async function mark(id: string, force = false) {
    const { data: r, error } = await sb.rpc("staff_mark", { p_student: id, p_force: force });
    if (error) return toast.error(error.message);
    setRes({ ...(r as ScanResult), student_id: id } as ScanResult & { student_id: string });
  }
  return (
    <DialogContent title="Manual attendance" description="No phone? Mark IN/OUT by name">
      <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" autoFocus placeholder="Name / phone / code" value={term} onChange={(e) => setTerm(e.target.value)} /></div>
      <ul className="mt-3 max-h-72 divide-y divide-border overflow-y-auto">
        {list.map((s) => (
          <li key={s.student_id} className="flex items-center justify-between gap-2 py-2">
            <div><p className="text-sm font-semibold">{s.full_name}</p><p className="text-xs text-muted-foreground">{s.code} · {s.shift_name ?? "no plan"}{s.seat_label ? ` · ${s.seat_label}` : ""}</p></div>
            <Button size="sm" variant="secondary" onClick={() => mark(s.student_id)}>IN / OUT</Button>
          </li>
        ))}
      </ul>
      {res && <ResultCard r={res} onForce={() => mark((res as ScanResult & { student_id: string }).student_id, true)} />}
    </DialogContent>
  );
}

export default function AttendancePage() {
  return <Suspense><AttendanceInner /></Suspense>;
}
