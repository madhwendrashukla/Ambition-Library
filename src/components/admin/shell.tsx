"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard, Users, Armchair, ScanLine, BellRing, IndianRupee, PhoneCall, Megaphone, Wallet, Settings, LogOut, Menu, X, BookOpen, UserPlus,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { AdminProvider, useAdmin } from "./context";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/students", label: "Students", icon: Users },
  { href: "/admin/seats", label: "Seat Map", icon: Armchair },
  { href: "/admin/attendance", label: "Attendance", icon: ScanLine },
  { href: "/admin/dues", label: "Dues & Renewals", icon: BellRing },
  { href: "/admin/payments", label: "Payments", icon: IndianRupee },
  { href: "/admin/enquiries", label: "Enquiries", icon: PhoneCall },
  { href: "/admin/notices", label: "Notices", icon: Megaphone },
  { href: "/admin/expenses", label: "Expenses", icon: Wallet },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

const MOBILE = [
  { href: "/admin", label: "Home", icon: LayoutDashboard },
  { href: "/admin/students", label: "Students", icon: Users },
  { href: "/admin/students/new", label: "Admission", icon: UserPlus },
  { href: "/admin/dues", label: "Dues", icon: BellRing },
  { href: "/admin/seats", label: "Seats", icon: Armchair },
];

function isActive(path: string, href: string) {
  return href === "/admin" ? path === "/admin" : path === href || path.startsWith(href + "/");
}

function Brand() {
  const { settings } = useAdmin();
  return (
    <Link href="/admin" className="flex items-center gap-3">
      <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-white shadow-md shadow-primary/30">
        {settings?.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={settings.logo_url} alt="" className="size-10 rounded-xl object-cover" />
        ) : (
          <BookOpen className="size-5" />
        )}
      </div>
      <div className="leading-tight">
        <p className="font-extrabold tracking-tight">{settings?.name ?? "Ambition Library"}</p>
        <p className="text-xs text-muted-foreground">Admin panel</p>
      </div>
    </Link>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav className="space-y-1">
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} onClick={onNavigate}
          className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
            isActive(path, href) ? "bg-brand-soft text-primary" : "text-slate-600 hover:bg-muted hover:text-foreground")}>
          <Icon className="size-[18px]" />{label}
        </Link>
      ))}
    </nav>
  );
}

export function AdminShell({ children, role, userName }: { children: React.ReactNode; role: string; userName: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const path = usePathname();

  async function logout() {
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <AdminProvider role={role}>
      <div className="min-h-dvh bg-[#fafbff]">
        {/* desktop sidebar */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-white p-4 lg:flex">
          <div className="px-2 py-2"><Brand /></div>
          <div className="mt-6 flex-1 overflow-y-auto"><NavList /></div>
          <div className="border-t border-border pt-4">
            <p className="px-3 text-sm font-semibold">{userName}</p>
            <p className="px-3 text-xs capitalize text-muted-foreground">{role}</p>
            <button onClick={logout} className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-muted">
              <LogOut className="size-[18px]" />Logout
            </button>
          </div>
        </aside>

        {/* mobile top bar */}
        <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-border bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <Brand />
          <button onClick={() => setOpen(true)} className="rounded-xl p-2 hover:bg-muted" aria-label="Menu"><Menu className="size-6" /></button>
        </header>

        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-slate-900/30" onClick={() => setOpen(false)} />
            <div className="absolute inset-y-0 right-0 flex w-72 flex-col bg-white p-4 shadow-2xl">
              <div className="mb-4 flex justify-end"><button onClick={() => setOpen(false)} className="rounded-xl p-2 hover:bg-muted"><X className="size-5" /></button></div>
              <div className="flex-1 overflow-y-auto"><NavList onNavigate={() => setOpen(false)} /></div>
              <button onClick={logout} className="mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-muted">
                <LogOut className="size-[18px]" />Logout
              </button>
            </div>
          </div>
        )}

        <main className="px-4 pb-28 pt-6 sm:px-6 lg:ml-64 lg:px-8 lg:pb-10 lg:pt-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>

        {/* mobile bottom nav */}
        <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          {MOBILE.map(({ href, label, icon: Icon }) => {
            const active = href === "/admin/students" ? path === href || (path.startsWith("/admin/students/") && !path.endsWith("/new")) : isActive(path, href);
            return (
              <Link key={href} href={href} className={cn("flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold", active ? "text-primary" : "text-slate-500")}>
                <Icon className="size-5" />{label}
              </Link>
            );
          })}
        </nav>
      </div>
    </AdminProvider>
  );
}
