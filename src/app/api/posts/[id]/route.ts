import { NextResponse } from "next/server";
import { isId, sql } from "@/lib/db";
import { fetchMediaInsights, updateMediaCaption } from "@/lib/graph";
import type { AccountDoc, PostDoc } from "@/lib/models";

type Ctx = { params: Promise<{ id: string }> };
const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

async function loadPost(id: string) {
  if (!isId(id)) return null;
  const [post] = await sql<PostDoc[]>`select * from posts where id = ${id}`;
  if (!post) return null;
  const [account] = await sql<AccountDoc[]>`select * from accounts where id = ${post.accountId}`;
  return { post, account: account ?? null };
}

// Post details + fresh analytics.
export async function GET(_req: Request, { params }: Ctx) {
  const ctx = await loadPost((await params).id);
  if (!ctx) return notFound();
  const { post, account } = ctx;
  if (account) {
    const metrics = await fetchMediaInsights(post.igMediaId, account.accessToken, post.mediaType).catch(() => post.metrics);
    await sql`update posts set metrics = ${sql.json(metrics)}, synced_at = now() where id = ${post.id}`;
    post.metrics = metrics;
  }
  return NextResponse.json(post);
}

// Edit caption on Instagram and in the app.
export async function PATCH(req: Request, { params }: Ctx) {
  const ctx = await loadPost((await params).id);
  if (!ctx) return notFound();
  const { caption } = (await req.json()) as { caption: string };
  try {
    if (ctx.account) await updateMediaCaption(ctx.post.igMediaId, ctx.account.accessToken, caption);
  } catch (e) {
    return NextResponse.json({ error: `Instagram rejected the edit: ${(e as Error).message}` }, { status: 400 });
  }
  await sql`update posts set caption = ${caption}, synced_at = now() where id = ${ctx.post.id}`;
  return NextResponse.json({ ok: true });
}

// Instagram's Graph API cannot delete media, so this removes the post from the app only.
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (isId(id)) await sql`update posts set removed_from_app = true where id = ${id}`;
  return NextResponse.json({
    ok: true,
    note: "Removed from the app. Instagram's API cannot delete posts; delete it in the Instagram app to remove it there.",
  });
}
