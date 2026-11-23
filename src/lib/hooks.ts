"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const reload = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setData(await fnRef.current());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, reload, setData };
}

/** throws on supabase error, returns data */
export async function q<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
}

const urlCache = new Map<string, { url: string; exp: number }>();
export async function signedUrl(path?: string | null) {
  if (!path) return null;
  const hit = urlCache.get(path);
  if (hit && hit.exp > Date.now()) return hit.url;
  const { data } = await supabaseBrowser().storage.from("student-files").createSignedUrl(path, 3600);
  if (data?.signedUrl) urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 3500_000 });
  return data?.signedUrl ?? null;
}

export function useSignedUrl(path?: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    signedUrl(path).then((u) => alive && setUrl(u));
    return () => { alive = false; };
  }, [path]);
  return url;
}

/** shrink a camera/photo file to max 800px JPEG (keeps storage tiny) */
export async function compressImage(file: Blob, max = 800, quality = 0.72): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return await new Promise((res) => canvas.toBlob((b) => res(b!), "image/jpeg", quality));
}
