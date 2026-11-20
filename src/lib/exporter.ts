import { sql } from "@/lib/db";
import { decodeHashes, encodeHash, setHash } from "@/lib/hash";
import { type Agg, type ExportRequest, datasetByKey } from "@/lib/export-datasets";
import { r2Key, r2Put } from "@/lib/r2";

type Row = Record<string, string | number | null>;

const views = sql`coalesce((p.metrics->>'views')::bigint, (p.metrics->>'plays')::bigint, 0)`;
const metric = (k: string) => sql`coalesce((p.metrics->>${k})::bigint, 0)`;

/** Load the rows of one dataset for a project (filters applied in SQL). */
async function load(projectId: number, req: ExportRequest): Promise<Row[]> {
  const accounts = decodeHashes("accounts", req.accountIds ?? []); // codes from the browser
  const accountFilter = accounts.length ? sql`and a.id = any(${accounts}::int[])` : sql``;
  const range = (col: ReturnType<typeof sql.unsafe>) => sql`
    ${req.from ? sql`and ${col} >= ${req.from}::date` : sql``}
    ${req.to ? sql`and ${col} < (${req.to}::date + 1)` : sql``}`;

  switch (req.dataset) {
    case "accounts":
      return sql<Row[]>`
        select a.username as account, coalesce(a.name, '') as name, a.account_type, a.designation,
          coalesce(a.followers_count, 0) as followers, coalesce(a.follows_count, 0) as following,
          coalesce(a.media_count, 0) as media_count,
          count(p.id) filter (where p.media_type <> 'REELS')::int as posts,
          count(p.id) filter (where p.media_type = 'REELS')::int as reels,
          coalesce(sum(${views}), 0)::bigint as views, coalesce(sum(${metric("reach")}), 0)::bigint as reach,
          coalesce(sum(p.like_count), 0)::bigint as likes, coalesce(sum(p.comments_count), 0)::bigint as comments,
          coalesce(sum(${metric("shares")}), 0)::bigint as shares, coalesce(sum(${metric("saved")}), 0)::bigint as saves,
          coalesce(sum(${metric("reposts")}), 0)::bigint as reposts,
          coalesce(sum(p.like_count + p.comments_count + ${metric("shares")} + ${metric("saved")}), 0)::bigint as engagement,
          case when count(p.id) > 0 and coalesce(a.followers_count, 0) > 0
            then round(100.0 * sum(p.like_count + p.comments_count) / count(p.id) / a.followers_count, 2) else 0 end as engagement_rate,
          (select count(*)::int from automation_logs l where l.account_id = a.id and l.status = 'sent') as auto_dms,
          (select count(*)::int from messages m where m.account_id = a.id and m.direction = 'in') as inbox_messages,
          coalesce(to_char(a.last_synced_at, 'YYYY-MM-DD HH24:MI'), '') as last_synced
        from accounts a left join posts p on p.account_id = a.id and not p.removed_from_app
        where a.project_id = ${projectId} ${accountFilter}
        group by a.id`;
    case "posts":
      return sql<Row[]>`
        select a.username as account, a.account_type, a.designation, p.media_type as type,
          to_char(p."timestamp", 'YYYY-MM-DD HH24:MI') as posted_at, to_char(p."timestamp", 'YYYY-MM-DD') as day,
          to_char(p."timestamp", 'IYYY-"W"IW') as week, to_char(p."timestamp", 'YYYY-MM') as month,
          left(coalesce(p.caption, ''), 300) as caption, coalesce(p.permalink, '') as permalink,
          case when p.boosted then 'yes' else 'no' end as boosted,
          ${views}::bigint as views, ${metric("reach")}::bigint as reach, p.like_count as likes,
          p.comments_count as comments, ${metric("shares")}::bigint as shares, ${metric("saved")}::bigint as saves,
          ${metric("reposts")}::bigint as reposts,
          (p.like_count + p.comments_count + ${metric("shares")} + ${metric("saved")})::bigint as engagement, 1 as count
        from posts p join accounts a on a.id = p.account_id
        where a.project_id = ${projectId} and not p.removed_from_app ${accountFilter} ${range(sql.unsafe('p."timestamp"'))}`;
    case "daily":
      return sql<Row[]>`
        select a.username as account, a.designation, s.day, to_char(s.day::date, 'IYYY-"W"IW') as week,
          left(s.day, 7) as month, s.followers, s.follows as following, s.media_count, s.likes, s.comments
        from snapshots s join accounts a on a.id = s.account_id
        where a.project_id = ${projectId} ${accountFilter} ${range(sql.unsafe("s.day::date"))}`;
    case "comments":
      return sql<Row[]>`
        select a.username as account, c.ig_media_id as post_id, coalesce(c.from_username, '') as from_username,
          c.text, case when c.is_own then 'yes' else 'no' end as own, case when c.hidden then 'yes' else 'no' end as hidden,
          case when c.deleted_at is not null then 'yes' else 'no' end as deleted,
          to_char(c.commented_at, 'YYYY-MM-DD HH24:MI') as commented_at, to_char(c.commented_at, 'YYYY-MM-DD') as day,
          to_char(c.commented_at, 'YYYY-MM') as month, c.like_count as likes, 1 as count
        from comments c join accounts a on a.id = c.account_id
        where a.project_id = ${projectId} ${accountFilter} ${range(sql.unsafe("c.commented_at"))}`;
    case "messages":
      return sql<Row[]>`
        select a.username as account, coalesce(m.thread_username, m.thread_user_id) as thread, m.direction, m.source,
          m.text, to_char(m.sent_at, 'YYYY-MM-DD HH24:MI') as sent_at, to_char(m.sent_at, 'YYYY-MM-DD') as day,
          to_char(m.sent_at, 'YYYY-MM') as month, case when m.read_at is not null then 'yes' else 'no' end as read, 1 as count
        from messages m join accounts a on a.id = m.account_id
        where a.project_id = ${projectId} ${accountFilter} ${range(sql.unsafe("m.sent_at"))}`;
    case "automations":
      return sql<Row[]>`
        select a.username as account, x.name as automation, x.keyword, coalesce(l.commenter_username, l.commenter_igsid) as commenter,
          l.comment_text as comment,
          case when l.is_follower is null then 'unknown' when l.is_follower then 'yes' else 'no' end as follower,
          l.status, case when l.public_reply_sent then 'yes' else 'no' end as public_reply,
          to_char(l.created_at, 'YYYY-MM-DD HH24:MI') as at, to_char(l.created_at, 'YYYY-MM-DD') as day,
          to_char(l.created_at, 'YYYY-MM') as month, 1 as count
        from automation_logs l join accounts a on a.id = l.account_id join automations x on x.id = l.automation_id
        where a.project_id = ${projectId} ${accountFilter} ${range(sql.unsafe("l.created_at"))}`;
  }
}

