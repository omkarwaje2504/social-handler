import { sql } from "@/lib/db";
import { publishMedia } from "@/lib/graph";
import type { AccountDoc, ScheduledPostDoc } from "@/lib/models";
import { syncAccount } from "@/lib/sync";

const AUTO_SYNC_HOURS = 6;

/** Publish every scheduled post whose time has come. Each post is claimed atomically. */
export async function publishDue() {
  for (;;) {
    // Claim the next due post; SKIP LOCKED keeps two ticks from publishing the same post.
    const [job] = await sql<ScheduledPostDoc[]>`
      update scheduled_posts set status = 'publishing'
      where id = (
        select id from scheduled_posts
        where status = 'pending' and publish_at <= now()
        order by publish_at limit 1
        for update skip locked
      )
      returning *`;
    if (!job) break;

    const [account] = await sql<AccountDoc[]>`select * from accounts where id = ${job.accountId}`;
    try {
      if (!account) throw new Error("Account no longer connected");
      const igMediaId = await publishMedia({
        igUserId: account.igUserId,
        token: account.accessToken,
        mediaUrl: job.mediaUrl,
        mediaType: job.mediaType,
        caption: job.caption,
      });
      await sql`update scheduled_posts set status = 'published', ig_media_id = ${igMediaId} where id = ${job.id}`;
      await syncAccount(account.id).catch(() => {});
    } catch (e) {
      await sql`update scheduled_posts set status = 'failed', error = ${(e as Error).message} where id = ${job.id}`;
    }
  }
}

/** Keep every account's numbers (and daily snapshots) fresh. */
export async function autoSync() {
  const cutoff = new Date(Date.now() - AUTO_SYNC_HOURS * 60 * 60 * 1000);
  const stale = await sql<{ id: string }[]>`
    select id from accounts where last_synced_at is null or last_synced_at < ${cutoff}`;
  for (const a of stale) await syncAccount(a.id).catch((e) => console.warn("auto-sync failed", e.message));
}

const g = globalThis as unknown as { __shScheduler?: NodeJS.Timeout; __shRunning?: boolean };

export function startScheduler() {
  if (g.__shScheduler) return;
  const tick = async () => {
    if (g.__shRunning) return;
    g.__shRunning = true;
    try {
      await publishDue();
      await autoSync();
    } catch (e) {
      console.warn("scheduler tick failed", (e as Error).message);
    } finally {
      g.__shRunning = false;
    }
  };
  g.__shScheduler = setInterval(tick, 60_000);
  setTimeout(tick, 5_000);
}
