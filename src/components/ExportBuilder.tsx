"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { type Agg, DATASETS, type DatasetKey, type ExportRequest, datasetByKey } from "@/lib/export-datasets";
import { Icon, type IconName } from "./Icon";

type Account = { id: string; username: string };
type Preview = { headers: string[]; rows: (string | number)[][]; total: number };
type Layout = "list" | "summary";

// Ready-made reports: the common questions, so nobody has to build a pivot from scratch.
type Template = { key: string; icon: IconName; title: string; text: string; dataset: DatasetKey; layout: Layout; groupBy?: string[]; splitBy?: string; value?: string; calc?: Agg; sort?: string; dir?: "asc" | "desc"; period?: string };
const TEMPLATES: Template[] = [
  { key: "accounts", icon: "users", title: "Account summary", text: "One row per account: followers, posts, reels, views and engagement rate.", dataset: "accounts", layout: "list", sort: "followers", dir: "desc" },
  { key: "posts", icon: "image", title: "All posts & reels", text: "Every post with its views, reach, likes, comments, shares and saves.", dataset: "posts", layout: "list", sort: "posted_at", dir: "desc" },
  { key: "monthly", icon: "calendar", title: "Monthly views by account", text: "Total views for each account, one column per month.", dataset: "posts", layout: "summary", groupBy: ["account"], splitBy: "month", value: "views", calc: "sum", period: "year" },
  { key: "types", icon: "film", title: "Engagement by format", text: "Likes, comments, shares and saves per account, split by photo / reel / carousel.", dataset: "posts", layout: "summary", groupBy: ["account"], splitBy: "type", value: "engagement", calc: "sum", period: "90d" },
  { key: "growth", icon: "trendUp", title: "Daily follower growth", text: "Followers per day for each account, from the daily sync.", dataset: "daily", layout: "summary", groupBy: ["day"], splitBy: "account", value: "followers", calc: "max", sort: "day", dir: "asc", period: "30d" },
  { key: "dms", icon: "zap", title: "Auto-DM results", text: "How many comment-to-DM runs were sent, skipped or failed per automation.", dataset: "automations", layout: "summary", groupBy: ["automation"], splitBy: "status", value: "count", calc: "count", period: "30d" },
  { key: "comments", icon: "message", title: "Comments received", text: "Every comment on the project's posts, with who wrote it and when.", dataset: "comments", layout: "list", sort: "commented_at", dir: "desc", period: "30d" },
  { key: "custom", icon: "settings", title: "Build your own", text: "Pick any data set and arrange it yourself.", dataset: "posts", layout: "list" },
];

const CALCS: { key: Agg; label: string; word: string }[] = [
  { key: "sum", label: "Total", word: "Total" },
  { key: "avg", label: "Average", word: "Average" },
  { key: "count", label: "Number of rows", word: "Number of" },
  { key: "max", label: "Highest", word: "Highest" },
  { key: "min", label: "Lowest", word: "Lowest" },
];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function periodRange(p: string): { from: string; to: string } {
  const now = new Date();
  const back = (days: number) => ({ from: iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1)), to: iso(now) });
  switch (p) {
    case "7d": return back(7);
    case "30d": return back(30);
    case "90d": return back(90);
    case "month": return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
    case "lastmonth": return { from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: iso(new Date(now.getFullYear(), now.getMonth(), 0)) };
    case "year": return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) };
    default: return { from: "", to: "" };
  }
}
const PERIODS = [["30d", "Last 30 days"], ["7d", "Last 7 days"], ["90d", "Last 90 days"], ["month", "This month"], ["lastmonth", "Last month"], ["year", "This year"], ["all", "All time"], ["custom", "Custom"]] as const;

