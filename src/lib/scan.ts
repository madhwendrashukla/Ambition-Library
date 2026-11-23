/** Turns whatever the camera read into a gate key.
 *  Accepts the printed gate URL (…/app/scan?k=KEY), a bare key, or flags a student's personal QR. */
export function extractGateKey(text: string): string | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  if (t.startsWith("AL-STU:")) return "__personal__";
  try {
    const u = new URL(t);
    const k = u.searchParams.get("k");
    return k && /^[A-Za-z0-9_-]{6,64}$/.test(k) ? k : null;
  } catch { /* not a URL */ }
  return /^[A-Za-z0-9_-]{6,64}$/.test(t) ? t : null;
}

/** Staff scanner: student's personal QR → token */
export function extractStudentToken(text: string): string | null {
  const t = (text ?? "").trim();
  const m = t.match(/^AL-STU:([A-Za-z0-9_-]{6,64})$/);
  return m ? m[1] : null;
}
