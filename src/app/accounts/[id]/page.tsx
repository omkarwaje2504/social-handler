import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { sql } from "@/lib/db";
import type { AccountDoc, PostDoc, ScheduledPostDoc } from "@/lib/models";
import { accountTotals, dailySeries, demographics } from "@/lib/insights";
import { PERIODS, PERIOD_LABEL, countByPeriod, postsPerMonth, snapshotDeltas, snapshotSeries } from "@/lib/stats";
import { BarChart, BarList, LineChart, Stat } from "@/components/charts";
import { SyncButton } from "@/components/SyncButton";
import { AccountActions } from "@/components/AccountActions";
import { SyncingNotice } from "@/components/SyncingNotice";
import { decodeHash } from "@/lib/hash";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TYPE_LABEL: Record<string, string> = { IMAGE: "Photos", REELS: "Reels", CAROUSEL_ALBUM: "Carousels", VIDEO: "Videos" };

// Per-post metric readers (names differ between feed posts and reels / API versions).
const m = (p: PostDoc, ...keys: string[]) => {
  for (const k of keys) if (p.metrics?.[k] != null) return Number(p.metrics[k]);
  return null;
};
const views = (p: PostDoc) => m(p, "views", "plays", "impressions");
const reach = (p: PostDoc) => m(p, "reach");
const shares = (p: PostDoc) => m(p, "shares");
const saves = (p: PostDoc) => m(p, "saved");
const reposts = (p: PostDoc) => m(p, "reposts");
const engagement = (p: PostDoc) =>
  (p.likeCount || 0) + (p.commentsCount || 0) + (shares(p) ?? 0) + (saves(p) ?? 0) + (reposts(p) ?? 0);

const SORTS = {
  views: { label: "Views", get: (p: PostDoc) => views(p) ?? -1 },
  reach: { label: "Reach", get: (p: PostDoc) => reach(p) ?? -1 },
  engagement: { label: "Engagement", get: engagement },
  likes: { label: "Likes", get: (p: PostDoc) => p.likeCount },
  comments: { label: "Comments", get: (p: PostDoc) => p.commentsCount },
  shares: { label: "Shares", get: (p: PostDoc) => shares(p) ?? -1 },
  saves: { label: "Saves", get: (p: PostDoc) => saves(p) ?? -1 },
  date: { label: "Newest", get: (p: PostDoc) => p.timestamp?.getTime() ?? 0 },
} as const;
type SortKey = keyof typeof SORTS;

const n = (v: number | null | undefined) => (v == null ? "–" : v.toLocaleString());

