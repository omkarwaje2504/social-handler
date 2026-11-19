import { NextResponse } from "next/server";
import { isId, sql } from "@/lib/db";
import type { ScheduledPostDoc } from "@/lib/models";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isId(id)) return NextResponse.json([]);
  const rows = await sql<ScheduledPostDoc[]>`
    select * from scheduled_posts where account_id = ${id} order by publish_at`;
  return NextResponse.json(rows);
}

// Schedule a post: { mediaUrl, mediaType, caption, publishAt (ISO) }
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isId(id)) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  const b = (await req.json()) as { mediaUrl?: string; mediaType?: string; caption?: string; publishAt?: string };
  const publishAt = b.publishAt ? new Date(b.publishAt) : null;
  if (!b.mediaUrl || !["IMAGE", "REELS"].includes(b.mediaType ?? "") || !publishAt || isNaN(+publishAt)) {
    return NextResponse.json({ error: "mediaUrl, mediaType and a valid publish time are required" }, { status: 400 });
  }
  if (publishAt.getTime() < Date.now() - 60_000) {
    return NextResponse.json({ error: "Publish time is in the past" }, { status: 400 });
  }
  const doc = {
    accountId: id,
    mediaUrl: b.mediaUrl,
    mediaType: b.mediaType as "IMAGE" | "REELS",
    caption: b.caption ?? "",
    publishAt,
    status: "pending" as const,
  };
  const [row] = await sql<ScheduledPostDoc[]>`insert into scheduled_posts ${sql(doc)} returning *`;
  return NextResponse.json(row, { status: 201 });
}
