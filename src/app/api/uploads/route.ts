import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { r2Key, r2Put } from "@/lib/r2";

// Instagram's publishing API takes JPEG photos and MP4/MOV videos only (no PNG).
// Uploads pass through this serverless function, whose request body Vercel caps at about 4.5 MB,
// so larger files (most reels) go through "Paste public link" instead.
const MAX_BYTES = 4 * 1024 * 1024;
const TYPES = {
  "image/jpeg": { ext: "jpg", video: false },
  "video/mp4": { ext: "mp4", video: true },
  "video/quicktime": { ext: "mov", video: true },
} as const;

// Stores an uploaded photo/reel in R2 and returns a public URL (served by /uploads/[name]),
// which Instagram downloads when it publishes.
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in again" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  const rule = TYPES[file.type as keyof typeof TYPES];
  if (!rule) {
    const png = file.type === "image/png";
    return NextResponse.json({
      error: png
        ? "Instagram only accepts JPG photos. Save the image as JPG and try again."
        : "Use a JPG photo, or an MP4/MOV reel.",
    }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({
      error: "Files up to 4 MB can be uploaded here. For bigger files, put them online and use \"Paste public link\".",
    }, { status: 400 });
  }

  const name = `${randomUUID()}.${rule.ext}`;
  try {
    await r2Put(r2Key(`uploads/${name}`), new Uint8Array(await file.arrayBuffer()), file.type);
  } catch (e) {
    console.error("upload to R2 failed", e);
    return NextResponse.json({ error: "Could not store the file. Try again in a moment." }, { status: 502 });
  }
  return NextResponse.json({ url: `${process.env.APP_URL}/uploads/${name}`, isVideo: rule.video }, { status: 201 });
}
