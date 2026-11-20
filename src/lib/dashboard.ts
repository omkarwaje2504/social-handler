import { sql } from "@/lib/db";
import { dayKey } from "@/lib/models";

// Numbers for the dashboards, always for a given set of accounts (the ones the viewer can open).
// Every query is scoped by account ids, so one admin's dashboard never includes another's data.

const views = sql`coalesce((p.metrics->>'views')::bigint, (p.metrics->>'plays')::bigint, 0)`;
const DAY = 86_400_000;
const shortDay = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/**
 * Total followers per day for the last `days` days (each account's latest known count that day).
 * Days before the first sync are left out, so the line never starts from a made-up zero.
 * delta7: change over 7 days, only for accounts that were already synced 7 days ago (so newly
 * connected accounts don't count as growth); null when there's no such history yet.
 */
export async function followerTrend(accIds: number[], days = 30) {
  const today = new Date();
  const dates = Array.from({ length: days }, (_, i) => new Date(today.getTime() - (days - 1 - i) * DAY));
  if (!accIds.length) return { labels: [] as string[], values: [] as number[], delta7: null as number | null, hasData: false };
  const rows = await sql<{ accountId: number; day: string; followers: number }[]>`
    select account_id, day, followers from snapshots
    where account_id = any(${accIds}::int[]) and day >= ${dayKey(new Date(today.getTime() - (days + 60) * DAY))}
    order by day`;
  const byAcc = new Map<number, { day: string; followers: number }[]>();
  for (const r of rows) {
    if (!byAcc.has(r.accountId)) byAcc.set(r.accountId, []);
    byAcc.get(r.accountId)!.push(r);
  }
  const lastOn = (list: { day: string; followers: number }[], key: string) => {
    let last: number | null = null;
    for (const s of list) { if (s.day <= key) last = s.followers; else break; }
    return last;
  };
  const totals = dates.map((d) => {
    const key = dayKey(d);
    let total = 0, any = false;
    for (const list of byAcc.values()) {
      const v = lastOn(list, key);
      if (v != null) { total += v; any = true; }
    }
    return any ? total : null;
  });
  const first = totals.findIndex((v) => v != null);
  const from = first < 0 ? dates.length : first;
  let delta7: number | null = null;
  const nowKey = dayKey(today), weekKey = dayKey(new Date(today.getTime() - 7 * DAY));
  for (const list of byAcc.values()) {
    const now = lastOn(list, nowKey), then = lastOn(list, weekKey);
    if (now != null && then != null) delta7 = (delta7 ?? 0) + (now - then);
  }
  return { labels: dates.slice(from).map(shortDay), values: totals.slice(from) as number[], delta7, hasData: rows.length > 0 };
}

/** Posts and reels published per week (last `weeks` weeks, Monday-based). */
export async function contentPerWeek(accIds: number[], weeks = 12) {
  const rows = accIds.length ? await sql<{ wk: Date; posts: number; reels: number }[]>`
    select date_trunc('week', p."timestamp") as wk,
      count(*) filter (where p.media_type <> 'REELS')::int as posts,
      count(*) filter (where p.media_type = 'REELS')::int as reels
    from posts p
    where p.account_id = any(${accIds}::int[]) and not p.removed_from_app
      and p."timestamp" >= date_trunc('week', now()) - make_interval(weeks => ${weeks - 1})
    group by 1` : [];
  const monday = (() => { const d = new Date(); const k = (d.getDay() + 6) % 7; return new Date(d.getFullYear(), d.getMonth(), d.getDate() - k); })();
  const starts = Array.from({ length: weeks }, (_, i) => new Date(monday.getTime() - (weeks - 1 - i) * 7 * DAY));
  const find = (d: Date) => rows.find((r) => Math.abs(new Date(r.wk).getTime() - d.getTime()) < 2 * DAY);
  return {
    labels: starts.map(shortDay),
    posts: starts.map((d) => find(d)?.posts ?? 0),
    reels: starts.map((d) => find(d)?.reels ?? 0),
  };
}

