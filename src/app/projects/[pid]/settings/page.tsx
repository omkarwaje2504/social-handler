import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { canManageProject, isSuper, requireAccess } from "@/lib/auth";
import { sql } from "@/lib/db";
import { toPublic } from "@/lib/hash";
import { listOrgs, type OrgKind } from "@/lib/orgs";
import { ProjectSettings, type OrgLists, type OwnerOption, type SettingsProject } from "@/components/ProjectSettings";
import { Icon } from "@/components/Icon";

export const metadata: Metadata = { title: "Project settings" };

// Project settings: super admins and the project's admins. Close / reopen / delete: super admins.
export default async function ProjectSettingsPage({ params }: { params: Promise<{ pid: string }> }) {
  await connection();
  // code: the project's code from the URL (used in links); pid: its integer id (used in queries).
  const { pid: code } = await params;
  const { user, id: pid } = await requireAccess("project", code);
  if (!(await canManageProject(user, pid))) notFound();

  const [p] = await sql<(Omit<SettingsProject, "connectUrl" | "closedAt" | "agencyId" | "companyId" | "brandId" | "ownerId"> & { ownerRaw: number | null; ownerHash: string | null; agencyId: number | null; companyId: number | null; brandId: number | null; connectToken: string; closedAt: Date | null })[]>`
    select p.hash as id, p.owner_id as owner_raw, ow.hash as owner_hash, coalesce(nullif(ow.name, ''), ow.email) as owner_name, p.name, p.description, p.agency_id, p.company_id, p.brand_id, p.brand_color,
      p.status, p.closed_at, p.closed_reason, p.connect_token, c.name as closed_by_name,
      (select count(*)::int from accounts a where a.project_id = p.id) as accounts,
      (select count(*)::int from project_members m where m.project_id = p.id) as members
    from projects p left join users c on c.id = p.closed_by left join users ow on ow.id = p.owner_id
    where p.id = ${pid}`;
  if (!p) notFound();
  const [all, owners] = await Promise.all([
    listOrgs(p.ownerRaw),
    isSuper(user) ? sql<OwnerOption[]>`select hash as id, coalesce(nullif(name, ''), email) as name from users where role = 'admin' and active order by name` : Promise.resolve([] as OwnerOption[]),
  ]);
  const pick = (k: OrgKind) => toPublic(all.filter((o) => o.kind === k).map((o) => ({ id: o.id, hash: o.hash, name: o.name, projects: o.projects, companyId: o.companyId ?? null })));
  const orgs: OrgLists = { agency: pick("agency"), company: pick("company"), brand: pick("brand") };

  const { ownerRaw: _o, ownerHash, ...rest } = p;
  const project: SettingsProject = {
    ...toPublic(rest),
    ownerId: ownerHash,
    closedAt: p.closedAt ? p.closedAt.toISOString() : null,
    connectUrl: `${process.env.APP_URL}/api/auth/instagram?p=${p.connectToken}`,
  };

  return (
    <div className="shell">
      <div className="crumbs">
        <Link href="/projects">Projects</Link> <span>/</span> <Link href={`/projects/${code}`}>{p.name}</Link> <span>/</span> <span>Settings</span>
      </div>
      <div className="page-head">
        <div>
          <h1>Project settings</h1>
          <div className="muted">Rename the project, link its agency, company and brand, and manage its connect link{isSuper(user) ? " and status" : ""}.</div>
        </div>
        <div className="spacer" />
        <Link className="btn secondary" href={`/projects/${code}`}><Icon name="chevronLeft" size={16} />Back to project</Link>
      </div>
      <ProjectSettings project={project} orgs={orgs} isSuper={isSuper(user)} owners={owners} />
    </div>
  );
}

export const instant = false;
