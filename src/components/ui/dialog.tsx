"use client";
import * as React from "react";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({ className, children, title, description, ...props }: React.ComponentProps<typeof D.Content> & { title: string; description?: string }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-[2px] data-[state=open]:animate-in" />
      <D.Content
        className={cn("fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-3xl border border-border bg-white p-6 shadow-2xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl", className)}
        {...props}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <D.Title className="text-lg font-bold tracking-tight">{title}</D.Title>
            {description ? <D.Description className="mt-1 text-sm text-muted-foreground">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          </div>
          <D.Close className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><X className="size-5" /></D.Close>
        </div>
        {children}
      </D.Content>
    </D.Portal>
  );
}
