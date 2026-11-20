import { NextResponse } from "next/server";
import { fitsWorkspace, getUser, guard, workspaceOfUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { decodeHash } from "@/lib/hash";

type Ctx = { params: Promise<{ pid: string }> };

/**
 * Give someone access to the project. Only people with the "user" role are members (owners and super
 * admins already have access). An admin adds people from their own team; a super admin adds anyone
 * who fits the project's workspace (the owner's team, or people created by super admins).
 */
export async function POST(req: Request, { params }: Ctx) {
  const { deny, id: pid } = await guard("project", (await params).pid, { manage: true });
  if (deny) return deny;
  const me = (await getUser())!;
  const b = await req.json().catch(() => ({}));
  const userId = decodeHash("users", b.userId);
  if (!userId) return NextResponse.json({ error: "Pick a user" }, { status: 400 });
  const [target] = await sql<{ role: string; createdBy: number | null }[]>`select role, created_by from users where id = ${userId} and active`;
  // Another admin's team member answers exactly like a missing user.
  if (!target || (me.role !== "super_admin" && target.createdBy !== me.id)) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (target.role !== "user") return NextResponse.json({ error: "Admins own their projects and super admins see everything, so only users get project access." }, { status: 400 });
  const [project] = await sql<{ ownerId: number | null }[]>`select owner_id from projects where id = ${pid}`;
  if (!fitsWorkspace(await workspaceOfUser(userId), project.ownerId)) {
    return NextResponse.json({ error: "This person belongs to another admin's team." }, { status: 400 });
  }
  await sql`
    insert into project_members (project_id, user_id, role, added_by) values (${pid}, ${userId}, 'user', ${me.id})
    on conflict (project_id, user_id) do nothing`;
  return NextResponse.json({ ok: true });
}

/** Remove someone's access (the owner or a super admin). */
export async function DELETE(req: Request, { params }: Ctx) {
  const { deny, id: pid } = await guard("project", (await params).pid, { manage: true });
  if (deny) return deny;
  const userId = decodeHash("users", new URL(req.url).searchParams.get("userId"));
  if (!userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const r = await sql`delete from project_members where project_id = ${pid} and user_id = ${userId}`;
  if (!r.count) return NextResponse.json({ error: "Not a member" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
