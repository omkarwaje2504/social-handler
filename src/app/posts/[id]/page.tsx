import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { isId, sql } from "@/lib/db";
import type { AccountDoc, PostDoc } from "@/lib/models";
import { fetchMediaInsights } from "@/lib/graph";
import { PostEditor } from "@/components/PostEditor";
import { CommentsPanel } from "@/components/CommentsPanel";

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!isId(id)) notFound();
  const [post] = await sql<PostDoc[]>`select * from posts where id = ${id}`;
  if (!post) notFound();

  const [account] = await sql<AccountDoc[]>`select * from accounts where id = ${post.accountId}`;
  // Refresh analytics from Instagram when the page loads (falls back to the stored values).
  let metrics = post.metrics ?? {};
  if (account) {
    metrics = await fetchMediaInsights(post.igMediaId, account.accessToken, post.mediaType).catch(() => metrics);
  }

  const rows: [string, number | undefined][] = [
    ["Likes", post.likeCount],
    ["Comments", post.commentsCount],
    ["Reach", metrics.reach],
    ["Views / plays / impressions", metrics.views ?? metrics.plays ?? metrics.impressions],
    ["Saves", metrics.saved],
    ["Shares", metrics.shares],
    ["Total interactions", metrics.total_interactions],
  ];

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <h1 style={{ marginBottom: 0 }}>Post</h1>
        <span className="pill">{post.mediaType}</span>
        <div className="spacer" />
        <Link className="btn secondary" href={`/accounts/${post.accountId}`}>← Back</Link>
        {post.permalink && <a className="btn secondary" href={post.permalink} target="_blank" rel="noreferrer">Open on Instagram</a>}
      </div>

      <div className="card row" style={{ alignItems: "flex-start" }}>
        {post.thumbnailUrl || post.mediaUrl ? (
          <img src={post.thumbnailUrl || post.mediaUrl || undefined} alt="" style={{ width: 220, borderRadius: 10 }} />
        ) : null}
        <div style={{ flex: 1, minWidth: 260 }}>
          <h3>Caption</h3>
          <PostEditor postId={id} initialCaption={post.caption ?? ""} />
        </div>
      </div>

      <div className="card">
        <h3>Analytics</h3>
        <div className="grid">
          {rows.map(([label, value]) => (
            <div key={label} className="stat"><div className="label">{label}</div><div className="value">{value?.toLocaleString() ?? "–"}</div></div>
          ))}
        </div>
        <p className="muted" style={{ marginTop: 10 }}>Posted {post.timestamp ? new Date(post.timestamp).toLocaleString() : "–"}</p>
      </div>

      <div className="card">
        <h3>Comments</h3>
        <CommentsPanel postId={id} />
      </div>
    </>
  );
}

export const instant = false;
