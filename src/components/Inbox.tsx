"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";

export type Thread = {
  userId: string;
  username: string | null;
  lastText: string;
  lastAt: string;
  lastDirection: "in" | "out";
  unread: number;
};

export type ChatMessage = {
  id: string;
  direction: "in" | "out";
  text: string;
  sentAt: string;
  source: string;
  automationName: string | null;
  hasAttachment: boolean;
};

/** Messages inbox: thread list on the left, chat + reply box on the right. Refreshes every 10 s. */
export function Inbox({
  accountId,
  threads,
  selected,
  messages,
  lastInboundAt,
}: {
  accountId: string;
  threads: Thread[];
  selected: string | null;
  messages: ChatMessage[];
  lastInboundAt: string | null;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setInterval(() => router.refresh(), 10000);
    return () => clearInterval(t);
  }, [router]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [selected, messages.length]);

  useEffect(() => {
    if (!selected) return;
    fetch(`/api/accounts/${accountId}/messages`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user: selected }),
    }).catch(() => {});
  }, [accountId, selected, messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !text.trim()) return;
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/accounts/${accountId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: selected, text }),
    });
    setBusy(false);
    if (!res.ok) return setErr((await res.json()).error ?? "Could not send");
    setText("");
    router.refresh();
  }

  async function sync() {
    setSyncMsg("Syncing…");
    const res = await fetch(`/api/accounts/${accountId}/messages/sync`, { method: "POST" });
    const data = await res.json();
    setSyncMsg(res.ok ? `Imported ${data.messages} messages from ${data.conversations} chats` : data.error);
    router.refresh();
  }

  const current = threads.find((t) => t.userId === selected);
  const shown = threads.filter((t) => !q || (t.username ?? t.userId).toLowerCase().includes(q.toLowerCase()));
  const windowOpen = lastInboundAt ? Date.now() - new Date(lastInboundAt).getTime() < 24 * 3600 * 1000 : false;

  return (
    <div className="inbox card">
      <aside className="inbox-list">
        <div className="inbox-tools">
          <input placeholder="Search people" value={q} onChange={(e) => setQ(e.target.value)} />
          <button type="button" className="secondary" onClick={sync} title="Import recent chats from Instagram">⟳</button>
        </div>
        {syncMsg && <div className="muted" style={{ padding: "0 12px 8px" }}>{syncMsg}</div>}
        {shown.map((t) => (
          <Link
            key={t.userId}
            href={`/accounts/${accountId}/messages?user=${encodeURIComponent(t.userId)}`}
            className={`thread${t.userId === selected ? " active" : ""}`}
            scroll={false}
          >
            <span className="thread-avatar">{(t.username ?? "?").slice(0, 1).toUpperCase()}</span>
            <span className="thread-text">
              <b>@{t.username ?? t.userId}</b>
              <span className="muted">{t.lastDirection === "out" ? "You: " : ""}{t.lastText || "(attachment)"}</span>
            </span>
            <span className="thread-meta">
              <span className="muted">{new Date(t.lastAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
              {t.unread > 0 && <span className="unread">{t.unread}</span>}
            </span>
          </Link>
        ))}
        {shown.length === 0 && (
          <div className="muted" style={{ padding: 16 }}>
            No conversations yet. Messages appear here when people DM the account or an automation replies. Use ⟳ to import recent chats.
          </div>
        )}
      </aside>

      <section className="inbox-chat">
        {!current ? (
          <div className="chat-empty muted">Select a conversation</div>
        ) : (
          <>
            <header className="chat-head">
              <span className="thread-avatar">{(current.username ?? "?").slice(0, 1).toUpperCase()}</span>
              <div>
                <b>@{current.username ?? current.userId}</b>
                <div className="muted">{windowOpen ? "Can reply (last message within 24 h)" : "Reply window closed: they need to message again"}</div>
              </div>
              <div className="spacer" />
              {current.username && (
                <a className="btn secondary" href={`https://instagram.com/${current.username}`} target="_blank" rel="noreferrer"><Icon name="external" size={15} />Profile</a>
              )}
            </header>
            <div className="chat-body">
              {messages.map((m) => (
                <div key={m.id} className={`bubble-row ${m.direction}`}>
                  <div className={`bubble ${m.direction}`}>
                    {m.text || (m.hasAttachment ? "Attachment" : "")}
                    <div className="bubble-meta">
                      {new Date(m.sentAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      {m.source === "automation" && <> · auto-DM: {m.automationName ?? "automation"}</>}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>
            <form className="chat-compose" onSubmit={send}>
              <input placeholder="Message…" value={text} onChange={(e) => setText(e.target.value)} />
              <button disabled={busy || !text.trim()}>{busy ? "Sending…" : "Send"}</button>
            </form>
            {err && <div className="error" style={{ margin: "0 14px 12px" }}>{err}</div>}
          </>
        )}
      </section>
    </div>
  );
}
