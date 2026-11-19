import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { isId, sql } from "@/lib/db";
import type { AccountDoc } from "@/lib/models";
import { Inbox, type ChatMessage, type Thread } from "@/components/Inbox";

export default async function MessagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ user?: string }>;
}) {
  await connection();
  const { id } = await params;
  const { user } = await searchParams;
  if (!isId(id)) notFound();
  const [account] = await sql<Pick<AccountDoc, "username">[]>`select username from accounts where id = ${id}`;
  if (!account) notFound();

  const threads = await sql<Thread[]>`
    select distinct on (thread_user_id)
           thread_user_id as user_id,
           (select m2.thread_username from messages m2 where m2.account_id = m.account_id and m2.thread_user_id = m.thread_user_id
              and m2.thread_username is not null limit 1) as username,
           text as last_text, sent_at as last_at, direction as last_direction,
           (select count(*)::int from messages m3 where m3.account_id = m.account_id and m3.thread_user_id = m.thread_user_id
              and m3.direction = 'in' and m3.read_at is null) as unread
    from messages m where account_id = ${id}
    order by thread_user_id, sent_at desc`;
  threads.sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());

  const selected = user ?? threads[0]?.userId ?? null;
  const rows = selected
    ? await sql<(ChatMessage & { attachments: unknown })[]>`
        select m.id, m.direction, m.text, m.sent_at, m.source, m.attachments, a.name as automation_name
        from messages m left join automations a on a.id = m.automation_id
        where m.account_id = ${id} and m.thread_user_id = ${selected}
        order by m.sent_at asc limit 500`
    : [];
  const messages: ChatMessage[] = rows.map((r) => ({
    id: r.id,
    direction: r.direction,
    text: r.text,
    sentAt: new Date(r.sentAt).toISOString(),
    source: r.source,
    automationName: r.automationName,
    hasAttachment: r.attachments != null,
  }));
  const lastIn = [...rows].reverse().find((r) => r.direction === "in");

  // A thread opened from an automation log may have no stored messages yet.
  if (selected && !threads.some((t) => t.userId === selected)) {
    const [log] = await sql<{ name: string | null }[]>`
      select commenter_username as name from automation_logs where account_id = ${id} and commenter_igsid = ${selected} limit 1`;
    threads.unshift({ userId: selected, username: log?.name ?? null, lastText: "", lastAt: new Date().toISOString(), lastDirection: "out", unread: 0 });
  }

  return (
    <>
      <div className="page-head">
        <h1>Messages · @{account.username}</h1>
        <div className="spacer" />
        <Link className="btn secondary" href={`/accounts/${id}/automations`}>⚡ Automations</Link>
        <Link className="btn secondary" href={`/accounts/${id}`}>← Dashboard</Link>
      </div>
      <Inbox
        accountId={id}
        threads={threads.map((t) => ({ ...t, lastAt: new Date(t.lastAt).toISOString() }))}
        selected={selected}
        messages={messages}
        lastInboundAt={lastIn ? new Date(lastIn.sentAt).toISOString() : null}
      />
    </>
  );
}

export const instant = false;
