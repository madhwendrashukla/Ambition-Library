import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn("flex h-10 w-full rounded-xl border border-input bg-white px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary disabled:opacity-50", className)} {...props} />
  )
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn("flex min-h-20 w-full rounded-xl border border-input bg-white px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary", className)} {...props} />
  )
);
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn("flex h-10 w-full appearance-none rounded-xl border border-input bg-white bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2364748b%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:14px] bg-[right_12px_center] bg-no-repeat px-3 pr-9 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30", className)} {...props}>
      {children}
    </select>
  )
);
Select.displayName = "Select";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground", className)} {...props} />;
}

export function Field({ label, children, hint, className }: { label: string; children: React.ReactNode; hint?: string; className?: string }) {
  return (
    // wrapping <label> links the text to the input (screen readers, tap-to-focus, getByLabel)
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}
