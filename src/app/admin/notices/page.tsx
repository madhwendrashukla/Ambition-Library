"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Megaphone, Pin, Trash2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useAsync, q } from "@/lib/hooks";
import { fmtDate } from "@/lib/utils";
import { PageHeader, Skeleton, Empty } from "@/components/ui/misc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";

interface Notice { id: string; title: string; body: string | null; pinned: boolean; created_at: string }

export default function NoticesPage() {
  const sb = supabaseBrowser();
  const { data, loading, reload } = useAsync(() => q<Notice[]>(sb.from("notices").select("*").order("pinned", { ascending: false }).order("created_at", { ascending: false })));
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function post() {
    if (!title.trim()) return toast.error("Enter a title");
    setBusy(true);
    const { error } = await sb.from("notices").insert({ title, body: body || null });
    setBusy(false);
    if (error) return toast.error(error.message);
    setTitle(""); setBody(""); toast.success("Notice is now showing in the student app"); reload(true);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Notices" subtitle="Holidays, rules, announcements — shown in the student app" />
      <Card className="mb-6"><CardContent className="space-y-3 pt-5">
        <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Library opens at 10 am tomorrow" /></Field>
        <Field label="Details"><Textarea value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        <Button loading={busy} onClick={post}><Megaphone />Post notice</Button>
      </CardContent></Card>
      {loading ? <Skeleton className="h-48" /> : !data?.length ? <Empty icon={<Megaphone />} title="No notices yet" /> : (
        <div className="space-y-3">
          {data.map((n) => (
            <Card key={n.id}><CardContent className="flex items-start gap-3 pt-5">
              <div className="flex-1">
                <p className="font-bold">{n.pinned && <Pin className="mr-1 inline size-4 text-primary" />}{n.title}</p>
                {n.body && <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{n.body}</p>}
                <p className="mt-2 text-xs text-muted-foreground">{fmtDate(n.created_at)}</p>
              </div>
              <Button size="icon" variant="ghost" onClick={async () => { await sb.from("notices").update({ pinned: !n.pinned }).eq("id", n.id); reload(true); }} aria-label="Pin"><Pin /></Button>
              <Button size="icon" variant="ghost" className="text-red-600" onClick={async () => { await sb.from("notices").delete().eq("id", n.id); reload(true); }} aria-label="Delete"><Trash2 /></Button>
            </CardContent></Card>
          ))}
        </div>
      )}
    </div>
  );
}