/** Headline numbers for the last 30 days, with the 30 days before for comparison. */
export async function headline(accIds: number[]) {
  if (!accIds.length) {
    return { followers: 0, posts30: 0, postsPrev: 0, views30: 0, viewsPrev: 0, dms30: 0, dmsPrev: 0, unread: 0, scheduled: 0, engagementRate: null as number | null, mix: { posts: 0, reels: 0, carousels: 0 } };
  }
  const [r] = await sql<{
    followers: string; posts30: number; postsPrev: number; views30: string; viewsPrev: string; dms30: number; dmsPrev: number;
    unread: number; scheduled: number; eng30: string; mixPosts: number; mixReels: number; mixCarousels: number;
  }[]>`
    select
      (select coalesce(sum(followers_count), 0)::bigint from accounts where id = any(${accIds}::int[])) as followers,
      (select count(*)::int from posts p where p.account_id = any(${accIds}::int[]) and not p.removed_from_app and p."timestamp" >= now() - interval '30 days') as posts30,
      (select count(*)::int from posts p where p.account_id = any(${accIds}::int[]) and not p.removed_from_app and p."timestamp" >= now() - interval '60 days' and p."timestamp" < now() - interval '30 days') as posts_prev,
      (select coalesce(sum(${views}), 0)::bigint from posts p where p.account_id = any(${accIds}::int[]) and not p.removed_from_app and p."timestamp" >= now() - interval '30 days') as views30,
      (select coalesce(sum(${views}), 0)::bigint from posts p where p.account_id = any(${accIds}::int[]) and not p.removed_from_app and p."timestamp" >= now() - interval '60 days' and p."timestamp" < now() - interval '30 days') as views_prev,
      (select count(*)::int from automation_logs where account_id = any(${accIds}::int[]) and status = 'sent' and created_at >= now() - interval '30 days') as dms30,
      (select count(*)::int from automation_logs where account_id = any(${accIds}::int[]) and status = 'sent' and created_at >= now() - interval '60 days' and created_at < now() - interval '30 days') as dms_prev,
      (select count(distinct (account_id, thread_user_id))::int from messages where account_id = any(${accIds}::int[]) and direction = 'in' and read_at is null) as unread,
      (select count(*)::int from scheduled_posts where account_id = any(${accIds}::int[]) and status = 'pending') as scheduled,
      (select coalesce(sum(p.like_count + p.comments_count), 0)::bigint from posts p where p.account_id = any(${accIds}::int[]) and not p.removed_from_app and p."timestamp" >= now() - interval '30 days') as eng30,
      (select count(*)::int from posts p where p.account_id = any(${accIds}::int[]) and not p.removed_from_app and p.media_type in ('IMAGE')) as mix_posts,
      (select count(*)::int from posts p where p.account_id = any(${accIds}::int[]) and not p.removed_from_app and p.media_type in ('REELS', 'VIDEO')) as mix_reels,
      (select count(*)::int from posts p where p.account_id = any(${accIds}::int[]) and not p.removed_from_app and p.media_type = 'CAROUSEL_ALBUM') as mix_carousels`;
  const followers = Number(r.followers);
  return {
    followers, posts30: r.posts30, postsPrev: r.postsPrev, views30: Number(r.views30), viewsPrev: Number(r.viewsPrev),
    dms30: r.dms30, dmsPrev: r.dmsPrev, unread: r.unread, scheduled: r.scheduled,
    // Likes + comments per post, as a share of followers (same definition as the account page).
    engagementRate: r.posts30 && followers ? (Number(r.eng30) / r.posts30 / followers) * 100 : null,
    mix: { posts: r.mixPosts, reels: r.mixReels, carousels: r.mixCarousels },
  };
}

export type Attention = { level: "bad" | "warn" | "info"; title: string; detail: string; href: string; action: string };

