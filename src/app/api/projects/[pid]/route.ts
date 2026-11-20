import { NextResponse } from "next/server";
import { activeAdminId, getUser, guard } from "@/lib/auth";
import { sql } from "@/lib/db";
import { projectFields } from "@/lib/projects";

type Ctx = { params: Promise<{ pid: string }> };

/**
 * Settings (the owner or a super admin): name, description, agency / company / brand, brand colour,
 * and a new connect link. Super admins only: close / reopen, and hand the project to another owner
 * ({ ownerId: <admin's code> | null for the super admins }). Projects are never deleted.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const { deny, id: pid } = await guard("project", (await params).pid, { manage: true });
  if (deny) return deny;
  const me = (await getUser())!;
  const b = await req.json().catch(() => ({}));
  const [project] = await sql<{ ownerId: number | null }[]>`select owner_id from projects where id = ${pid}`;
  let owner = project.ownerId;

  if ("ownerId" in b) {
    if (me.role !== "super_admin") return NextResponse.json({ error: "Only a super admin can change the owner" }, { status: 403 });
    const next = b.ownerId ? await activeAdminId(b.ownerId) : null;
    if (b.ownerId && !next) return NextResponse.json({ error: "Pick an active admin as the owner" }, { status: 400 });
    if (next !== owner) {
      await sql.begin(async (tx) => {
        await tx`update projects set owner_id = ${next} where id = ${pid}`;
        if (next !== null) {
          // Keep the new owner's workspace clean: people from another admin's team lose access,
          // and agency / company / brand links that aren't in the new owner's directory are cleared.
          await tx`
            delete from project_members m using users u join users c on c.id = u.created_by
            where m.project_id = ${pid} and m.user_id = u.id and c.role = 'admin' and u.created_by <> ${next}`;
        }
        for (const col of ["agency_id", "company_id", "brand_id"] as const) {
          await tx`
            update projects p set ${tx(col)} = null
            where p.id = ${pid} and p.${tx(col)} is not null
              and not exists (select 1 from orgs o where o.id = p.${tx(col)} and o.owner_id is not distinct from ${next})`;
        }
      });
      owner = next;
    }
  }

  const fields = await projectFields(b, { projectId: pid, owner });
  if ("error" in fields) return NextResponse.json({ error: fields.error }, { status: 400 });
  if (Object.keys(fields.set).length) await sql`update projects set ${sql(fields.set)} where id = ${pid}`;
  if (b.rotateLink) await sql`update projects set connect_token = encode(gen_random_bytes(18), 'hex') where id = ${pid}`;

  if (b.action === "close" || b.action === "reopen") {
    if (me.role !== "super_admin") return NextResponse.json({ error: "Only a super admin can close or reopen a project" }, { status: 403 });
    if (b.action === "close") {
      const reason = typeof b.reason === "string" ? b.reason.trim().slice(0, 300) : "";
      await sql`update projects set status = 'closed', closed_at = now(), closed_by = ${me.id}, closed_reason = ${reason} where id = ${pid}`;
    } else {
      await sql`update projects set status = 'active', closed_at = null, closed_by = null, closed_reason = '' where id = ${pid}`;
    }
  }
  return NextResponse.json({ ok: true });
}
