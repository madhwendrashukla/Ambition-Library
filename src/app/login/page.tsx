"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, Phone, KeyRound, Mail, Lock } from "lucide-react";
import { toast } from "sonner";
import { supabaseBrowser } from "@/lib/supabase/client";
import { normalizePhone, pinPassword, studentEmail } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const sb = supabaseBrowser();
  const [lib, setLib] = useState<{ name: string; tagline: string | null; logo_url: string | null } | null>(null);
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (params.get("e") === "no_profile") {
      sb.auth.signOut();
      toast.error("This account's setup is incomplete — please contact the library owner");
    }
  }, [params, sb]);

  useEffect(() => {
    sb.from("library_public").select("name, tagline, logo_url").maybeSingle().then(({ data }: { data: typeof lib }) => setLib(data));
  }, [sb]);

  async function go(emailAddr: string, pass: string) {
    setBusy(true);
    const { data, error } = await sb.auth.signInWithPassword({ email: emailAddr, password: pass });
    if (error || !data.user) {
      setBusy(false);
      toast.error("Login failed — check your details");
      return;
    }
    const { data: profile } = await sb.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
    const next = params.get("next");
    const home = profile?.role === "student" ? "/app" : "/admin";
    router.replace(next && next.startsWith(home) ? next : home);
    router.refresh();
  }

  return (
    <div className="bg-grid flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/30">
            {lib?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={lib.logo_url} alt="" className="size-16 rounded-2xl object-cover" />
            ) : (
              <BookOpen className="size-8" />
            )}
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">{lib?.name ?? "Ambition Library"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{lib?.tagline ?? "Self Study Library"}</p>
        </div>

        <div className="rounded-3xl border border-border bg-white p-6 shadow-xl shadow-blue-900/5">
          <Tabs defaultValue="student">
            <TabsList className="mb-6 grid w-full grid-cols-2">
              <TabsTrigger value="student">Student</TabsTrigger>
              <TabsTrigger value="staff">Owner / Staff</TabsTrigger>
            </TabsList>

            <TabsContent value="student">
              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); go(studentEmail(phone), pinPassword(pin)); }}>
                <Field label="Mobile number">
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input className="pl-9" inputMode="numeric" autoComplete="tel" placeholder="10 digit number" value={phone} onChange={(e) => setPhone(normalizePhone(e.target.value).slice(0, 10))} required />
                  </div>
                </Field>
                <Field label="PIN" hint="Get your PIN from the library counter">
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input className="pl-9 tracking-[0.4em]" type="password" inputMode="numeric" maxLength={6} placeholder="••••••" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} required />
                  </div>
                </Field>
                <Button className="w-full" size="lg" loading={busy}>Login</Button>
              </form>
            </TabsContent>

            <TabsContent value="staff">
              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); go(email.trim(), password); }}>
                <Field label="Email">
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input className="pl-9" type="email" placeholder="owner@library.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </div>
                </Field>
                <Field label="Password">
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input className="pl-9" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                  </div>
                </Field>
                <Button className="w-full" size="lg" loading={busy}>Login</Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">Powered by ms.dev</p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginInner /></Suspense>;
}
