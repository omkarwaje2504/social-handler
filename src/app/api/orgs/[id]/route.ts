import { NextResponse } from "next/server";
import { type UserDoc, guardRole } from "@/lib/auth";
import { sql } from "@/lib/db";
import { decodeHash } from "@/lib/hash";
import { checkOrgName, nameKey } from "@/lib/names";
import { ORG_COLUMN, ORG_LABEL, companyIdOf, type OrgKind } from "@/lib/orgs";

type Ctx = { params: Promise<{ id: string }> };
type OrgRow = { id: number; kind: OrgKind; name: string; companyId: number | null; ownerId: number | null };

/**
 * An entry the caller may manage: super admins any; an admin only entries of their own directory.
 * Anything else answers "Not found", exactly like a missing entry.
 */
async function load(code: unknown, me: UserDoc): Promise<OrgRow | null> {
  const id = decodeHash("orgs", code);
  if (!id) return null;
  const [o] = await sql<OrgRow[]>`select id, kind, name, company_id, owner_id from orgs where id = ${id}`;
  if (!o || (me.role !== "super_admin" && o.ownerId !== me.id)) return null;
  return o;
}

// Edit: PATCH { name?, companyId? }. A new name must be valid and not clash with another entry of the
// same kind in the same directory. companyId (brands only, null to unlink) also moves the brand's projects.
export async function PATCH(req: Request, { params }: Ctx) {
  const { deny, user } = await guardRole(["super_admin", "admin"]);
  if (deny) return deny;
  const org = await load((await params).id, user);
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  if ("companyId" in b) {
    if (org.kind !== "brand") return NextResponse.json({ error: "Only brands belong to a company" }, { status: 400 });
    const companyId = b.companyId ? await companyIdOf(b.companyId, org.ownerId) : null;
    if (b.companyId && !companyId) return NextResponse.json({ error: "Unknown company" }, { status: 400 });
    await sql.begin(async (tx) => {
      await tx`update orgs set company_id = ${companyId} where id = ${org.id}`;
      if (companyId) await tx`update projects set company_id = ${companyId} where brand_id = ${org.id}`;
    });
  }
  if ("name" in b) {
    const check = checkOrgName(b.name, ORG_LABEL[org.kind].one);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
    const key = nameKey(check.value);
    const [clash] = await sql<{ name: string }[]>`
      select name from orgs where kind = ${org.kind} and name_key = ${key} and id <> ${org.id} and owner_id is not distinct from ${org.ownerId}`;
    if (clash) return NextResponse.json({ error: `“${clash.name}” already exists. Merge into it instead.` }, { status: 409 });
    await sql`update orgs set name = ${check.value}, name_key = ${key} where id = ${org.id}`;
  }
  return NextResponse.json({ ok: true });
}

// Merge: POST { intoId } moves every project link to another entry of the same directory, then removes this one.
export async function POST(req: Request, { params }: Ctx) {
  const { deny, user } = await guardRole(["super_admin", "admin"]);
  if (deny) return deny;
  const org = await load((await params).id, user);
  const b = await req.json().catch(() => ({}));
  const into = await load(b.intoId, user);
  if (!org || !into || into.kind !== org.kind || into.id === org.id || into.ownerId !== org.ownerId) {
    return NextResponse.json({ error: "Pick another entry of the same list" }, { status: 400 });
  }
  const col = sql(ORG_COLUMN[org.kind]);
  await sql.begin(async (tx) => {
    await tx`update projects set ${col} = ${into.id} where ${col} = ${org.id}`;
    if (org.kind === "company") await tx`update orgs set company_id = ${into.id} where company_id = ${org.id}`;
    if (org.kind === "brand") await tx`update orgs set company_id = coalesce(company_id, ${org.companyId}) where id = ${into.id}`;
    await tx`delete from orgs where id = ${org.id}`;
  });
  return NextResponse.json({ ok: true });
}

// Delete, only when no project uses it (and, for a company, no brand belongs to it).
export async function DELETE(_req: Request, { params }: Ctx) {
  const { deny, user } = await guardRole(["super_admin", "admin"]);
  if (deny) return deny;
  const org = await load((await params).id, user);
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from projects where ${sql(ORG_COLUMN[org.kind])} = ${org.id}`;
  if (n) return NextResponse.json({ error: `Used by ${n} project(s). Merge it into another entry instead.` }, { status: 409 });
  const [{ brands }] = await sql<{ brands: number }[]>`select count(*)::int as brands from orgs where company_id = ${org.id}`;
  if (brands) return NextResponse.json({ error: `${brands} brand(s) belong to it. Move them or merge it instead.` }, { status: 409 });
  await sql`delete from orgs where id = ${org.id}`;
  return NextResponse.json({ ok: true });
}
