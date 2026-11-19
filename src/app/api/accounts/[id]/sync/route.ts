import { isId } from "@/lib/db";
import { NextResponse } from "next/server";
import { syncAccount } from "@/lib/sync";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isId(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const result = await syncAccount(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
