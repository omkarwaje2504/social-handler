import { guard } from "@/lib/auth";
import { NextResponse } from "next/server";
import { syncAccount } from "@/lib/sync";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { deny, id: id } = await guard("account", (await params).id);
  if (deny) return deny;
  try {
    const result = await syncAccount(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
