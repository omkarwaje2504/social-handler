"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { checkOrgName } from "@/lib/names";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { OrgFields, type OrgLists, type OrgOption } from "./OrgPicker";

export type PersonOption = { id: string; name: string; email: string; designation: string; role: string };
const EMPTY = { agencyId: null as string | null, companyId: null as string | null, brandId: null as string | null };

/**
 * "New project" button and popup. An admin's project is theirs. A super admin picks the owner:
 * one of the admins (the project then lives in that admin's workspace and directory) or the
 * super admins themselves.
 */
export function ProjectFormButton({ admins = [], label, className = "btn", isSuper = false }: {
  admins?: PersonOption[]; label: string; className?: string; isSuper?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [owner, setOwner] = useState(""); // "" = super admins; else an admin's code
  const [v, setV] = useState({ name: "", description: "", ...EMPTY });
  const [touched, setTouched] = useState(false);
  const [lists, setLists] = useState<OrgLists>({ agency: [], company: [], brand: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const nameCheck = checkOrgName(v.name, "Project name");

  // The agency / company / brand lists of the owner's directory.
  useEffect(() => {
    if (!open) return;
    const q = isSuper && owner ? `?workspace=${encodeURIComponent(owner)}` : "";
    fetch(`/api/orgs${q}`).then((r) => (r.ok ? r.json() : [])).then((rows: (OrgOption & { kind: keyof OrgLists })[]) => {
      const by = (k: keyof OrgLists) => rows.filter((r) => r.kind === k);
      setLists({ agency: by("agency"), company: by("company"), brand: by("brand") });
    }).catch(() => {});
  }, [open, owner, isSuper]);

  function pickOwner(code: string) {
    setOwner(code);
    setV((cur) => ({ ...cur, ...EMPTY })); // links belong to one directory
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!nameCheck.ok) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...v, ownerId: isSuper && owner ? owner : undefined }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Could not create the project");
    setOpen(false);
    router.push(`/projects/${data.id}`);
  }

  const ownerName = admins.find((a) => a.id === owner);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}><Icon name="plus" size={16} />{label}</button>
      {open && (
        <Modal title="New project" onClose={() => setOpen(false)} wide>
          <form onSubmit={save} noValidate>
            {isSuper && (
              <>
                <label htmlFor="np-owner" style={{ marginTop: 0 }}>Owner</label>
                <select id="np-owner" value={owner} onChange={(e) => pickOwner(e.target.value)}>
                  <option value="">Super admins (keep it for us)</option>
                  {admins.filter((a) => a.role === "admin").map((a) => (
                    <option key={a.id} value={a.id}>{a.name || a.email}{a.designation ? ` · ${a.designation}` : ""}</option>
                  ))}
                </select>
                <div className="hint">
                  {ownerName
                    ? `It goes into ${ownerName.name || ownerName.email}'s workspace: they manage it and give their team access. Other admins never see it.`
                    : "Only super admins manage it. You can hand it to an admin later in project settings."}
                </div>
              </>
            )}
            <label htmlFor="np-name" style={isSuper ? undefined : { marginTop: 0 }}>Project name</label>
            <input id="np-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} onBlur={() => setTouched(true)}
              autoFocus={!isSuper} maxLength={80} placeholder="e.g. City Hospital – Instagram" className={touched && !nameCheck.ok ? "invalid" : undefined} />
            {touched && !nameCheck.ok && <div className="err-text">{nameCheck.error}</div>}

            <label htmlFor="np-desc">Description <span className="muted">(optional)</span></label>
            <textarea id="np-desc" rows={2} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} maxLength={600} placeholder="What this project covers" />

            <div className="field-row" style={{ marginTop: 4 }}>
              <OrgFields value={v} onChange={(links) => setV({ ...v, ...links })} lists={lists} setLists={setLists} optional workspace={isSuper && owner ? owner : undefined} />
            </div>
            <div className="hint">Type to search the {ownerName ? "owner's" : "your"} directory, or press Enter to add a new name.</div>

            {error && <div className="error"><Icon name="alert" size={16} />{error}</div>}
            <div className="row modal-foot">
              <button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button>
              <button type="submit" disabled={busy || (touched && !nameCheck.ok)}>{busy ? "Creating…" : "Create project"}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
