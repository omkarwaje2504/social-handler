import { r2Get, r2Key } from "@/lib/r2";

// Public (no login): Instagram downloads the media from here when it publishes a post.
// Names are random UUIDs, so files can't be guessed or listed.
const NAME = /^[0-9a-f-]{36}\.(jpg|mp4|mov)$/;
const TYPE = { jpg: "image/jpeg", mp4: "video/mp4", mov: "video/quicktime" } as const;

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const m = NAME.exec(name);
  if (!m) return new Response("Not found", { status: 404 });
  const res = await r2Get(r2Key(`uploads/${name}`)).catch(() => null);
  if (!res?.ok || !res.body) return new Response("Not found", { status: 404 });
  return new Response(res.body, {
    headers: {
      "content-type": TYPE[m[1] as keyof typeof TYPE],
      ...(res.headers.get("content-length") ? { "content-length": res.headers.get("content-length")! } : {}),
      "cache-control": "public, max-age=86400",
      "x-robots-tag": "noindex",
    },
  });
}
