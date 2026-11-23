import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", {
  variants: {
    variant: {
      default: "bg-brand-soft text-primary",
      success: "bg-green-50 text-green-700 ring-1 ring-green-200",
      warning: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
      danger: "bg-red-50 text-red-700 ring-1 ring-red-200",
      muted: "bg-slate-100 text-slate-600",
      outline: "ring-1 ring-border text-foreground",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export function PlanStateBadge({ state, days }: { state: string; days?: number | null }) {
  if (state === "active") return <Badge variant="success">Active{days != null ? ` · ${days}d` : ""}</Badge>;
  if (state === "expiring") return <Badge variant="warning">{days === 0 ? "Ends today" : `${days} days left`}</Badge>;
  if (state === "expired") return <Badge variant="danger">Expired{days != null ? ` · ${Math.abs(days)}d` : ""}</Badge>;
  if (state === "upcoming") return <Badge variant="default">Upcoming</Badge>;
  return <Badge variant="muted">No plan</Badge>;
}
