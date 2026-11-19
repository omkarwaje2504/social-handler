import { NextResponse } from "next/server";
import { isId, sql } from "@/lib/db";
import { listComments, replyToComment, setCommentHidden, deleteComment } from "@/lib/graph";
import type { AccountDoc, CommentDoc, PostDoc } from "@/lib/models";
import { saveComment } from "@/lib/inbox";

type Ctx = { params: Promise<{ id: string }> };

async function loadPostAndAccount(id: string) {
  if (!isId(id)) return null;
  const [post] = await sql<PostDoc[]>`select * from posts where id = ${id}`;
  if (!post) return null;
  const [account] = await sql<AccountDoc[]>`select * from accounts where id = ${post.accountId}`;
  if (!account) return null;
  return { post, account };
}

// Comments of the post: refreshed from Instagram into the database, then returned from the database,
// so comments deleted from the app are still listed (with deletedAt set).
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const ctx = await loadPostAndAccount(id);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let liveError: string | null = null;
  try {
    const live = await listComments(ctx.post.igMediaId, ctx.account.accessToken);
    for (const c of live) {
      await saveComment({
        accountId: ctx.account.id,
        igCommentId: c.id,
        igMediaId: ctx.post.igMediaId,
        fromId: c.from?.id ?? null,
        fromUsername: c.username ?? c.from?.username ?? null,
        text: c.text ?? "",
        likeCount: c.like_count ?? 0,
        hidden: !!c.hidden,
        isOwn: c.from?.id === ctx.account.igUserId,
        commentedAt: c.timestamp ? new Date(c.timestamp) : undefined,
      });
    }
  } catch (e) {
    liveError = (e as Error).message;
  }
  const rows = await sql<CommentDoc[]>`
    select * from comments where ig_media_id = ${ctx.post.igMediaId} order by commented_at desc`;
  return NextResponse.json({ comments: rows, liveError });
}

// { commentId, action: "reply" | "hide" | "unhide" | "delete", message? }
// "delete" removes the comment on Instagram but keeps the row (deleted_at); /api/comments/[cid] purges it.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const ctx = await loadPostAndAccount(id);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const token = ctx.account.accessToken;

  const body = (await req.json()) as {
    commentId: string;
    message?: string;
    action?: "reply" | "hide" | "unhide" | "delete";
  };
  try {
    switch (body.action ?? "reply") {
      case "reply": {
        if (!body.message) return NextResponse.json({ error: "message required" }, { status: 400 });
        const r = await replyToComment(body.commentId, token, body.message);
        await saveComment({
          accountId: ctx.account.id,
          igCommentId: r.id,
          igMediaId: ctx.post.igMediaId,
          parentId: body.commentId,
          fromId: ctx.account.igUserId,
          fromUsername: ctx.account.username,
          text: body.message,
          isOwn: true,
        });
        break;
      }
      case "hide":
      case "unhide":
        await setCommentHidden(body.commentId, token, body.action === "hide");
        await sql`update comments set hidden = ${body.action === "hide"} where ig_comment_id = ${body.commentId}`;
        break;
      case "delete":
        try {
          await deleteComment(body.commentId, token);
        } catch (e) {
          // Already gone on Instagram: still record it as deleted.
          if (!/does not exist|cannot be loaded|Unsupported/i.test((e as Error).message)) throw e;
        }
        await sql`update comments set deleted_at = now() where ig_comment_id = ${body.commentId}`;
        break;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
