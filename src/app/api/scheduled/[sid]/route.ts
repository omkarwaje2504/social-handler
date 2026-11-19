import { NextResponse } from "next/server";
import { isId, sql } from "@/lib/db";

// Cancel a scheduled post that hasn't been published yet.
export async function DELETE(_req: Request, { params }: { params: Promise<{ sid: string }> }) {
  const { sid } = await params;
  const res = isId(sid)
    ? await sql`update scheduled_posts set status = 'cancelled' where id = ${sid} and status = 'pending'`
    : { count: 0 };
  if (!res.count) return NextResponse.json({ error: "Only pending posts can be cancelled" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
