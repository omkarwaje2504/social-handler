"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "./Icon";
import { Modal } from "./Modal";

export type Member = { userId: string; name: string; email: string; designation: string; userRole: string; memberRole: string };
export type Candidate = { id: string; name: string; email: string; designation: string; role: string };

/**
 * Who can open the project: its owner (an admin, or the super admins) plus the users given access.
 * The owner and super admins add and remove users; only users are added (admins own their projects).
 */
export function ProjectPeople({
  projectId, members, candidates, canManage, meId, ownerName,
}: {
  projectId: string; members: Member[]; candidates: Candidate[]; canManage: boolean; meId: string; ownerName: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy("add");
    setError("");
    const res = await fetch(`/api/projects/${projectId}/members`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) return setError(data.error ?? "Could not add");
    setOpen(false);
    setUserId("");
    router.refresh();
  }

  async function remove(m: Member) {
    if (!confirm(`Remove ${m.name || m.email}'s access to this project?`)) return;
    setBusy(m.userId);
    const res = await fetch(`/api/projects/${projectId}/members?userId=${m.userId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) alert(data.error ?? "Could not remove");
    router.refresh();
  }

  return (
    <section className="panel" style={{ marginTop: 16 }}>
      <div className="panel-head">
        <div><h3>People with access</h3><p>The owner, super admins and {members.length} user{members.length === 1 ? "" : "s"}</p></div>
        {canManage && (
          <button type="button" className="sm" onClick={() => setOpen(true)} disabled={!candidates.length}
            title={candidates.length ? "" : "Everyone you can add already has access"}>
            <Icon name="plus" size={15} />Give access
          </button>
        )}
      </div>
      <div className="panel-body">
        <div className="people-list">
          <div className="person">
            <span className="me-avatar">{(ownerName ?? "S").slice(0, 1).toUpperCase()}</span>
            <div style={{ flex: 1 }}>
              <b>{ownerName ?? "Super admins"}</b>
              <div className="muted">{ownerName ? "Owner · manages the project and its access" : "Owner · only super admins manage it"}</div>
            </div>
            <span className="badge accent">Owner</span>
          </div>
          {members.map((m) => (
            <div key={m.userId} className="person">
              <span className="me-avatar">{(m.name || m.email).slice(0, 1).toUpperCase()}</span>
              <div style={{ flex: 1 }}>
                <b>{m.name || m.email}{m.userId === meId && <span className="muted"> (you)</span>}</b>
                <div className="muted">{[m.designation, m.email].filter(Boolean).join(" · ")}</div>
              </div>
              <span className="badge">User</span>
              {canManage && (
                <button type="button" className="ghost sm icon-only" disabled={busy === m.userId} onClick={() => remove(m)} title="Remove access" aria-label={`Remove ${m.name || m.email}`}>
                  <Icon name="x" size={16} />
                </button>
              )}
            </div>
          ))}
          {members.length === 0 && <div className="muted">No users yet{canManage ? ". Use “Give access” to add people from your team." : "."}</div>}
        </div>
      </div>

      {open && (
        <Modal title="Give access to this project" onClose={() => setOpen(false)}>
          <form onSubmit={add}>
            <label htmlFor="pp-user" style={{ marginTop: 0 }}>Person</label>
            <select id="pp-user" value={userId} onChange={(e) => setUserId(e.target.value)} required autoFocus>
              <option value="">Choose…</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>{c.name || c.email}{c.designation ? ` · ${c.designation}` : ""}</option>
              ))}
            </select>
            <p className="hint">
              They&apos;ll see this project on their dashboard and can work with its accounts. Not in the list? Add them on the <a href="/users?new=1" className="profile-link">Users</a> page first.
            </p>
            {error && <div className="error"><Icon name="alert" size={16} />{error}</div>}
            <div className="row modal-foot">
              <button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button>
              <button type="submit" disabled={!userId || busy === "add"}>{busy === "add" ? "Adding…" : "Give access"}</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}

/** Inline editor for an account's type and project (the owner or a super admin). */
export function AccountMeta({
  projectId, accountId, accountType, types, projects,
}: {
  projectId: string; accountId: string; accountType: string;
  types: { key: string; label: string }[]; projects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function save(patch: Record<string, string>) {
    setBusy(true);
    const res = await fetch(`/api/projects/${projectId}/accounts/${accountId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    setBusy(false);
    if (!res.ok) alert((await res.json().catch(() => ({}))).error ?? "Could not save");
    router.refresh();
  }
  return (
    <div className="acct-meta">
      <select defaultValue={accountType} disabled={busy} onChange={(e) => save({ accountType: e.target.value })} aria-label="Account type">
        {types.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
      </select>
      {projects.length > 1 && (
        <select
          value=""
          disabled={busy}
          onChange={(e) => e.target.value && confirm("Move this account (and all its data) to the other project?") && save({ projectId: e.target.value })}
          aria-label="Move to project"
        >
          <option value="">Move to…</option>
          {projects.filter((p) => p.id !== projectId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}
    </div>
  );
}

/** Copies the project's public connect link (for account owners) to the clipboard. */
export function CopyLink({ url, label = "Copy connect link" }: { url: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="secondary"
      onClick={async () => {
        await navigator.clipboard.writeText(url).catch(() => prompt("Copy this link", url));
        setDone(true);
        setTimeout(() => setDone(false), 1800);
      }}
    >
      <Icon name={done ? "check" : "link"} size={16} />{done ? "Copied" : label}
    </button>
  );
}
