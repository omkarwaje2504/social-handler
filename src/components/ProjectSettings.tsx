"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { checkOrgName } from "@/lib/names";
import { BRAND_COLORS } from "@/lib/projects-client";
import { Modal } from "./Modal";
import { OrgFields, type OrgLists } from "./OrgPicker";

export type { OrgLists };
export type SettingsProject = {
  id: string; name: string; description: string;
  agencyId: string | null; companyId: string | null; brandId: string | null; brandColor: string;
  status: "active" | "closed"; closedAt: string | null; closedByName: string | null; closedReason: string;
  connectUrl: string; accounts: number; members: number; ownerId: string | null; ownerName: string | null;
};
export type OwnerOption = { id: string; name: string };

async function patch(id: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/projects/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Could not save");
}

export function ProjectSettings({ project, orgs: initialOrgs, isSuper, owners = [] }: { project: SettingsProject; orgs: OrgLists; isSuper: boolean; owners?: OwnerOption[] }) {
  const router = useRouter();
  const initial = {
    name: project.name, description: project.description, brandColor: project.brandColor,
    agencyId: project.agencyId, companyId: project.companyId, brandId: project.brandId,
  };
  const [v, setV] = useState(initial);
  const [orgs, setOrgs] = useState(initialOrgs);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dialog, setDialog] = useState<"close" | "reopen" | "rotate" | null>(null);
  const [newOwner, setNewOwner] = useState<string | null>(null); // a pending owner change (super admins)
  const dirty = (Object.keys(v) as (keyof typeof v)[]).some((k) => v[k] !== initial[k]);
  const closed = project.status === "closed";
  const nameCheck = checkOrgName(v.name, "Project name");
  const nameOf = (k: keyof OrgLists, id: string | null) => orgs[k].find((o) => o.id === id)?.name;
  const brand = nameOf("brand", v.brandId), company = nameOf("company", v.companyId), agency = nameOf("agency", v.agencyId);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!nameCheck.ok) return;
    setSaving(true);
    setMsg(null);
    try {
      await patch(project.id, v);
      setMsg({ ok: true, text: "Saved." });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
    setSaving(false);
  }

  return (
    <div className="settings-grid">
      <form className="card settings-card" onSubmit={save} noValidate>
        <div className="settings-preview">
          <span className="proj-avatar xl" style={v.brandColor ? { background: v.brandColor } : undefined}>{(brand || v.name || "?").slice(0, 1).toUpperCase()}</span>
          <div style={{ minWidth: 0 }}>
            <div className="settings-title">{v.name.trim() || "Untitled project"}</div>
            <div className="muted">{[brand, company, agency && `via ${agency}`].filter(Boolean).join(" · ") || "No agency, company or brand yet"}</div>
          </div>
          <span className={`pill ${closed ? "pill-closed" : "pill-active"}`}>{closed ? "Closed" : "Active"}</span>
        </div>

        <h3>General</h3>
        <label htmlFor="pname">Project name</label>
        <input id="pname" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} maxLength={80}
          aria-invalid={!nameCheck.ok} className={!nameCheck.ok ? "invalid" : undefined} />
        {!nameCheck.ok && <div className="err-text">{nameCheck.error}</div>}
        <label style={{ marginTop: 12 }} htmlFor="pdesc">Description</label>
        <textarea id="pdesc" rows={3} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} maxLength={600} placeholder="What this project covers" />

        <h3>Agency, company &amp; brand <span className="muted" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>(optional)</span></h3>
        <div className="field-row">
          <OrgFields value={v} onChange={(links) => setV({ ...v, ...links })} lists={orgs} setLists={setOrgs} />
        </div>
        <p className="hint">Type to search {project.ownerName ? `${project.ownerName}'s` : "the"} directory, or press Enter to add a new name. Picking a brand fills in its company.</p>

        <label style={{ marginTop: 12 }}>Brand colour</label>
        <div className="swatches">
          <button type="button" className={`swatch swatch-none${!v.brandColor ? " on" : ""}`} onClick={() => setV({ ...v, brandColor: "" })} title="Default gradient" />
          {BRAND_COLORS.map((c) => (
            <button key={c} type="button" className={`swatch${v.brandColor === c ? " on" : ""}`} style={{ background: c }} onClick={() => setV({ ...v, brandColor: c })} title={c} />
          ))}
          <label className="swatch swatch-custom" title="Custom colour">
            <input type="color" value={v.brandColor || "#7c5cff"} onChange={(e) => setV({ ...v, brandColor: e.target.value })} />
          </label>
        </div>

        <div className="row" style={{ marginTop: 18, justifyContent: "flex-end", gap: 10 }}>
          {msg && <span className={msg.ok ? "ok-text" : "err-text"} style={{ marginRight: "auto" }}>{msg.text}</span>}
          <button type="button" className="secondary" disabled={!dirty || saving} onClick={() => { setV(initial); setMsg(null); }}>Reset</button>
          <button type="submit" disabled={!dirty || saving || !nameCheck.ok}>{saving ? "Saving…" : "Save changes"}</button>
        </div>
      </form>

      <div className="settings-side">
        <div className="card settings-card">
          <h3>Owner</h3>
          <div className="owner-chip" style={{ marginBottom: 10 }}>
            <span className="me-avatar">{(project.ownerName ?? "S").slice(0, 1).toUpperCase()}</span>
            <span><b>{project.ownerName ?? "Super admins"}</b></span>
          </div>
          <p className="muted">
            {project.ownerName
              ? "The project lives in this admin's workspace: they manage it and give their team access. Other admins can't see it."
              : "Only super admins manage this project."}
          </p>
          {isSuper && (
            <>
              <label htmlFor="owner">Hand the project to</label>
              <select id="owner" value={project.ownerId ?? ""} onChange={(e) => setNewOwner(e.target.value)}>
                <option value="">Super admins</option>
                {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </>
          )}
        </div>

        <div className="card settings-card">
          <h3>Connect link</h3>
          <p className="muted" style={{ fontSize: 13 }}>Send this to account owners. Accounts they connect join this project.{closed ? " It doesn't work while the project is closed." : ""}</p>
          <input readOnly value={project.connectUrl} onFocus={(e) => e.target.select()} aria-label="Connect link" />
          <div className="row" style={{ marginTop: 10, gap: 8 }}>
            <button type="button" className="secondary" onClick={() => navigator.clipboard.writeText(project.connectUrl)}>Copy</button>
            <button type="button" className="secondary" onClick={() => setDialog("rotate")}>Make a new link</button>
          </div>
        </div>

        {isSuper && (
          <div className={`card settings-card ${closed ? "status-closed" : ""}`}>
            <h3>Project status</h3>
            {closed ? (
              <>
                <p style={{ fontSize: 14 }}>
                  <b>Closed</b>{project.closedAt ? ` on ${new Date(project.closedAt).toLocaleString()}` : ""}{project.closedByName ? ` by ${project.closedByName}` : ""}.
                </p>
                {project.closedReason && <p className="muted" style={{ fontSize: 13 }}>Reason: {project.closedReason}</p>}
                <p className="muted" style={{ fontSize: 13 }}>Its owner and {project.members} user(s) see it as closed and can&apos;t open it. Accounts, data and automations are kept.</p>
                <button type="button" onClick={() => setDialog("reopen")}>Reactivate project</button>
              </>
            ) : (
              <>
                <p className="muted" style={{ fontSize: 13 }}>
                  Closing stops its owner and {project.members} user(s) from opening the project or its {project.accounts} account(s). They&apos;ll see it as closed. Projects are never deleted; you can reactivate it any time.
                </p>
                <button type="button" className="danger" onClick={() => setDialog("close")}>Close project</button>
              </>
            )}
          </div>
        )}
      </div>

      {dialog && <ConfirmDialog kind={dialog} project={project} onClose={() => setDialog(null)} onDone={() => { setDialog(null); router.refresh(); }} />}
      {newOwner !== null && (
        <OwnerDialog project={project} ownerId={newOwner} ownerName={owners.find((o) => o.id === newOwner)?.name ?? "Super admins"}
          onClose={() => setNewOwner(null)} onDone={() => { setNewOwner(null); router.refresh(); }} />
      )}
    </div>
  );
}

