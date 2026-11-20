"use client";

import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { checkDesignation, checkPersonName } from "@/lib/names";
import { Icon } from "./Icon";
import { Modal } from "./Modal";

export type PersonRow = {
  id: string; email: string; name: string; designation: string; role: "super_admin" | "admin" | "user";
  active: boolean; lastLoginAt: string | null; createdByName: string | null;
  projects: { id: string; name: string; role: string }[];
  canEdit: boolean;
};
type ProjectOpt = { id: string; name: string };

const ROLE: Record<string, string> = { super_admin: "Super admin", admin: "Admin", user: "User" };

/** People table with filters, plus create / edit popups. */
export function UsersManager({
  people, projects, isSuper, meId, openNew = false,
}: { people: PersonRow[]; projects: ProjectOpt[]; isSuper: boolean; meId: string; openNew?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [project, setProject] = useState("");
  const [sort, setSort] = useState<"name" | "role" | "projects" | "login">("name");
  const [editing, setEditing] = useState<PersonRow | "new" | null>(openNew ? "new" : null);
  // Closing the popup also drops ?new=1 so a refresh doesn't reopen it.
  const close = () => { setEditing(null); if (openNew) router.replace(pathname); };

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = people.filter((p) =>
      (!needle || [p.name, p.email, p.designation].some((s) => s.toLowerCase().includes(needle))) &&
      (!role || p.role === role) &&
      (!project || p.projects.some((x) => x.id === project)));
    const order = { super_admin: 0, admin: 1, user: 2 };
    return list.sort((a, b) =>
      sort === "role" ? order[a.role] - order[b.role] || a.name.localeCompare(b.name)
      : sort === "projects" ? b.projects.length - a.projects.length
      : sort === "login" ? (b.lastLoginAt ?? "").localeCompare(a.lastLoginAt ?? "")
      : (a.name || a.email).localeCompare(b.name || b.email));
  }, [people, q, role, project, sort]);

  return (
    <>
      <div className="card table-card">
      <div className="table-toolbar">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, designation…" aria-label="Search people" className="search-input" style={{ flex: "1 1 220px", maxWidth: 340, width: "auto" }} />
        <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role" style={{ width: "auto", flex: "1 1 140px", maxWidth: 200 }}>
          <option value="">All roles</option>
          {isSuper && <option value="super_admin">Super admins</option>}
          <option value="admin">Admins</option>
          <option value="user">Users</option>
        </select>
        <select value={project} onChange={(e) => setProject(e.target.value)} aria-label="Project" style={{ width: "auto", flex: "1 1 160px", maxWidth: 240 }}>
          <option value="">All projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort" style={{ width: "auto", flex: "1 1 150px", maxWidth: 200 }}>
          <option value="name">Sort: name</option>
          <option value="role">Sort: role</option>
          <option value="projects">Sort: most projects</option>
          <option value="login">Sort: last login</option>
        </select>
        <div className="spacer" />
        <span className="muted">{shown.length} of {people.length}</span>
        <button type="button" onClick={() => setEditing("new")}><Icon name="plus" size={16} />Add user</button>
      </div>

        <div className="table-scroll">
        <table className="perf-table accounts-table sticky-first">
          <thead>
            <tr><th>Person</th><th>Role</th><th>Designation</th><th>Projects</th><th>Last login</th><th>Added by</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.id} style={p.active ? undefined : { opacity: 0.55 }}>
                <td>
                  <div className="acct-cell">
                    <span className="me-avatar">{(p.name || p.email).slice(0, 1).toUpperCase()}</span>
                    <span><b>{p.name || "–"}{p.id === meId && <span className="muted"> (you)</span>}</b><span className="muted">{p.email}</span></span>
                  </div>
                </td>
                <td><span className={`badge ${p.role === "user" ? "" : "pending"}`}>{ROLE[p.role]}</span></td>
                <td>{p.designation || "–"}</td>
                <td style={{ maxWidth: 320 }}>
                  {p.role === "super_admin" ? <span className="muted">All projects</span>
                    : p.projects.length ? p.projects.map((x) => (
                        <a key={x.id} href={`/projects/${x.id}`} className="chip-link" title={x.role === "owner" ? "Owner" : "Has access"}>{x.role === "owner" && <Icon name="key" size={12} />}{x.name}</a>
                      ))
                    : <span className="muted">none</span>}
                </td>
                <td>{p.lastLoginAt ? new Date(p.lastLoginAt).toLocaleString() : "never"}</td>
                <td>{p.createdByName ?? "–"}</td>
                <td>{p.active ? <span className="badge published">Active</span> : <span className="badge failed">Disabled</span>}</td>
                <td>{p.canEdit && <button type="button" className="secondary sm" onClick={() => setEditing(p)}>Edit</button>}</td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={8}>
                <div className="empty">
                  <span className="empty-ico"><Icon name="users" size={24} /></span>
                  <b>{people.length <= 1 ? "No team members yet" : "Nobody matches"}</b>
                  <span className="muted">{people.length <= 1 ? "Add users, then give them access to your projects." : "Try another search or filter."}</span>
                </div>
              </td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
      <p className="hint"><Icon name="key" size={12} /> marks a project the person owns.</p>

      {editing && (
        <PersonForm person={editing === "new" ? null : editing} projects={projects} isSuper={isSuper} meId={meId} onClose={close} />
      )}
    </>
  );
}

