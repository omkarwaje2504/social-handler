import { NextResponse } from "next/server";
import { clearPending, finish, loadPending, saveAccounts } from "@/lib/connect";

// Step 3 (only when one login reached several accounts): connect just the ticked ones.
export async function POST(req: Request) {
  const pending = await loadPending();
  if (!pending) return finish({ error: "oauth_state" });

  const ids = new Set((await req.formData()).getAll("ig").map(String));
  const selected = pending.found.filter((f) => ids.has(f.igId));
  if (!selected.length) {
    return NextResponse.redirect(`${process.env.APP_URL}/connect/choose?error=none`, 303);
  }

  const linked = await saveAccounts(selected, pending.userToken);
  await clearPending();
  if (!linked.length) return finish({ error: "no_instagram_account" });
  return finish({
    accountId: linked[0].hash,
    username: linked.map((a) => a.username).join(", @"),
  });
}
