import { NextResponse } from "next/server";
import { getUser, guard } from "@/lib/auth";
import { sql } from "@/lib/db";
import { r2Delete, r2SignedUrl } from "@/lib/r2";
import { decodeHash, encodeHash } from "@/lib/hash";

type Ctx = { params: Promise<{ eid: string }> };

async function load(code: string) {
  const id = decodeHash("exports", code);
  if (!id) return null;
  const [e] = await sql<{ id: number; projectId: number; r2Key: string; fileName: string; userId: number | null }[]>`
    select id, project_id, r2_key, file_name, user_id from exports where id = ${id}`;
  return e ?? null;
}

// Download: redirect to a 5-minute signed Cloudflare R2 link.
export async function GET(_req: Request, { params }: Ctx) {
  const e = await load((await params).eid);
  if (!e) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { deny } = await guard("project", encodeHash("projects", e.projectId));
  if (deny) return deny;
  return NextResponse.redirect(await r2SignedUrl(e.r2Key, e.fileName), 302);
}

// Delete the file and its record (whoever made it, or a project admin).
export async function DELETE(_req: Request, { params }: Ctx) {
  const e = await load((await params).eid);
  if (!e) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const me = await getUser();
  const { deny } = await guard("project", encodeHash("projects", e.projectId), e.userId === me?.id ? {} : { manage: true });
  if (deny) return deny;
  await r2Delete(e.r2Key);
  await sql`delete from exports where id = ${e.id}`;
  return NextResponse.json({ ok: true });
}
