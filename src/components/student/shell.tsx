"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Home, History, Receipt, User, ScanLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStudent } from "./context";

const NAV = [
  { href: "/app", label: "Home", icon: Home },
  { href: "/app/history", label: "History", icon: History },
  { href: "/app/scan", label: "Scan", icon: ScanLine, primary: true },
  { href: "/app/payments", label: "Fees", icon: Receipt },
  { href: "/app/profile", label: "Profile", icon: User },
];

export function StudentShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { lib } = useStudent();
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return (
    <div className="mx-auto min-h-dvh max-w-md bg-white pb-28">
      <header className="sticky top-0 z-20 flex items-center gap-2.5 border-b border-border/60 bg-white/85 px-5 py-3 backdrop-blur">
        {lib?.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={lib.logo_url} alt="" className="size-8 rounded-lg object-cover" />
        ) : <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-black text-white">{(lib?.name ?? "A")[0]}</div>}
        <p className="font-bold tracking-tight">{lib?.name ?? "Library"}</p>
      </header>
      <main className="px-5 pt-5">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md border-t border-border/70 bg-white/95 px-3 pb-[max(env(safe-area-inset-bottom),10px)] pt-2 backdrop-blur">
        <ul className="grid grid-cols-5 items-end">
          {NAV.map(({ href, label, icon: Icon, primary }) => {
            const active = href === "/app" ? path === "/app" : path.startsWith(href);
            if (primary) return (
              <li key={href} className="flex justify-center">
                <Link href={href} className="-mt-7 flex size-16 flex-col items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/30 active:scale-95">
                  <Icon className="size-7" /><span className="text-[10px] font-bold">{label}</span>
                </Link>
              </li>
            );
            return (
              <li key={href}>
                <Link href={href} className={cn("flex flex-col items-center gap-1 py-1 text-[11px] font-semibold", active ? "text-primary" : "text-muted-foreground")}>
                  <Icon className="size-5" />{label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