function PersonForm({ person, projects, isSuper, meId, onClose }: { person: PersonRow | null; projects: ProjectOpt[]; isSuper: boolean; meId: string; onClose: () => void }) {
  const router = useRouter();
  const [v, setV] = useState({
    email: person?.email ?? "", name: person?.name ?? "", designation: person?.designation ?? "",
    role: person?.role ?? "user", password: "", active: person?.active ?? true,
  });
  // Ticked projects: for an existing person, the ones they already have that this viewer can assign.
  const [projectIds, setProjectIds] = useState<string[]>(
    () => (person?.projects ?? []).map((x) => x.id).filter((id) => projects.some((p) => p.id === id)),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const self = person?.id === meId;
  // Project access is for users; admins own projects (set when a project is created or in its settings).
  const showProjects = projects.length > 0 && v.role === "user" && !self;
  const nameCheck = checkPersonName(v.name);
  const desigCheck = checkDesignation(v.designation);
  const [touched, setTouched] = useState(!!person);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!nameCheck.ok || !desigCheck.ok) return;
    setBusy(true);
    setError("");
    const res = await fetch(person ? `/api/users/${person.id}` : "/api/users", {
      method: person ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(person
        ? { name: v.name, designation: v.designation, role: v.role, active: v.active, password: v.password || undefined, ...(showProjects ? { projectIds } : {}) }
        : { ...v, projectIds }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Could not save");
    onClose();
    router.refresh();
  }

  async function remove() {
    if (!person || !confirm(`Delete ${person.name || person.email}? They lose access to every project. This can't be undone.`)) return;
    const res = await fetch(`/api/users/${person.id}`, { method: "DELETE" });
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? "Could not delete");
    onClose();
    router.refresh();
  }

  return (
    <Modal title={person ? `Edit ${person.name || person.email}` : "Add a new user"} onClose={onClose}>
      <form onSubmit={save} noValidate>
        <div className="field-row">
          <div className="field">
            <label>Email</label>
            <input type="email" value={v.email} disabled={!!person} onChange={(e) => setV({ ...v, email: e.target.value })} required autoFocus={!person} />
          </div>
          <div className="field">
            <label>Full name</label>
            <input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} onBlur={() => setTouched(true)} maxLength={60} className={touched && !nameCheck.ok ? "invalid" : undefined} />
            {touched && !nameCheck.ok && <div className="err-text">{nameCheck.error}</div>}
          </div>
        </div>
        <div className="field-row" style={{ marginTop: 12 }}>
          <div className="field">
            <label>Designation</label>
            <input value={v.designation} onChange={(e) => setV({ ...v, designation: e.target.value })} maxLength={60} placeholder="e.g. Social media manager" className={!desigCheck.ok ? "invalid" : undefined} />
            {!desigCheck.ok && <div className="err-text">{desigCheck.error}</div>}
          </div>
          <div className="field">
            <label>Role</label>
            <select value={v.role} disabled={!isSuper || self} onChange={(e) => setV({ ...v, role: e.target.value as PersonRow["role"] })}>
              <option value="user">User: works in assigned projects</option>
              {isSuper && <option value="admin">Admin: own workspace, projects and team</option>}
              {isSuper && <option value="super_admin">Super admin: everything</option>}
            </select>
          </div>
        </div>
        <label style={{ marginTop: 12 }}>{person ? "New password (leave empty to keep)" : "Password"}</label>
        <input type="text" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} required={!person} minLength={8}
          placeholder="At least 8 characters" autoComplete="new-password" />
        {person && !self && (
          <label className="check" style={{ marginTop: 12 }}>
            <input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} /> Active (can sign in)
          </label>
        )}
        {showProjects && (
          <>
            <label style={{ marginTop: 12 }}>{isSuper ? "Project access" : "Access to your projects"} ({projectIds.length})</label>
            <div className="people-pick">
              {projects.map((p) => (
                <label key={p.id} className="check people-opt">
                  <input type="checkbox" checked={projectIds.includes(p.id)}
                    onChange={(e) => setProjectIds(e.target.checked ? [...projectIds, p.id] : projectIds.filter((x) => x !== p.id))} />
                  <span><b>{p.name}</b></span>
                </label>
              ))}
            </div>
          </>
        )}
        {error && <div className="error">{error}</div>}
        <div className="row modal-foot">
          {person && isSuper && !self && <button type="button" className="danger" onClick={remove} style={{ marginRight: "auto" }}>Delete</button>}
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={busy}>{busy ? "Saving…" : person ? "Save" : "Add"}</button>
        </div>
      </form>
    </Modal>
  );
}
