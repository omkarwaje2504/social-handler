"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Source = "file" | "link";

export function UploadPostForm({ accountId }: { accountId: string }) {
  const [source, setSource] = useState<Source>("file");
  const [file, setFile] = useState<File | null>(null);
  const [link, setLink] = useState("");
  const [mediaType, setMediaType] = useState<"IMAGE" | "REELS">("IMAGE");
  const [caption, setCaption] = useState("");
  const [scheduleAt, setScheduleAt] = useState(""); // datetime-local value; empty = publish now
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await publish();
    } catch {
      setMsg({ ok: false, text: "Something went wrong. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  // Reads an API reply; a non-JSON error page becomes a readable message instead of a crash.
  async function reply(res: Response) {
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data: data as { error?: string; url?: string; isVideo?: boolean } };
  }

  async function publish() {

    let mediaUrl = link.trim();
    let type: "IMAGE" | "REELS" = mediaType;

    // File source: store it first to get a public URL Instagram can download
    if (source === "file") {
      if (!file) return setMsg({ ok: false, text: "Choose a file first." });
      const form = new FormData();
      form.append("file", file);
      const up = await reply(await fetch("/api/uploads", { method: "POST", body: form }));
      if (!up.ok) return setMsg({ ok: false, text: up.data.error ?? "Upload failed. Try again." });
      mediaUrl = up.data.url!;
      type = up.data.isVideo ? "REELS" : "IMAGE";
    }

    // Schedule for later, or publish to Instagram now
    const scheduled = Boolean(scheduleAt);
    const res = scheduled
      ? await fetch(`/api/accounts/${accountId}/scheduled`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mediaUrl, mediaType: type, caption, publishAt: new Date(scheduleAt).toISOString() }),
        })
      : await fetch(`/api/accounts/${accountId}/posts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mediaUrl, mediaType: type, caption }),
        });
    const done = await reply(res);
    if (!done.ok) return setMsg({ ok: false, text: done.data.error ?? "Instagram didn't accept the post. Try again." });
    setMsg({
      ok: true,
      text: scheduled ? `Scheduled for ${new Date(scheduleAt).toLocaleString()}.` : "Published to Instagram.",
    });
    setScheduleAt("");
    setFile(null);
    setLink("");
    setCaption("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="form-row">
      <div className="row">
        <button
          type="button"
          className={source === "file" ? "" : "secondary"}
          onClick={() => setSource("file")}
        >
          Upload file
        </button>
        <button
          type="button"
          className={source === "link" ? "" : "secondary"}
          onClick={() => setSource("link")}
        >
          Paste public link
        </button>
      </div>

      {source === "file" ? (
        <div>
          <label>File (JPG photo, or MP4/MOV reel)</label>
          <input
            type="file"
            accept="image/jpeg,video/mp4,video/quicktime"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <p className="muted" style={{ marginTop: 4 }}>
            Files up to 4 MB. Instagram accepts JPG photos (not PNG). For bigger reels, use &ldquo;Paste public link&rdquo;.
          </p>
        </div>
      ) : (
        <div>
          <label>Public media URL</label>
          <input placeholder="https://…" value={link} onChange={(e) => setLink(e.target.value)} />
          <p className="muted" style={{ marginTop: 4 }}>
            Must be publicly reachable (JPG for photos, MP4 for reels). Instagram downloads it from this URL.
          </p>
          <label>Type</label>
          <select value={mediaType} onChange={(e) => setMediaType(e.target.value as "IMAGE" | "REELS")}>
            <option value="IMAGE">Photo</option>
            <option value="REELS">Reel</option>
          </select>
        </div>
      )}

      <div>
        <label>Caption</label>
        <textarea value={caption} onChange={(e) => setCaption(e.target.value)} />
      </div>
      <div>
        <label>Schedule for later (optional)</label>
        <input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
        <p className="muted" style={{ marginTop: 4 }}>
          Leave empty to publish now. Scheduled posts go out automatically while the app server is running.
        </p>
      </div>
      <div className="row">
        <button disabled={busy}>{busy ? "Working…" : scheduleAt ? "Schedule" : "Share"}</button>
        {msg && <span className={msg.ok ? "notice" : "error"} style={{ margin: 0 }}>{msg.text}</span>}
      </div>
    </form>
  );
}
