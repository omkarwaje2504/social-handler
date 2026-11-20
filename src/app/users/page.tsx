import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { isAdminRole, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { UsersManager, type PersonRow } from "@/components/UsersManager";

export const metadata: Metadata = { title: "Users" };

// Super admins see and manage everyone. Each admin works as an independent space: they see only
// themselves and the users they created, and give those users access to the projects they own.
export default async function UsersPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  await connection();
  const me = await requireUser();
  const { new: openNew } = await searchParams;
  if (!isAdminRole(me)) notFound();
  const isSuper = me.role === "super_admin";

  const visible = isSuper
    ? sql`true`
    : sql`(u.id = ${me.id} or u.created_by = ${me.id})`;
  // Projects shown on each person: all for super admins; for an admin, only the ones they own.
  const shownProjects = isSuper ? sql`true` : sql`p.owner_id = ${me.id}`;

  const [rows, projects] = await Promise.all([
    sql<(Omit<PersonRow, "id" | "canEdit" | "lastLoginAt"> & { id: number; hash: string; createdBy: number | null; lastLoginAt: Date | null })[]>`
      select u.id, u.hash, u.email, u.name, u.designation, u.role, u.active, u.last_login_at, u.created_by,
        c.name as created_by_name,
        coalesce(case when u.role = 'admin' then
          (select json_agg(json_build_object('id', p.hash, 'name', p.name, 'role', 'owner') order by p.name)
            from projects p where p.owner_id = u.id and ${shownProjects})
          else (select json_agg(json_build_object('id', p.hash, 'name', p.name, 'role', 'user') order by p.name)
            from project_members m join projects p on p.id = m.project_id where m.user_id = u.id and ${shownProjects}) end, '[]') as projects
      from users u left join users c on c.id = u.created_by
      where ${visible}
      order by u.name`,
    isSuper
      ? sql<{ id: string; name: string }[]>`select hash as id, name from projects where status = 'active' order by name`
      : sql<{ id: string; name: string }[]>`
          select hash as id, name from projects where owner_id = ${me.id} and status = 'active' order by name`,
  ]);

  const people: PersonRow[] = rows.map((r) => ({
    id: r.hash, email: r.email, name: r.name, designation: r.designation, role: r.role, active: r.active,
    lastLoginAt: r.lastLoginAt ? r.lastLoginAt.toISOString() : null, createdByName: r.createdByName,
    projects: r.projects,
    canEdit: isSuper || r.id === me.id || (r.createdBy === me.id && r.role === "user"),
  }));

  return (
    <div className="shell">
      <div className="page-head">
        <div>
          <div className="eyebrow">{isSuper ? "All workspaces" : "Your workspace"}</div>
          <h1>{isSuper ? "Users" : "My team"}</h1>
          <p className="page-sub">
            {isSuper
              ? "Everyone in SMC. Admins own their projects and manage their own team; users only see the projects they're given."
              : "The people you add here belong to your workspace. Give each one access to the projects they work on; other admins never see them."}
          </p>
        </div>
      </div>
      <UsersManager people={people} projects={projects} isSuper={isSuper} meId={me.hash} openNew={openNew === "1"} />
    </div>
  );
}

export const instant = false;
