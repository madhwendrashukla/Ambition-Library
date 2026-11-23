"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Pencil, Armchair } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { SeatBoardRow } from "@/lib/types";
import { cn, fmtDate, todayISO, TAG_LABEL } from "@/lib/utils";
import { PageHeader, Skeleton, Empty } from "@/components/ui/misc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAdmin } from "@/components/admin/context";

const TAGS = Object.keys(TAG_LABEL);

export default function SeatsPage() {
  const sb = supabaseBrowser();
  const { shifts, reload: reloadAdmin, role } = useAdmin();
  const [shift, setShift] = useState<string | null>(null);
  const [date, setDate] = useState(todayISO());
  const [rows, setRows] = useState<SeatBoardRow[] | null>(null);
  const [edit, setEdit] = useState<SeatBoardRow | null>(null);
  const [bulk, setBulk] = useState(false);

  useEffect(() => { if (!shift && shifts.length) setShift(shifts[0].id); }, [shifts, shift]);
  const load = async () => {
    if (!shift) return;
    const { data } = await sb.rpc("seat_board", { p_shift: shift, p_date: date });
    setRows(data ?? []);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setRows(null); load(); }, [shift, date]);

  const maxCol = useMemo(() => Math.max(1, ...(rows ?? []).map((r) => r.col_no)), [rows]);
  const free = (rows ?? []).filter((r) => r.active && !r.occupied).length;
  const booked = (rows ?? []).filter((r) => r.occupied).length;

  return (
    <div>
      <PageHeader title="Seat map" subtitle="Pick a shift — green is free, red is taken"
        actions={role === "admin" && <Button variant="outline" onClick={() => setBulk(true)}><Plus />Add seats</Button>} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {shifts.map((s) => (
          <button key={s.id} onClick={() => setShift(s.id)} className={cn("rounded-full px-4 py-2 text-sm font-semibold", shift === s.id ? "bg-primary text-white" : "bg-white text-slate-600 ring-1 ring-border")}>
            {s.name} <span className="opacity-70">{s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}</span>
          </button>
        ))}
        <Input type="date" className="ml-auto w-44" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Card><CardContent className="pt-4"><p className="text-xs font-semibold uppercase text-muted-foreground">Free</p><p className="text-2xl font-extrabold text-green-600">{rows ? free : "–"}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs font-semibold uppercase text-muted-foreground">Taken</p><p className="text-2xl font-extrabold text-red-600">{rows ? booked : "–"}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs font-semibold uppercase text-muted-foreground">Total</p><p className="text-2xl font-extrabold">{rows?.length ?? "–"}</p></CardContent></Card>
      </div>

      {!rows ? <Skeleton className="h-96" /> : rows.length === 0 ? (
        <Empty icon={<Armchair />} title="No seats yet" hint="Enter rows and columns to create seats." action={<Button onClick={() => setBulk(true)}>Create seats</Button>} />
      ) : (
        <Card><CardContent className="overflow-x-auto pt-5">
          <div className="mb-3 rounded-xl bg-muted py-1.5 text-center text-xs font-bold uppercase tracking-[0.3em] text-muted-foreground">Entrance / Counter</div>
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${maxCol}, minmax(3.4rem, 1fr))` }}>
            {rows.map((r) => (
              <button key={r.seat_id} onClick={() => setEdit(r)} style={{ gridColumnStart: r.col_no }}
                className={cn("relative flex h-16 flex-col items-center justify-center rounded-xl px-1 text-center transition-transform hover:scale-105",
                  !r.active ? "bg-slate-100 text-slate-300" : r.occupied ? "bg-red-50 text-red-700 ring-1 ring-red-200" : "bg-green-50 text-green-700 ring-1 ring-green-200")}>
                <span className="text-sm font-extrabold">{r.label}</span>
                <span className="w-full truncate text-[10px] font-medium">{r.occupied ? r.student_name?.split(" ")[0] : r.active ? "free" : "off"}</span>
                <span className="absolute right-1 top-0.5 text-[9px]">{r.tags.includes("window") ? "🪟" : ""}{r.tags.includes("ac") ? "❄️" : ""}</span>
              </button>
            ))}
          </div>
        </CardContent></Card>
      )}

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        {edit && <SeatEditor seat={edit} canEdit={role === "admin"} onDone={() => { setEdit(null); load(); reloadAdmin(); }} />}
      </Dialog>
      <Dialog open={bulk} onOpenChange={setBulk}>
        <BulkSeats onDone={() => { setBulk(false); load(); reloadAdmin(); }} />
      </Dialog>
    </div>
  );
}

function SeatEditor({ seat, canEdit, onDone }: { seat: SeatBoardRow; canEdit: boolean; onDone: () => void }) {
  const sb = supabaseBrowser();
  const [label, setLabel] = useState(seat.label);
  const [tags, setTags] = useState<string[]>(seat.tags);
  const [active, setActive] = useState(seat.active);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const { error } = await sb.from("seats").update({ label, tags, active }).eq("id", seat.seat_id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Seat updated"); onDone();
  }
  return (
    <DialogContent title={`Seat ${seat.label}`} description={seat.occupied ? `${seat.student_name} · ${seat.occupant_shift} · till ${fmtDate(seat.end_date)}` : "Free in this shift"}>
      {seat.occupied && seat.student_id && (
        <Button variant="secondary" asChild className="mb-4 w-full"><Link href={`/admin/students/${seat.student_id}`}>{seat.student_name}’s profile</Link></Button>
      )}
      {canEdit ? (
        <div className="space-y-4">
          <Field label="Seat number"><Input value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tags</p>
            <div className="flex flex-wrap gap-2">
              {TAGS.map((t) => (
                <button key={t} type="button" onClick={() => setTags((p) => p.includes(t) ? p.filter((x) => x !== t) : [...p, t])}
                  className={cn("rounded-full px-3 py-1.5 text-sm font-semibold", tags.includes(t) ? "bg-primary text-white" : "bg-muted text-slate-600")}>{TAG_LABEL[t]}</button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="size-4" checked={active} onChange={(e) => setActive(e.target.checked)} />Seat in use</label>
          <Button className="w-full" loading={busy} onClick={save}><Pencil />Save</Button>
        </div>
      ) : <p className="text-sm text-muted-foreground">Only an admin can edit seats.</p>}
    </DialogContent>
  );
}

function BulkSeats({ onDone }: { onDone: () => void }) {
  const sb = supabaseBrowser();
  const { seats } = useAdmin();
  const nextRow = Math.max(0, ...seats.map((s) => s.row_no)) + 1;
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(10);
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    const data = [];
    for (let r = 0; r < rows; r++) for (let c = 1; c <= cols; c++) {
      const row = nextRow + r;
      data.push({ label: `${String.fromCharCode(64 + row)}${c}`, row_no: row, col_no: c, tags: c === 1 || c === cols ? ["window"] : [] });
    }
    const { error } = await sb.from("seats").insert(data);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${data.length} seats created`); onDone();
  }
  return (
    <DialogContent title="Add seats" description={`New rows will start from ${String.fromCharCode(64 + nextRow)}`}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Rows"><Input type="number" min={1} max={26} value={rows} onChange={(e) => setRows(Number(e.target.value))} /></Field>
        <Field label="Seats per row"><Input type="number" min={1} max={30} value={cols} onChange={(e) => setCols(Number(e.target.value))} /></Field>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{rows * cols} seats will be created. You can set Window/AC tags on each seat later.</p>
      <Button className="mt-5 w-full" loading={busy} onClick={create}>Create</Button>
    </DialogContent>
  );
}
