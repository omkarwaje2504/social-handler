import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { sql } from "@/lib/db";
import type { ScheduledPostDoc } from "@/lib/models";
import { ensureHash, toPublic } from "@/lib/hash";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { deny, id: id } = await guard("account", (await params).id);
  if (deny) return deny;
  const rows = await sql<ScheduledPostDoc[]>`
    select * from scheduled_posts where account_id = ${id} order by publish_at`;
  return NextResponse.json(toPublic(rows));
}

// Schedule a post: { mediaUrl, mediaType, caption, publishAt (ISO) }
export async function POST(req: Request, { params }: Ctx) {
  const { deny, id: id } = await guard("account", (await params).id);
  if (deny) return deny;
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
  await ensureHash("scheduled_posts", row);
  return NextResponse.json(toPublic(row), { status: 201 });
}
