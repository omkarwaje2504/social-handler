"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { PostPicker, type PickablePost } from "./PostPicker";

type FormValues = {
  name: string;
  keyword: string;
  igMediaIds: string[];
  followerMessage: string;
  nonFollowerMessage: string;
  publicReply: string;
};

const EMPTY: FormValues = { name: "", keyword: "", igMediaIds: [], followerMessage: "", nonFollowerMessage: "", publicReply: "" };

/** Create (no ruleId) or edit (ruleId) a keyword automation. */
export function AutomationForm({
  accountId,
  posts,
  ruleId,
  initial,
  onDone,
}: {
  accountId: string;
  posts: PickablePost[];
  ruleId?: string;
  initial?: FormValues;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<FormValues>(initial ?? EMPTY);
  const set = (k: keyof FormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const res = await fetch(ruleId ? `/api/automations/${ruleId}` : "/api/automations", {
      method: ruleId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ruleId ? form : { accountId, ...form }),
    });
    setBusy(false);
    if (!res.ok) return setErr((await res.json()).error ?? "Could not save");
    if (!ruleId) setForm(EMPTY);
    router.refresh();
    onDone?.();
  }

  return (
    <form onSubmit={submit} className="form-row">
      <div className="field-row">
        <div className="field">
          <label>Automation title (optional)</label>
          <input placeholder="e.g. Price enquiries" value={form.name} onChange={set("name")} />
        </div>
        <div className="field">
          <label>Keyword (case-insensitive)</label>
          <input required placeholder="e.g. price" value={form.keyword} onChange={set("keyword")} />
        </div>
        <div className="field">
          <label>Post</label>
          <PostPicker posts={posts} value={form.igMediaIds} onChange={(v) => setForm({ ...form, igMediaIds: v })} />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>DM to people who follow you</label>
          <textarea required value={form.followerMessage} onChange={set("followerMessage")} />
        </div>
        <div className="field">
          <label>DM to people who do not follow you</label>
          <textarea required value={form.nonFollowerMessage} onChange={set("nonFollowerMessage")} />
        </div>
        <div className="field">
          <label>Public reply under the comment (optional)</label>
          <textarea value={form.publicReply} onChange={set("publicReply")} />
        </div>
      </div>
      <div className="row">
        <button disabled={busy}>{busy ? "Saving…" : ruleId ? "Save changes" : "Create automation"}</button>
        {onDone && <button type="button" className="secondary" onClick={onDone}>Cancel</button>}
        {err && <span className="error" style={{ margin: 0 }}>{err}</span>}
      </div>
    </form>
  );
}

export type RuleCard = FormValues & {
  id: string;
  enabled: boolean;
  createdAt: string;
  sent: number;
  matched: number;
};

