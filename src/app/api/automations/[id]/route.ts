import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { sql } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

// Stats for one automation: totals, today / yesterday / 7 days / 30 days, and every handled comment.
export async function GET(_req: Request, { params }: Ctx) {
  const { deny, id: id } = await guard("automation", (await params).id);
  if (deny) return deny;
  const [rule] = await sql`select id from automations where id = ${id}`;
  if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [totals] = await sql`
    select count(*)::int as matched,
           count(distinct commenter_igsid)::int as people,
           count(*) filter (where is_follower)::int as followers,
           count(*) filter (where is_follower = false)::int as non_followers,
           count(*) filter (where is_follower is null)::int as unknown,
           count(*) filter (where status = 'sent')::int as sent,
           count(*) filter (where status = 'error')::int as errors,
           count(*) filter (where public_reply_sent)::int as replies
    from automation_logs where automation_id = ${id}`;

  const [p] = await sql`
    select count(*) filter (where created_at >= date_trunc('day', now()))::int as today_m,
           count(*) filter (where created_at >= date_trunc('day', now()) and status = 'sent')::int as today_s,
           count(*) filter (where created_at >= date_trunc('day', now()) - interval '1 day' and created_at < date_trunc('day', now()))::int as yest_m,
           count(*) filter (where created_at >= date_trunc('day', now()) - interval '1 day' and created_at < date_trunc('day', now()) and status = 'sent')::int as yest_s,
           count(*) filter (where created_at >= now() - interval '7 days')::int as week_m,
           count(*) filter (where created_at >= now() - interval '7 days' and status = 'sent')::int as week_s,
           count(*) filter (where created_at >= now() - interval '30 days')::int as month_m,
           count(*) filter (where created_at >= now() - interval '30 days' and status = 'sent')::int as month_s
    from automation_logs where automation_id = ${id}`;

  const logs = await sql`
    select comment_id as id, created_at, commenter_igsid, commenter_username, comment_text, is_follower, message_sent,
           status, error, public_reply_sent
    from automation_logs where automation_id = ${id} order by created_at desc limit 500`;

  return NextResponse.json({
    totals,
    periods: [
      { label: "Today", matched: p.todayM, sent: p.todayS },
      { label: "Yesterday", matched: p.yestM, sent: p.yestS },
      { label: "Last 7 days", matched: p.weekM, sent: p.weekS },
      { label: "Last 30 days", matched: p.monthM, sent: p.monthS },
    ],
    logs,
  });
}

// Toggle enabled / edit messages.
export async function PATCH(req: Request, { params }: Ctx) {
  const { deny, id: id } = await guard("automation", (await params).id);
  if (deny) return deny;
  const b = await req.json();
  const allowed = ["enabled", "keyword", "name", "followerMessage", "nonFollowerMessage", "publicReply"];
  const set: Record<string, unknown> = {};
  for (const k of allowed) if (k in b) set[k] = b[k] === "" && k === "publicReply" ? null : b[k];
  if (Array.isArray(b.igMediaIds)) {
    set.igMediaIds = b.igMediaIds.map(String);
    set.igMediaId = b.igMediaIds.length ? String(b.igMediaIds[0]) : null;
  }
  if (typeof set.name === "string" && !set.name.trim() && typeof b.keyword === "string") set.name = `Keyword: ${b.keyword}`;
  if (Object.keys(set).length) await sql`update automations set ${sql(set)} where id = ${id}`;
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { deny, id: id } = await guard("automation", (await params).id);
  if (deny) return deny;
  await sql`delete from automations where id = ${id}`;
  return NextResponse.json({ ok: true });
}
