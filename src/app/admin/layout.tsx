import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { AdminShell } from "@/components/admin/shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");
  const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).maybeSingle();
  if (!profile) redirect("/login?e=no_profile");
  if (profile.role === "student") redirect("/app");
  return <AdminShell role={profile.role} userName={profile.full_name ?? user.email ?? "Owner"}>{children}</AdminShell>;
}
