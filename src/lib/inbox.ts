import { sql } from "@/lib/db";
import { ensureHash } from "@/lib/hash";
import type { AccountDoc } from "@/lib/models";
import { getUserFollowStatus } from "@/lib/graph";

// Storage for comments and direct messages. Everything the app sees is kept in Postgres so the
// dashboard can count it per day/week, even after a comment is deleted on Instagram.

export async function saveComment(c: {
  accountId: number;
  igCommentId: string;
  igMediaId: string;
  parentId?: string | null;
  fromId?: string | null;
  fromUsername?: string | null;
  text: string;
  likeCount?: number;
  hidden?: boolean;
  isOwn?: boolean;
  commentedAt?: Date;
}) {
  const [saved] = await sql<{ id: number; hash: string | null }[]>`
    insert into comments ${sql({
      accountId: c.accountId,
      igCommentId: c.igCommentId,
      igMediaId: c.igMediaId,
      parentId: c.parentId ?? null,
      fromId: c.fromId ?? null,
      fromUsername: c.fromUsername ?? null,
      text: c.text ?? "",
      likeCount: c.likeCount ?? 0,
      hidden: c.hidden ?? false,
      isOwn: c.isOwn ?? false,
      commentedAt: c.commentedAt ?? new Date(),
    })}
    on conflict (ig_comment_id) do update set
      text = excluded.text,
      like_count = excluded.like_count,
      hidden = excluded.hidden,
      from_username = coalesce(excluded.from_username, comments.from_username)
    returning id, hash`;
  await ensureHash("comments", saved);
}

/** Username of an Instagram user by IGSID (only available after they interacted with the account). */
export async function lookupUsername(account: AccountDoc, igsid: string): Promise<string | null> {
  const [known] = await sql<{ name: string | null }[]>`
    select coalesce(
      (select thread_username from messages where account_id = ${account.id} and thread_user_id = ${igsid} and thread_username is not null limit 1),
      (select commenter_username from automation_logs where account_id = ${account.id} and commenter_igsid = ${igsid} and commenter_username is not null limit 1),
      (select from_username from comments where account_id = ${account.id} and from_id = ${igsid} and from_username is not null limit 1)
    ) as name`;
  if (known?.name) return known.name;
  try {
    return (await getUserFollowStatus(igsid, account.accessToken)).username ?? null;
  } catch {
    return null;
  }
}

/**
 * Meta only shares whether someone follows the account (is_user_follow_business) after that person has
 * messaged it. When they do, look it up and fill in the "unknown" follow status on their automation logs.
 */
export async function refreshFollowStatus(account: AccountDoc, igsid: string): Promise<boolean | null> {
  try {
    const p = await getUserFollowStatus(igsid, account.accessToken);
    if (p.is_user_follow_business == null) return null;
    await sql`update automation_logs set is_follower = ${p.is_user_follow_business},
                commenter_username = coalesce(commenter_username, ${p.username ?? null})
              where account_id = ${account.id} and commenter_igsid = ${igsid} and is_follower is null`;
    return p.is_user_follow_business;
  } catch {
    return null; // still no consent, or token problem
  }
}

export async function saveMessage(m: {
  accountId: number;
  igMessageId?: string | null;
  threadUserId: string;
  threadUsername?: string | null;
  direction: "in" | "out";
  text: string;
  attachments?: unknown;
  source: "webhook" | "reply" | "automation" | "sync";
  automationId?: number | null;
  sentAt?: Date;
}) {
  const row = {
    accountId: m.accountId,
    igMessageId: m.igMessageId ?? null,
    threadUserId: m.threadUserId,
    threadUsername: m.threadUsername ?? null,
    direction: m.direction,
    text: m.text ?? "",
    attachments: m.attachments == null ? null : sql.json(m.attachments as never),
    source: m.source,
    automationId: m.automationId ?? null,
    sentAt: m.sentAt ?? new Date(),
  };
  // A message the app sends is also delivered back by Meta as a webhook "echo", with a different id
  // and in either order. Merge them: the same outgoing text in the same thread within 2 minutes is one
  // message; the app's row (automation / reply) keeps its source and automation link.
  if (row.direction === "out" && row.source !== "sync") {
    const [dupe] = await sql<{ id: number; source: string }[]>`
      select id, source from messages
      where account_id = ${row.accountId} and thread_user_id = ${row.threadUserId} and direction = 'out'
        and text = ${row.text} and abs(extract(epoch from (sent_at - ${row.sentAt}::timestamptz))) < 120
        and ((${row.source} = 'webhook' and source in ('automation', 'reply'))
          or (${row.source} <> 'webhook' and source = 'webhook'))
      order by sent_at desc limit 1`;
    if (dupe) {
      if (row.source !== "webhook") {
        await sql`update messages set source = ${row.source}, automation_id = ${row.automationId}
                  where id = ${dupe.id}`;
      }
      return;
    }
  }
  if (row.igMessageId) {
    const [r] = await sql<{ id: number; hash: string | null }[]>`insert into messages ${sql(row)} on conflict (ig_message_id) do nothing returning id, hash`;
    await ensureHash("messages", r);
  } else {
    const [r] = await sql<{ id: number; hash: string | null }[]>`insert into messages ${sql(row)} returning id, hash`;
    await ensureHash("messages", r);
  }
  if (m.threadUsername) {
    await sql`update messages set thread_username = ${m.threadUsername}
              where account_id = ${m.accountId} and thread_user_id = ${m.threadUserId} and thread_username is null`;
  }
}
