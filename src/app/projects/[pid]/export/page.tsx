import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { canManageProject, requireAccess } from "@/lib/auth";
import { sql } from "@/lib/db";
import { datasetByKey } from "@/lib/export-datasets";
import { DeleteExport, ExportBuilder } from "@/components/ExportBuilder";
import { Icon } from "@/components/Icon";

export const metadata: Metadata = { title: "Export" };

type ExportRow = { id: string; dataset: string; fileName: string; rowCount: number; bytes: number; createdAt: Date; userId: number | null; byName: string | null; pivot: boolean };
const size = (b: number) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`);

// Export a report from the project's data as a CSV: pick a ready-made report or build one, preview it
// live, download it. Every file is also kept (Cloudflare storage) under "Saved exports".
export default async function ExportPage({ params }: { params: Promise<{ pid: string }> }) {
  await connection();
  // code: the project's code from the URL (used in links); pid: its integer id (used in queries).
  const { pid: code } = await params;
  const { user, id: pid } = await requireAccess("project", code);
  const [[project], accounts, history, canManage] = await Promise.all([
    sql<{ name: string }[]>`select name from projects where id = ${pid}`,
    sql<{ id: string; username: string }[]>`select hash as id, username from accounts where project_id = ${pid} order by username`,
    sql<ExportRow[]>`
      select e.hash as id, e.dataset, e.file_name, e.row_count, e.bytes, e.created_at, e.user_id, u.name as by_name,
        (e.params->'pivot') is not null and (e.params->'pivot') <> 'null'::jsonb as pivot
      from exports e left join users u on u.id = e.user_id
      where e.project_id = ${pid} order by e.created_at desc limit 50`,
    canManageProject(user, pid),
  ]);

  return (
    <div className="shell">
      <div className="crumbs">
        <Link href="/projects">Projects</Link> <Icon name="chevronRight" size={14} /> <Link href={`/projects/${code}`}>{project.name}</Link> <Icon name="chevronRight" size={14} /> <span>Export</span>
      </div>
      <div className="page-head">
        <div>
          <h1>Export a report</h1>
          <p className="page-sub">Three steps: pick a report, choose accounts and dates, and decide how it should look. The preview updates as you go; download it as a CSV that opens in Excel or Google Sheets.</p>
        </div>
      </div>

      <ExportBuilder projectId={code} accounts={accounts} />

      <div className="section-title"><h2>Saved exports</h2><span className="muted">{history.length} file{history.length === 1 ? "" : "s"}</span></div>
      <div className="card table-card">
        <div className="table-scroll">
          <table className="perf-table sticky-first">
            <thead><tr><th>File</th><th style={{ textAlign: "left" }}>Report</th><th>Rows</th><th>Size</th><th style={{ textAlign: "left" }}>By</th><th>When</th><th></th></tr></thead>
            <tbody>
              {history.map((e) => (
                <tr key={e.id}>
                  <td><a href={`/api/exports/${e.id}`} className="row" style={{ gap: 8, flexWrap: "nowrap", fontWeight: 600 }}><Icon name="file" size={16} />{e.fileName}</a></td>
                  <td style={{ textAlign: "left" }}>{datasetByKey(e.dataset)?.label ?? e.dataset}{e.pivot && <span className="badge info" style={{ marginLeft: 6 }}>Summary</span>}</td>
                  <td>{e.rowCount.toLocaleString()}</td>
                  <td>{size(e.bytes)}</td>
                  <td style={{ textAlign: "left" }}>{e.byName ?? "–"}</td>
                  <td>{e.createdAt.toLocaleString()}</td>
                  <td>
                    <div className="row-actions">
                      <a className="btn secondary sm" href={`/api/exports/${e.id}`}><Icon name="download" size={15} />Download</a>
                      {(canManage || e.userId === user.id) && <DeleteExport id={e.id} />}
                    </div>
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr><td colSpan={7}>
                  <div className="empty"><span className="empty-ico"><Icon name="file" size={24} /></span><b>No exports yet</b><span className="muted">Files you download appear here so the team can grab them again.</span></div>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export const instant = false;
