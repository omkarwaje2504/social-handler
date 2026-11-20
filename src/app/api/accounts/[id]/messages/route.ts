import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { sql } from "@/lib/db";
import type { AccountDoc } from "@/lib/models";
import { sendDirectMessage } from "@/lib/graph";
import { lookupUsername, saveMessage } from "@/lib/inbox";

type Ctx = { params: Promise<{ id: string }> };

// Reply in a DM thread: { to: IGSID, text }. Meta only allows this within 24 hours of the person's last message.
export async function POST(req: Request, { params }: Ctx) {
  const { deny, id: id } = await guard("account", (await params).id);
  if (deny) return deny;
  const [account] = await sql<AccountDoc[]>`select * from accounts where id = ${id}`;
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { to, text } = (await req.json()) as { to?: string; text?: string };
  if (!to || !text?.trim()) return NextResponse.json({ error: "to and text are required" }, { status: 400 });

  try {
    const sent = await sendDirectMessage(account.pageId || account.igUserId, account.accessToken, to, text.trim());
    await saveMessage({
      accountId: id,
      igMessageId: sent.message_id ?? null,
      threadUserId: to,
      threadUsername: await lookupUsername(account, to),
      direction: "out",
      text: text.trim(),
      source: "reply",
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = (e as Error).message;
    const hint = /outside of allowed window|24/i.test(msg)
      ? " Instagram only allows replies within 24 hours of the person's last message."
      : "";
    return NextResponse.json({ error: msg + hint }, { status: 400 });
  }
}

// Mark a thread as read: { user: IGSID }.
export async function PATCH(req: Request, { params }: Ctx) {
  const { deny, id: id } = await guard("account", (await params).id);
  if (deny) return deny;
  const { user } = (await req.json()) as { user?: string };
  if (user) {
    await sql`update messages set read_at = now()
              where account_id = ${id} and thread_user_id = ${user} and direction = 'in' and read_at is null`;
  }
  return NextResponse.json({ ok: true });
}
