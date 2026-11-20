import { NextResponse } from "next/server";
import { type UserDoc, activeAdminId, guardRole } from "@/lib/auth";
import { toPublic } from "@/lib/hash";
import { createOrg, isOrgKind, listOrgs } from "@/lib/orgs";

/**
 * Which directory a request works on. An admin always gets their own. A super admin passes
 * workspace=<admin's code> to work in that admin's directory (e.g. creating a project for them);
 * anything else means the super admins' own directory. Undefined = not a valid workspace.
 */
async function workspaceFor(me: UserDoc, requested: unknown): Promise<number | null | undefined> {
  if (me.role === "admin") return me.id;
  if (!requested || requested === "platform") return null;
  return (await activeAdminId(requested)) ?? undefined;
}

// GET /api/orgs?kind=agency&workspace=<admin code>  → one directory (super admins and admins)
export async function GET(req: Request) {
  const { deny, user } = await guardRole(["super_admin", "admin"]);
  if (deny) return deny;
  const q = new URL(req.url).searchParams;
  const owner = await workspaceFor(user, q.get("workspace"));
  if (owner === undefined) return NextResponse.json([]);
  const kind = q.get("kind");
  const rows = await listOrgs(owner, isOrgKind(kind) ? kind : undefined);
  return NextResponse.json(toPublic(rows.map((o) => ({
    id: o.id, hash: o.hash, kind: o.kind, name: o.name, projects: o.projects, companyId: o.companyId ?? null, companyName: o.companyName,
  }))));
}

// POST { kind, name, force?, companyId? (brands), workspace? (super admins) }
//   → 200 { org, existing } | 409 { similar: [...] } | 400 { error }
export async function POST(req: Request) {
  const { deny, user } = await guardRole(["super_admin", "admin"]);
  if (deny) return deny;
  const b = await req.json().catch(() => ({}));
  if (!isOrgKind(b.kind)) return NextResponse.json({ error: "Unknown list" }, { status: 400 });
  const owner = await workspaceFor(user, b.workspace);
  if (owner === undefined) return NextResponse.json({ error: "Unknown workspace" }, { status: 400 });
  const r = await createOrg(b.kind, b.name, user.id, owner, b.force === true, b.companyId);
  if (r.status === "invalid") return NextResponse.json({ error: r.error }, { status: 400 });
  if (r.status === "similar") return NextResponse.json({ error: "Similar names already exist", similar: toPublic(r.similar) }, { status: 409 });
  return NextResponse.json({ org: toPublic(r.org), existing: r.status === "existing" });
}