function OwnerDialog({ project, ownerId, ownerName, onClose, onDone }: { project: SettingsProject; ownerId: string; ownerName: string; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function go() {
    setBusy(true);
    try {
      await patch(project.id, { ownerId: ownerId || null });
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Modal title={`Hand “${project.name}” to ${ownerName}?`} onClose={onClose}>
      <p>{ownerId ? `${ownerName} becomes the owner and manages the project in their workspace.` : "Super admins become the owner."} The current owner loses access.</p>
      <ul className="muted" style={{ margin: "12px 0 0 18px", display: "grid", gap: 6 }}>
        {ownerId && <li>Users from another admin&apos;s team lose access to this project.</li>}
        <li>Agency, company and brand links that aren&apos;t in the new owner&apos;s directory are cleared.</li>
        <li>Accounts, posts, messages and automations stay with the project.</li>
      </ul>
      {error && <div className="error">{error}</div>}
      <div className="row modal-foot">
        <button type="button" className="secondary" onClick={onClose}>Cancel</button>
        <button type="button" disabled={busy} onClick={go}>{busy ? "Working…" : "Change owner"}</button>
      </div>
    </Modal>
  );
}

function ConfirmDialog({ kind, project, onClose, onDone }: { kind: "close" | "reopen" | "rotate"; project: SettingsProject; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const title = { close: "Close this project?", reopen: "Reactivate this project?", rotate: "Make a new connect link?" }[kind];

  async function go() {
    setBusy(true);
    setError("");
    try {
      await patch(project.id, kind === "rotate" ? { rotateLink: true } : { action: kind, reason });
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      {kind === "close" && (
        <>
          <p>Admins and users of <b>{project.name}</b> will immediately lose access and see it marked as closed. Super admins can still open it. Nothing is deleted.</p>
          <label style={{ marginTop: 12 }}>Reason (optional, shown to super admins)</label>
          <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="e.g. Contract ended" />
        </>
      )}
      {kind === "reopen" && <p>Everyone who had access to <b>{project.name}</b> gets it back right away.</p>}
      {kind === "rotate" && <p>The current link stops working. Anyone you sent it to will need the new one.</p>}
      {error && <div className="error">{error}</div>}
      <div className="row modal-foot">
        <button type="button" className="secondary" onClick={onClose}>Cancel</button>
        <button type="button" className={kind === "close" ? "danger" : ""} disabled={busy} onClick={go}>
          {busy ? "Working…" : { close: "Close project", reopen: "Reactivate", rotate: "Make new link" }[kind]}
        </button>
      </div>
    </Modal>
  );
}
