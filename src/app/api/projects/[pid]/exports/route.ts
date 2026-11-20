import { NextResponse } from "next/server";
import { getUser, guard } from "@/lib/auth";
import { sql } from "@/lib/db";
import { type ExportRequest, datasetByKey } from "@/lib/export-datasets";
import { buildTable, runExport } from "@/lib/exporter";
import { LIMITS, rateLimit, tooMany } from "@/lib/ratelimit";

type Ctx = { params: Promise<{ pid: string }> };

function parse(b: Record<string, unknown>): ExportRequest | null {
  if (!datasetByKey(String(b.dataset))) return null;
  const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 200) : undefined);
  const p = b.pivot as Record<string, unknown> | null | undefined;
  const aggs = ["sum", "avg", "count", "min", "max"];
  return {
    dataset: b.dataset as ExportRequest["dataset"],
    from: date(b.from),
    to: date(b.to),
    accountIds: strs(b.accountIds),
    columns: strs(b.columns),
    sort: typeof b.sort === "string" ? b.sort : undefined,
    dir: b.dir === "asc" ? "asc" : "desc",
    pivot: p && Array.isArray(p.rows) && p.rows.length && typeof p.measure === "string"
      ? {
          rows: strs(p.rows)!.slice(0, 3),
          cols: typeof p.cols === "string" && p.cols ? p.cols : undefined,
          measure: p.measure,
          agg: (aggs.includes(String(p.agg)) ? p.agg : "sum") as "sum",
        }
      : null,
  };
}

// POST { ...ExportRequest, preview?: true }
//   preview → first 100 rows of the table, nothing stored
//   else    → CSV uploaded to Cloudflare R2 and recorded; returns the export id
export async function POST(req: Request, { params }: Ctx) {
  const { deny, id: pid } = await guard("project", (await params).pid);
  if (deny) return deny;
  const b = await req.json().catch(() => ({}));
  const r = parse(b);
  if (!r) return NextResponse.json({ error: "Pick what to export" }, { status: 400 });
  const me = (await getUser())!;
  const limit = await rateLimit(`export:${b.preview ? "preview" : "file"}:${me.id}`, b.preview ? LIMITS.exportPreview : LIMITS.exportFile);
  if (!limit.ok) return tooMany(limit, b.preview ? "Slow down a little: too many previews." : "Too many exports in a minute. Please wait.");

  try {
    if (b.preview) {
      const t = await buildTable(pid, r);
      return NextResponse.json({ headers: t.headers, rows: t.rows.slice(0, 100), total: t.rows.length });
    }
    const [p] = await sql<{ name: string }[]>`select name from projects where id = ${pid}`;
    const out = await runExport(pid, p.name, me.id, r);
    return NextResponse.json({ id: out.id, fileName: out.fileName, rowCount: out.rowCount, bytes: out.bytes });
  } catch (e) {
    console.error("export failed", e);
    return NextResponse.json({ error: "The export failed. Please try again." }, { status: 500 });
  }
}
