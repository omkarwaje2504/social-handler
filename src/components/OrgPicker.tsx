"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { DUPLICATE_AT, checkOrgName, fuzzyFilter, nameKey, similarity } from "@/lib/names";

export type OrgOption = { id: string; name: string; projects?: number; companyId?: string | null; hint?: string };
type Kind = "agency" | "company" | "brand";
const LABEL: Record<Kind, string> = { agency: "agency", company: "company", brand: "brand" };

/**
 * Searchable dropdown for an agency / company / brand.
 *   Type → fuzzy-ranked matches ("apolo" finds "Apollo Hospitals").
 *   Enter → picks the highlighted match, or creates the typed name when nothing matches.
 *   Close matches ("Acme" vs "Acme Pvt Ltd") show a "possible duplicate" warning before creating.
 */
export function OrgPicker({
  kind, label, value, options, onChange, onCreated, extra, placeholder,
}: {
  kind: Kind; label: string; value: string | null; options: OrgOption[];
  onChange: (id: string | null) => void; onCreated: (o: OrgOption) => void;
  /** Sent along when creating (e.g. the company a new brand belongs to). */
  extra?: Record<string, unknown>; placeholder?: string;
}) {
  const listId = useId();
  const selected = options.find((o) => o.id === value) ?? null;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmNew, setConfirmNew] = useState<OrgOption[] | null>(null); // similar names found on create
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && (setOpen(false), setConfirmNew(null));
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const typed = query.trim();
  const matches = useMemo(() => fuzzyFilter(options, typed, (o) => o.name).slice(0, 8), [options, typed]);
  const exact = typed ? options.find((o) => nameKey(o.name) === nameKey(typed)) : undefined;
  const near = typed && !exact ? options.filter((o) => similarity(typed, o.name) >= DUPLICATE_AT) : [];
  const canCreate = !!typed && !exact;
  const rows = canCreate ? matches.length + 1 : matches.length; // last row = "Create …"
  const check = typed ? checkOrgName(typed, label) : null;

  function pick(o: OrgOption) {
    onChange(o.id);
    setQuery("");
    setOpen(false);
    setConfirmNew(null);
    setError("");
  }

  async function create(force = false) {
    if (!check?.ok) return setError(check?.ok === false ? check.error : "");
    setBusy(true);
    setError("");
    const res = await fetch("/api/orgs", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...extra, kind, name: typed, force }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.status === 409 && data.similar) return setConfirmNew(data.similar);
    if (!res.ok) return setError(data.error ?? "Could not create");
    onCreated(data.org);
    pick(data.org);
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, rows - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Escape") { setOpen(false); setConfirmNew(null); }
    else if (e.key === "Enter") {
      e.preventDefault(); // never submit the surrounding form from here
      if (exact) return pick(exact);
      if (active < matches.length && matches[active] && typed) return pick(matches[active]);
      if (canCreate) {
        // A close match exists: ask first (the list already shows it).
        if (near.length && !confirmNew) return setConfirmNew(near);
        create(!!confirmNew);
      }
    }
  }

  return (
    <div className="org-picker" ref={box}>
      <label htmlFor={`${listId}-in`}>{label}</label>
      <div className={`org-input${open ? " open" : ""}`}>
        {selected && !query && <span className="org-chip">{selected.name}</span>}
        <input
          id={`${listId}-in`}
          ref={input}
          value={query}
          placeholder={selected ? "" : placeholder ?? `Search or type a new ${LABEL[kind]}…`}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); setConfirmNew(null); setError(""); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${listId}-list`}
          autoComplete="off"
          maxLength={80}
        />
        {selected && (
          <button type="button" className="org-clear" title={`Remove ${LABEL[kind]}`} onClick={() => { onChange(null); input.current?.focus(); }}>×</button>
        )}
      </div>

      {open && (
        <div className="org-menu" id={`${listId}-list`} role="listbox">
          {confirmNew ? (
            <div className="org-confirm">
              <b>Possible duplicate</b>
              <span className="muted">“{typed}” looks like:</span>
              {confirmNew.map((o) => (
                <button key={o.id} type="button" className="org-option" onClick={() => pick(o)}>
                  Use <b>{o.name}</b>
                </button>
              ))}
              <button type="button" className="secondary" disabled={busy} onClick={() => create(true)}>
                {busy ? "Creating…" : `No, create “${typed}” as a new ${LABEL[kind]}`}
              </button>
            </div>
          ) : (
            <>
              {matches.map((o, i) => (
                <button
                  key={o.id}
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  className={`org-option${i === active ? " on" : ""}${o.id === value ? " picked" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(o)}
                >
                  <span>{o.name}</span>
                  {o.hint ? <small className="muted">{o.hint}</small>
                    : o.projects != null && <small className="muted">{o.projects} project{o.projects === 1 ? "" : "s"}</small>}
                </button>
              ))}
              {canCreate && (
                <button
                  type="button"
                  className={`org-option org-create${active === matches.length ? " on" : ""}`}
                  onMouseEnter={() => setActive(matches.length)}
                  disabled={busy || check?.ok === false}
                  onClick={() => (near.length ? setConfirmNew(near) : create())}
                >
                  <span>＋ Create “{typed}”</span>
                  {near.length > 0 && <small className="warn-text">similar to {near[0].name}</small>}
                  {check?.ok === false && <small className="err-text">{check.error}</small>}
                </button>
              )}
              {!typed && options.length === 0 && <div className="org-empty muted">Type a name and press Enter to add the first {LABEL[kind]}.</div>}
              {typed && !matches.length && !canCreate && <div className="org-empty muted">No matches.</div>}
            </>
          )}
        </div>
      )}
      {error && <div className="err-text" style={{ marginTop: 4 }}>{error}</div>}
    </div>
  );
}

