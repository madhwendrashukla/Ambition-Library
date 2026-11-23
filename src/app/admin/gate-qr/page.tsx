"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Printer } from "lucide-react";
import { useAdmin } from "@/components/admin/context";
import { Button } from "@/components/ui/button";

export default function GateQrPrint() {
  const { settings } = useAdmin();
  const [qr, setQr] = useState("");
  useEffect(() => {
    if (!settings) return;
    QRCode.toDataURL(`${window.location.origin}/app/scan?k=${settings.gate_key}`, { width: 900, margin: 1, color: { dark: "#0B1B3F" } }).then(setQr);
  }, [settings]);

  return (
    <div className="flex flex-col items-center">
      <Button className="no-print mb-6" onClick={() => window.print()}><Printer />Print</Button>
      <div className="w-full max-w-[560px] rounded-[2rem] border-4 border-primary bg-white p-10 text-center">
        <p className="text-sm font-bold uppercase tracking-[0.3em] text-primary">Entry · Exit</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight">{settings?.name}</h1>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {qr && <img src={qr} alt="Gate QR" className="mx-auto my-8 w-full max-w-[380px]" />}
        <ol className="mx-auto max-w-xs space-y-2 text-left text-lg font-semibold">
          <li>1. Open your library app</li>
          <li>2. Tap the <span className="text-primary">Scan</span> button</li>
          <li>3. IN when you arrive, OUT when you leave ✓</li>
        </ol>
        <p className="mt-8 text-xs text-slate-400">Powered by ms.dev</p>
      </div>
    </div>
  );
}
