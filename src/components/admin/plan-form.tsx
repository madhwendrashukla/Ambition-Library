"use client";
import { useEffect, useMemo } from "react";
import { useAdmin } from "./context";
import { Field, Input, Select } from "@/components/ui/input";
import { SeatPicker } from "./seat-picker";
import { addDaysISO, inr, cn } from "@/lib/utils";

export interface PlanValues {
  shift_id: string | null; plan_id: string | null; seat_id: string | null; seat_label?: string;
  start_date: string; end_date: string; fee: number; admission_fee: number; discount: number;
  pay_now: number; mode: string; note: string;
}

export function emptyPlan(start: string): PlanValues {
  return { shift_id: null, plan_id: null, seat_id: null, start_date: start, end_date: start, fee: 0, admission_fee: 0, discount: 0, pay_now: 0, mode: "cash", note: "" };
}

export const total = (v: PlanValues) => Math.max(0, Number(v.fee) + Number(v.admission_fee) - Number(v.discount));

export function PlanForm({ value, onChange, withAdmissionFee, studentId }: {
  value: PlanValues; onChange: (v: PlanValues) => void; withAdmissionFee?: boolean; studentId?: string;
}) {
  const { shifts, plans } = useAdmin();
  const set = (patch: Partial<PlanValues>) => onChange({ ...value, ...patch });
  const shiftPlans = useMemo(() => plans.filter((p) => p.active && p.shift_id === value.shift_id), [plans, value.shift_id]);
  const plan = plans.find((p) => p.id === value.plan_id);

  // keep end date + fee in sync with plan / start date
  useEffect(() => {
    if (!plan) return;
    const end = addDaysISO(value.start_date, plan.duration_days - 1);
    const fee = Number(plan.price);
    const adm = withAdmissionFee ? Number(plan.admission_fee) : 0;
    if (end !== value.end_date || fee !== value.fee || adm !== value.admission_fee) {
      const t = Math.max(0, fee + adm - value.discount);
      onChange({ ...value, end_date: end, fee, admission_fee: adm, pay_now: t });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.plan_id, value.start_date]);

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Shift</p>
        <div className="grid grid-cols-3 gap-2">
          {shifts.filter((s) => s.active).map((s) => (
            <button type="button" key={s.id} onClick={() => set({ shift_id: s.id, plan_id: null, seat_id: null })}
              className={cn("rounded-xl border p-3 text-left transition-all", value.shift_id === s.id ? "border-primary bg-brand-soft ring-2 ring-primary/20" : "border-border hover:bg-muted")}>
              <p className="text-sm font-bold">{s.name}</p>
              <p className="text-xs text-muted-foreground">{s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}</p>
            </button>
          ))}
        </div>
      </div>

      {value.shift_id && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Plan</p>
          {shiftPlans.length === 0 ? <p className="text-sm text-muted-foreground">No plans for this shift — create one in Settings → Plans.</p> : (
            <div className="grid gap-2 sm:grid-cols-2">
              {shiftPlans.map((p) => (
                <button type="button" key={p.id} onClick={() => set({ plan_id: p.id })}
                  className={cn("flex items-center justify-between rounded-xl border p-3 text-left", value.plan_id === p.id ? "border-primary bg-brand-soft ring-2 ring-primary/20" : "border-border hover:bg-muted")}>
                  <div><p className="text-sm font-bold">{p.name}</p><p className="text-xs text-muted-foreground">{p.duration_days} days</p></div>
                  <p className="font-extrabold">{inr(p.price)}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {value.plan_id && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date"><Input type="date" value={value.start_date} onChange={(e) => set({ start_date: e.target.value })} /></Field>
            <Field label="End date"><Input type="date" value={value.end_date} min={value.start_date} onChange={(e) => set({ end_date: e.target.value })} /></Field>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Seat</p>
            <SeatPicker shiftId={value.shift_id} date={value.start_date} until={value.end_date} value={value.seat_id} allowStudentId={studentId}
              onChange={(id, label) => set({ seat_id: id, seat_label: label })} />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Plan fee"><Input type="number" value={value.fee} onChange={(e) => { const fee = Number(e.target.value); set({ fee, pay_now: Math.max(0, fee + value.admission_fee - value.discount) }); }} /></Field>
            <Field label="Admission fee"><Input type="number" value={value.admission_fee} onChange={(e) => { const a = Number(e.target.value); set({ admission_fee: a, pay_now: Math.max(0, value.fee + a - value.discount) }); }} /></Field>
            <Field label="Discount"><Input type="number" value={value.discount} onChange={(e) => { const d = Number(e.target.value); set({ discount: d, pay_now: Math.max(0, value.fee + value.admission_fee - d) }); }} /></Field>
            <Field label="Total"><div className="flex h-10 items-center rounded-xl bg-muted px-3 text-lg font-extrabold">{inr(total(value))}</div></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pay now"><Input type="number" value={value.pay_now} onChange={(e) => set({ pay_now: Number(e.target.value) })} /></Field>
            <Field label="Mode">
              <Select value={value.mode} onChange={(e) => set({ mode: e.target.value })}>
                <option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank">Bank transfer</option>
              </Select>
            </Field>
          </div>
          {value.pay_now < total(value) && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">Due: <b>{inr(total(value) - value.pay_now)}</b> — will show in dues</p>
          )}
        </>
      )}
    </div>
  );
}
