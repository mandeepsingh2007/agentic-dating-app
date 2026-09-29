import { db } from "./supabase";

const BUCKET = "ig-images";

export async function download(url: string): Promise<{ buf: Buffer; type: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/jpeg";
    if (!type.startsWith("image/")) return null;
    return { buf: Buffer.from(await res.arrayBuffer()), type };
  } catch {
    return null;
  }
}

/** Copies an image into Supabase Storage (IG CDN links expire) and returns its public URL. */
export async function rehost(url: string | undefined, path: string): Promise<{ publicUrl: string; dataUrl: string } | null> {
  if (!url) return null;
  const img = await download(url);
  if (!img) return null;
  const { error } = await db().storage.from(BUCKET).upload(path, img.buf, { contentType: img.type, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  const publicUrl = db().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  return { publicUrl, dataUrl: `data:${img.type};base64,${img.buf.toString("base64")}` };
}