export function ExportBuilder({ projectId, accounts }: { projectId: string; accounts: Account[] }) {
  const router = useRouter();
  const [template, setTemplate] = useState("accounts");
  const [dataset, setDataset] = useState<DatasetKey>("accounts");
  const ds = datasetByKey(dataset)!;
  const dims = ds.cols.filter((c) => c.kind === "dim");
  const nums = ds.cols.filter((c) => c.kind === "num");
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [period, setPeriod] = useState("all");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [layout, setLayout] = useState<Layout>("list");
  const [columns, setColumns] = useState<string[]>(ds.cols.map((c) => c.key));
  const [sort, setSort] = useState("followers");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [groupBy, setGroupBy] = useState("account");
  const [thenBy, setThenBy] = useState("");
  const [splitBy, setSplitBy] = useState("");
  const [value, setValue] = useState("views");
  const [calc, setCalc] = useState<Agg>("sum");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function applyTemplate(t: Template) {
    const d = datasetByKey(t.dataset)!;
    setTemplate(t.key);
    setDataset(t.dataset);
    setLayout(t.layout);
    setColumns(d.cols.map((c) => c.key));
    setSort(t.sort ?? "");
    setDir(t.dir ?? "desc");
    setGroupBy(t.groupBy?.[0] ?? d.cols.find((c) => c.kind === "dim")!.key);
    setThenBy(t.groupBy?.[1] ?? "");
    setSplitBy(t.splitBy ?? "");
    setValue(t.value ?? d.cols.find((c) => c.kind === "num")?.key ?? "");
    setCalc(t.calc ?? "sum");
    setPeriod(t.period ?? "all");
    setMsg(null);
  }
  function pickDataset(k: DatasetKey) {
    const d = datasetByKey(k)!;
    setDataset(k);
    setColumns(d.cols.map((c) => c.key));
    setSort("");
    setGroupBy(d.cols.find((c) => c.kind === "dim")!.key);
    setThenBy("");
    setSplitBy("");
    setValue(d.cols.find((c) => c.kind === "num")?.key ?? "");
  }

  const range = period === "custom" ? custom : periodRange(period);
  const request: ExportRequest = useMemo(() => ({
    dataset,
    from: ds.dated && range.from ? range.from : undefined,
    to: ds.dated && range.to ? range.to : undefined,
    accountIds: accountIds.length ? accountIds : undefined,
    columns: layout === "list" ? columns : undefined,
    sort: sort || undefined,
    dir,
    pivot: layout === "summary" && groupBy && value
      ? { rows: [groupBy, ...(thenBy && thenBy !== groupBy ? [thenBy] : [])], cols: splitBy || undefined, measure: value, agg: calc }
      : null,
  }), [dataset, ds.dated, range.from, range.to, accountIds, layout, columns, sort, dir, groupBy, thenBy, splitBy, value, calc]);

  // Live preview (debounced) whenever an option changes.
  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      const res = await fetch(`/api/projects/${projectId}/exports`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...request, preview: true }),
      });
      const data = await res.json().catch(() => ({}));
      setLoading(false);
      setPreview(res.ok ? data : null);
      if (!res.ok) setMsg({ ok: false, text: data.error ?? "Preview failed" });
    }, 350);
    return () => clearTimeout(t);
  }, [projectId, request]);

  async function download() {
    setSaving(true);
    setMsg(null);
    const res = await fetch(`/api/projects/${projectId}/exports`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setMsg({ ok: false, text: data.error ?? "Export failed" });
    setMsg({ ok: true, text: `${data.fileName} is ready (${data.rowCount.toLocaleString()} rows). It's also saved under "Saved exports".` });
    window.location.href = `/api/exports/${data.id}`;
    router.refresh();
  }

  const label = (k: string) => ds.cols.find((c) => c.key === k)?.label ?? k;
  const tpl = TEMPLATES.find((t) => t.key === template)!;
  const calcWord = CALCS.find((c) => c.key === calc)!.word;
  const sentence = layout === "summary"
    ? <>{calc === "count" ? "Number of rows" : <>{calcWord} <b>{label(value)}</b></>} for each <b>{label(groupBy)}</b>{thenBy && thenBy !== groupBy ? <> and <b>{label(thenBy)}</b></> : null}{splitBy ? <>, one column per <b>{label(splitBy)}</b></> : null}{sort && (sort === groupBy || sort === thenBy) ? <>, sorted by {label(sort)}</> : <>, {dir === "desc" ? "biggest" : "smallest"} first</>}.</>
    : <>One row per item from <b>{ds.label.toLowerCase()}</b> with {columns.length} column{columns.length === 1 ? "" : "s"}{sort ? <>, sorted by <b>{label(sort)}</b> ({dir === "desc" ? "high to low" : "low to high"})</> : null}.</>;

  return (
    <div className="export-layout">
      <div className="export-steps">
        <section className="step-card">
          <div className="step-head"><span className="step-num">1</span><div><h3>What do you want to export?</h3><p>Start from a ready-made report, or build your own.</p></div></div>
          <div className="choice-grid templates">
            {TEMPLATES.map((t) => (
              <button key={t.key} type="button" className="choice" aria-pressed={template === t.key} onClick={() => applyTemplate(t)}>
                <b><Icon name={t.icon} size={16} />{t.title}</b>
                <span>{t.text}</span>
              </button>
            ))}
          </div>
          <p className="hint template-hint">{tpl.text}</p>
          {template === "custom" && (
            <div style={{ marginTop: 12 }}>
              <label htmlFor="ex-ds">Data</label>
              <select id="ex-ds" value={dataset} onChange={(e) => pickDataset(e.target.value as DatasetKey)}>
                {DATASETS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
              <p className="hint">{ds.hint}</p>
            </div>
          )}
        </section>

        <section className="step-card">
          <div className="step-head"><span className="step-num">2</span><div><h3>Which accounts{ds.dated ? " and dates" : ""}?</h3><p>Leave everything as it is for the whole project.</p></div></div>
          <label style={{ marginTop: 0 }}>Accounts</label>
          <div className="chip-row">
            <button type="button" className={`chip-toggle${accountIds.length === 0 ? " on" : ""}`} onClick={() => setAccountIds([])}>All accounts</button>
            {accounts.map((a) => (
              <button key={a.id} type="button" className={`chip-toggle${accountIds.includes(a.id) ? " on" : ""}`}
                onClick={() => setAccountIds(accountIds.includes(a.id) ? accountIds.filter((x) => x !== a.id) : [...accountIds, a.id])}>
                @{a.username}
              </button>
            ))}
            {accounts.length === 0 && <span className="muted">No accounts in this project yet.</span>}
          </div>
          {ds.dated ? (
            <>
              <label>Period</label>
              <div className="chip-row">
                {PERIODS.map(([k, l]) => (
                  <button key={k} type="button" className={`chip-toggle${period === k ? " on" : ""}`} onClick={() => setPeriod(k)}>{l}</button>
                ))}
              </div>
              {period === "custom" && (
                <div className="inline-fields" style={{ marginTop: 10 }}>
                  <div><label htmlFor="ex-from">From</label><input id="ex-from" type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></div>
                  <div><label htmlFor="ex-to">To</label><input id="ex-to" type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></div>
                </div>
              )}
            </>
          ) : <p className="hint">This report always covers all synced data, so there&apos;s no date range.</p>}
        </section>

        <section className="step-card">
          <div className="step-head"><span className="step-num">3</span><div><h3>How should it look?</h3><p>{tpl.key === "custom" ? "A list of rows, or totals grouped the way you need." : "Already set up for this report; change anything you like."}</p></div></div>
          <div className="choice-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))" }}>
            <button type="button" className="choice" aria-pressed={layout === "list"} onClick={() => setLayout("list")}>
              <b><Icon name="table" size={16} />List</b><span>One row per {dataset === "accounts" ? "account" : dataset === "daily" ? "account per day" : "item"}, with the columns you pick.</span>
            </button>
            <button type="button" className="choice" aria-pressed={layout === "summary"} onClick={() => setLayout("summary")}>
              <b><Icon name="grid" size={16} />Summary</b><span>Totals grouped by account, month, type… like a pivot table.</span>
            </button>
          </div>

          {layout === "list" ? (
            <>
              <div className="row" style={{ marginTop: 14, justifyContent: "space-between" }}>
                <label style={{ margin: 0 }}>Columns ({columns.length} of {ds.cols.length})</label>
                <span className="row" style={{ gap: 4 }}>
                  <button type="button" className="ghost sm" onClick={() => setColumns(ds.cols.map((c) => c.key))}>Select all</button>
                  <button type="button" className="ghost sm" onClick={() => setColumns([])}>Clear</button>
                </span>
              </div>
              <div className="col-chips" style={{ marginTop: 6 }}>
                {ds.cols.map((c) => (
                  <button key={c.key} type="button" className={`chip-toggle${columns.includes(c.key) ? " on" : ""}`}
                    onClick={() => setColumns(columns.includes(c.key) ? columns.filter((x) => x !== c.key) : ds.cols.map((x) => x.key).filter((k) => k === c.key || columns.includes(k)))}>
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="inline-fields" style={{ marginTop: 12 }}>
                <div>
                  <label htmlFor="ex-sort">Sort by</label>
                  <select id="ex-sort" value={sort} onChange={(e) => setSort(e.target.value)}>
                    <option value="">As stored</option>
                    {ds.cols.filter((c) => columns.includes(c.key)).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="ex-dir">Order</label>
                  <select id="ex-dir" value={dir} onChange={(e) => setDir(e.target.value as "asc" | "desc")} disabled={!sort}>
                    <option value="desc">High to low / newest first</option>
                    <option value="asc">Low to high / oldest first</option>
                  </select>
                </div>
              </div>
            </>
          ) : (
            <div className="inline-fields" style={{ marginTop: 12 }}>
              <div>
                <label htmlFor="ex-group">Group rows by</label>
                <select id="ex-group" value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
                  {dims.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="ex-then">Then by <span className="muted">(optional)</span></label>
                <select id="ex-then" value={thenBy} onChange={(e) => setThenBy(e.target.value)}>
                  <option value="">Nothing</option>
                  {dims.filter((c) => c.key !== groupBy && c.key !== splitBy).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="ex-split">One column per <span className="muted">(optional)</span></label>
                <select id="ex-split" value={splitBy} onChange={(e) => setSplitBy(e.target.value)}>
                  <option value="">Don&apos;t split</option>
                  {dims.filter((c) => c.key !== groupBy && c.key !== thenBy).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="ex-calc">Show</label>
                <select id="ex-calc" value={calc} onChange={(e) => setCalc(e.target.value as Agg)}>
                  {CALCS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
              {calc !== "count" && (
                <div>
                  <label htmlFor="ex-value">of</label>
                  <select id="ex-value" value={value} onChange={(e) => setValue(e.target.value)}>
                    {nums.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label htmlFor="ex-order">Order</label>
                <select id="ex-order" value={sort === groupBy ? "name" : dir} onChange={(e) => {
                  if (e.target.value === "name") { setSort(groupBy); setDir("asc"); } else { setSort(""); setDir(e.target.value as "asc" | "desc"); }
                }}>
                  <option value="desc">Biggest first</option>
                  <option value="asc">Smallest first</option>
                  <option value="name">By {label(groupBy).toLowerCase()}</option>
                </select>
              </div>
            </div>
          )}
          <div className="sentence" style={{ marginTop: 14 }}><Icon name="info" size={15} /> {sentence}</div>
        </section>
      </div>

      <section className="panel export-preview">
        <div className="preview-meta">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0 }}>Preview</h3>
            <span className="muted">{loading ? "Updating…" : preview ? `${preview.total.toLocaleString()} row${preview.total === 1 ? "" : "s"} · ${preview.headers.length} column${preview.headers.length === 1 ? "" : "s"}${preview.total > 100 ? " · first 100 shown" : ""}` : "—"}</span>
          </div>
          <button type="button" onClick={download} disabled={saving || !preview?.total}>
            <Icon name="download" size={16} />{saving ? "Preparing…" : "Download CSV"}
          </button>
        </div>
        {msg && <div className={msg.ok ? "notice" : "error"} style={{ margin: "12px 16px 0" }}><Icon name={msg.ok ? "check" : "alert"} size={16} />{msg.text}</div>}
        <div className="preview-scroll" style={{ opacity: loading ? 0.6 : 1 }}>
          {preview && preview.total > 0 ? (
            <table className="perf-table preview-table">
              <thead><tr>{preview.headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
              <tbody>
                {preview.rows.map((r, i) => (
                  <tr key={i} className={layout === "summary" && r[0] === "Grand total" ? "total-row" : undefined}>
                    {r.map((c, j) => <td key={j}>{typeof c === "number" ? c.toLocaleString() : String(c)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">
              <span className="empty-ico"><Icon name="table" size={24} /></span>
              <b>{loading ? "Loading…" : layout === "list" && columns.length === 0 ? "Pick at least one column" : "Nothing to export for these options"}</b>
              {!loading && <span className="muted">Try another period or include more accounts.</span>}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/** Delete a saved export (file in R2 + record). */
export function DeleteExport({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className="ghost sm icon-only" disabled={busy} title="Delete file" aria-label="Delete file"
      onClick={async () => {
        if (!confirm("Delete this export file from storage? This can't be undone.")) return;
        setBusy(true);
        const res = await fetch(`/api/exports/${id}`, { method: "DELETE" });
        setBusy(false);
        if (!res.ok) alert((await res.json().catch(() => ({}))).error ?? "Could not delete");
        router.refresh();
      }}><Icon name="x" size={16} /></button>
  );
}
