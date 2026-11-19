import Link from "next/link";
import { connection } from "next/server";
import { isId, sql } from "@/lib/db";
import type { ScheduledPostDoc } from "@/lib/models";
import { CancelScheduledButton } from "@/components/CancelScheduledButton";

export default async function ScheduledPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const rows = isId(id)
    ? await sql<ScheduledPostDoc[]>`
        select * from scheduled_posts where account_id = ${id} and status <> 'cancelled'
        order by publish_at desc limit 100`
    : [];

  return (
    <>
      <div className="page-head">
        <h1>Scheduled posts & reels</h1>
        <div className="spacer" />
        <Link className="btn" href={`/accounts/${id}/create`}>Schedule new</Link>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Media</th><th>Type</th><th>Caption</th><th>Publish at</th><th>Status</th><th /></tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td>
                  {s.mediaType === "IMAGE"
                    ? <img className="thumb" src={s.mediaUrl} alt="" />
                    : <a href={s.mediaUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>Video</a>}
                </td>
                <td>{s.mediaType === "REELS" ? "Reel" : "Post"}</td>
                <td style={{ maxWidth: 280 }}>{s.caption || <span className="muted">(no caption)</span>}</td>
                <td>{s.publishAt.toLocaleString()}</td>
                <td>
                  <span className={`badge ${s.status}`}>{s.status}</span>
                  {s.error && <div className="muted" style={{ marginTop: 4 }}>{s.error}</div>}
                </td>
                <td>{s.status === "pending" && <CancelScheduledButton id={s.id} />}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="muted">Nothing scheduled yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="muted">Scheduled posts are published by the app server, so keep it (and the tunnel) running at the scheduled time.</p>
    </>
  );
}

export const instant = false;
