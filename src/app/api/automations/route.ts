import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { sql } from "@/lib/db";
import type { AutomationDoc } from "@/lib/models";
import { ensureHash, toPublic } from "@/lib/hash";

// List automations for an account: GET /api/automations?accountId=...
export async function GET(req: Request) {
  const accountId = new URL(req.url).searchParams.get("accountId");
  if (!accountId) return NextResponse.json({ error: "accountId required" }, { status: 400 });
  const { deny, id } = await guard("account", accountId);
  if (deny) return deny;
  const rules = await sql<AutomationDoc[]>`
    select * from automations where account_id = ${id} order by created_at desc`;
  return NextResponse.json(toPublic(rules));
}

// Create automation.
export async function POST(req: Request) {
  const b = await req.json();
  if (!b.accountId || !b.keyword || !b.followerMessage || !b.nonFollowerMessage) {
    return NextResponse.json({ error: "accountId, keyword, followerMessage, nonFollowerMessage are required" }, { status: 400 });
  }
  const { deny, id: accountId } = await guard("account", b.accountId);
  if (deny) return deny;
  const doc = {
    accountId,
    name: b.name || `Keyword: ${b.keyword}`,
    keyword: String(b.keyword).trim(),
    igMediaIds: Array.isArray(b.igMediaIds) ? b.igMediaIds.map(String) : [],
    igMediaId: Array.isArray(b.igMediaIds) && b.igMediaIds.length ? String(b.igMediaIds[0]) : null,
    enabled: true,
    followerMessage: String(b.followerMessage),
    nonFollowerMessage: String(b.nonFollowerMessage),
    publicReply: b.publicReply || null,
  };
  const [row] = await sql<AutomationDoc[]>`insert into automations ${sql(doc)} returning *`;
  await ensureHash("automations", row);
  return NextResponse.json(toPublic(row), { status: 201 });
}
