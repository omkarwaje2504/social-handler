import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { sql } from "@/lib/db";

// Cancel a scheduled post that hasn't been published yet.
export async function DELETE(_req: Request, { params }: { params: Promise<{ sid: string }> }) {
  const { deny, id: sid } = await guard("scheduled", (await params).sid);
  if (deny) return deny;
  const res = await sql`update scheduled_posts set status = 'cancelled' where id = ${sid} and status = 'pending'`;
  if (!res.count) return NextResponse.json({ error: "Only pending posts can be cancelled" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
