import { NextResponse } from "next/server";
import { isId, sql } from "@/lib/db";
import type { AutomationDoc } from "@/lib/models";

// List automations for an account: GET /api/automations?accountId=...
export async function GET(req: Request) {
  const accountId = new URL(req.url).searchParams.get("accountId");
  if (!accountId) return NextResponse.json({ error: "accountId required" }, { status: 400 });
  if (!isId(accountId)) return NextResponse.json([]);
  const rules = await sql<AutomationDoc[]>`
    select * from automations where account_id = ${accountId} order by created_at desc`;
  return NextResponse.json(rules);
}

// Create automation.
export async function POST(req: Request) {
  const b = await req.json();
  if (!b.accountId || !b.keyword || !b.followerMessage || !b.nonFollowerMessage) {
    return NextResponse.json({ error: "accountId, keyword, followerMessage, nonFollowerMessage are required" }, { status: 400 });
  }
  if (!isId(b.accountId)) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  const doc = {
    accountId: b.accountId as string,
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
  return NextResponse.json(row, { status: 201 });
}
