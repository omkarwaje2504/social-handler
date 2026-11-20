import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { canManageProject, isSuper, requireAccess, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { encodeHash, toPublic } from "@/lib/hash";
import type { AccountDoc, PostDoc, ScheduledPostDoc } from "@/lib/models";
import { ACCOUNT_TYPES, accountTypeOf } from "@/lib/account-types";
import { PERIODS, PERIOD_LABEL, countByPeriod, postsPerDay } from "@/lib/stats";
import { BarList, ColumnChart, Kpi, TrendChart } from "@/components/charts";
import { fmtCompact } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { contentPerWeek, followerTrend } from "@/lib/dashboard";
import { AccountMeta, CopyLink, ProjectPeople, type Candidate, type Member } from "@/components/ProjectPeople";

type VideoStat = { accountId: number; videos: number; views: string; reach: string; likes: string; comments: string; shares: string; saves: string };
type PerAccount = { accountId: number; posts: number; reels: number; boosted: number; likes: number; comments: number; lastPost?: Date };
type Project = {
  id: number; name: string; description: string; status: string; connectToken: string;
  agencyName: string; companyName: string; brandName: string; brandColor: string; closedAt: Date | null; closedReason: string;
  ownerId: number | null; ownerName: string | null;
};
type Acc = AccountDoc & { accountType: string; designation: string };

// One project: its linked social accounts, analytics across them, and who has access.
// "/projects/unassigned" (super admin only) lists accounts that belong to no project.
export default async function ProjectPage({ params }: { params: Promise<{ pid: string }> }) {
  await connection();
  // code: the project's code from the URL (used in links); pid: its integer id (used in queries).
  const { pid: code } = await params;
  const unassigned = code === "unassigned";
  const { user, id: pid } = unassigned ? { user: await requireUser(), id: 0 } : await requireAccess("project", code);
  if (unassigned && !isSuper(user)) notFound();

  const [project] = unassigned
    ? [{ id: 0, name: "Accounts without a project", description: "Move each account into a project.", status: "active", connectToken: "", agencyName: "", companyName: "", brandName: "", brandColor: "", closedAt: null, closedReason: "", ownerId: null, ownerName: null } as Project]
    : await sql<Project[]>`select p.id, p.name, p.description, p.status, p.connect_token, p.owner_id, (select coalesce(nullif(u.name, ''), u.email) from users u where u.id = p.owner_id) as owner_name, coalesce((select name from orgs o where o.id = p.agency_id), '') as agency_name, coalesce((select name from orgs o where o.id = p.company_id), '') as company_name, coalesce((select name from orgs o where o.id = p.brand_id), '') as brand_name, p.brand_color, p.closed_at, p.closed_reason from projects p where p.id = ${pid}`;
  if (!project) notFound();
  const canManage = unassigned || (await canManageProject(user, pid));
  const closed = project.status === "closed";

  const accounts = await sql<Acc[]>`
    select * from accounts where ${unassigned ? sql`project_id is null` : sql`project_id = ${pid}`}`;
  const ids = accounts.map((a) => a.id);
  const inAcc = sql`account_id = any(${ids}::int[])`;

  const [perAccount, pending, registered, postsCount, reelsCount, dmsCount, perDay, videoStats, topContent, activity, [{ n: scheduledTotal }]] = await Promise.all([
    sql<PerAccount[]>`
      select account_id,
        count(*)::int as posts,
        count(*) filter (where media_type = 'REELS')::int as reels,
        count(*) filter (where boosted)::int as boosted,
        coalesce(sum(like_count), 0)::int as likes,
        coalesce(sum(comments_count), 0)::int as comments,
        max("timestamp") as last_post
      from posts where not removed_from_app and ${inAcc}
      group by account_id`,
    sql<ScheduledPostDoc[]>`select * from scheduled_posts where status = 'pending' and ${inAcc} order by publish_at limit 10`,
    countByPeriod("accounts", "created_at", sql`id = any(${ids}::int[])`),
    countByPeriod("posts", "timestamp", sql`media_type <> 'REELS' and ${inAcc}`),
    countByPeriod("posts", "timestamp", sql`media_type = 'REELS' and ${inAcc}`),
    countByPeriod("automation_logs", "created_at", sql`status = 'sent' and ${inAcc}`),
    postsPerDay(inAcc, 30),
    sql<VideoStat[]>`
      select account_id,
        count(*)::int as videos,
        coalesce(sum(coalesce((metrics->>'views')::bigint, (metrics->>'plays')::bigint, 0)), 0)::bigint as views,
        coalesce(sum((metrics->>'reach')::bigint), 0)::bigint as reach,
        coalesce(sum(like_count), 0)::bigint as likes,
        coalesce(sum(comments_count), 0)::bigint as comments,
        coalesce(sum((metrics->>'shares')::bigint), 0)::bigint as shares,
        coalesce(sum((metrics->>'saved')::bigint), 0)::bigint as saves
      from posts where not removed_from_app and media_type in ('REELS', 'VIDEO') and ${inAcc}
      group by account_id`,
    sql<(PostDoc & { username: string })[]>`
      select p.*, a.username from posts p join accounts a on a.id = p.account_id
      where not p.removed_from_app and p.account_id = any(${ids}::int[])
      order by coalesce((p.metrics->>'views')::bigint, (p.metrics->>'plays')::bigint, p.like_count + p.comments_count) desc nulls last
      limit 8`,
    sql<{ accountId: number; dms: number; inbox: number; automations: number; views: string }[]>`
      select a.id as account_id,
        (select count(*)::int from automation_logs l where l.account_id = a.id and l.status = 'sent') as dms,
        (select count(*)::int from messages m where m.account_id = a.id and m.direction = 'in') as inbox,
        (select count(*)::int from automations x where x.account_id = a.id and x.enabled) as automations,
        (select coalesce(sum(coalesce((p.metrics->>'views')::bigint, (p.metrics->>'plays')::bigint, 0)), 0)::bigint
           from posts p where p.account_id = a.id and not p.removed_from_app) as views
      from accounts a where a.id = any(${ids}::int[])`,
    sql<{ n: number }[]>`select count(*)::int as n from scheduled_posts where status = 'pending' and ${inAcc}`,
  ]);

  // People: members of this project, and who could be added.
  const [members, candidates, movable] = await Promise.all([
    unassigned ? Promise.resolve([] as Member[]) : sql<Member[]>`
      select u.hash as user_id, u.name, u.email, u.designation, u.role as user_role, m.role as member_role
      from project_members m join users u on u.id = m.user_id
      where m.project_id = ${pid} order by m.role, u.name`,
    // Who can be added: users only. A super admin sees everyone who fits the project's workspace
    // (the owner's team or people created by super admins); an owner sees their own team.
    !canManage || unassigned ? Promise.resolve([] as Candidate[]) : isSuper(user)
      ? sql<Candidate[]>`
          select u.hash as id, u.name, u.email, u.designation, u.role from users u left join users c on c.id = u.created_by
          where u.active and u.role = 'user'
            and not exists (select 1 from project_members m where m.project_id = ${pid} and m.user_id = u.id)
            and (${project.ownerId}::int is null or c.role is distinct from 'admin' or u.created_by = ${project.ownerId})
          order by u.name`
      : sql<Candidate[]>`
          select distinct u.hash as id, u.name, u.email, u.designation, u.role from users u
          where u.active and u.role = 'user'
            and not exists (select 1 from project_members m where m.project_id = ${pid} and m.user_id = u.id)
            and u.created_by = ${user.id}
          order by u.name`,
    // Projects an account can be moved into: the ones this person manages.
    !canManage ? Promise.resolve([] as { id: string; name: string }[]) : isSuper(user)
      ? sql<{ id: string; name: string }[]>`select hash as id, name from projects where status = 'active' order by name`
      : sql<{ id: string; name: string }[]>`select hash as id, name from projects where owner_id = ${user.id} and status = 'active' order by name`,
  ]);
  const [trend, weekly] = await Promise.all([followerTrend(ids, 30), contentPerWeek(ids, 12)]);

  const stats = new Map(perAccount.map((s) => [s.accountId, s]));
  const actById = new Map(activity.map((x) => [x.accountId, x]));
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const sum = (f: (s: PerAccount) => number) => perAccount.reduce((t, s) => t + f(s), 0);
  const totalFollowers = accounts.reduce((t, a) => t + (a.followersCount ?? 0), 0);

  const engagement = (a: AccountDoc) => {
    const s = stats.get(a.id);
    if (!s || !s.posts || !a.followersCount) return "–";
    return `${(((s.likes + s.comments) / s.posts / a.followersCount) * 100).toFixed(2)}%`;
  };

  const shareUrl = project.connectToken ? `${process.env.APP_URL}/api/auth/instagram?p=${project.connectToken}` : "";
  const waText = `Please connect your Instagram account to ${project.name} on SMC. Open this link and approve access: ${shareUrl}`;
  const movableProjects = unassigned ? movable : movable.some((p) => p.id === code) ? movable : [{ id: code, name: project.name }, ...movable];

  return (
    <div className="shell">

      <div className="crumbs"><Link href="/projects">Projects</Link> <Icon name="chevronRight" size={14} /> <span>{project.name}</span></div>
      <div className="page-head">
        <div className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start", gap: 14 }}>
          <span className="proj-avatar lg" style={project.brandColor ? { background: project.brandColor } : undefined}>{(project.brandName || project.name).slice(0, 1).toUpperCase()}</span>
          <div style={{ minWidth: 0 }}>
            <h1>{project.name} {closed ? <span className="pill pill-closed">Closed</span> : !unassigned && <span className="pill pill-active">Active</span>}</h1>
            <p className="page-sub">
              {[project.brandName, project.companyName, project.agencyName && `via ${project.agencyName}`].filter(Boolean).join(" · ") || project.description || "No description"}
              {!unassigned && <> · Owner: <b>{project.ownerName ?? "Super admins"}</b></>}
            </p>
          </div>
        </div>
        {!unassigned && (
          <div className="page-actions">
            <Link className="btn secondary" href={`/projects/${code}/export`}><Icon name="download" size={16} />Export</Link>
            {canManage && (
              <>
                <CopyLink url={shareUrl} />
                <a className="btn secondary" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(waText)}`}><Icon name="send" size={16} />WhatsApp</a>
                <Link className="btn secondary icon-only" href={`/projects/${code}/settings`} title="Settings" aria-label="Settings"><Icon name="settings" size={17} /></Link>
              </>
            )}
            <a className="btn" href={`/api/auth/instagram?project=${code}`}><Icon name="plus" size={16} />Connect Instagram</a>
          </div>
        )}
      </div>

      {closed && (
        <div className="closed-banner">
          <Icon name="lock" size={16} /><span><b>This project is closed.</b> Its owner and users can&apos;t open it{project.closedAt ? ` (since ${project.closedAt.toLocaleDateString()})` : ""}.
          {project.closedReason && <> Reason: {project.closedReason}.</>}{" "}
          <Link href={`/projects/${code}/settings`}>Reactivate in settings</Link></span>
        </div>
      )}

      <div className="kpis k6">
        <Kpi label="Linked accounts" value={accounts.length} />
        <Kpi label="Total followers" value={totalFollowers} delta={trend.delta7} sub={trend.delta7 == null ? "change shows after a week of syncs" : "in 7 days"} spark={trend.values.slice(-14)} />
        <Kpi label="Posts" value={sum((s) => s.posts - s.reels)} />
        <Kpi label="Reels" value={sum((s) => s.reels)} />
        <Kpi label="Boosted posts / reels" value={sum((s) => s.boosted)} hint="Detected from your Meta ad accounts" />
        <Kpi label="Scheduled" value={scheduledTotal} sub="waiting to publish" />
      </div>

      <div className="section-title"><h2>Linked accounts</h2><span className="muted">{accounts.length} account{accounts.length === 1 ? "" : "s"}</span></div>
      <div className="card table-card">
        <div className="table-scroll">
        <table className="perf-table accounts-table sticky-first">
          <thead>
            <tr>
              <th>Account</th><th>Type</th><th>Followers</th><th>Posts</th><th>Reels</th><th>Views</th>
              <th>Likes</th><th>Comments</th><th>Engagement</th><th>Auto-DMs</th><th>Inbox</th><th>Last post</th><th>Synced</th><th></th>
            </tr>
          </thead>
          <tbody>
            {[...accounts]
              .sort((a, b) => (b.followersCount ?? 0) - (a.followersCount ?? 0))
              .map((a) => {
                const s = stats.get(a.id);
                const act = actById.get(a.id);
                const type = accountTypeOf(a.accountType);
                return (
                  <tr key={a.id}>
                    <td>
                      <Link href={`/accounts/${a.hash}`} className="acct-cell">
                        {a.profilePictureUrl ? <img className="avatar" src={a.profilePictureUrl} alt="" /> : <span className="avatar" />}
                        <span>
                          <b><img src={type.icon} alt={type.label} title={type.label} className="type-ico" />@{a.username}</b>
                          {a.name && <span className="muted">{a.name}</span>}
                        </span>
                      </Link>
                    </td>
                    <td>
                      {canManage ? (
                        <AccountMeta projectId={code} accountId={a.hash} accountType={a.accountType}
                          types={ACCOUNT_TYPES.map((t) => ({ key: t.key, label: t.label }))} projects={movableProjects} />
                      ) : (
                        <span>{type.label}</span>
                      )}
                    </td>
                    <td>{(a.followersCount ?? 0).toLocaleString()}</td>
                    <td>{((s?.posts ?? 0) - (s?.reels ?? 0)).toLocaleString()}</td>
                    <td>{(s?.reels ?? 0).toLocaleString()}</td>
                    <td>{Number(act?.views ?? 0).toLocaleString()}</td>
                    <td>{(s?.likes ?? 0).toLocaleString()}</td>
                    <td>{(s?.comments ?? 0).toLocaleString()}</td>
                    <td>{engagement(a)}</td>
                    <td>{(act?.dms ?? 0).toLocaleString()}</td>
                    <td>{(act?.inbox ?? 0).toLocaleString()}</td>
                    <td>{s?.lastPost ? s.lastPost.toLocaleDateString() : "–"}</td>
                    <td>{a.lastSyncedAt ? a.lastSyncedAt.toLocaleDateString() : "never"}</td>
                    <td>
                      <div className="row" style={{ gap: 6, flexWrap: "nowrap", justifyContent: "flex-end" }}>
                        <Link className="btn sm" href={`/accounts/${a.hash}`}>Open</Link>
                        <Link className="btn secondary sm icon-btn" href={`/accounts/${a.hash}/messages`} title="Messages" aria-label="Messages"><Icon name="message" size={16} /></Link>
                        <Link className="btn secondary sm icon-btn" href={`/accounts/${a.hash}/automations`} title={`Automations (${act?.automations ?? 0} active)`} aria-label="Automations"><Icon name="zap" size={16} /></Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            {accounts.length === 0 && (
              <tr><td colSpan={14}>
                <div className="empty">
                  <span className="empty-ico"><Icon name="instagram" size={24} /></span>
                  <b>{unassigned ? "Every account belongs to a project" : "No accounts linked yet"}</b>
                  {!unassigned && <span className="muted">Use “Connect Instagram”, or send the account owner the connect link (copy it from the buttons above).</span>}
                </div>
              </td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {!unassigned && (
        <ProjectPeople projectId={code} members={members} candidates={candidates} canManage={canManage}
          meId={user.hash} ownerName={project.ownerName} />
      )}

      {accounts.length > 0 && (
        <>
          <div className="dash-grid" style={{ marginTop: 16 }}>
            <section className="panel span-8">
              <div className="panel-body">
                <TrendChart title="Follower growth" subtitle="All accounts in this project, last 30 days" labels={trend.labels}
                  series={[{ name: "Followers", values: trend.values }]} hero={fmtCompact(totalFollowers)}
                  empty="Follower history builds up from the daily sync; check back tomorrow." />
              </div>
            </section>
            <section className="panel span-4">
              <div className="panel-body">
                <BarList bare title="Followers by account" subtitle="Share of the project's audience"
                  points={accounts.map((a) => ({ label: `@${a.username}`, value: a.followersCount ?? 0 }))} empty="No accounts linked yet." />
              </div>
            </section>
          </div>
          <div className="dash-grid">
            <section className="panel span-8">
              <div className="panel-body">
                <ColumnChart title="Content published per week" subtitle="Posts and reels, last 12 weeks" labels={weekly.labels}
                  series={[{ name: "Posts", values: weekly.posts }, { name: "Reels", values: weekly.reels }]} empty="Nothing published in the last 12 weeks." />
              </div>
            </section>
            <section className="panel span-4">
              <div className="panel-head"><div><h3>Activity by day</h3><p>Counts per period</p></div></div>
              <div className="panel-body" style={{ paddingTop: 8 }}>
            <div className="table-scroll"><table className="period-table">
              <thead>
                <tr><th>Metric</th>{PERIODS.map((p) => <th key={p}>{PERIOD_LABEL[p]}</th>)}</tr>
              </thead>
              <tbody>
                <PeriodRow label="New accounts connected" values={registered} />
                <PeriodRow label="Posts published" values={postsCount} />
                <PeriodRow label="Reels published" values={reelsCount} />
                <PeriodRow label="Auto DMs sent" values={dmsCount} />
              </tbody>
            </table></div>
              </div>
            </section>
          </div>

          <div className="section-title"><h2>Video performance by account</h2></div>
          <div className="card table-card">
            <div className="table-scroll">
            <table className="perf-table sticky-first">
              <thead>
                <tr><th>Account</th><th>Followers</th><th>Videos</th><th>Views</th><th>Avg views / video</th><th>Reach</th><th>Likes</th><th>Comments</th><th>Shares</th><th>Saves</th><th>Engagement / video</th></tr>
              </thead>
              <tbody>
                {[...videoStats]
                  .sort((a, b) => Number(b.views) - Number(a.views))
                  .map((v) => {
                    const a = byId.get(v.accountId);
                    const eng = Number(v.likes) + Number(v.comments) + Number(v.shares) + Number(v.saves);
                    return (
                      <tr key={v.accountId}>
                        <td><Link href={`/accounts/${encodeHash("accounts", v.accountId)}#content`} style={{ fontWeight: 600 }}>@{a?.username ?? "unknown"}</Link></td>
                        <td>{(a?.followersCount ?? 0).toLocaleString()}</td>
                        <td>{v.videos}</td>
                        <td>{Number(v.views).toLocaleString()}</td>
                        <td>{v.videos ? Math.round(Number(v.views) / v.videos).toLocaleString() : "–"}</td>
                        <td>{Number(v.reach).toLocaleString()}</td>
                        <td>{Number(v.likes).toLocaleString()}</td>
                        <td>{Number(v.comments).toLocaleString()}</td>
                        <td>{Number(v.shares).toLocaleString()}</td>
                        <td>{Number(v.saves).toLocaleString()}</td>
                        <td><b>{v.videos ? Math.round(eng / v.videos).toLocaleString() : "–"}</b></td>
                      </tr>
                    );
                  })}
                {videoStats.length === 0 && <tr><td colSpan={11} className="muted">No videos synced yet.</td></tr>}
              </tbody>
            </table>
            </div>
          </div>

          <div className="section-title"><h2>Top-performing content</h2></div>
          <div className="card">
            {topContent.length === 0 && <div className="muted">No posts synced yet.</div>}
            <div className="top-grid">
              {topContent.map((p, i) => (
                <Link key={p.id} href={`/posts/${p.hash}`} className="top-card">
                  <div className="top-media">
                    {p.thumbnailUrl || p.mediaUrl ? <img src={p.thumbnailUrl || p.mediaUrl || undefined} alt="" /> : null}
                    <span className="top-rank">#{i + 1}</span>
                    {p.mediaType === "REELS" && <span className="tile-badge">▶</span>}
                  </div>
                  <div className="top-stats">
                    <b style={{ width: "100%" }}>@{p.username}</b>
                    <span title="Views">{fmtCompact(p.metrics?.views ?? p.metrics?.plays ?? 0)} views</span>
                    <span title="Likes">{fmtCompact(p.likeCount)} likes</span>
                    <span title="Comments">{fmtCompact(p.commentsCount)} comments</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="section-title"><h2>Scheduled posts &amp; reels</h2></div>
          <div className="card">
            {pending.length === 0 && <div className="muted">Nothing scheduled.</div>}
            {pending.map((s) => {
              const a = byId.get(s.accountId);
              return (
                <div key={s.id} className="list-row">
                  <span className="badge pending">{s.mediaType === "REELS" ? "Reel" : "Post"}</span>
                  <Link href={`/accounts/${encodeHash("accounts", s.accountId)}/scheduled`} style={{ fontWeight: 600 }}>@{a?.username ?? "unknown"}</Link>
                  <span className="muted" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.caption || "(no caption)"}</span>
                  <span>{s.publishAt.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function PeriodRow({ label, values }: { label: string; values: Record<string, number | null> }) {
  return (
    <tr>
      <td>{label}</td>
      {PERIODS.map((p) => <td key={p}>{values[p] == null ? "–" : values[p]!.toLocaleString()}</td>)}
    </tr>
  );
}

export const instant = false;
