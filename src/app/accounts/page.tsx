import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { projectIdsFor, requireUser, scopeSql } from "@/lib/auth";
import { sql } from "@/lib/db";
import { decodeHash } from "@/lib/hash";
import { ACCOUNT_TYPES, accountTypeOf } from "@/lib/account-types";
import { Icon } from "@/components/Icon";

export const metadata: Metadata = { title: "Accounts" };

type Row = {
  id: number; hash: string; username: string; name: string | null; profilePictureUrl: string | null; accountType: string; designation: string;
  projectId: number | null; projectHash: string | null; projectName: string | null; followersCount: number | null; followsCount: number | null;
  posts: number; reels: number; views: string; likes: string; comments: string; dms: number; inbox: number; lastSyncedAt: Date | null;
};

const SORTS: Record<string, { label: string; key: (r: Row) => number | string }> = {
  followers: { label: "Followers", key: (r) => r.followersCount ?? 0 },
  views: { label: "Views", key: (r) => Number(r.views) },
  posts: { label: "Posts", key: (r) => r.posts },
  engagement: { label: "Engagement rate", key: (r) => rate(r) },
  dms: { label: "Auto-DMs", key: (r) => r.dms },
  name: { label: "Name", key: (r) => r.username.toLowerCase() },
  project: { label: "Project", key: (r) => (r.projectName ?? "").toLowerCase() },
};

function rate(r: Row) {
  const n = r.posts + r.reels;
  return n && r.followersCount ? ((Number(r.likes) + Number(r.comments)) / n / r.followersCount) * 100 : 0;
}

