import { NextResponse } from "next/server";
import { getUser, workspaceOfUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { checkDesignation, checkPersonName } from "@/lib/names";
import { MIN_PASSWORD, hashPassword } from "@/lib/password";
import { decodeHash, decodeHashes } from "@/lib/hash";

type Ctx = { params: Promise<{ uid: string }> };

/**
 * Who may edit whom:
 *   yourself     → name, designation, password
 *   super admin  → anyone: also role and active (but not your own role/active)
 *   admin        → users (role 'user') they created: name, designation, password, active
 */
async function canEdit(uid: number) {
  const me = await getUser();
  if (!me) return { me: null, ok: false, full: false };
  if (uid === me.id) return { me, ok: true, full: false };
  if (me.role === "super_admin") return { me, ok: true, full: true };
  if (me.role === "admin") {
    const [t] = await sql`select 1 from users where id = ${uid} and created_by = ${me.id} and role = 'user'`;
    return { me, ok: !!t, full: false };
  }
  return { me, ok: false, full: false };
}

export async function PATCH(req: Request, { params }: Ctx) {
  const uid = decodeHash("users", (await params).uid);
  if (!uid) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { me, ok, full } = await canEdit(uid);
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!ok) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const set: Record<string, unknown> = {};
  if (typeof b.name === "string") {
    const name = checkPersonName(b.name);
    if (!name.ok) return NextResponse.json({ error: name.error }, { status: 400 });
    set.name = name.value;
  }
  if (typeof b.designation === "string") {
    const d = checkDesignation(b.designation);
    if (!d.ok) return NextResponse.json({ error: d.error }, { status: 400 });
    set.designation = d.value;
  }
  if (typeof b.password === "string" && b.password) {
    if (b.password.length < MIN_PASSWORD) return NextResponse.json({ error: `Password must be at least ${MIN_PASSWORD} characters` }, { status: 400 });
    set.password_hash = await hashPassword(b.password);
  }
  if (uid !== me.id && typeof b.active === "boolean") set.active = b.active;
  const [before] = await sql<{ role: string }[]>`select role from users where id = ${uid}`;
  if (full && uid !== me.id && ["super_admin", "admin", "user"].includes(b.role) && b.role !== before.role) {
    // An admin who still owns projects keeps the role until those projects are handed to someone else.
    if (before.role === "admin") {
      const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from projects where owner_id = ${uid}`;
      if (n) return NextResponse.json({ error: `They own ${n} project(s). Give those projects a new owner in project settings first.` }, { status: 409 });
    }
    set.role = b.role;
  }
  if (Object.keys(set).length) await sql`update users set ${sql(set)} where id = ${uid}`;
  // Only users are project members: someone promoted to admin / super admin leaves their memberships.
  if (set.role && set.role !== "user") await sql`delete from project_members where user_id = ${uid}`;

  // Project access (users only): { projectIds: [codes] } is the full list for the projects the caller
  // manages: their own projects for an admin; for a super admin, every active project that fits the
  // person's workspace. Access to projects outside that list is left untouched.
  if (Array.isArray(b.projectIds) && uid !== me.id) {
    const [target] = await sql<{ role: string }[]>`select role from users where id = ${uid}`;
    if (target?.role === "user") {
      const ws = await workspaceOfUser(uid);
      const manageable = me.role === "super_admin"
        ? await sql<{ id: number }[]>`
            select id from projects where status = 'active' and (owner_id is null or ${ws}::int is null or owner_id = ${ws})`
        : await sql<{ id: number }[]>`select id from projects where owner_id = ${me.id} and status = 'active'`;
      const allowed = new Set(manageable.map((p) => p.id));
      const wanted = decodeHashes("projects", b.projectIds).filter((id) => allowed.has(id));
      await sql.begin(async (tx) => {
        await tx`delete from project_members where user_id = ${uid}
                 and project_id = any(${[...allowed]}::int[]) and not (project_id = any(${wanted}::int[]))`;
        if (wanted.length) {
          await tx`insert into project_members (project_id, user_id, role, added_by)
                   select unnest(${wanted}::int[]), ${uid}, 'user', ${me.id}
                   on conflict (project_id, user_id) do nothing`;
        }
      });
    }
  }
  return NextResponse.json({ ok: true });
}

// Delete a person (super admin only, never yourself). Projects they created stay.
export async function DELETE(_req: Request, { params }: Ctx) {
  const uid = decodeHash("users", (await params).uid);
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (me.role !== "super_admin" || !uid || uid === me.id) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from projects where owner_id = ${uid}`;
  if (n) return NextResponse.json({ error: `They own ${n} project(s). Give those projects a new owner first.` }, { status: 409 });
  const r = await sql`delete from users where id = ${uid}`;
  return r.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
