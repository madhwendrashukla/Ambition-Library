"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Student, StudentStatus } from "@/lib/types";

export interface PublicLib { name: string; tagline: string | null; logo_url: string | null; primary_color: string; upi_id: string | null; phone: string | null; address: string | null }
interface Ctx { student: Student | null; status: StudentStatus | null; lib: PublicLib | null; loading: boolean; reload: () => Promise<void> }
const C = createContext<Ctx>({ student: null, status: null, lib: null, loading: true, reload: async () => {} });

export function StudentProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [state, setState] = useState<Omit<Ctx, "reload">>({ student: null, status: null, lib: null, loading: true });
  const reload = useCallback(async () => {
    const sb = supabaseBrowser();
    const [{ data: student }, { data: lib }] = await Promise.all([
      sb.from("students").select("*").eq("user_id", userId).maybeSingle(),
      sb.from("library_public").select("name, tagline, logo_url, primary_color, upi_id, phone, address").maybeSingle(),
    ]);
    const { data: status } = student
      ? await sb.from("v_student_status").select("*").eq("student_id", student.id).maybeSingle()
      : { data: null };
    if ((lib as PublicLib | null)?.primary_color) document.documentElement.style.setProperty("--brand", (lib as PublicLib).primary_color);
    setState({ student: (student as Student) ?? null, status: (status as StudentStatus) ?? null, lib: (lib as PublicLib) ?? null, loading: false });
  }, [userId]);
  useEffect(() => { reload(); }, [reload]);
  return <C.Provider value={{ ...state, reload }}>{children}</C.Provider>;
}
export const useStudent = () => useContext(C);
