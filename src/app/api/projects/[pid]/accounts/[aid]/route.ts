import { NextResponse } from "next/server";
import { canManageProject, getUser, guard, guardRole } from "@/lib/auth";
import { sql } from "@/lib/db";
import { ACCOUNT_TYPES } from "@/lib/account-types";
import { decodeHash } from "@/lib/hash";

type Ctx = { params: Promise<{ pid: string; aid: string }> };

// Edit an account's type / designation, or move it to another project (admins of both projects).
export async function PATCH(req: Request, { params }: Ctx) {
  const { pid: pcode, aid: acode } = await params;
  // "unassigned" = accounts without a project, which only super admins can see.
  const unassigned = pcode === "unassigned";
  const g = unassigned ? { ...(await guardRole(["super_admin"])), id: null } : await guard("project", pcode, { manage: true });
  if (g.deny) return g.deny;
  const pid = g.id;
  const aid = decodeHash("accounts", acode);
  const [acc] = aid
    ? await sql`select 1 from accounts where id = ${aid} and ${unassigned ? sql`project_id is null` : sql`project_id = ${pid}`}`
    : [];
  if (!acc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const set: Record<string, string | number> = {};
  if (typeof b.designation === "string") set.designation = b.designation.trim().slice(0, 80);
  if (typeof b.accountType === "string" && ACCOUNT_TYPES.some((t) => t.key === b.accountType)) set.account_type = b.accountType;
  if (b.projectId !== undefined) {
    const target = decodeHash("projects", b.projectId);
    if (!target || !(await canManageProject((await getUser())!, target))) {
      return NextResponse.json({ error: "You can't move accounts into that project" }, { status: 403 });
    }
    set.project_id = target;
  }
  if (Object.keys(set).length) await sql`update accounts set ${sql(set)} where id = ${aid}`;
  return NextResponse.json({ ok: true });
}
