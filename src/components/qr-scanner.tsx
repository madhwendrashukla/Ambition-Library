"use client";
import { useEffect, useRef, useState } from "react";
import { CameraOff } from "lucide-react";

/** Camera QR scanner (html5-qrcode). Calls onResult once per distinct scan; parent controls `paused`. */
export function QrScanner({ onResult, paused }: { onResult: (text: string) => void; paused?: boolean }) {
  const ref = useRef<import("html5-qrcode").Html5Qrcode | null>(null);
  const pausedRef = useRef(paused);
  const cbRef = useRef(onResult);
  const [err, setErr] = useState<string | null>(null);
  pausedRef.current = paused;
  cbRef.current = onResult;

  useEffect(() => {
    let stopped = false;
    const boot = (async () => {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (stopped) return;
      const scanner = new Html5Qrcode("qr-reader", { verbose: false });
      ref.current = scanner;
      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: (w, h) => { const s = Math.floor(Math.min(w, h) * 0.72); return { width: s, height: s }; }, aspectRatio: 1 },
          (text) => { if (!pausedRef.current) cbRef.current(text); },
          () => {}
        );
      } catch (e) {
        if (!stopped) setErr(e instanceof Error ? e.message : "Couldn't open the camera");
      }
    })();
    return () => {
      stopped = true;
      // wait for start() to settle, then stop only if the camera is really running
      boot.finally(() => {
        const s = ref.current;
        if (!s) return;
        try {
          if (s.isScanning) s.stop().then(() => s.clear()).catch(() => {});
          else s.clear();
        } catch { /* already stopped */ }
      });
    };
  }, []);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-3xl bg-slate-900">
      <div id="qr-reader" className="size-full [&_video]:!h-full [&_video]:!w-full" />
      {!err && (
        <div className="pointer-events-none absolute inset-[14%] rounded-3xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(15,23,42,0.35)]">
          <div className="absolute inset-x-4 top-1/2 h-0.5 animate-pulse bg-green-400 shadow-[0_0_12px_#4ade80]" />
        </div>
      )}
      {err && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-white">
          <CameraOff className="size-8" />
          <p className="text-sm font-semibold">Camera permission required</p>
          <p className="text-xs text-white/70">Allow the camera in your browser settings, then reload the page.</p>
        </div>
      )}
    </div>
  );
}
