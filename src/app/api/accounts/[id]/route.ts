import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { sql } from "@/lib/db";
import type { AccountDoc } from "@/lib/models";
import { updateProfileDetails } from "@/lib/profile";
import { toPublic } from "@/lib/hash";

type Ctx = { params: Promise<{ id: string }> };
const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

export async function GET(_req: Request, { params }: Ctx) {
  const { deny, id: id } = await guard("account", (await params).id);
  if (deny) return deny;
  const [account] = await sql<AccountDoc[]>`select * from accounts where id = ${id}`;
  if (!account) return notFound();
  const { accessToken: _a, userToken: _u, ...safe } = account;
  return NextResponse.json(toPublic(safe));
}

// Update profile details. Instagram's API cannot edit bio/name/picture, so changes are
// saved in the app and returned with a flag telling the UI they must be applied on Instagram.
export async function PATCH(req: Request, { params }: Ctx) {
  const { deny, id: id } = await guard("account", (await params).id);
  if (deny) return deny;
  const body = await req.json();
  try {
    const result = await updateProfileDetails(id, body);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

// Disconnect the account from the app (does not touch Instagram). Posts, automations, logs,
// snapshots and scheduled posts are removed with it (on delete cascade).
export async function DELETE(_req: Request, { params }: Ctx) {
  const { deny, id: id } = await guard("account", (await params).id, { manage: true });
  if (deny) return deny;
  const res = await sql`delete from accounts where id = ${id}`;
  if (!res.count) return notFound();
  return NextResponse.json({ ok: true });
}
