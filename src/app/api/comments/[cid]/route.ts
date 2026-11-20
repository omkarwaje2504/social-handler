import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { sql } from "@/lib/db";

type Ctx = { params: Promise<{ cid: string }> };

// Permanently remove a stored comment record (only after it was deleted on Instagram).
export async function DELETE(_req: Request, { params }: Ctx) {
  const { deny, id: cid } = await guard("comment", (await params).cid);
  if (deny) return deny;
  const r = await sql`delete from comments where id = ${cid} and deleted_at is not null`;
  if (!r.count) return NextResponse.json({ error: "Delete the comment on Instagram first." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
