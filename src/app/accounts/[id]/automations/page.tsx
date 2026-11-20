import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { sql } from "@/lib/db";
import type { AccountDoc, AutomationDoc, AutomationLogDoc, PostDoc } from "@/lib/models";
import { AutomationCard, AutomationForm } from "@/components/AutomationForm";
import type { PickablePost } from "@/components/PostPicker";
import { decodeHash } from "@/lib/hash";
import { Icon } from "@/components/Icon";

export default async function AutomationsPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const accountId = decodeHash("accounts", id); // id in the URL is the account's code
  if (!accountId) notFound();
  const [account] = await sql<Pick<AccountDoc, "username">[]>`select username from accounts where id = ${accountId}`;
  if (!account) notFound();

  const [rules, counts, logs, postRows] = await Promise.all([
    sql<AutomationDoc[]>`select * from automations where account_id = ${accountId} order by created_at desc`,
    sql<{ automationId: number; matched: number; sent: number }[]>`
      select automation_id, count(*)::int as matched, count(*) filter (where status = 'sent')::int as sent
      from automation_logs where account_id = ${accountId} group by automation_id`,
    sql<(AutomationLogDoc & { ruleName: string | null })[]>`
      select l.*, a.name as rule_name from automation_logs l left join automations a on a.id = l.automation_id
      where l.account_id = ${accountId} order by l.created_at desc limit 30`,
    sql<Pick<PostDoc, "igMediaId" | "thumbnailUrl" | "mediaUrl" | "caption" | "mediaType" | "timestamp">[]>`
      select ig_media_id, thumbnail_url, media_url, caption, media_type, "timestamp" from posts
      where account_id = ${accountId} and not removed_from_app order by "timestamp" desc nulls last`,
  ]);

  const posts: PickablePost[] = postRows.map((p) => ({
    igMediaId: p.igMediaId,
    thumb: p.thumbnailUrl || p.mediaUrl || null,
    caption: (p.caption ?? "").slice(0, 120),
    mediaType: p.mediaType,
    date: p.timestamp ? p.timestamp.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : null,
  }));
  const byRule = new Map(counts.map((c) => [c.automationId, c]));

  return (
    <>
      <div className="page-head">
        <h1>Automations · @{account.username}</h1>
        <div className="spacer" />
        <Link className="btn secondary" href={`/accounts/${id}/messages`}><Icon name="message" size={16} />Messages</Link>
        <Link className="btn secondary" href={`/accounts/${id}`}><Icon name="chart" size={16} />Analytics</Link>
      </div>

      <div className="card">
        <h3>New keyword automation</h3>
        <p className="muted" style={{ marginBottom: 8 }}>
          When a comment contains the keyword, the app checks whether the commenter follows you and sends the matching
          message as a DM (a private reply to that comment), plus an optional public reply.
        </p>
        <AutomationForm accountId={id} posts={posts} />
      </div>

      <h2>Your automations ({rules.length})</h2>
      {rules.length === 0 && <div className="card muted">No automations yet.</div>}
      <div className="auto-list">
        {rules.map((r) => (
          <AutomationCard
            key={r.id}
            accountId={id}
            posts={posts}
            rule={{
              id: r.hash,
              name: r.name,
              keyword: r.keyword,
              enabled: r.enabled,
              igMediaIds: r.igMediaIds ?? [],
              followerMessage: r.followerMessage,
              nonFollowerMessage: r.nonFollowerMessage,
              publicReply: r.publicReply ?? "",
              createdAt: r.createdAt.toISOString(),
              matched: byRule.get(r.id)?.matched ?? 0,
              sent: byRule.get(r.id)?.sent ?? 0,
            }}
          />
        ))}
      </div>

      <h2>Recent activity</h2>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr><th>When</th><th>Automation</th><th>Commenter</th><th>Comment</th><th>Follows you?</th><th>Result</th><th></th></tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td>{new Date(l.createdAt).toLocaleString()}</td>
                <td>{l.ruleName ?? "—"}</td>
                <td>@{l.commenterUsername ?? l.commenterIgsid}</td>
                <td>{l.commentText.slice(0, 80)}</td>
                <td>{l.isFollower === null ? <span title="Instagram shares this only after the person messages you. It fills in automatically when they reply." className="muted">not shared yet</span> : l.isFollower ? "yes" : "no"}</td>
                <td>{l.status === "sent" ? <span className="pill on">DM sent</span> : <span className="pill" title={l.error ?? undefined}>error</span>}</td>
                <td><Link className="btn secondary" href={`/accounts/${id}/messages?user=${encodeURIComponent(l.commenterIgsid)}`}>Open chat</Link></td>
              </tr>
            ))}
            {logs.length === 0 && <tr><td colSpan={7} className="muted">Nothing yet. Activity appears when someone comments with a keyword.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

export const instant = false;