export type OrgLists = { agency: OrgOption[]; company: OrgOption[]; brand: OrgOption[] };
export type OrgLinks = { agencyId: string | null; companyId: string | null; brandId: string | null };

/**
 * The agency, company and brand pickers together. Brands belong to a company:
 *   - with a company chosen, the brand list shows that company's brands (and brands with no company yet);
 *   - picking a brand fills in its company;
 *   - changing the company clears a brand that belongs to another company;
 *   - a brand created (or picked without a company) here is linked to the chosen company.
 */
export function OrgFields({
  value, onChange, lists, setLists, optional = false, workspace,
}: {
  value: OrgLinks; onChange: (v: OrgLinks) => void;
  lists: OrgLists; setLists: React.Dispatch<React.SetStateAction<OrgLists>>; optional?: boolean;
  /** Super admins: the directory new names go into (an admin's code); omitted = the caller's own. */
  workspace?: string;
}) {
  const ws = workspace ? { workspace } : undefined;
  const sfx = optional ? " (optional)" : "";
  const companyName = (id: string | null | undefined) => lists.company.find((c) => c.id === id)?.name;
  const brandOf = (id: string | null) => lists.brand.find((b) => b.id === id);
  const company = companyName(value.companyId);
  const brands = lists.brand
    .filter((b) => !value.companyId || !b.companyId || b.companyId === value.companyId || b.id === value.brandId)
    .map((b) => ({ ...b, hint: b.companyId ? companyName(b.companyId) : value.companyId ? "no company yet" : undefined }));
  const added = (k: keyof OrgLists) => (o: OrgOption) => setLists((cur) => ({ ...cur, [k]: [...cur[k].filter((x) => x.id !== o.id), o] }));

  function pickCompany(id: string | null) {
    const b = brandOf(value.brandId);
    const keepBrand = !b?.companyId || b.companyId === id;
    onChange({ ...value, companyId: id, brandId: keepBrand ? value.brandId : null });
  }
  function pickBrand(id: string | null) {
    const b = brandOf(id);
    if (b && !b.companyId && value.companyId) {
      // Saving links this brand to the chosen company; show it that way now.
      setLists((cur) => ({ ...cur, brand: cur.brand.map((x) => (x.id === b.id ? { ...x, companyId: value.companyId } : x)) }));
    }
    onChange({ ...value, brandId: id, companyId: b?.companyId ?? value.companyId });
  }

  return (
    <>
      <div className="field"><OrgPicker kind="agency" label={`Agency${sfx}`} value={value.agencyId} options={lists.agency} onChange={(id) => onChange({ ...value, agencyId: id })} onCreated={added("agency")} extra={ws} /></div>
      <div className="field"><OrgPicker kind="company" label={`Company${sfx}`} value={value.companyId} options={lists.company} onChange={pickCompany} onCreated={added("company")} extra={ws} /></div>
      <div className="field">
        <OrgPicker
          kind="brand"
          label={`Brand${sfx}`}
          value={value.brandId}
          options={brands}
          onChange={pickBrand}
          onCreated={added("brand")}
          extra={value.companyId ? { ...ws, companyId: value.companyId } : ws}
          placeholder={company ? `Brands of ${company}, or type a new one…` : undefined}
        />
      </div>
    </>
  );
}
