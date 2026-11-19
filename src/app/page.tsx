import Link from "next/link";
import { connection } from "next/server";
import { sql } from "@/lib/db";
import type { AccountDoc, PostDoc, ScheduledPostDoc } from "@/lib/models";
import { PERIODS, PERIOD_LABEL, countByPeriod, postsPerDay } from "@/lib/stats";
import { BarChart, BarList, Stat } from "@/components/charts";
import { ThemeToggle } from "@/components/ThemeToggle";

type VideoStat = { accountId: string; videos: number; views: string; reach: string; likes: string; comments: string; shares: string; saves: string };
type PerAccount = { accountId: string; posts: number; reels: number; boosted: number; likes: number; comments: number; lastPost?: Date };

export default async function Dashboard() {
  await connection();
  const [accounts, perAccount, pending, registered, postsCount, reelsCount, dmsCount, perDay, videoStats, topContent, activity] = await Promise.all([
    sql<AccountDoc[]>`select * from accounts`,
    sql<PerAccount[]>`
      select account_id,
        count(*)::int as posts,
        count(*) filter (where media_type = 'REELS')::int as reels,
        count(*) filter (where boosted)::int as boosted,
        coalesce(sum(like_count), 0)::int as likes,
        coalesce(sum(comments_count), 0)::int as comments,
        max("timestamp") as last_post
      from posts where not removed_from_app
      group by account_id`,
    sql<ScheduledPostDoc[]>`select * from scheduled_posts where status = 'pending' order by publish_at limit 10`,
    countByPeriod("accounts", "created_at"),
    countByPeriod("posts", "timestamp", sql`media_type <> 'REELS'`),
    countByPeriod("posts", "timestamp", sql`media_type = 'REELS'`),
    countByPeriod("automation_logs", "created_at", sql`status = 'sent'`),
    postsPerDay(sql`true`, 30),
    // Account-wise video (reel) performance from the per-post metrics saved on each sync.
    sql<VideoStat[]>`
      select account_id,
        count(*)::int as videos,
        coalesce(sum(coalesce((metrics->>'views')::bigint, (metrics->>'plays')::bigint, 0)), 0)::bigint as views,
        coalesce(sum((metrics->>'reach')::bigint), 0)::bigint as reach,
        coalesce(sum(like_count), 0)::bigint as likes,
        coalesce(sum(comments_count), 0)::bigint as comments,
        coalesce(sum((metrics->>'shares')::bigint), 0)::bigint as shares,
        coalesce(sum((metrics->>'saved')::bigint), 0)::bigint as saves
      from posts where not removed_from_app and media_type in ('REELS', 'VIDEO')
      group by account_id`,
    sql<(PostDoc & { username: string })[]>`
      select p.*, a.username from posts p join accounts a on a.id = p.account_id
      where not p.removed_from_app
      order by coalesce((p.metrics->>'views')::bigint, (p.metrics->>'plays')::bigint, p.like_count + p.comments_count) desc nulls last
      limit 8`,
    sql<{ accountId: string; dms: number; inbox: number; automations: number; views: string }[]>`
      select a.id as account_id,
        (select count(*)::int from automation_logs l where l.account_id = a.id and l.status = 'sent') as dms,
        (select count(*)::int from messages m where m.account_id = a.id and m.direction = 'in') as inbox,
        (select count(*)::int from automations x where x.account_id = a.id and x.enabled) as automations,
        (select coalesce(sum(coalesce((p.metrics->>'views')::bigint, (p.metrics->>'plays')::bigint, 0)), 0)::bigint
           from posts p where p.account_id = a.id and not p.removed_from_app) as views
      from accounts a`,
  ]);

  const stats = new Map(perAccount.map((s) => [s.accountId, s]));
  const actById = new Map(activity.map((x) => [x.accountId, x]));
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const sum = (f: (s: PerAccount) => number) => perAccount.reduce((t, s) => t + f(s), 0);
  const totalFollowers = accounts.reduce((t, a) => t + (a.followersCount ?? 0), 0);
  const [{ n: scheduledTotal }] = await sql<{ n: number }[]>`select count(*)::int as n from scheduled_posts where status = 'pending'`;

  const engagement = (a: AccountDoc) => {
    const s = stats.get(a.id);
    if (!s || !s.posts || !a.followersCount) return "–";
    return `${(((s.likes + s.comments) / s.posts / a.followersCount) * 100).toFixed(2)}%`;
  };

  const connectUrl = `${process.env.APP_URL}/api/auth/instagram`;
  const waText = `Please connect your Instagram account to our analytics app. Open this link and approve access: ${connectUrl}`;

  return (
    <>
      <div className="page-head">
        <h1>Dashboard</h1>
        <div className="spacer" />
        <a className="btn secondary" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(waText)}`}>
          Share link on WhatsApp
        </a>
        <a className="btn" href="/api/auth/instagram">+ Connect Instagram</a>
        <ThemeToggle />
        <form method="post" action="/api/auth/logout">
          <button type="submit" className="secondary">Log out</button>
        </form>
      </div>

      <div className="grid">
        <Stat label="Connected accounts" value={accounts.length} />
        <Stat label="Total followers" value={totalFollowers} />
        <Stat label="Posts" value={sum((s) => s.posts - s.reels)} />
        <Stat label="Reels" value={sum((s) => s.reels)} />
        <Stat label="Boosted posts / reels" value={sum((s) => s.boosted)} hint="Detected from your Meta ad accounts" />
        <Stat label="Scheduled (pending)" value={scheduledTotal} />
      </div>

      <h2>Accounts ({accounts.length})</h2>
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="perf-table accounts-table">
          <thead>
            <tr>
              <th>Account</th><th>Followers</th><th>Following</th><th>Posts</th><th>Reels</th><th>Views</th>
              <th>Likes</th><th>Comments</th><th>Engagement</th><th>Auto-DMs</th><th>Inbox</th><th>Last post</th><th>Synced</th><th></th>
            </tr>
          </thead>
          <tbody>
            {[...accounts]
              .sort((a, b) => (b.followersCount ?? 0) - (a.followersCount ?? 0))
              .map((a) => {
                const s = stats.get(a.id);
                const act = actById.get(a.id);
                return (
                  <tr key={a.id}>
                    <td>
                      <Link href={`/accounts/${a.id}`} className="acct-cell">
                        {a.profilePictureUrl ? <img className="avatar" src={a.profilePictureUrl} alt="" /> : <span className="avatar" />}
                        <span>
                          <b>@{a.username}</b>
                          {a.name && <span className="muted">{a.name}</span>}
                        </span>
                      </Link>
                    </td>
                    <td>{(a.followersCount ?? 0).toLocaleString()}</td>
                    <td>{(a.followsCount ?? 0).toLocaleString()}</td>
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
                        <Link className="btn" href={`/accounts/${a.id}`}>Open</Link>
                        <Link className="btn secondary" href={`/accounts/${a.id}/messages`} title="Messages">💬</Link>
                        <Link className="btn secondary" href={`/accounts/${a.id}/automations`} title={`Automations (${act?.automations ?? 0} active)`}>⚡</Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            {accounts.length === 0 && <tr><td colSpan={14} className="muted">No accounts connected yet. Use “+ Connect Instagram”.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2>Activity by day</h2>
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="period-table">
          <thead>
            <tr><th>Metric</th>{PERIODS.map((p) => <th key={p}>{PERIOD_LABEL[p]}</th>)}</tr>
          </thead>
          <tbody>
            <PeriodRow label="New accounts connected" values={registered} />
            <PeriodRow label="Posts published" values={postsCount} />
            <PeriodRow label="Reels published" values={reelsCount} />
            <PeriodRow label="Auto DMs sent" values={dmsCount} />
          </tbody>
        </table>
      </div>

      <h2>Charts</h2>
      <div className="charts-2">
        <BarChart title="Posts & reels published per day (30 days)" points={perDay} valueLabel="Posts" />
        <BarList
          title="Followers by account"
          points={accounts.map((a) => ({ label: a.username, value: a.followersCount ?? 0 })).sort((a, b) => b.value - a.value)}
          empty="No users connected yet."
        />
      </div>

      <h2>🎬 Account-wise video performance</h2>
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="perf-table">
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
                    <td><Link href={`/accounts/${v.accountId}#content`} style={{ fontWeight: 600 }}>@{a?.username ?? "unknown"}</Link></td>
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

      <h2>🏆 Top-performing content (all accounts)</h2>
      <div className="card">
        {topContent.length === 0 && <div className="muted">No posts synced yet.</div>}
        <div className="top-grid">
          {topContent.map((p, i) => (
            <Link key={p.id} href={`/posts/${p.id}`} className="top-card">
              <div className="top-media">
                {p.thumbnailUrl || p.mediaUrl ? <img src={p.thumbnailUrl || p.mediaUrl || undefined} alt="" /> : null}
                <span className="top-rank">#{i + 1}</span>
                {p.mediaType === "REELS" && <span className="tile-badge">▶</span>}
              </div>
              <div className="top-stats">
                <b style={{ width: "100%" }}>@{p.username}</b>
                <span>▶ {(p.metrics?.views ?? p.metrics?.plays ?? 0).toLocaleString()}</span>
                <span>♥ {p.likeCount.toLocaleString()}</span>
                <span>💬 {p.commentsCount.toLocaleString()}</span>
                <span>↗ {(p.metrics?.shares ?? 0).toLocaleString()}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <h2>Scheduled posts & reels</h2>
      <div className="card">
        {pending.length === 0 && <div className="muted">Nothing scheduled.</div>}
        {pending.map((s) => {
          const a = byId.get(s.accountId.toString());
          return (
            <div key={s.id} className="list-row">
              <span className="badge pending">{s.mediaType === "REELS" ? "Reel" : "Post"}</span>
              <Link href={`/accounts/${s.accountId}/scheduled`} style={{ fontWeight: 600 }}>@{a?.username ?? "unknown"}</Link>
              <span className="muted" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.caption || "(no caption)"}</span>
              <span>{s.publishAt.toLocaleString()}</span>
            </div>
          );
        })}
      </div>

    </>
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
