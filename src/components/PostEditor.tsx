"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PostEditor({ postId, initialCaption }: { postId: string; initialCaption: string }) {
  const [caption, setCaption] = useState(initialCaption);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/posts/${postId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caption }),
    });
    const data = await res.json();
    setBusy(false);
    setMsg(res.ok ? { ok: true, text: "Caption updated." } : { ok: false, text: data.error });
    if (res.ok) router.refresh();
  }

  async function remove() {
    if (!confirm("Remove this post from the app? (It stays on Instagram; delete it in the Instagram app.)")) return;
    const res = await fetch(`/api/posts/${postId}`, { method: "DELETE" });
    const data = await res.json();
    setMsg({ ok: res.ok, text: data.note ?? data.error });
  }

  return (
    <div className="form-row">
      <textarea value={caption} onChange={(e) => setCaption(e.target.value)} style={{ minHeight: 140 }} />
      <div className="row">
        <button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save caption"}</button>
        <button className="danger" onClick={remove}>Remove from app</button>
      </div>
      {msg && <div className={msg.ok ? "notice" : "error"}>{msg.text}</div>}
    </div>
  );
}