/** One automation in the list: status, counts and Edit / Pause / Delete / DM stats. */
export function AutomationCard({ accountId, rule, posts }: { accountId: string; rule: RuleCard; posts: PickablePost[] }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(rule.enabled);
  const [editing, setEditing] = useState(false);
  const [stats, setStats] = useState(false);
  const picked = posts.filter((p) => rule.igMediaIds.includes(p.igMediaId));

  async function toggle() {
    await fetch(`/api/automations/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !enabled }),
    });
    setEnabled(!enabled);
  }

  async function remove() {
    if (!confirm(`Delete the automation "${rule.name}"? Its DM history stays in Messages.`)) return;
    await fetch(`/api/automations/${rule.id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="card auto-card">
      <div className="auto-thumb">
        {picked[0]?.thumb ? <img src={picked[0].thumb} alt="" /> : <span>{rule.igMediaIds.length ? "▣" : "∞"}</span>}
        {picked.length > 1 && <span className="auto-thumb-count">+{picked.length - 1}</span>}
      </div>
      <div className="auto-main">
        <div className="row" style={{ gap: 8 }}>
          <h3 style={{ margin: 0 }}>{rule.name}</h3>
          <span className={`pill ${enabled ? "on" : ""}`}>{enabled ? "active" : "paused"}</span>
        </div>
        <div className="muted" style={{ marginTop: 4 }}>
          Keyword <b>“{rule.keyword}”</b> · {rule.igMediaIds.length ? `${rule.igMediaIds.length} selected post${rule.igMediaIds.length > 1 ? "s" : ""}` : "all posts & reels"}
        </div>
        <div className="auto-counts">
          <span><b>{rule.matched}</b> comments</span>
          <span><b>{rule.sent}</b> DMs sent</span>
        </div>
      </div>
      <div className="auto-actions">
        <button className="secondary" onClick={() => setStats(true)}>📊 DM stats</button>
        <button className="secondary" onClick={() => setEditing(true)}>Edit</button>
        <button className="secondary" onClick={toggle}>{enabled ? "Pause" : "Activate"}</button>
        <button className="danger" onClick={remove}>Delete</button>
      </div>

      {editing && (
        <Modal title={`Edit · ${rule.name}`} onClose={() => setEditing(false)} wide>
          <AutomationForm
            accountId={accountId}
            posts={posts}
            ruleId={rule.id}
            initial={{
              name: rule.name, keyword: rule.keyword, igMediaIds: rule.igMediaIds,
              followerMessage: rule.followerMessage, nonFollowerMessage: rule.nonFollowerMessage, publicReply: rule.publicReply,
            }}
            onDone={() => setEditing(false)}
          />
        </Modal>
      )}
      {stats && <AutomationStats accountId={accountId} ruleId={rule.id} title={rule.name} onClose={() => setStats(false)} />}
    </div>
  );
}

type Stats = {
  totals: { matched: number; people: number; followers: number; nonFollowers: number; unknown: number; sent: number; errors: number; replies: number };
  periods: { label: string; matched: number; sent: number }[];
  logs: {
    id: string; createdAt: string; commenterIgsid: string; commenterUsername: string | null; commentText: string;
    isFollower: boolean | null; messageSent: string; status: string; error: string | null; publicReplySent: boolean;
  }[];
};

/** Big popup: counts for one automation, then every comment it handled with a link to the chat. */
function AutomationStats({ accountId, ruleId, title, onClose }: { accountId: string; ruleId: string; title: string; onClose: () => void }) {
  const [data, setData] = useState<Stats | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/automations/${ruleId}`)
      .then(async (r) => (r.ok ? setData(await r.json()) : setErr((await r.json()).error ?? "Could not load")))
      .catch((e) => setErr(String(e)));
  }, [ruleId]);

  const t = data?.totals;
  return (
    <Modal title={`DM stats · ${title}`} onClose={onClose} wide>
      {err && <div className="error">{err}</div>}
      {!data && !err && <p className="muted">Loading…</p>}
      {t && (
        <>
          <div className="grid">
            <Tile label="Comments matched" value={t.matched} />
            <Tile label="People reached" value={t.people} hint="Different people who commented the keyword" />
            <Tile label="Followers" value={t.followers} />
            <Tile label="Non-followers" value={t.nonFollowers} />
            <Tile label="Follow status not shared yet" value={t.unknown} hint="Meta shares it only after the person messages you; it fills in when they reply" />
            <Tile label="DMs sent" value={t.sent} />
            <Tile label="Public replies" value={t.replies} />
            <Tile label="Errors" value={t.errors} />
          </div>
          <table className="period-table" style={{ marginTop: 16 }}>
            <thead><tr><th>Period</th>{data.periods.map((p) => <th key={p.label}>{p.label}</th>)}</tr></thead>
            <tbody>
              <tr><td>Comments matched</td>{data.periods.map((p) => <td key={p.label}>{p.matched}</td>)}</tr>
              <tr><td>DMs sent</td>{data.periods.map((p) => <td key={p.label}>{p.sent}</td>)}</tr>
            </tbody>
          </table>

          <h3 style={{ marginTop: 22 }}>Every comment</h3>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>When</th><th>Person</th><th>Comment</th><th>Follows?</th><th>DM sent</th><th>Result</th><th></th></tr></thead>
              <tbody>
                {data.logs.map((l) => (
                  <tr key={l.id}>
                    <td>{new Date(l.createdAt).toLocaleString()}</td>
                    <td>@{l.commenterUsername ?? l.commenterIgsid}</td>
                    <td>{l.commentText.slice(0, 60)}</td>
                    <td>{l.isFollower === null ? <span title="Instagram shares this only after the person messages you. It fills in automatically when they reply." className="muted">not shared yet</span> : l.isFollower ? "yes" : "no"}</td>
                    <td className="muted" style={{ maxWidth: 260 }}>{l.messageSent || "—"}</td>
                    <td>
                      {l.status === "sent" ? <span className="pill on">DM sent</span> : <span className="pill" title={l.error ?? undefined}>error</span>}
                      {l.publicReplySent && <span className="pill" style={{ marginLeft: 4 }}>replied</span>}
                    </td>
                    <td><Link className="btn secondary" href={`/accounts/${accountId}/messages?user=${encodeURIComponent(l.commenterIgsid)}`}>Open chat</Link></td>
                  </tr>
                ))}
                {data.logs.length === 0 && <tr><td colSpan={7} className="muted">No comments matched this automation yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}

function Tile({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="card stat" style={{ margin: 0 }} title={hint}>
      <div className="label">{label}</div>
      <div className="value">{value.toLocaleString()}</div>
    </div>
  );
}