const num = (v: unknown) => (v == null || v === "" ? 0 : Number(v));

function aggregate(values: number[], agg: Agg) {
  if (agg === "count") return values.length;
  if (!values.length) return 0;
  if (agg === "sum") return values.reduce((a, b) => a + b, 0);
  if (agg === "avg") return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
  if (agg === "min") return Math.min(...values);
  return Math.max(...values);
}

function compare(a: unknown, b: unknown) {
  const na = typeof a === "number" || (typeof a === "string" && a !== "" && !isNaN(Number(a)));
  const nb = typeof b === "number" || (typeof b === "string" && b !== "" && !isNaN(Number(b)));
  if (na && nb) return Number(a) - Number(b);
  return String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true });
}

export interface Table { headers: string[]; rows: (string | number)[][] }

/** Turn rows into the table that is written to CSV: raw (chosen columns, sorted) or a pivot. */
export function shape(rows: Row[], req: ExportRequest): Table {
  const ds = datasetByKey(req.dataset)!;
  const label = (k: string) => ds.cols.find((c) => c.key === k)?.label ?? k;
  const valid = new Set(ds.cols.map((c) => c.key));
  const dir = req.dir === "asc" ? 1 : -1;

  const p = req.pivot;
  if (p && p.rows.length && valid.has(p.measure) && p.rows.every((r) => valid.has(r)) && (!p.cols || valid.has(p.cols))) {
    // Pivot: group by the row fields (and spread one field across columns), aggregate the measure.
    const colValues = p.cols ? [...new Set(rows.map((r) => String(r[p.cols!] ?? "")))].sort((a, b) => compare(a, b)) : [];
    const groups = new Map<string, { keys: string[]; cells: Map<string, number[]>; all: number[] }>();
    for (const r of rows) {
      const keys = p.rows.map((k) => String(r[k] ?? ""));
      const id = JSON.stringify(keys);
      let g = groups.get(id);
      if (!g) groups.set(id, (g = { keys, cells: new Map(), all: [] }));
      const v = num(r[p.measure]);
      g.all.push(v);
      if (p.cols) {
        const c = String(r[p.cols] ?? "");
        if (!g.cells.has(c)) g.cells.set(c, []);
        g.cells.get(c)!.push(v);
      }
    }
    const measureName = `${p.agg === "count" ? "Count of" : AGG_WORD[p.agg]} ${label(p.measure)}`;
    const headers = [...p.rows.map(label), ...colValues.map((c) => c || "(blank)"), p.cols ? `Total (${measureName})` : measureName];
    let out = [...groups.values()].map((g) => [
      ...g.keys,
      ...colValues.map((c) => aggregate(g.cells.get(c) ?? [], p.agg)),
      aggregate(g.all, p.agg),
    ]);
    // Sort by a row field (when chosen) or by the total.
    const sortIdx = req.sort && p.rows.includes(req.sort) ? p.rows.indexOf(req.sort) : headers.length - 1;
    out.sort((a, b) => compare(a[sortIdx], b[sortIdx]) * dir);
    const allValues = rows.map((r) => num(r[p.measure]));
    const totals = [
      "Grand total", ...p.rows.slice(1).map(() => ""),
      ...colValues.map((c) => aggregate(rows.filter((r) => String(r[p.cols!] ?? "") === c).map((r) => num(r[p.measure])), p.agg)),
      aggregate(allValues, p.agg),
    ];
    out = [...out, totals];
    return { headers, rows: out };
  }

  const cols = (req.columns?.length ? req.columns.filter((c) => valid.has(c)) : ds.cols.map((c) => c.key));
  const sorted = req.sort && valid.has(req.sort) ? [...rows].sort((a, b) => compare(a[req.sort!], b[req.sort!]) * dir) : rows;
  return { headers: cols.map(label), rows: sorted.map((r) => cols.map((c) => r[c] ?? "")) };
}

