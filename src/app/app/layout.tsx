import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { StudentProvider } from "@/components/student/context";
import { StudentShell } from "@/components/student/shell";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile) redirect("/login?e=no_profile");
  if (profile.role !== "student") redirect("/admin");
  return (
    <StudentProvider userId={user.id}>
      <StudentShell>{children}</StudentShell>
    </StudentProvider>
  );
}
