"use server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizePhone, pinPassword, studentEmail } from "@/lib/utils";

type Result<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

async function requireStaff(adminOnly = false) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("Login required");
  const { data: p } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const ok = adminOnly ? p?.role === "admin" : p?.role === "admin" || p?.role === "staff";
  if (!ok) throw new Error("Permission denied");
  return user;
}

export interface NewStudentInput {
  full_name: string; phone: string; pin: string; email?: string; gender?: string; dob?: string;
  address?: string; guardian_name?: string; guardian_phone?: string; exam_target?: string;
  id_type?: string; id_last4?: string; admission_date?: string; notes?: string;
}

/** Creates the login (phone + PIN) and the student row. Photo/plan/payment are added by the client after. */
export async function createStudent(input: NewStudentInput): Promise<Result<{ id: string; code: string }>> {
  try {
    await requireStaff();
    const phone = normalizePhone(input.phone);
    if (phone.length !== 10) return { ok: false, error: "Mobile number must be 10 digits" };
    if (!/^\d{4,6}$/.test(input.pin)) return { ok: false, error: "PIN must be 4–6 digits" };
    const admin = supabaseAdmin();

    const { data: existing } = await admin.from("students").select("id").eq("phone", phone).maybeSingle();
    if (existing) return { ok: false, error: "A student with this number already exists" };

    const { data: created, error: authErr } = await admin.auth.admin.createUser({
      email: studentEmail(phone), password: pinPassword(input.pin), email_confirm: true,
      user_metadata: { full_name: input.full_name, phone },
    });
    if (authErr || !created.user) return { ok: false, error: authErr?.message ?? "Could not create login" };

    const uid = created.user.id;
    await admin.from("profiles").insert({ id: uid, role: "student", full_name: input.full_name });
    const { data: st, error } = await admin.from("students").insert({
      user_id: uid, full_name: input.full_name.trim(), phone, email: input.email || null, gender: input.gender || null,
      dob: input.dob || null, address: input.address || null, guardian_name: input.guardian_name || null,
      guardian_phone: input.guardian_phone || null, exam_target: input.exam_target || null,
      id_type: input.id_type || null, id_last4: input.id_last4?.slice(-4) || null,
      admission_date: input.admission_date || undefined, notes: input.notes || null,
    }).select("id, code").single();
    if (error) {
      await admin.auth.admin.deleteUser(uid);
      return { ok: false, error: error.message };
    }
    return { ok: true, data: st };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" };
  }
}

export async function resetStudentPin(studentId: string, pin: string): Promise<Result> {
  try {
    await requireStaff();
    if (!/^\d{4,6}$/.test(pin)) return { ok: false, error: "PIN must be 4–6 digits" };
    const admin = supabaseAdmin();
    const { data: st } = await admin.from("students").select("user_id, phone, full_name").eq("id", studentId).single();
    if (!st) return { ok: false, error: "Student not found" };
    if (st.user_id) {
      const { error } = await admin.auth.admin.updateUserById(st.user_id, { password: pinPassword(pin), email: studentEmail(st.phone), email_confirm: true });
      if (error) return { ok: false, error: error.message };
    } else {
      const { data: created, error } = await admin.auth.admin.createUser({ email: studentEmail(st.phone), password: pinPassword(pin), email_confirm: true });
      if (error || !created.user) return { ok: false, error: error?.message ?? "Error" };
      await admin.from("profiles").insert({ id: created.user.id, role: "student", full_name: st.full_name });
      await admin.from("students").update({ user_id: created.user.id }).eq("id", studentId);
    }
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" };
  }
}

/** When the phone number changes, keep the login email in sync */
export async function syncStudentLogin(studentId: string): Promise<Result> {
  try {
    await requireStaff();
    const admin = supabaseAdmin();
    const { data: st } = await admin.from("students").select("user_id, phone").eq("id", studentId).single();
    if (st?.user_id) {
      const { error } = await admin.auth.admin.updateUserById(st.user_id, { email: studentEmail(st.phone), email_confirm: true });
      if (error) return { ok: false, error: error.message };
    }
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" };
  }
}

export async function createStaff(input: { email: string; password: string; full_name: string; role: "admin" | "staff" }): Promise<Result> {
  try {
    await requireStaff(true);
    if (input.password.length < 8) return { ok: false, error: "Password must be at least 8 characters" };
    const admin = supabaseAdmin();
    const { data, error } = await admin.auth.admin.createUser({ email: input.email, password: input.password, email_confirm: true });
    if (error || !data.user) return { ok: false, error: error?.message ?? "Error" };
    await admin.from("profiles").insert({ id: data.user.id, role: input.role, full_name: input.full_name });
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" };
  }
}

export async function removeStaff(userId: string): Promise<Result> {
  try {
    const me = await requireStaff(true);
    if (me.id === userId) return { ok: false, error: "You can't remove yourself" };
    const admin = supabaseAdmin();
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error" };
  }
}