// Every linked social account this person can open, across their projects, as one sortable table.
export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; project?: string; type?: string; sort?: string; dir?: string }>;
}) {
  await connection();
  const user = await requireUser();
  const { q = "", project = "", type = "", sort = "followers", dir = "desc" } = await searchParams;
  const ids = await projectIdsFor(user);

  const filters = sql`
    ${project === "none" ? sql`and a.project_id is null` : decodeHash("projects", project) ? sql`and a.project_id = ${decodeHash("projects", project)}` : sql``}
    ${ACCOUNT_TYPES.some((t) => t.key === type) ? sql`and a.account_type = ${type}` : sql``}
    ${q.trim() ? sql`and (a.username ilike ${"%" + q.trim() + "%"} or a.name ilike ${"%" + q.trim() + "%"} or a.designation ilike ${"%" + q.trim() + "%"})` : sql``}`;

  const [rows, projects] = await Promise.all([
    sql<Row[]>`
      select a.id, a.hash, a.username, a.name, a.profile_picture_url, a.account_type, a.designation, a.project_id, p.hash as project_hash, p.name as project_name,
        a.followers_count, a.follows_count, a.last_synced_at,
        count(x.id) filter (where x.media_type <> 'REELS')::int as posts,
        count(x.id) filter (where x.media_type = 'REELS')::int as reels,
        coalesce(sum(coalesce((x.metrics->>'views')::bigint, (x.metrics->>'plays')::bigint, 0)), 0)::bigint as views,
        coalesce(sum(x.like_count), 0)::bigint as likes,
        coalesce(sum(x.comments_count), 0)::bigint as comments,
        (select count(*)::int from automation_logs l where l.account_id = a.id and l.status = 'sent') as dms,
        (select count(*)::int from messages m where m.account_id = a.id and m.direction = 'in') as inbox
      from accounts a
      left join projects p on p.id = a.project_id
      left join posts x on x.account_id = a.id and not x.removed_from_app
      where ${scopeSql(ids, "a.project_id")} ${filters}
      group by a.id, p.name, p.hash`,
    sql<{ hash: string; name: string }[]>`select p.hash, p.name from projects p where ${scopeSql(ids, "p.id")} order by p.name`,
  ]);

  const s = SORTS[sort] ?? SORTS.followers;
  const d = dir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    const x = s.key(a), y = s.key(b);
    return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * d;
  });

  // Column headers that sort the table (click again to flip the direction).
  const qs = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ q, project, type, sort, dir, ...patch });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `/accounts?${p}`;
  };
  const Th = ({ k, children }: { k: string; children: React.ReactNode }) => (
    <th>
      <Link href={qs({ sort: k, dir: sort === k && dir === "desc" ? "asc" : "desc" })} className={`th-sort${sort === k ? " on" : ""}`}>
        {children}{sort === k ? (dir === "asc" ? " ↑" : " ↓") : ""}
      </Link>
    </th>
  );

  const totalFollowers = rows.reduce((t, r) => t + (r.followersCount ?? 0), 0);

  return (
    <div className="shell">
      <div className="page-head">
        <div>
          <h1>Accounts</h1>
          <div className="muted">{rows.length} linked account{rows.length === 1 ? "" : "s"} · {totalFollowers.toLocaleString()} followers in total</div>
        </div>
      </div>

      <form className="card filters" method="get">
        <input name="q" defaultValue={q} placeholder="Search username, name, designation…" aria-label="Search accounts" />
        <select name="project" defaultValue={project} aria-label="Project">
          <option value="">All projects</option>
          {projects.map((p) => <option key={p.hash} value={p.hash}>{p.name}</option>)}
          {user.role === "super_admin" && <option value="none">No project</option>}
        </select>
        <select name="type" defaultValue={type} aria-label="Account type">
          <option value="">All types</option>
          {ACCOUNT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <input type="hidden" name="sort" value={sort} />
        <input type="hidden" name="dir" value={dir} />
        <button type="submit">Filter</button>
        {(q || project || type) && <Link className="btn secondary" href="/accounts">Clear</Link>}
      </form>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="perf-table accounts-table">
          <thead>
            <tr>
              <Th k="name">Account</Th><Th k="project">Project</Th><th>Type</th><th>Designation</th>
              <Th k="followers">Followers</Th><Th k="posts">Posts</Th><th>Reels</th><Th k="views">Views</Th>
              <Th k="engagement">Engagement</Th><Th k="dms">Auto-DMs</Th><th>Inbox</th><th>Synced</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const t = accountTypeOf(a.accountType);
              const r = rate(a);
              return (
                <tr key={a.id}>
                  <td>
                    <Link href={`/accounts/${a.hash}`} className="acct-cell">
                      {a.profilePictureUrl ? <img className="avatar" src={a.profilePictureUrl} alt="" /> : <span className="avatar" />}
                      <span><b>@{a.username}</b>{a.name && <span className="muted">{a.name}</span>}</span>
                    </Link>
                  </td>
                  <td>{a.projectId ? <Link href={`/projects/${a.projectHash}`}>{a.projectName}</Link> : <Link href="/projects/unassigned" className="muted">none</Link>}</td>
                  <td style={{ whiteSpace: "nowrap" }}><img src={t.icon} alt="" className="type-ico" />{t.label}</td>
                  <td>{a.designation || "–"}</td>
                  <td>{(a.followersCount ?? 0).toLocaleString()}</td>
                  <td>{a.posts.toLocaleString()}</td>
                  <td>{a.reels.toLocaleString()}</td>
                  <td>{Number(a.views).toLocaleString()}</td>
                  <td>{r ? `${r.toFixed(2)}%` : "–"}</td>
                  <td>{a.dms.toLocaleString()}</td>
                  <td>{a.inbox.toLocaleString()}</td>
                  <td>{a.lastSyncedAt ? a.lastSyncedAt.toLocaleDateString() : "never"}</td>
                  <td>
                    <div className="row" style={{ gap: 6, flexWrap: "nowrap", justifyContent: "flex-end" }}>
                      <Link className="btn" href={`/accounts/${a.hash}`}>Open</Link>
                      <Link className="btn secondary sm icon-btn" href={`/accounts/${a.hash}/messages`} title="Messages" aria-label="Messages"><Icon name="message" size={16} /></Link>
                      <Link className="btn secondary sm icon-btn" href={`/accounts/${a.hash}/automations`} title="Automations" aria-label="Automations"><Icon name="zap" size={16} /></Link>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={13} className="muted">No accounts match. Connect accounts from inside a project.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const instant = false;
