import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fmtDate, inr } from "@/lib/utils";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fee Receipt" };

type Row = {
  receipt_no: string; amount: number; mode: string; paid_at: string; note: string | null;
  students: { full_name: string; code: string; phone: string } | null;
  memberships: { start_date: string; end_date: string; fee: number; admission_fee: number; discount: number; total: number;
    shifts: { name: string } | null; seats: { label: string } | null; plans: { name: string } | null } | null;
};

export default async function Receipt({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(token)) notFound();
  const db = supabaseAdmin();
  const [{ data: p }, { data: lib }] = await Promise.all([
    db.from("payments").select("receipt_no, amount, mode, paid_at, note, students(full_name, code, phone), memberships(start_date, end_date, fee, admission_fee, discount, total, shifts(name), seats(label), plans(name))")
      .eq("public_token", token).maybeSingle<Row>(),
    db.from("library_settings").select("name, tagline, address, phone, email, logo_url, primary_color, upi_id").eq("id", 1).single(),
  ]);
  if (!p || !lib) notFound();
  const m = p.memberships;
  const brand = lib.primary_color || "#2563EB";

  return (
    <main className="min-h-dvh bg-slate-50 px-4 py-8 print:bg-white print:p-0">
      <div className="mx-auto max-w-lg overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200 print:shadow-none print:ring-0">
        <div className="px-7 py-6 text-white" style={{ background: brand }}>
          <div className="flex items-center gap-3">
            {lib.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={lib.logo_url} alt="" className="size-12 rounded-xl bg-white object-cover" />
            )}
            <div>
              <h1 className="text-xl font-bold">{lib.name}</h1>
              {lib.tagline && <p className="text-sm opacity-80">{lib.tagline}</p>}
            </div>
          </div>
        </div>
        <div className="space-y-6 px-7 py-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Fee Receipt</p>
              <p className="font-mono text-lg font-bold">{p.receipt_no}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Date</p>
              <p className="font-semibold">{fmtDate(p.paid_at)}</p>
            </div>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-lg font-bold">{p.students?.full_name}</p>
            <p className="text-sm text-slate-500">ID {p.students?.code} · {p.students?.phone}</p>
          </div>
          {m && (
            <dl className="grid grid-cols-2 gap-y-3 text-sm">
              <dt className="text-slate-500">Plan</dt><dd className="text-right font-semibold">{m.plans?.name ?? "Custom"}</dd>
              <dt className="text-slate-500">Shift</dt><dd className="text-right font-semibold">{m.shifts?.name}</dd>
              <dt className="text-slate-500">Seat</dt><dd className="text-right font-semibold">{m.seats?.label ?? "—"}</dd>
              <dt className="text-slate-500">Validity</dt><dd className="text-right font-semibold">{fmtDate(m.start_date)} – {fmtDate(m.end_date)}</dd>
            </dl>
          )}
          <div className="border-t border-dashed border-slate-200 pt-4 text-sm">
            {m && (
              <div className="space-y-1.5 text-slate-600">
                <Line k="Library fee" v={inr(m.fee)} />
                {Number(m.admission_fee) > 0 && <Line k="Admission fee" v={inr(m.admission_fee)} />}
                {Number(m.discount) > 0 && <Line k="Discount" v={"− " + inr(m.discount)} />}
                <Line k="Total" v={inr(m.total)} />
              </div>
            )}
            <div className="mt-4 flex items-center justify-between rounded-2xl px-4 py-3" style={{ background: brand + "14" }}>
              <span className="font-semibold">Paid ({p.mode.toUpperCase()})</span>
              <span className="text-2xl font-black" style={{ color: brand }}>{inr(p.amount)}</span>
            </div>
            {p.note && <p className="mt-3 text-slate-500">Note: {p.note}</p>}
          </div>
          <div className="text-center text-xs text-slate-400">
            {lib.address && <p>{lib.address}</p>}
            <p>{[lib.phone, lib.email].filter(Boolean).join(" · ")}</p>
            <p className="mt-3">Computer generated receipt · Powered by ms.dev</p>
          </div>
        </div>
      </div>
      <div className="mt-6 text-center print:hidden"><PrintButton /></div>
    </main>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><span>{k}</span><span className="font-medium text-slate-800">{v}</span></div>;
}
