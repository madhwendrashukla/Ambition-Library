"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { LogOut, Phone, KeyRound, Smartphone, MapPin } from "lucide-react";
import { toast } from "sonner";
import { supabaseBrowser } from "@/lib/supabase/client";
import { fmtDate, pinPassword } from "@/lib/utils";
import { useStudent } from "@/components/student/context";
import { StudentAvatar } from "@/components/admin/student-avatar";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/misc";

export default function ProfilePage() {
  const { student, lib } = useStudent();
  const router = useRouter();
  const [qr, setQr] = useState("");
  useEffect(() => { if (student) QRCode.toDataURL(`AL-STU:${student.qr_token}`, { width: 480, margin: 1 }).then(setQr); }, [student]);
  if (!student) return <Skeleton className="h-96" />;

  async function logout() {
    await supabaseBrowser().auth.signOut();
    router.replace("/login"); router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center text-center">
        <StudentAvatar name={student.full_name} path={student.photo_path} size={88} />
        <h1 className="mt-3 text-xl font-bold">{student.full_name}</h1>
        <p className="text-sm text-muted-foreground">ID {student.code} · Member since {fmtDate(student.admission_date)}</p>
      </div>

      <div className="rounded-3xl border border-border p-5 text-center">
        <p className="font-semibold">My QR</p>
        <p className="mb-3 text-xs text-muted-foreground">If your phone’s internet/location isn’t working, show this at the desk</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {qr && <img src={qr} alt="Personal QR" className="mx-auto size-52" />}
      </div>

      <ul className="divide-y divide-border rounded-3xl border border-border text-sm">
        <Row icon={<Phone />} k="Phone" v={student.phone} />
        {student.exam_target && <Row icon={<KeyRound />} k="Target" v={student.exam_target} />}
        <Row icon={<Smartphone />} k="Device" v={student.device_id ? "This phone is linked" : "Will link on first scan"} />
        {lib?.phone && <Row icon={<MapPin />} k="Library" v={lib.phone} />}
      </ul>

      <ChangePin />
      <Button variant="outline" className="h-12 w-full text-red-600" onClick={logout}><LogOut />Logout</Button>
      <p className="pt-2 text-center text-[11px] text-muted-foreground">Powered by ms.dev</p>
    </div>
  );
}

function Row({ icon, k, v }: { icon: React.ReactNode; k: string; v: string }) {
  return <li className="flex items-center gap-3 px-4 py-3 [&_svg]:size-4 [&_svg]:text-muted-foreground">{icon}<span className="text-muted-foreground">{k}</span><span className="ml-auto font-semibold">{v}</span></li>;
}

function ChangePin() {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!/^\d{4,6}$/.test(pin)) return toast.error("PIN must be 4–6 digits");
    setBusy(true);
    const { error } = await supabaseBrowser().auth.updateUser({ password: pinPassword(pin) });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("PIN changed"); setOpen(false); setPin("");
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="secondary" className="h-12 w-full"><KeyRound />Change PIN</Button></DialogTrigger>
      <DialogContent title="New PIN" description="Use this PIN to log in next time">
        <Field label="4–6 digit PIN"><Input inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} /></Field>
        <Button className="mt-4 w-full" loading={busy} onClick={save}>Save</Button>
      </DialogContent>
    </Dialog>
  );
}
