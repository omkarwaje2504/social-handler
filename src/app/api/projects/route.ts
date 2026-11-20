import { NextResponse } from "next/server";
import { activeAdminId, guardRole } from "@/lib/auth";
import { sql } from "@/lib/db";
import { setHash } from "@/lib/hash";
import { projectFields } from "@/lib/projects";

/**
 * Create a project.
 *   admin:       the project is theirs (owner = them), in their own workspace.
 *   super admin: { ownerId: <admin's code> } creates it for that admin; without it the project
 *                belongs to the super admins.
 */
export async function POST(req: Request) {
  const { deny, user } = await guardRole(["super_admin", "admin"]);
  if (deny) return deny;
  const b = await req.json().catch(() => ({}));

  let owner: number | null = user.role === "admin" ? user.id : null;
  if (user.role === "super_admin" && b.ownerId) {
    owner = await activeAdminId(b.ownerId);
    if (!owner) return NextResponse.json({ error: "Pick an active admin as the owner" }, { status: 400 });
  }
  const fields = await projectFields(b, { requireName: true, owner });
  if ("error" in fields) return NextResponse.json({ error: fields.error }, { status: 400 });

  const [project] = await sql<{ id: number }[]>`
    insert into projects ${sql({ ...fields.set, created_by: user.id, owner_id: owner })}
    returning id`;
  return NextResponse.json({ id: await setHash("projects", project.id) });
}