/** Things someone should act on, most urgent first. */
export async function needsAttention(accIds: number[], opts: { projectIds: number[] | null; isSuper: boolean; isAdmin: boolean }) {
  const out: Attention[] = [];
  if (accIds.length) {
    const [stale, replies, failed, autoErr] = await Promise.all([
      sql<{ hash: string; username: string; lastSyncedAt: Date | null }[]>`
        select hash, username, last_synced_at from accounts
        where id = any(${accIds}::int[]) and (last_synced_at is null or last_synced_at < now() - interval '24 hours')
        order by last_synced_at nulls first limit 4`,
      sql<{ hash: string; username: string; threads: number }[]>`
        select a.hash, a.username, count(distinct m.thread_user_id)::int as threads
        from messages m join accounts a on a.id = m.account_id
        where m.account_id = any(${accIds}::int[]) and m.direction = 'in' and m.read_at is null
          and m.sent_at < now() - interval '18 hours' and m.sent_at > now() - interval '24 hours'
        group by a.hash, a.username order by threads desc limit 3`,
      sql<{ hash: string; username: string; n: number }[]>`
        select a.hash, a.username, count(*)::int as n from scheduled_posts s join accounts a on a.id = s.account_id
        where s.account_id = any(${accIds}::int[]) and s.status = 'failed' and s.created_at > now() - interval '14 days'
        group by a.hash, a.username limit 3`,
      sql<{ hash: string; username: string; n: number }[]>`
        select a.hash, a.username, count(*)::int as n from automation_logs l join accounts a on a.id = l.account_id
        where l.account_id = any(${accIds}::int[]) and l.status = 'error' and l.created_at > now() - interval '7 days'
        group by a.hash, a.username limit 3`,
    ]);
    for (const r of replies) out.push({ level: "bad", title: `Reply window closing for @${r.username}`, detail: `${r.threads} conversation(s) pass Instagram's 24-hour reply limit within hours.`, href: `/accounts/${r.hash}/messages`, action: "Open inbox" });
    for (const r of failed) out.push({ level: "bad", title: `Scheduled post failed on @${r.username}`, detail: `${r.n} post(s) could not be published.`, href: `/accounts/${r.hash}/scheduled`, action: "Review" });
    for (const r of autoErr) out.push({ level: "warn", title: `Auto-DM errors on @${r.username}`, detail: `${r.n} automation run(s) failed this week.`, href: `/accounts/${r.hash}/automations`, action: "Check" });
    for (const r of stale) out.push({ level: "warn", title: `@${r.username} isn't up to date`, detail: r.lastSyncedAt ? `Last synced ${timeAgo(r.lastSyncedAt)}.` : "Never synced.", href: `/accounts/${r.hash}`, action: "Sync" });
  }
  if (opts.isAdmin) {
    const ids = opts.projectIds;
    const empty = await sql<{ hash: string; name: string }[]>`
      select p.hash, p.name from projects p
      where p.status = 'active' and ${ids === null ? sql`true` : sql`p.id = any(${ids}::int[])`}
        and not exists (select 1 from accounts a where a.project_id = p.id)
      order by p.created_at desc limit 3`;
    for (const p of empty) out.push({ level: "info", title: `${p.name} has no accounts yet`, detail: "Connect an Instagram account or send the owner the connect link.", href: `/projects/${p.hash}`, action: "Connect" });
  }
  if (opts.isSuper) {
    const [[orphans], idleAdmins] = await Promise.all([
      sql<{ n: number }[]>`select count(*)::int as n from accounts where project_id is null`,
      sql<{ name: string; email: string }[]>`
        select u.name, u.email from users u where u.role = 'admin' and u.active
          and not exists (select 1 from projects p where p.owner_id = u.id) order by u.created_at desc limit 3`,
    ]);
    if (orphans.n) out.push({ level: "warn", title: `${orphans.n} account(s) without a project`, detail: "Only super admins can see them until they're moved into a project.", href: "/projects/unassigned", action: "Assign" });
    for (const a of idleAdmins) out.push({ level: "info", title: `${a.name || a.email} has no projects`, detail: "Create a project for this admin, or they can create their own.", href: "/projects", action: "Projects" });
  }
  const rank = { bad: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

/** Best posts of the last 30 days by views (falls back to engagement). */
export async function topContent(accIds: number[], limit = 5) {
  if (!accIds.length) return [];
  return sql<{ hash: string; username: string; caption: string | null; mediaType: string; thumbnailUrl: string | null; mediaUrl: string | null; views: string; likeCount: number; commentsCount: number; timestamp: Date | null }[]>`
    select p.hash, a.username, p.caption, p.media_type, p.thumbnail_url, p.media_url, ${views} as views, p.like_count, p.comments_count, p."timestamp"
    from posts p join accounts a on a.id = p.account_id
    where p.account_id = any(${accIds}::int[]) and not p.removed_from_app and p."timestamp" >= now() - interval '30 days'
    order by ${views} desc, p.like_count + p.comments_count desc limit ${limit}`;
}

/** Per-project summary rows for the projects the viewer can open. */
export async function projectSummaries(projectIds: number[] | null, limit = 12) {
  return sql<{ hash: string; name: string; brand: string; ownerName: string | null; accounts: number; followers: string; posts30: number; members: number; brandColor: string }[]>`
    select p.hash, p.name, coalesce((select name from orgs o where o.id = p.brand_id), '') as brand, p.brand_color,
      (select coalesce(nullif(u.name, ''), u.email) from users u where u.id = p.owner_id) as owner_name,
      (select count(*)::int from accounts a where a.project_id = p.id) as accounts,
      (select coalesce(sum(a.followers_count), 0)::bigint from accounts a where a.project_id = p.id) as followers,
      (select count(*)::int from posts x join accounts a on a.id = x.account_id
        where a.project_id = p.id and not x.removed_from_app and x."timestamp" >= now() - interval '30 days') as posts30,
      (select count(*)::int from project_members m where m.project_id = p.id) as members
    from projects p
    where p.status = 'active' and ${projectIds === null ? sql`true` : sql`p.id = any(${projectIds}::int[])`}
    order by followers desc, p.name limit ${limit}`;
}

export function timeAgo(d: Date) {
  const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}
