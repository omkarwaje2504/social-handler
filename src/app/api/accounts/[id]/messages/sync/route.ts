import { NextResponse } from "next/server";
import { isId, sql } from "@/lib/db";
import type { AccountDoc } from "@/lib/models";
import { listConversations } from "@/lib/graph";
import { saveMessage } from "@/lib/inbox";

type Ctx = { params: Promise<{ id: string }> };

// Imports the latest Instagram DM conversations (and their recent messages) into the database.
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isId(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [account] = await sql<AccountDoc[]>`select * from accounts where id = ${id}`;
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!account.pageId) return NextResponse.json({ error: "This account has no linked Facebook Page." }, { status: 400 });

  try {
    const conversations = await listConversations(account.pageId, account.accessToken);
    let saved = 0;
    for (const c of conversations) {
      const other = c.participants?.data.find((p) => p.id !== account.igUserId);
      if (!other) continue;
      for (const m of c.messages?.data ?? []) {
        const outgoing = m.from?.id === account.igUserId;
        await saveMessage({
          accountId: id,
          igMessageId: m.id,
          threadUserId: other.id,
          threadUsername: other.username ?? null,
          direction: outgoing ? "out" : "in",
          text: m.message ?? "",
          source: "sync",
          sentAt: new Date(m.created_time),
        });
        saved++;
      }
    }
    return NextResponse.json({ ok: true, conversations: conversations.length, messages: saved });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
