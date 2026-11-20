import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { cache } from "react";
import { sql } from "@/lib/db";
import { type HashTable, decodeHash } from "@/lib/hash";
import { SESSION_COOKIE, readSession } from "@/lib/session";

// Who is signed in, and what they may open. Each admin is a separate workspace.
//   super_admin: every project, user and directory entry; creates projects for admins (owner) or
//                keeps them for the super admins (no owner).
//   admin:       only the projects they own, the users they created and their own directory.
//                Nothing of another admin's workspace is visible to them.
//   user:        only the projects they were given access to (project_members), and works inside them.
//
// Ids: everything here works with integer row ids. Codes from the browser (URL params, bodies)
// are decoded with decodeHash / guard first; anything that isn't a valid code is "Not found".

export type Role = "super_admin" | "admin" | "user";
export const ROLES: Role[] = ["super_admin", "admin", "user"];
export const ROLE_LABEL: Record<Role, string> = { super_admin: "Super admin", admin: "Admin", user: "User" };

export interface UserDoc {
  id: number;
  hash: string;
  email: string;
  name: string;
  designation: string;
  role: Role;
  active: boolean;
  createdBy?: number | null;
  lastLoginAt?: Date | null;
  createdAt: Date;
}

/** The signed-in, active user (one lookup per request). */
export const getUser = cache(async (): Promise<UserDoc | null> => {
  const code = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  const uid = decodeHash("users", code);
  if (!uid) return null;
  const [u] = await sql<UserDoc[]>`
    select id, hash, email, name, designation, role, active, created_by, last_login_at, created_at
    from users where id = ${uid} and active`;
  return u ?? null;
});

/** For pages: the user, or off to /login. */
export async function requireUser() {
  const u = await getUser();
  if (!u) redirect("/login");
  return u;
}

export const isSuper = (u: UserDoc | null) => u?.role === "super_admin";
export const isAdminRole = (u: UserDoc | null) => u?.role === "super_admin" || u?.role === "admin";

/**
 * Project ids the user may open; null = all (super admin).
 * Closed projects are left out: their admins and users lose access until a super admin reopens them.
 */
export const projectIdsFor = cache(async (u: UserDoc): Promise<number[] | null> => {
  if (u.role === "super_admin") return null;
  const rows = u.role === "admin"
    ? await sql<{ projectId: number }[]>`select id as project_id from projects where owner_id = ${u.id} and status = 'active'`
    : await sql<{ projectId: number }[]>`
        select m.project_id from project_members m join projects p on p.id = m.project_id
        where m.user_id = ${u.id} and p.status = 'active'`;
  return rows.map((r) => r.projectId);
});

/**
 * The workspace a user belongs to: the admin who created them, or null for people created by a
 * super admin ("platform" users, who can be given any project). Admins are their own workspace.
 */
export async function workspaceOfUser(userId: number): Promise<number | null> {
  const [u] = await sql<{ role: Role; createdBy: number | null; creatorRole: Role | null }[]>`
    select u.role, u.created_by, c.role as creator_role from users u left join users c on c.id = u.created_by where u.id = ${userId}`;
  if (!u) return null;
  if (u.role === "admin") return userId;
  return u.creatorRole === "admin" ? u.createdBy : null;
}

/** The id of an active admin with this code (a project owner picked by a super admin), or null. */
export async function activeAdminId(code: unknown) {
  const id = decodeHash("users", code);
  if (!id) return null;
  const [a] = await sql`select 1 from users where id = ${id} and role = 'admin' and active`;
  return a ? id : null;
}

/** May this user (by workspace) work in a project owned by `owner` (null = super admins)? */
export const fitsWorkspace = (userWorkspace: number | null, owner: number | null) =>
  owner === null || userWorkspace === null || userWorkspace === owner;

/**
 * SQL condition limiting a project_id column to the given project ids (null = no limit).
 * Synchronous on purpose: a SQL fragment is "thenable", so returning one from an async
 * function would run it as a query.
 *   const scope = scopeSql(await projectIdsFor(user), "a.project_id");
 */
