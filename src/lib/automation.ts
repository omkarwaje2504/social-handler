import { sql } from "@/lib/db";
import type { AccountDoc, AutomationDoc, AutomationLogDoc } from "@/lib/models";
import {
  getUserFollowStatus,
  replyToComment,
  sendPrivateReply,
} from "@/lib/graph";
import { saveComment, saveMessage } from "@/lib/inbox";

export interface CommentEvent {
  igAccountId: string; // the business account that received the comment (webhook entry.id)
  igMediaId: string;
  commentId: string;
  text: string;
  fromId: string; // commenter's IGSID
  fromUsername?: string;
  parentId?: string;
}

/**
 * For every enabled rule whose keyword appears in the comment:
 *  1. check whether the commenter follows the account
 *  2. send the follower or non-follower DM as a private reply to that comment
 *  3. log the outcome (also used to avoid double-sending on webhook retries)
 */
export async function handleCommentEvent(ev: CommentEvent): Promise<string> {
  const [account] = await sql<AccountDoc[]>`select * from accounts where ig_user_id = ${ev.igAccountId}`;
  if (!account) return `no connected account with igUserId ${ev.igAccountId}`;

  // Every comment is stored (also the account's own replies), so it can be counted and kept after deletion.
  const own = ev.fromId === account.igUserId;
  await saveComment({
    accountId: account.id,
    igCommentId: ev.commentId,
    igMediaId: ev.igMediaId,
    parentId: ev.parentId ?? null,
    fromId: ev.fromId,
    fromUsername: ev.fromUsername ?? null,
    text: ev.text,
    isOwn: own,
  }).catch((e) => console.error("save comment failed", e));
  if (own) return "own comment, ignored"; // never react to our own comments

  const rules = await sql<AutomationDoc[]>`
    select * from automations
    where account_id = ${account.id} and enabled
      and (cardinality(ig_media_ids) = 0 or ${ev.igMediaId} = any(ig_media_ids))
    order by created_at`;

  const text = ev.text.toLowerCase();
  if (!rules.length) return "no enabled rules for this account/post";
  const results: string[] = [];

  for (const rule of rules) {
    if (!text.includes(rule.keyword.toLowerCase())) {
      results.push(`"${rule.keyword}": no match`);
      continue;
    }

    // Idempotency: Meta retries webhooks, so skip comments already handled by this rule.
    const [already] = await sql`
      select 1 from automation_logs where automation_id = ${rule.id} and comment_id = ${ev.commentId}`;
    if (already) {
      results.push(`"${rule.keyword}": already handled`);
      continue;
    }

    let isFollower: boolean | null = null;
    let status: AutomationLogDoc["status"] = "sent";
    let error: string | null = null;
    let messageSent = "";

    const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
    const problems: string[] = [];

    // Follow check is best-effort: Meta only shares a user's profile (incl. is_user_follow_business)
    // after that user has messaged the account (error #230 "User consent is required"). In that
    // case — or any other failure — treat them as a non-follower and still send the DM.
    try {
      const profile = await getUserFollowStatus(ev.fromId, account.accessToken);
      isFollower = profile.is_user_follow_business ?? false;
    } catch (e) {
      isFollower = null;
      console.warn(`follow check unavailable for ${ev.fromId}: ${msg(e)}`);
    }
    messageSent = isFollower ? rule.followerMessage : rule.nonFollowerMessage;

    // DM and public reply are independent: one failing doesn't block the other.
    let publicReplySent = false;
    try {
      const sent = await sendPrivateReply(account.pageId || account.igUserId, account.accessToken, ev.commentId, messageSent);
      await saveMessage({
        accountId: account.id,
        igMessageId: sent.message_id ?? null,
        threadUserId: sent.recipient_id || ev.fromId,
        threadUsername: ev.fromUsername ?? null,
        direction: "out",
        text: messageSent,
        source: "automation",
        automationId: rule.id,
      }).catch((e) => console.error("save automation DM failed", e));
    } catch (e) {
      problems.push(`DM: ${msg(e)}`);
      messageSent = "";
    }
    if (rule.publicReply) {
      try {
        await replyToComment(ev.commentId, account.accessToken, rule.publicReply);
        publicReplySent = true;
      } catch (e) {
        problems.push(`public reply: ${msg(e)}`);
      }
    }
    if (problems.length) {
      status = "error";
      error = problems.join(" | ");
    }

    const log = {
      automationId: rule.id,
      accountId: account.id,
      igMediaId: ev.igMediaId,
      commentId: ev.commentId,
      commenterIgsid: ev.fromId,
      commenterUsername: ev.fromUsername ?? null,
      commentText: ev.text,
      isFollower,
      messageSent,
      status,
      error,
      publicReplySent,
    };
    // unique (automation_id, comment_id) also guards against a webhook retry racing this one
    await sql`insert into automation_logs ${sql(log)} on conflict (automation_id, comment_id) do nothing`;
    results.push(`"${rule.keyword}": ${status}${error ? ` (${error})` : ""}`);
  }
  return results.join("; ");
}
