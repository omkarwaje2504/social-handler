"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DUPLICATE_AT, checkOrgName, fuzzyFilter, similarity } from "@/lib/names";
import { Modal } from "./Modal";
import { Icon } from "./Icon";

export type DirRow = {
  id: string; name: string; createdAt: string; createdByName: string | null;
  projects: { id: string; name: string; status: string }[];
  companyId: string | null; companyName: string | null; // brands: the company they belong to
  brands: { id: string; name: string }[];                // companies: their brands
};
type Company = { id: string; name: string };
type Kind = "agency" | "company" | "brand";
const ONE: Record<Kind, string> = { agency: "agency", company: "company", brand: "brand" };

/** Table of one list (agencies, companies or brands) with fuzzy search, add, and duplicate tools. */
export function DirectoryManager({ kind, rows, companies, canManage, workspace }: { kind: Kind; rows: DirRow[]; companies: Company[]; canManage: boolean; workspace?: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"name" | "projects" | "newest">("name");
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<DirRow | null>(null);
  const [merging, setMerging] = useState<DirRow | null>(null);

  const shown = useMemo(() => {
    const list = q.trim() ? fuzzyFilter(rows, q, (r) => (kind === "brand" && r.companyName ? `${r.name} ${r.companyName}` : r.name)) : [...rows];
    if (!q.trim()) {
      list.sort((a, b) =>
        sort === "projects" ? b.projects.length - a.projects.length || a.name.localeCompare(b.name)
        : sort === "newest" ? b.createdAt.localeCompare(a.createdAt)
        : a.name.localeCompare(b.name));
    }
    return list;
  }, [rows, q, sort]);

  // Pairs that look like the same thing ("Acme" / "ACME Pvt Ltd", "Nestle" / "Nesle").
  const dupes = useMemo(() => {
    const out: { a: DirRow; b: DirRow; s: number }[] = [];
    for (let i = 0; i < rows.length; i++)
      for (let j = i + 1; j < rows.length; j++) {
        const s = similarity(rows[i].name, rows[j].name);
        if (s >= DUPLICATE_AT) out.push({ a: rows[i], b: rows[j], s });
      }
    return out.sort((x, y) => y.s - x.s).slice(0, 20);
  }, [rows]);

  async function remove(r: DirRow) {
    if (!confirm(`Delete “${r.name}”? This can't be undone.`)) return;
    const res = await fetch(`/api/orgs/${r.id}`, { method: "DELETE" });
    if (!res.ok) alert((await res.json().catch(() => ({}))).error ?? "Could not delete");
    router.refresh();
  }

  return (
    <>
      {canManage && dupes.length > 0 && (
        <div className="card dupes">
          <div className="row" style={{ marginBottom: 8 }}>
            <b style={{ flex: 1, display: "inline-flex", gap: 8, alignItems: "center" }}><Icon name="alert" size={16} />{dupes.length} possible duplicate{dupes.length === 1 ? "" : "s"}</b>
            <span className="muted" style={{ fontSize: 12 }}>Merge them so every project points to one entry.</span>
          </div>
          {dupes.map(({ a, b, s }) => (
            <div key={`${a.id}-${b.id}`} className="dupe-row">
              <span><b>{a.name}</b> <span className="muted">({a.projects.length})</span></span>
              <span className="muted">≈ {Math.round(s * 100)}%</span>
              <span><b>{b.name}</b> <span className="muted">({b.projects.length})</span></span>
              <div className="spacer" />
              <button type="button" className="secondary sm" onClick={() => setMerging(a)}>Merge “{a.name}”</button>
            </div>
          ))}
        </div>
      )}

      <div className="card table-card">
        <div className="table-toolbar">
          <input className="search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${ONE[kind]} names (typos are fine)…`} aria-label="Search" />
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort" disabled={!!q.trim()}>
            <option value="name">Sort: A–Z</option>
            <option value="projects">Sort: most projects</option>
            <option value="newest">Sort: newest</option>
          </select>
          <div className="spacer" />
          <span className="muted">{shown.length} of {rows.length}</span>
          <button type="button" onClick={() => setAdding(true)}>+ Add {ONE[kind]}</button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="perf-table proj-table">
            <thead><tr><th>Name</th>{kind === "brand" && <th>Company</th>}{kind === "company" && <th>Brands</th>}<th>Projects</th><th>Added by</th><th>Added</th><th></th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="proj-cell">
                      <span className="proj-avatar">{r.name.slice(0, 1).toUpperCase()}</span>
                      <b>{r.name}</b>
                    </div>
                  </td>
                  {kind === "brand" && (
                    <td>{r.companyName ? <a href={`/directory?kind=company`} className="chip-link">{r.companyName}</a> : <span className="muted">No company</span>}</td>
                  )}
                  {kind === "company" && (
                    <td style={{ maxWidth: 320 }}>
                      {r.brands.length ? r.brands.map((b) => <span key={b.id} className="chip-link">{b.name}</span>) : <span className="muted">None yet</span>}
                    </td>
                  )}
                  <td style={{ maxWidth: 420 }}>
                    {r.projects.length ? r.projects.map((p) => (
                      <a key={p.id} href={`/projects/${p.id}`} className={`chip-link${p.status === "closed" ? " chip-closed" : ""}`}>{p.name}</a>
                    )) : <span className="muted">Not used</span>}
                  </td>
                  <td>{r.createdByName ?? "–"}</td>
                  <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                  <td>
                    {canManage && (
                      <div className="row-actions">
                        <button type="button" className="secondary" onClick={() => setRenaming(r)}>{kind === "brand" ? "Edit" : "Rename"}</button>
                        <button type="button" className="secondary" onClick={() => setMerging(r)} disabled={rows.length < 2}>Merge</button>
                        {r.projects.length === 0 && r.brands.length === 0 && <button type="button" className="ghost sm icon-only" title="Delete" aria-label="Delete" onClick={() => remove(r)}><Icon name="x" size={16} /></button>}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr><td colSpan={kind === "agency" ? 5 : 6}><div className="empty"><span className="empty-ico"><Icon name="building" size={24} /></span><b>{q ? "No matches" : `No ${ONE[kind]} yet`}</b><span className="muted">Add one here, or type a new name in a project&apos;s settings.</span></div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {adding && <AddDialog kind={kind} rows={rows} companies={companies} workspace={workspace} onClose={() => setAdding(false)} onDone={() => { setAdding(false); router.refresh(); }} />}
      {renaming && <RenameDialog row={renaming} kind={kind} companies={companies} onClose={() => setRenaming(null)} onDone={() => { setRenaming(null); router.refresh(); }} />}
      {merging && <MergeDialog row={merging} rows={rows} kind={kind} onClose={() => setMerging(null)} onDone={() => { setMerging(null); router.refresh(); }} />}
    </>
  );
}

function AddDialog({ kind, rows, companies, workspace, onClose, onDone }: { kind: Kind; rows: DirRow[]; companies: Company[]; workspace?: string; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const check = name.trim() ? checkOrgName(name, "Name") : null;
  const near = name.trim() ? rows.map((r) => ({ r, s: similarity(name, r.name) })).filter((x) => x.s >= DUPLICATE_AT).sort((a, b) => b.s - a.s) : [];
  const same = near.find((x) => x.s === 1);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!check?.ok || same) return;
    setBusy(true);
    const res = await fetch("/api/orgs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, name, force: true, companyId: companyId || undefined, workspace }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Could not add");
    onDone();
  }

  return (
    <Modal title={`Add ${ONE[kind]}`} onClose={onClose}>
      <form onSubmit={save}>
        <label>Name</label>
        <input value={name} onChange={(e) => { setName(e.target.value); setError(""); }} autoFocus maxLength={80} placeholder={`e.g. ${kind === "agency" ? "Pixel Media" : kind === "company" ? "Apollo Hospitals Ltd" : "Apollo Pharmacy"}`} />
        {check?.ok === false && <div className="err-text">{check.error}</div>}
        {same && <div className="err-text">“{same.r.name}” already exists.</div>}
        {!same && near.length > 0 && (
          <div className="warn-box">Looks similar to: {near.slice(0, 3).map((x) => <b key={x.r.id}>{x.r.name}</b>).reduce((a, b) => <>{a}, {b}</>)}. Add it only if it&apos;s really different.</div>
        )}
        {kind === "brand" && <CompanySelect companies={companies} value={companyId} onChange={setCompanyId} />}
        {error && <div className="error">{error}</div>}
        <div className="row modal-foot">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={busy || !check?.ok || !!same}>{busy ? "Adding…" : near.length ? "Add anyway" : "Add"}</button>
        </div>
      </form>
    </Modal>
  );
}

function RenameDialog({ row, kind, companies, onClose, onDone }: { row: DirRow; kind: Kind; companies: Company[]; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(row.name);
  const [companyId, setCompanyId] = useState(row.companyId ?? "");
  const companyChanged = kind === "brand" && companyId !== (row.companyId ?? "");
  const nameChanged = name.trim() !== row.name;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const check = checkOrgName(name, "Name");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch(`/api/orgs/${row.id}`, { method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...(nameChanged ? { name } : {}), ...(companyChanged ? { companyId: companyId || null } : {}) }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Could not rename");
    onDone();
  }
  return (
    <Modal title={kind === "brand" ? "Edit brand" : `Rename ${ONE[kind]}`} onClose={onClose}>
      <form onSubmit={save}>
        <label>Name</label>
        <input value={name} onChange={(e) => { setName(e.target.value); setError(""); }} autoFocus maxLength={80} />
        {!check.ok && <div className="err-text">{check.error}</div>}
        {kind === "brand" && <CompanySelect companies={companies} value={companyId} onChange={setCompanyId} />}
        {companyChanged && companyId && row.projects.length > 0 && (
          <div className="warn-box">Its {row.projects.length} project(s) will move to {companies.find((c) => c.id === companyId)?.name} too.</div>
        )}
        <p className="muted" style={{ fontSize: 13 }}>Used by {row.projects.length} project(s); they all show the change.</p>
        {error && <div className="error">{error}</div>}
        <div className="row modal-foot">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={busy || !check.ok || (!nameChanged && !companyChanged)}>{busy ? "Saving…" : kind === "brand" ? "Save" : "Rename"}</button>
        </div>
      </form>
    </Modal>
  );
}

function MergeDialog({ row, rows, kind, onClose, onDone }: { row: DirRow; rows: DirRow[]; kind: Kind; onClose: () => void; onDone: () => void }) {
  const others = rows.filter((r) => r.id !== row.id).sort((a, b) => similarity(row.name, b.name) - similarity(row.name, a.name));
  const [into, setInto] = useState(others[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const target = others.find((o) => o.id === into);
  async function go() {
    setBusy(true);
    const res = await fetch(`/api/orgs/${row.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ intoId: into }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Could not merge");
    onDone();
  }
  return (
    <Modal title={`Merge “${row.name}”`} onClose={onClose}>
      <p>Move its {row.projects.length} project(s) to another {ONE[kind]} and remove “{row.name}”.</p>
      <label style={{ marginTop: 12 }}>Merge into</label>
      <select value={into} onChange={(e) => setInto(e.target.value)}>
        {others.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.projects.length} project{o.projects.length === 1 ? "" : "s"}) · {Math.round(similarity(row.name, o.name) * 100)}% alike</option>)}
      </select>
      {target && <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>After merging, “{target.name}” will be used by {target.projects.length + row.projects.length} project(s). This can&apos;t be undone.</p>}
      {error && <div className="error">{error}</div>}
      <div className="row modal-foot">
        <button type="button" className="secondary" onClick={onClose}>Cancel</button>
        <button type="button" disabled={busy || !into} onClick={go}>{busy ? "Merging…" : "Merge"}</button>
      </div>
    </Modal>
  );
}

function CompanySelect({ companies, value, onChange }: { companies: Company[]; value: string; onChange: (id: string) => void }) {
  return (
    <>
      <label style={{ marginTop: 12 }}>Company</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">No company</option>
        {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      {companies.length === 0 && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Add companies under the Companies tab first.</div>}
    </>
  );
}