export default async function UserDashboard({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sort?: string; type?: string }>;
}) {
  await connection();
  const { id } = await params;
  const sp = await searchParams;
  const sort: SortKey = sp.sort && sp.sort in SORTS ? (sp.sort as SortKey) : "views";
  const type = sp.type === "reels" || sp.type === "posts" ? sp.type : "all";
  const accountId = decodeHash("accounts", id); // id in the URL is the account's code
  if (!accountId) notFound();
  const [account] = await sql<AccountDoc[]>`select * from accounts where id = ${accountId}`;
  if (!account) notFound();
  const { igUserId: ig, accessToken: token } = account;
  const acc = sql`account_id = ${accountId}`;

  const [
    posts, scheduled,
    postsP, reelsP, autoDmP, publishedP, commentsInP, dmInP, dmOutP,
    followersD, likesD, commentsD,
    followersSeries,
    totals28, totals7, reachSeries,
    cities, countries, ages, genders,
  ] = await Promise.all([
    sql<PostDoc[]>`select * from posts where account_id = ${accountId} and not removed_from_app order by "timestamp" desc nulls last`,
    sql<ScheduledPostDoc[]>`select * from scheduled_posts where account_id = ${accountId} and status = 'pending' order by publish_at limit 5`,
    countByPeriod("posts", "timestamp", sql`${acc} and media_type <> 'REELS'`),
    countByPeriod("posts", "timestamp", sql`${acc} and media_type = 'REELS'`),
    countByPeriod("automation_logs", "created_at", sql`${acc} and status = 'sent'`),
    countByPeriod("scheduled_posts", "publish_at", sql`${acc} and status = 'published'`),
    countByPeriod("comments", "commented_at", sql`${acc} and not is_own`),
    countByPeriod("messages", "sent_at", sql`${acc} and direction = 'in'`),
    countByPeriod("messages", "sent_at", sql`${acc} and direction = 'out'`),
    snapshotDeltas(accountId, "followers"),
    snapshotDeltas(accountId, "likes"),
    snapshotDeltas(accountId, "comments"),
    snapshotSeries(accountId, "followers", 30),
    accountTotals(ig, token, 28),
    accountTotals(ig, token, 7),
    dailySeries(ig, token, "reach", 30),
    demographics(ig, token, "city"),
    demographics(ig, token, "country"),
    demographics(ig, token, "age"),
    demographics(ig, token, "gender"),
  ]);

  const t28 = totals28.ok ? totals28.data : null;
  const t7 = totals7.ok ? totals7.data : null;
  const insightsError = !totals28.ok ? totals28.error : null;

  // Regions
  const countryRows = countries.ok ? countries.data : [];
  const cityRows = cities.ok ? cities.data : [];
  const total = (rows: { value: number }[]) => rows.reduce((s, r) => s + r.value, 0);
  const pct = (v: number, rows: { value: number }[]) => (total(rows) ? `${((v / total(rows)) * 100).toFixed(1)}%` : "–");
  const homeCountry = countryRows[0];
  const localCity = cityRows[0];

  // Content
  const reels = posts.filter((p) => p.mediaType === "REELS");
  const sum = (list: PostDoc[], f: (p: PostDoc) => number | null) => list.reduce((s, p) => s + (f(p) ?? 0), 0);
  const allEngagement = sum(posts, engagement);
  const engagementRate = account.followersCount && posts.length
    ? `${((allEngagement / posts.length / account.followersCount) * 100).toFixed(2)}%`
    : null;
  const listed = posts
    .filter((p) => (type === "reels" ? p.mediaType === "REELS" : type === "posts" ? p.mediaType !== "REELS" : true))
    .sort((a, b) => SORTS[sort].get(b) - SORTS[sort].get(a));
  const top = [...posts].sort((a, b) => (views(b) ?? engagement(b)) - (views(a) ?? engagement(a))).slice(0, 6);
  const topReels = [...reels].sort((a, b) => (views(b) ?? 0) - (views(a) ?? 0)).slice(0, 6);

  const byType = new Map<string, { n: number; e: number }>();
  for (const p of posts) {
    const k = TYPE_LABEL[p.mediaType] ?? p.mediaType;
    const cur = byType.get(k) ?? { n: 0, e: 0 };
    byType.set(k, { n: cur.n + 1, e: cur.e + engagement(p) });
  }
  const byDay = DAYS.map(() => ({ n: 0, e: 0 }));
  for (const p of posts) if (p.timestamp) { const d = byDay[p.timestamp.getDay()]; d.n++; d.e += engagement(p); }
  const chrono = [...posts].reverse().slice(-30);
  const qs = (o: Record<string, string>) => `?${new URLSearchParams({ sort, type, ...o })}#content`;
  const date = (p: PostDoc) => (p.timestamp ? p.timestamp.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");

  return (
    <>
      <div className="page-head">
        {account.profilePictureUrl ? <img className="avatar" src={account.profilePictureUrl} alt="" /> : <span className="avatar" />}
        <div>
          <h1>{account.username}</h1>
          <div className="muted">{account.name} · synced {account.lastSyncedAt ? account.lastSyncedAt.toLocaleString() : "never"}</div>
        </div>
        <div className="spacer" />
        <SyncButton accountId={id} />
        <Link className="btn secondary" href={`/accounts/${id}/profile`}>Open profile</Link>
        <AccountActions accountId={id} username={account.username} />
      </div>

      {!account.lastSyncedAt && <SyncingNotice />}

      <nav className="section-nav">
        <a href="#growth">Growth & engagement</a>
        <a href="#content">Content performance</a>
        <a href="#top">Top content</a>
        <a href="#regions">Audience regions</a>
        <a href="#messaging">Messages & automations</a>
      </nav>

      {insightsError && (
        <div className="error">
          Instagram Insights aren&apos;t available for this account yet ({insightsError}). Reach, views and regions need the
          <b> instagram_manage_insights</b> permission; everything else works without it.
        </div>
      )}

      {/* ------------------------------------------------------------ Growth */}
      <section id="growth" className="dash-section">
        <h2>Follower growth & total engagement</h2>
        <div className="grid">
          <Stat label="Followers" value={account.followersCount} />
          <Stat label="New followers (7 days)" value={followersD.week} hint="From daily snapshots" />
          <Stat label="New followers (30 days)" value={followersD.month} />
          <Stat label="Follows / unfollows (28d)" value={t28?.follows_and_unfollows} />
          <Stat label="Total engagement" value={allEngagement} hint="Likes + comments + shares + saves + reposts on all posts" />
          <Stat label="Engagement rate" value={engagementRate} hint="Engagement per post ÷ followers" />
          <Stat label="Accounts reached (28d)" value={t28?.reach} hint="Unique accounts" />
          <Stat label="Accounts engaged (28d)" value={t28?.accounts_engaged} />
          <Stat label="Profile views (28d)" value={t28?.profile_views} />
          <Stat label="Link taps (28d)" value={t28?.profile_links_taps} />
        </div>
        <div className="card" style={{ overflowX: "auto", marginTop: 16 }}>
          <table className="period-table">
            <thead><tr><th>Day-wise</th>{PERIODS.map((p) => <th key={p}>{PERIOD_LABEL[p]}</th>)}</tr></thead>
            <tbody>
              <DeltaRow label="New followers" values={followersD} />
              <DeltaRow label="Likes gained" values={likesD} />
              <DeltaRow label="Comments gained" values={commentsD} />
              <DeltaRow label="Posts published" values={postsP} plain />
              <DeltaRow label="Reels published" values={reelsP} plain />
              <DeltaRow label="Scheduled posts sent" values={publishedP} plain />
            </tbody>
          </table>
        </div>
        <div className="charts-2">
          <LineChart title="Followers over time" points={followersSeries} valueLabel="Followers" empty="Builds up from daily syncs; check back tomorrow." />
          <LineChart
            title="Daily reach (30 days)"
            points={reachSeries.ok ? reachSeries.data.map((d) => ({ label: d.day.slice(5), value: d.value })) : []}
            valueLabel="Accounts reached"
            empty={reachSeries.ok ? "No reach data yet." : "Needs the Instagram insights permission."}
          />
          <LineChart
            title="Engagement per post (last 30 posts)"
            points={chrono.map((p) => ({ label: p.timestamp ? p.timestamp.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "", value: engagement(p) }))}
            valueLabel="Engagement"
          />
          <BarChart title="Posts per month (6 months)" points={postsPerMonth(posts, 6)} valueLabel="Posts" />
        </div>
      </section>

      {/* ------------------------------------------------------------ Content */}
      <section id="content" className="dash-section">
        <h2>Content performance <span className="muted" style={{ fontWeight: 500 }}>· updated on every sync</span></h2>
        <div className="grid">
          <Stat label="Views" value={sum(posts, views)} />
          <Stat label="Reach" value={sum(posts, reach)} />
          <Stat label="Likes" value={sum(posts, (p) => p.likeCount)} />
          <Stat label="Comments" value={sum(posts, (p) => p.commentsCount)} />
          <Stat label="Shares" value={sum(posts, shares)} />
          <Stat label="Saves" value={sum(posts, saves)} />
          <Stat label="Reposts" value={posts.some((p) => reposts(p) != null) ? sum(posts, reposts) : null} hint="Shown where Instagram provides it" />
          <Stat label="Views (28d, account)" value={t28?.views} />
          <Stat label="Reach (7d)" value={t7?.reach} />
          <Stat label="Views (7d)" value={t7?.views} />
        </div>

        <div className="card" style={{ marginTop: 16, overflowX: "auto" }}>
          <div className="row" style={{ marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>Every post & reel</h3>
            <div className="seg">
              {(["all", "posts", "reels"] as const).map((t) => (
                <Link key={t} href={qs({ type: t })} aria-pressed={type === t} className="seg-link">{t === "all" ? "All" : t === "posts" ? "Posts" : "Reels"}</Link>
              ))}
            </div>
            <div className="spacer" />
            <span className="muted">Sort by</span>
            <div className="seg">
              {(Object.keys(SORTS) as SortKey[]).map((k) => (
                <Link key={k} href={qs({ sort: k })} aria-pressed={sort === k} className="seg-link">{SORTS[k].label}</Link>
              ))}
            </div>
          </div>
          <table className="perf-table">
            <thead>
              <tr>
                <th>Post</th><th>Date</th><th>Type</th><th>Views</th><th>Reach</th><th>Likes</th><th>Comments</th>
                <th>Shares</th><th>Saves</th><th>Reposts</th><th>Engagement</th>
              </tr>
            </thead>
            <tbody>
              {listed.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/posts/${p.hash}`} className="row" style={{ flexWrap: "nowrap", gap: 10 }}>
                      {p.thumbnailUrl || p.mediaUrl ? <img className="thumb" style={{ width: 40, height: 40 }} src={p.thumbnailUrl || p.mediaUrl || undefined} alt="" /> : null}
                      <span className="cap">{(p.caption || "(no caption)").slice(0, 40)}</span>
                      {p.boosted && <span className="badge accent" title="Boosted with Meta ads">Boosted</span>}
                    </Link>
                  </td>
                  <td>{date(p)}</td>
                  <td>{TYPE_LABEL[p.mediaType] ?? p.mediaType}</td>
                  <td>{n(views(p))}</td>
                  <td>{n(reach(p))}</td>
                  <td>{n(p.likeCount)}</td>
                  <td>{n(p.commentsCount)}</td>
                  <td>{n(shares(p))}</td>
                  <td>{n(saves(p))}</td>
                  <td>{n(reposts(p))}</td>
                  <td><b>{n(engagement(p))}</b></td>
                </tr>
              ))}
              {listed.length === 0 && <tr><td colSpan={11} className="muted">No posts synced yet.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="charts-2">
          <BarChart
            title="Avg engagement by content type"
            points={[...byType].map(([k, v]) => ({ label: k, value: Math.round(v.e / v.n) }))}
            valueLabel="Avg engagement"
          />
          <BarChart
            title="Avg engagement by day posted"
            points={byDay.map((d, i) => ({ label: DAYS[i], value: d.n ? Math.round(d.e / d.n) : 0 }))}
            valueLabel="Avg engagement"
          />
        </div>
      </section>

      {/* ------------------------------------------------------------ Top content */}
      <section id="top" className="dash-section">
        <h2>Top-performing content</h2>
        <TopGrid title="Top posts & reels (by views)" items={top} />
        {topReels.length > 0 && <TopGrid title="Top videos / reels" items={topReels} />}
      </section>

      {/* ------------------------------------------------------------ Regions */}
      <section id="regions" className="dash-section">
        <h2>Audience regions</h2>
        <div className="grid">
          <Stat label="Top city (local)" value={localCity ? `${localCity.key} · ${pct(localCity.value, cityRows)}` : null} />
          <Stat label="Home country" value={homeCountry ? `${homeCountry.key} · ${pct(homeCountry.value, countryRows)}` : null} />
          <Stat
            label="Outside home country (global)"
            value={homeCountry && countryRows.length > 1 ? pct(total(countryRows) - homeCountry.value, countryRows) : null}
          />
          <Stat label="Countries reached" value={countryRows.length || null} />
          <Stat label="Cities reached" value={cityRows.length || null} />
        </div>
        <div className="charts-2">
          <BarList title="Audience by city" points={cityRows.map((r) => ({ label: r.key, value: r.value }))} empty="Needs the Instagram insights permission." />
          <BarList title="Audience by country" points={countryRows.map((r) => ({ label: r.key, value: r.value }))} empty="Needs the Instagram insights permission." />
          <BarList title="Audience by age" points={ages.ok ? ages.data.map((r) => ({ label: r.key, value: r.value })) : []} empty="Needs the Instagram insights permission." />
          <BarList title="Audience by gender" points={genders.ok ? genders.data.map((r) => ({ label: r.key === "F" ? "Female" : r.key === "M" ? "Male" : r.key === "U" ? "Unknown" : r.key, value: r.value })) : []} empty="Needs the Instagram insights permission." />
        </div>
      </section>

      {/* ------------------------------------------------------------ Messaging */}
      <section id="messaging" className="dash-section">
        <div className="row">
          <h2>Messages & automations</h2>
          <div className="spacer" />
          <Link className="btn secondary" href={`/accounts/${id}/messages`}>Open inbox</Link>
          <Link className="btn secondary" href={`/accounts/${id}/automations`}>Automations</Link>
        </div>
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="period-table">
            <thead><tr><th>Day-wise</th>{PERIODS.map((p) => <th key={p}>{PERIOD_LABEL[p]}</th>)}</tr></thead>
            <tbody>
              <DeltaRow label="Comments received" values={commentsInP} plain />
              <DeltaRow label="Auto-DMs sent" values={autoDmP} plain />
              <DeltaRow label="Messages received" values={dmInP} plain />
              <DeltaRow label="Messages sent" values={dmOutP} plain />
            </tbody>
          </table>
        </div>

        <h3 style={{ marginTop: 18 }}>Upcoming scheduled</h3>
        <div className="card">
          {scheduled.length === 0 && <div className="muted">Nothing scheduled. <Link href={`/accounts/${id}/create`} className="profile-link">Create a post</Link></div>}
          {scheduled.map((s) => (
            <div key={s.id} className="list-row">
              <span className="badge pending">{s.mediaType === "REELS" ? "Reel" : "Post"}</span>
              <span className="muted" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.caption || "(no caption)"}</span>
              <span>{s.publishAt.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function TopGrid({ title, items }: { title: string; items: PostDoc[] }) {
  if (!items.length) return <div className="card muted">No posts synced yet.</div>;
  return (
    <div className="card">
      <h3>{title}</h3>
      <div className="top-grid">
        {items.map((p, i) => (
          <Link key={p.id} href={`/posts/${p.hash}`} className="top-card">
            <div className="top-media">
              {p.thumbnailUrl || p.mediaUrl ? <img src={p.thumbnailUrl || p.mediaUrl || undefined} alt="" /> : null}
              <span className="top-rank">#{i + 1}</span>
              {p.mediaType === "REELS" && <span className="tile-badge">▶</span>}
            </div>
            <div className="top-stats">
              <span>▶ {n(views(p))}</span>
              <span>{n(p.likeCount)} likes</span>
              <span>{n(p.commentsCount)} comments</span>
              <span>{n(shares(p))} shares</span>
              <span>{n(saves(p))} saves</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function DeltaRow({ label, values, plain }: { label: string; values: Record<string, number | null>; plain?: boolean }) {
  return (
    <tr>
      <td>{label}</td>
      {PERIODS.map((p) => {
        const v = values[p];
        if (v == null) return <td key={p} className="muted">–</td>;
        if (plain) return <td key={p}>{v.toLocaleString()}</td>;
        return <td key={p} className={v > 0 ? "delta-up" : v < 0 ? "delta-down" : ""}>{v > 0 ? "+" : ""}{v.toLocaleString()}</td>;
      })}
    </tr>
  );
}

export const instant = false;
