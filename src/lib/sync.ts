import { sql } from "@/lib/db";
import { dayKey, type AccountDoc } from "@/lib/models";
import { boostedMediaIds } from "@/lib/ads";
import {
  fetchAccountInsights,
  fetchAccountProfile,
  fetchMediaInsights,
  listMedia,
  subscribeInstagramToApp,
  subscribePageToApp,
} from "@/lib/graph";

/** Pull profile, account insights and all recent posts (with metrics) into the database. */
export async function syncAccount(accountId: string) {
  const [account] = await sql<AccountDoc[]>`select * from accounts where id = ${accountId}`;
  if (!account) throw new Error("Account not found");

  // Keep the linked Page subscribed to this app, otherwise Meta sends no comment webhooks
  // and keyword automations never fire. Runs on connect (callback → sync) and every sync.
  if (account.pageId) {
    await subscribePageToApp(account.pageId, account.accessToken).catch((e) =>
      console.error(`page ${account.pageId} subscribed_apps failed:`, e instanceof Error ? e.message : e),
    );
  }
  await subscribeInstagramToApp(account.igUserId, account.accessToken).catch((e) =>
    console.error(`instagram ${account.igUserId} subscribed_apps failed:`, e instanceof Error ? e.message : e),
  );

  const profile = await fetchAccountProfile(account.igUserId, account.accessToken);
  const insights = await fetchAccountInsights(account.igUserId, account.accessToken);

  await sql`
    update accounts set
      username = ${profile.username},
      name = ${profile.name ?? null},
      biography = ${profile.biography ?? null},
      profile_picture_url = ${profile.profile_picture_url ?? null},
      website = ${profile.website ?? null},
      followers_count = ${profile.followers_count ?? null},
      follows_count = ${profile.follows_count ?? null},
      media_count = ${profile.media_count ?? null},
      insights = ${sql.json(insights)},
      last_synced_at = now(),
      updated_at = now()
    where id = ${account.id}`;

  const media = await listMedia(account.igUserId, account.accessToken);
  for (const m of media) {
    const metrics = await fetchMediaInsights(m.id, account.accessToken, m.media_product_type);
    const row = {
      accountId: account.id,
      igMediaId: m.id,
      mediaType: m.media_product_type === "REELS" ? "REELS" : m.media_type,
      mediaUrl: m.media_url ?? null,
      thumbnailUrl: m.thumbnail_url ?? null,
      permalink: m.permalink ?? null,
      caption: m.caption ?? null,
      timestamp: m.timestamp ? new Date(m.timestamp) : null,
      likeCount: m.like_count ?? 0,
      commentsCount: m.comments_count ?? 0,
      metrics: sql.json(metrics),
      syncedAt: new Date(),
      removedFromApp: false,
    };
    await sql`
      insert into posts ${sql(row)}
      on conflict (ig_media_id) do update set
        account_id = excluded.account_id, media_type = excluded.media_type, media_url = excluded.media_url,
        thumbnail_url = excluded.thumbnail_url, permalink = excluded.permalink, caption = excluded.caption,
        "timestamp" = excluded."timestamp", like_count = excluded.like_count,
        comments_count = excluded.comments_count, metrics = excluded.metrics,
        synced_at = excluded.synced_at, removed_from_app = false`;
  }

  // Mark boosted posts (best effort; needs ads_read on the user token)
  if (account.userToken) {
    const boosted = await boostedMediaIds(account.userToken);
    if (boosted) {
      const ids = [...boosted];
      await sql`update posts set boosted = (ig_media_id = any(${ids}::text[])) where account_id = ${account.id}`;
    }
  }

  // Daily snapshot for today/yesterday/week/month comparisons
  const [totals] = await sql<{ likes: number; comments: number }[]>`
    select coalesce(sum(like_count), 0)::int as likes, coalesce(sum(comments_count), 0)::int as comments
    from posts where account_id = ${account.id}`;
  const snap = {
    accountId: account.id,
    day: dayKey(),
    followers: profile.followers_count ?? 0,
    follows: profile.follows_count ?? 0,
    mediaCount: profile.media_count ?? 0,
    likes: totals?.likes ?? 0,
    comments: totals?.comments ?? 0,
    takenAt: new Date(),
  };
  await sql`
    insert into snapshots ${sql(snap)}
    on conflict (account_id, day) do update set
      followers = excluded.followers, follows = excluded.follows, media_count = excluded.media_count,
      likes = excluded.likes, comments = excluded.comments, taken_at = excluded.taken_at`;

  return { posts: media.length };
}
