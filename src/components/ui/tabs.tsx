"use client";
import * as React from "react";
import * as T from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = T.Root;
export function TabsList({ className, ...props }: React.ComponentProps<typeof T.List>) {
  return <T.List className={cn("inline-flex rounded-xl bg-muted p-1 gap-1 overflow-x-auto max-w-full", className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof T.Trigger>) {
  return <T.Trigger className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold text-muted-foreground whitespace-nowrap data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-sm", className)} {...props} />;
}
export const TabsContent = T.Content;