export function scopeSql(ids: number[] | null, column = "project_id") {
  if (ids === null) return sql`true`;
  if (!ids.length) return sql`false`;
  return sql`${sql.unsafe(column)} = any(${ids}::int[])`;
}

export async function canOpenProject(u: UserDoc, projectId: number) {
  const ids = await projectIdsFor(u);
  return ids === null || ids.includes(projectId);
}

/** May the user add/remove members and change settings of this project? (super admin, or its owner) */
export async function canManageProject(u: UserDoc, projectId: number) {
  if (u.role === "super_admin") return true;
  if (u.role !== "admin") return false;
  const [p] = await sql`select 1 from projects where id = ${projectId} and owner_id = ${u.id} and status = 'active'`;
  return !!p;
}

export type Kind = "account" | "post" | "automation" | "comment" | "scheduled" | "project";
const TABLE: Record<Kind, HashTable> = {
  account: "accounts",
  post: "posts",
  automation: "automations",
  comment: "comments",
  scheduled: "scheduled_posts",
  project: "projects",
};

/** The project a row belongs to (via its account): undefined = no such row, null = no project. */
async function projectOf(kind: Kind, id: number): Promise<number | null | undefined> {
  if (kind === "project") {
    const [p] = await sql`select 1 from projects where id = ${id}`;
    return p ? id : undefined;
  }
  if (kind === "account") {
    const [a] = await sql<{ projectId: number | null }[]>`select project_id from accounts where id = ${id}`;
    return a ? a.projectId : undefined;
  }
  const [r] = await sql<{ projectId: number | null }[]>`
    select a.project_id from ${sql(TABLE[kind])} t join accounts a on a.id = t.account_id where t.id = ${id}`;
  return r ? r.projectId : undefined;
}

/** Can the user open this row? Rows without a project are visible to super admins only. */
export async function canAccess(u: UserDoc, kind: Kind, id: number) {
  const pid = await projectOf(kind, id);
  if (pid === undefined) return false;
  if (u.role === "super_admin") return true;
  return pid !== null && (await canOpenProject(u, pid));
}

type Guarded = { deny: NextResponse; id: null; user: null } | { deny: null; id: number; user: UserDoc };

/**
 * API guard for a row addressed by its code (from the URL or body).
 *   const { deny, id } = await guard("account", code); if (deny) return deny;
 * id is the integer row id to use in queries. A code of the wrong table, an edited code or a row
 * the user can't open all answer 404. manage: also require project-admin rights.
 */
export async function guard(kind: Kind, code: unknown, opts: { manage?: boolean } = {}): Promise<Guarded> {
  const u = await getUser();
  if (!u) return { deny: NextResponse.json({ error: "Not signed in" }, { status: 401 }), id: null, user: null };
  const id = decodeHash(TABLE[kind], code);
  if (!id || !(await canAccess(u, kind, id))) return { deny: NextResponse.json({ error: "Not found" }, { status: 404 }), id: null, user: null };
  if (opts.manage) {
    const pid = await projectOf(kind, id);
    const ok = pid ? await canManageProject(u, pid) : u.role === "super_admin";
    if (!ok) return { deny: NextResponse.json({ error: "Only project admins can do this" }, { status: 403 }), id: null, user: null };
  }
  return { deny: null, id, user: u };
}

/** API guard for role-only endpoints. */
export async function guardRole(roles: Role[]) {
  const u = await getUser();
  if (!u) return { deny: NextResponse.json({ error: "Not signed in" }, { status: 401 }), user: null } as const;
  if (!roles.includes(u.role)) return { deny: NextResponse.json({ error: "Not allowed" }, { status: 403 }), user: null } as const;
  return { deny: null, user: u } as const;
}

/** Page guard: the integer id for a code in the URL, or 404 unless the signed-in user may open it. */
export async function requireAccess(kind: Kind, code: string) {
  const u = await requireUser();
  const id = decodeHash(TABLE[kind], code);
  if (!id || !(await canAccess(u, kind, id))) notFound();
  return { user: u, id };
}
