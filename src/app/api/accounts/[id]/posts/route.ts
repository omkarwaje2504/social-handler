import { NextResponse } from "next/server";
import { isId, sql } from "@/lib/db";
import { publishMedia, GraphError } from "@/lib/graph";
import type { AccountDoc, PostDoc } from "@/lib/models";
import { syncAccount } from "@/lib/sync";

type Ctx = { params: Promise<{ id: string }> };

// List posts stored for this account (synced from Instagram).
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isId(id)) return NextResponse.json([]);
  const posts = await sql<PostDoc[]>`
    select * from posts where account_id = ${id} and not removed_from_app
    order by "timestamp" desc nulls last`;
  return NextResponse.json(posts);
}

// Publish a new post. Instagram needs a public URL to the image/video.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const { mediaUrl, mediaType, caption } = (await req.json()) as {
    mediaUrl: string;
    mediaType: "IMAGE" | "REELS";
    caption?: string;
  };
  if (!mediaUrl || !["IMAGE", "REELS"].includes(mediaType)) {
    return NextResponse.json({ error: "mediaUrl and mediaType (IMAGE|REELS) are required" }, { status: 400 });
  }

  const [account] = isId(id) ? await sql<AccountDoc[]>`select * from accounts where id = ${id}` : [];
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  try {
    const igMediaId = await publishMedia({
      igUserId: account.igUserId,
      token: account.accessToken,
      mediaUrl,
      mediaType,
      caption,
    });
    await syncAccount(account.id);
    return NextResponse.json({ ok: true, igMediaId }, { status: 201 });
  } catch (e) {
    const status = e instanceof GraphError ? 400 : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
