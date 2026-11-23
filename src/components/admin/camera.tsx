"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, RefreshCw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Live camera capture with a file-upload fallback. Returns a JPEG blob. */
export function CameraCapture({ value, onChange, facing = "user", label = "Photo" }: {
  value: Blob | null; onChange: (b: Blob | null) => void; facing?: "user" | "environment"; label?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [on, setOn] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!value) { setPreview(null); return; }
    const u = URL.createObjectURL(value);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [value]);

  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  async function start() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: 1280 } });
      streamRef.current = s;
      setOn(true);
      requestAnimationFrame(() => { if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play(); } });
    } catch {
      document.getElementById(`file-${label}`)?.click();
    }
  }

  function snap() {
    const v = videoRef.current;
    if (!v) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    c.toBlob((b) => b && onChange(b), "image/jpeg", 0.85);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setOn(false);
  }

  return (
    <div className="rounded-2xl border border-dashed border-border p-3">
      <div className="relative mx-auto aspect-[4/3] w-full max-w-xs overflow-hidden rounded-xl bg-muted">
        {on ? (
          <video ref={videoRef} playsInline muted className="size-full object-cover" style={{ transform: facing === "user" ? "scaleX(-1)" : undefined }} />
        ) : preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={label} className="size-full object-cover" />
        ) : (
          <div className="flex size-full flex-col items-center justify-center text-muted-foreground"><Camera className="mb-2 size-8" /><span className="text-xs">{label}</span></div>
        )}
      </div>
      <div className="mt-3 flex justify-center gap-2">
        {on ? <Button type="button" onClick={snap}><Camera />Click photo</Button> : (
          <Button type="button" variant="secondary" onClick={start}>{value ? <RefreshCw /> : <Camera />}{value ? "Retake" : "Camera"}</Button>
        )}
        <Button type="button" variant="outline" onClick={() => document.getElementById(`file-${label}`)?.click()}><Upload />Upload</Button>
        <input id={`file-${label}`} type="file" accept="image/*" capture={facing} className="hidden" onChange={(e) => e.target.files?.[0] && onChange(e.target.files[0])} />
      </div>
    </div>
  );
}
