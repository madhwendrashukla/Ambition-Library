import * as React from "react";
import { cn, initials } from "@/lib/utils";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-slate-100", className)} />;
}

export function Empty({ icon, title, hint, action }: { icon?: React.ReactNode; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-12 text-center">
      {icon && <div className="mb-3 text-muted-foreground [&_svg]:size-8">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Avatar({ name, src, size = 40, className }: { name?: string | null; src?: string | null; size?: number; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={name ?? ""} width={size} height={size} className={cn("rounded-full object-cover ring-2 ring-white", className)} style={{ width: size, height: size }} />
  ) : (
    <div className={cn("flex items-center justify-center rounded-full bg-brand-soft font-bold text-primary ring-2 ring-white", className)} style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials(name)}
    </div>
  );
}

export function StatCard({ label, value, hint, icon, tone = "default", live }: {
  label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ReactNode;
  tone?: "default" | "success" | "warning" | "danger"; live?: boolean;
}) {
  const tones = {
    default: "bg-brand-soft text-primary",
    success: "bg-green-50 text-green-600",
    warning: "bg-amber-50 text-amber-600",
    danger: "bg-red-50 text-red-600",
  };
  return (
    <div className="rounded-2xl border border-border bg-white p-4 shadow-[0_8px_24px_-14px_rgba(37,99,235,0.15)]">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        {icon && <div className={cn("rounded-xl p-2 [&_svg]:size-4", tones[tone])}>{icon}</div>}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-2xl font-extrabold tracking-tight sm:text-3xl">{value}</p>
        {live && <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-green-400 opacity-75" /><span className="relative inline-flex size-2 rounded-full bg-green-500" /></span>}
      </div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block size-5 animate-spin rounded-full border-2 border-primary border-t-transparent", className)} />;
}
