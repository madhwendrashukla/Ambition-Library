"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { LibrarySettings, Plan, Seat, Shift } from "@/lib/types";

interface AdminData {
  settings: LibrarySettings | null;
  shifts: Shift[];
  seats: Seat[];
  plans: Plan[];
  role: string;
  ready: boolean;
  reload: () => Promise<void>;
}

const Ctx = createContext<AdminData | null>(null);

export function AdminProvider({ role, children }: { role: string; children: React.ReactNode }) {
  const sb = supabaseBrowser();
  const [state, setState] = useState<Omit<AdminData, "reload" | "role">>({ settings: null, shifts: [], seats: [], plans: [], ready: false });

  const reload = useCallback(async () => {
    const [s, sh, se, pl] = await Promise.all([
      sb.from("library_settings").select("*").eq("id", 1).maybeSingle(),
      sb.from("shifts").select("*").order("sort"),
      sb.from("seats").select("*").order("row_no").order("col_no"),
      sb.from("plans").select("*").order("duration_days").order("price"),
    ]);
    setState({ settings: s.data, shifts: sh.data ?? [], seats: se.data ?? [], plans: pl.data ?? [], ready: true });
    if (s.data?.primary_color) document.documentElement.style.setProperty("--brand", s.data.primary_color);
  }, [sb]);

  useEffect(() => { reload(); }, [reload]);

  return <Ctx.Provider value={{ ...state, role, reload }}>{children}</Ctx.Provider>;
}

export function useAdmin() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAdmin outside AdminProvider");
  return v;
}