const AGG_WORD: Record<Agg, string> = { sum: "Sum of", avg: "Average", count: "Count of", min: "Min", max: "Max" };

/** RFC 4180 CSV with a BOM so Excel opens UTF-8 (emoji, Hindi, …) correctly. */
export function toCsv(t: Table) {
  const cell = (v: unknown) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s) && isNaN(Number(s))) s = `'${s}`; // stop spreadsheet formula injection
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [t.headers, ...t.rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** Build the table (for preview) without storing anything. */
export async function buildTable(projectId: number, req: ExportRequest) {
  return shape(await load(projectId, req), req);
}

/** Build, upload to R2 and record the export. */
export async function runExport(projectId: number, projectName: string, userId: number, req: ExportRequest) {
  const table = await buildTable(projectId, req);
  const csv = toCsv(table);
  const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const fileName = `${slug}-${req.dataset}${req.pivot ? "-pivot" : ""}-${stamp}.csv`;
  const body = new TextEncoder().encode(csv);
  // Record first (for the id), then upload under codes only: projects/<project code>/exports/<export code>/
  const [row] = await sql<{ id: number }[]>`
    insert into exports (project_id, user_id, dataset, params, r2_key, file_name, row_count, bytes)
    values (${projectId}, ${userId}, ${req.dataset}, ${sql.json(req as never)}, '', ${fileName}, ${table.rows.length}, ${body.byteLength})
    returning id`;
  const hash = await setHash("exports", row.id);
  const key = r2Key(`projects/${encodeHash("projects", projectId)}/exports/${hash}/${fileName}`);
  try {
    await r2Put(key, body, "text/csv; charset=utf-8");
  } catch (e) {
    await sql`delete from exports where id = ${row.id}`;
    throw e;
  }
  await sql`update exports set r2_key = ${key} where id = ${row.id}`;
  return { id: hash, fileName, rowCount: table.rows.length, bytes: body.byteLength, table };
}
