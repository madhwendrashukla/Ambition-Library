"use client";
import { useState } from "react";
import { toast } from "sonner";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { inr } from "@/lib/utils";

export function PaymentDialog({ open, onOpenChange, studentId, membershipId, due, onDone }: {
  open: boolean; onOpenChange: (o: boolean) => void; studentId: string; membershipId?: string | null; due?: number; onDone?: (receiptToken: string) => void;
}) {
  const [amount, setAmount] = useState<number>(due && due > 0 ? due : 0);
  const [mode, setMode] = useState("cash");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!amount || amount <= 0) return toast.error("Enter an amount");
    setBusy(true);
    const { data, error } = await supabaseBrowser().from("payments")
      .insert({ student_id: studentId, membership_id: membershipId ?? null, amount, mode, note: note || null })
      .select("public_token, receipt_no").single();
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Payment saved · Receipt ${data.receipt_no}`);
    onOpenChange(false);
    onDone?.(data.public_token);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Collect payment" description={due && due > 0 ? `Due: ${inr(due)}` : undefined}>
        <div className="space-y-4">
          <Field label="Amount (₹)"><Input type="number" autoFocus value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} /></Field>
          <Field label="Mode">
            <Select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank">Bank transfer</option>
            </Select>
          </Field>
          <Field label="Note (optional)"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. December fees" /></Field>
          <Button className="w-full" size="lg" loading={busy} onClick={save}>Save & create receipt</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
