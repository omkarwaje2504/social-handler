"use client";

import { useState } from "react";
import { Modal } from "./Modal";

export type PickablePost = {
  igMediaId: string;
  thumb: string | null;
  caption: string;
  mediaType: string;
  date: string | null;
};

/** Field button + popup of small thumbnails; pick several posts/reels, or none = all posts. */
export function PostPicker({
  posts,
  value,
  onChange,
}: {
  posts: PickablePost[];
  value: string[]; // [] = all posts
  onChange: (igMediaIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(value);
  const [filter, setFilter] = useState<"all" | "posts" | "reels">("all");
  const chosen = posts.filter((p) => value.includes(p.igMediaId));
  const shown = posts.filter((p) => (filter === "all" ? true : filter === "reels" ? p.mediaType === "REELS" : p.mediaType !== "REELS"));
  const toggle = (id: string) => setDraft((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));

  return (
    <>
      <button type="button" className="picker-field" onClick={() => { setDraft(value); setOpen(true); }}>
        <span className="picker-label">
          {chosen.length === 0 ? "∞ All posts & reels" : `${chosen.length} post${chosen.length > 1 ? "s" : ""} selected`}
        </span>
        <span className="picker-change">Choose ▾</span>
      </button>
      {chosen.length > 0 && (
        <div className="picker-chips">
          {chosen.map((p) => (
            <span key={p.igMediaId} className="picker-chip" title={p.caption || "(no caption)"}>
              {p.thumb ? <img src={p.thumb} alt="" /> : <span className="picker-blank" />}
              {p.mediaType === "REELS" && <span className="chip-type">▶</span>}
              <button
                type="button"
                aria-label="Remove"
                onClick={() => onChange(value.filter((x) => x !== p.igMediaId))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <Modal title="Choose posts & reels" onClose={() => setOpen(false)} wide>
          <div className="row" style={{ marginBottom: 12 }}>
            <div className="seg">
              {(["all", "posts", "reels"] as const).map((f) => (
                <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                  {f === "all" ? `All (${posts.length})` : f === "posts" ? "Posts" : "Reels"}
                </button>
              ))}
            </div>
            <div className="spacer" />
            <span className="muted">{draft.length ? `${draft.length} selected` : "None selected = all posts"}</span>
            <button type="button" className="secondary" onClick={() => setDraft(shown.map((p) => p.igMediaId))}>Select shown</button>
            <button type="button" className="secondary" onClick={() => setDraft([])}>Clear</button>
          </div>
          <div className="pick-grid">
            {shown.map((p) => {
              const on = draft.includes(p.igMediaId);
              return (
                <button
                  key={p.igMediaId}
                  type="button"
                  className={`pick-tile${on ? " picked" : ""}`}
                  onClick={() => toggle(p.igMediaId)}
                  title={p.caption || "(no caption)"}
                  aria-pressed={on}
                >
                  {p.thumb ? <img src={p.thumb} alt="" loading="lazy" /> : <span className="picker-blank" />}
                  {p.mediaType === "REELS" && <span className="pick-type">▶</span>}
                  <span className="pick-check">{on ? "✓" : ""}</span>
                  {p.date && <span className="pick-cap">{p.date}</span>}
                </button>
              );
            })}
            {shown.length === 0 && <p className="muted">No posts synced yet. Use Sync on the dashboard.</p>}
          </div>
          <div className="row modal-foot">
            <button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" onClick={() => { onChange(draft); setOpen(false); }}>
              {draft.length ? `Use ${draft.length} selected` : "Use all posts"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
