"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { SeatBoardRow } from "@/lib/types";
import { cn, TAG_LABEL } from "@/lib/utils";
import { Skeleton } from "@/components/ui/misc";

export function SeatPicker({ shiftId, date, until, value, onChange, allowStudentId }: {
  shiftId: string | null; date: string; until?: string; value: string | null; onChange: (seatId: string | null, label?: string) => void; allowStudentId?: string;
}) {
  const sb = supabaseBrowser();
  const [rows, setRows] = useState<SeatBoardRow[] | null>(null);

  useEffect(() => {
    if (!shiftId) return;
    setRows(null);
    sb.rpc("seat_board", { p_shift: shiftId, p_date: date, p_until: until ?? date }).then(({ data }: { data: SeatBoardRow[] | null }) => setRows(data ?? []));
  }, [sb, shiftId, date, until]);

  if (!shiftId) return <p className="text-sm text-muted-foreground">Choose a shift first</p>;
  if (!rows) return <Skeleton className="h-48" />;

  const maxCol = Math.max(1, ...rows.map((r) => r.col_no));
  const free = rows.filter((r) => r.active && !r.occupied).length;
  const selected = rows.find((r) => r.seat_id === value);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs font-semibold">
        <span className="flex items-center gap-1.5"><span className="size-3 rounded bg-green-500" />Free ({free})</span>
        <span className="flex items-center gap-1.5"><span className="size-3 rounded bg-red-300" />Taken</span>
        <span className="flex items-center gap-1.5"><span className="size-3 rounded bg-primary" />Selected</span>
        <button type="button" className="ml-auto text-primary" onClick={() => onChange(null)}>No seat</button>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border bg-muted/40 p-3">
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${maxCol}, minmax(2.6rem, 1fr))` }}>
          {rows.map((r) => {
            const mine = allowStudentId && r.student_id === allowStudentId;
            const disabled = !r.active || (r.occupied && !mine);
            const isSel = r.seat_id === value;
            return (
              <button type="button" key={r.seat_id} disabled={disabled}
                onClick={() => onChange(r.seat_id, r.label)}
                title={r.occupied ? `${r.student_name} (${r.occupant_shift})` : r.tags.map((t) => TAG_LABEL[t] ?? t).join(", ")}
                style={{ gridColumnStart: r.col_no }}
                className={cn("relative h-11 rounded-lg text-[11px] font-bold transition-all",
                  isSel ? "bg-primary text-white ring-2 ring-primary/30 scale-105" :
                  disabled ? (r.active ? "bg-red-100 text-red-400" : "bg-slate-100 text-slate-300") :
                  "bg-green-50 text-green-700 ring-1 ring-green-200 hover:bg-green-100")}>
                {r.label}
                {r.tags.includes("window") && <span className="absolute right-0.5 top-0 text-[8px]">🪟</span>}
              </button>
            );
          })}
        </div>
      </div>
      {selected && (
        <p className="mt-2 text-sm"><b>Seat {selected.label}</b> {selected.tags.length > 0 && <span className="text-muted-foreground">· {selected.tags.map((t) => TAG_LABEL[t] ?? t).join(" · ")}</span>}</p>
      )}
    </div>
  );
}
