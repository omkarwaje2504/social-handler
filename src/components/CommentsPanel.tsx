"use client";

import { useEffect, useState } from "react";

type Comment = {
  id: string;
  igCommentId: string;
  parentId: string | null;
  text: string;
  fromUsername: string | null;
  commentedAt: string;
  likeCount: number;
  hidden: boolean;
  isOwn: boolean;
  deletedAt: string | null;
};

export function CommentsPanel({ postId }: { postId: string }) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [showDeleted, setShowDeleted] = useState(true);

  async function load() {
    const res = await fetch(`/api/posts/${postId}/comments`);
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    setComments(data.comments);
    setNote(data.liveError ? `Showing saved comments; Instagram refresh failed: ${data.liveError}` : null);
  }

  useEffect(() => {
    load();
  }, [postId]);

  async function act(c: Comment, action: "reply" | "hide" | "unhide" | "delete") {
    const message = replies[c.igCommentId];
    if (action === "reply" && !message?.trim()) return;
    if (action === "delete" && !confirm("Delete this comment on Instagram? A record stays here until you delete it permanently.")) return;
    const res = await fetch(`/api/posts/${postId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commentId: c.igCommentId, action, message }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    setReplies((r) => ({ ...r, [c.igCommentId]: "" }));
    load();
  }

  async function purge(c: Comment) {
    if (!confirm("Permanently remove this comment record? This cannot be undone.")) return;
    const res = await fetch(`/api/comments/${c.id}`, { method: "DELETE" });
    if (!res.ok) return setError((await res.json()).error);
    load();
  }

  if (!comments) return error ? <div className="error">{error}</div> : <p className="muted">Loading comments…</p>;
  const deletedCount = comments.filter((c) => c.deletedAt).length;
  const list = comments.filter((c) => showDeleted || !c.deletedAt);

  return (
    <div>
      {error && <div className="error">{error}</div>}
      {note && <div className="muted" style={{ marginBottom: 8 }}>{note}</div>}
      <div className="row" style={{ marginBottom: 6 }}>
        <span className="muted">{comments.length - deletedCount} live · {deletedCount} deleted</span>
        <div className="spacer" />
        {deletedCount > 0 && (
          <label className="check" style={{ margin: 0 }}>
            <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} /> Show deleted
          </label>
        )}
      </div>
      {list.length === 0 && <p className="muted">No comments yet.</p>}
      {list.map((c) => (
        <div key={c.id} className={`comment${c.deletedAt ? " deleted" : ""}${c.parentId ? " reply" : ""}`}>
          <div className="meta">
            @{c.fromUsername ?? "unknown"} · {new Date(c.commentedAt).toLocaleString()} · ♥ {c.likeCount}
            {c.isOwn && <span className="pill" style={{ marginLeft: 6 }}>you</span>}
            {c.hidden && <span className="pill" style={{ marginLeft: 6 }}>hidden</span>}
            {c.deletedAt && <span className="pill" style={{ marginLeft: 6 }}>deleted {new Date(c.deletedAt).toLocaleDateString()}</span>}
          </div>
          <div style={{ margin: "4px 0 6px" }}>{c.text}</div>
          {c.deletedAt ? (
            <button className="danger" onClick={() => purge(c)}>Delete permanently</button>
          ) : (
            <div className="row">
              <input
                style={{ maxWidth: 380 }}
                placeholder="Reply…"
                value={replies[c.igCommentId] ?? ""}
                onChange={(e) => setReplies({ ...replies, [c.igCommentId]: e.target.value })}
              />
              <button className="secondary" onClick={() => act(c, "reply")}>Reply</button>
              <button className="secondary" onClick={() => act(c, c.hidden ? "unhide" : "hide")}>{c.hidden ? "Unhide" : "Hide"}</button>
              <button className="danger" onClick={() => act(c, "delete")}>Delete</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
