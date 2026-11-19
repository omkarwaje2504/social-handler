import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

const LIMITS = {
  "image/jpeg": { ext: "jpg", max: 8 * 1024 * 1024 },
  "image/png": { ext: "png", max: 8 * 1024 * 1024 },
  "video/mp4": { ext: "mp4", max: 100 * 1024 * 1024 },
  "video/quicktime": { ext: "mov", max: 100 * 1024 * 1024 },
} as const;

// Saves an uploaded photo/reel under public/uploads and returns a public URL.
// Instagram downloads the file from this URL, so APP_URL must be publicly reachable (tunnel or hosting).
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  const rule = LIMITS[file.type as keyof typeof LIMITS];
  if (!rule) {
    return NextResponse.json({ error: "Use a JPG or PNG photo, or an MP4/MOV reel" }, { status: 400 });
  }
  if (file.size > rule.max) {
    return NextResponse.json({ error: "File is too large" }, { status: 400 });
  }

  const name = `${randomUUID()}.${rule.ext}`;
  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));

  return NextResponse.json({
    url: `${process.env.APP_URL}/uploads/${name}`,
    isVideo: file.type.startsWith("video/"),
  }, { status: 201 });
}
