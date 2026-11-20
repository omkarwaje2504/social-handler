import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { isAdminRole, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { decodeHash } from "@/lib/hash";
import { Kpi } from "@/components/charts";
import { fmtCompact } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { ProjectFormButton, type PersonOption } from "@/components/ProjectForm";

export const metadata: Metadata = { title: "Projects" };

type ProjectRow = {
  id: string; name: string; description: string; status: "active" | "closed"; createdAt: Date;
  agencyName: string; companyName: string; brandName: string; brandColor: string; closedAt: Date | null;
  accounts: number; followers: string; posts: number; views: string; members: number;
  ownerName: string | null; mine: boolean;
};

// Projects table. Super admins: every project, filterable by owner. Admins: the projects they own.
// Users: the projects they were given. Closed ones stay listed (greyed, "Closed"); only super admins open them.
export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ owner?: string; status?: string; q?: string }> }) {
  await connection();
  const user = await requireUser();
  const { owner, status = "all", q = "" } = await searchParams;
  const isSuper = user.role === "super_admin";

  const scope = isSuper ? sql`true`
    : user.role === "admin" ? sql`p.owner_id = ${user.id}`
    : sql`exists (select 1 from project_members m where m.project_id = p.id and m.user_id = ${user.id})`;
  const ownerId = decodeHash("users", owner); // the filter holds the admin's code, or "platform"
  const ownerFilter = !isSuper ? sql`` : owner === "platform" ? sql`and p.owner_id is null` : ownerId ? sql`and p.owner_id = ${ownerId}` : sql``;
  const needle = q.trim() ? `%${q.trim()}%` : "";
  const search = needle
    ? sql`and (p.name ilike ${needle} or exists (select 1 from orgs o where o.id in (p.agency_id, p.company_id, p.brand_id) and o.name ilike ${needle}))`
    : sql``;

  const [all, admins] = await Promise.all([
    sql<ProjectRow[]>`
      select p.hash as id, p.name, p.description, p.status, p.created_at, p.closed_at,
        coalesce((select name from orgs o where o.id = p.agency_id), '') as agency_name,
        coalesce((select name from orgs o where o.id = p.company_id), '') as company_name,
        coalesce((select name from orgs o where o.id = p.brand_id), '') as brand_name, p.brand_color,
        (select coalesce(nullif(u.name, ''), u.email) from users u where u.id = p.owner_id) as owner_name,
        p.owner_id is not distinct from ${user.role === "admin" ? user.id : -1} as mine,
        (select count(*)::int from accounts a where a.project_id = p.id) as accounts,
        (select coalesce(sum(a.followers_count), 0)::bigint from accounts a where a.project_id = p.id) as followers,
        (select count(*)::int from posts x join accounts a on a.id = x.account_id where a.project_id = p.id and not x.removed_from_app) as posts,
        (select coalesce(sum(coalesce((x.metrics->>'views')::bigint, (x.metrics->>'plays')::bigint, 0)), 0)::bigint
           from posts x join accounts a on a.id = x.account_id where a.project_id = p.id and not x.removed_from_app) as views,
        (select count(*)::int from project_members m where m.project_id = p.id) as members
      from projects p
      where ${scope} ${ownerFilter} ${search}
      order by (p.status = 'active') desc, p.created_at desc`,
    isSuper
      ? sql<PersonOption[]>`select hash as id, name, email, designation, role from users where role = 'admin' and active order by name`
      : Promise.resolve([] as PersonOption[]),
  ]);

  const counts = { all: all.length, active: all.filter((p) => p.status === "active").length, closed: all.filter((p) => p.status === "closed").length };
  const tab = status === "active" || status === "closed" ? status : "all";
  const projects = tab === "all" ? all : all.filter((p) => p.status === tab);
  const live = all.filter((p) => p.status === "active");
  const totals = live.reduce(
    (t, p) => ({ accounts: t.accounts + p.accounts, followers: t.followers + Number(p.followers), posts: t.posts + p.posts, views: t.views + Number(p.views) }),
    { accounts: 0, followers: 0, posts: 0, views: 0 },
  );
  const maxFollowers = Math.max(1, ...projects.map((p) => Number(p.followers)));
  const link = (patch: Record<string, string>) => {
    const s = new URLSearchParams({ q, owner: owner ?? "", status: tab, ...patch });
    for (const [k, v] of [...s.entries()]) if (!v || (k === "status" && v === "all")) s.delete(k);
    const qs = s.toString();
    return qs ? `/projects?${qs}` : "/projects";
  };
  const filtered = !!(q || owner);

  return (
    <div className="shell">
      <div className="page-head">
        <div>
          <div className="eyebrow">{isSuper ? "All workspaces" : user.role === "admin" ? "Your workspace" : "Your access"}</div>
          <h1>{isSuper ? "All projects" : "My projects"}</h1>
          <p className="page-sub">
            {isSuper
              ? "Every client project in SMC. Create one for an admin or keep it for the super admins, open any project, and filter by owner."
              : user.role === "admin"
                ? "The projects you own. Only you, the users you give access to and the super admins can see them."
                : "The projects you've been given access to. Open one to work with its accounts."}
          </p>
        </div>
        {isAdminRole(user) && <div className="page-actions"><ProjectFormButton label="New project" admins={admins} isSuper={isSuper} /></div>}
      </div>

      <div className="kpis k5">
        <Kpi label="Active projects" value={counts.active} sub={counts.closed ? `${counts.closed} closed` : "none closed"} />
        <Kpi label="Linked accounts" value={totals.accounts} sub="in active projects" />
        <Kpi label="Total followers" value={fmtCompact(totals.followers)} sub="across accounts" />
        <Kpi label="Posts & reels" value={totals.posts} sub="synced" />
        <Kpi label="Views" value={fmtCompact(totals.views)} sub="all content" />
      </div>

      <div className="card table-card">
        <div className="table-toolbar">
          <div className="tabs" role="tablist">
            {(["all", "active", "closed"] as const).map((t) => (
              <Link key={t} href={link({ status: t })} className={`tab${tab === t ? " on" : ""}`} role="tab" aria-selected={tab === t}>
                {t === "all" ? "All" : t === "active" ? "Active" : "Closed"} <em>{counts[t]}</em>
              </Link>
            ))}
          </div>
          <form method="get" className="toolbar-form" style={{ justifyContent: "flex-end" }}>
            {tab !== "all" && <input type="hidden" name="status" value={tab} />}
            <input name="q" defaultValue={q} placeholder="Search name, brand, company, agency…" aria-label="Search projects" className="search-input" />
            {isSuper && (
              <select name="owner" defaultValue={owner ?? ""} aria-label="Filter by owner">
                <option value="">All owners</option>
                <option value="platform">Super admins</option>
                {admins.map((a) => <option key={a.id} value={a.id}>{a.name || a.email}</option>)}
              </select>
            )}
            <button type="submit" className="secondary">Apply</button>
            {filtered && <Link className="btn ghost" href={link({ q: "", owner: "" })}>Clear</Link>}
          </form>
        </div>

        <div className="table-scroll">
          <table className="perf-table proj-table sticky-first">
            <thead>
              <tr>
                <th>Project</th>{isSuper && <th>Owner</th>}<th className="num">Accounts</th><th>Followers</th><th className="num">Posts</th>
                <th className="num">Views</th><th className="num">Users</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const closed = p.status === "closed";
                const openable = isSuper || !closed;
                const canSettings = !closed && (isSuper || p.mine);
                const sub = [p.brandName, p.companyName, p.agencyName && `via ${p.agencyName}`].filter(Boolean).join(" · ") || p.description;
                const body = (
                  <>
                    <span className="proj-avatar" style={p.brandColor ? { background: p.brandColor } : undefined}>{(p.brandName || p.name).slice(0, 1).toUpperCase()}</span>
                    <span style={{ minWidth: 0 }}>
                      <b>{p.name}</b>
                      <span className="muted">{sub || `Created ${p.createdAt.toLocaleDateString()}`}</span>
                    </span>
                  </>
                );
                return (
                  <tr key={p.id} className={closed ? "row-closed" : undefined}>
                    <td>{openable ? <Link href={`/projects/${p.id}`} className="proj-cell">{body}</Link> : <div className="proj-cell">{body}</div>}</td>
                    {isSuper && (
                      <td>
                        <span className="owner-chip">
                          <span className="me-avatar">{(p.ownerName ?? "S").slice(0, 1).toUpperCase()}</span>
                          <span>{p.ownerName ?? <span className="muted">Super admins</span>}</span>
                        </span>
                      </td>
                    )}
                    <td className="num">{p.accounts}</td>
                    <td>
                      <div className="bar-cell">
                        <span>{fmtCompact(Number(p.followers))}</span>
                        <i style={{ width: `${Math.round((Number(p.followers) / maxFollowers) * 100)}%` }} />
                      </div>
                    </td>
                    <td className="num">{p.posts.toLocaleString()}</td>
                    <td className="num">{fmtCompact(Number(p.views))}</td>
                    <td className="num">{p.members}</td>
                    <td>
                      {closed
                        ? <span className="pill pill-closed" title={p.closedAt ? `Closed ${p.closedAt.toLocaleDateString()}` : undefined}>Closed</span>
                        : <span className="pill pill-active">Active</span>}
                    </td>
                    <td>
                      <div className="row-actions">
                        {openable ? (
                          <>
                            <Link className="btn sm" href={`/projects/${p.id}`}>Open</Link>
                            {canSettings && <Link className="btn secondary sm icon-btn" href={`/projects/${p.id}/settings`} title="Settings" aria-label="Settings"><Icon name="settings" size={16} /></Link>}
                            {isSuper && closed && <Link className="btn secondary sm" href={`/projects/${p.id}/settings`}>Reactivate</Link>}
                            {!closed && <Link className="btn secondary sm icon-btn" href={`/projects/${p.id}/export`} title="Export CSV" aria-label="Export CSV"><Icon name="download" size={16} /></Link>}
                          </>
                        ) : (
                          <span className="muted closed-note">Closed by a super admin</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {projects.length === 0 && (
                <tr>
                  <td colSpan={isSuper ? 9 : 8}>
                    <div className="empty">
                      <span className="empty-ico"><Icon name="folder" size={24} /></span>
                      <b>{filtered ? "No projects match these filters" : tab === "closed" ? "No closed projects" : "No projects yet"}</b>
                      <span className="muted">
                        {isAdminRole(user) ? "Create a project, then connect its Instagram accounts and give your team access." : "Ask your admin to give you access to a project."}
                      </span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export const instant = false;
