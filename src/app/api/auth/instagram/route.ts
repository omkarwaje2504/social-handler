import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { canOpenProject, getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { PROJECT_COOKIE } from "@/lib/connect";
import { decodeHash, encodeHash } from "@/lib/hash";

// Step 1: send the user to Meta's login dialog (OAuth 2.0 authorization code flow).
// Permissions come from the saved Login Configuration (META_LOGIN_CONFIG_ID), not a scope list.
// Which project the new accounts join:
//   ?project=<id>  signed-in member of that project (the "+ Connect" button inside a project)
//   ?p=<token>     the project's public connect link, shared with the account owner
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  // The cookie keeps the project's code (never its integer id).
  let projectCode: string | null = null;
  const pid = decodeHash("projects", q.get("project"));
  const token = q.get("p");
  if (pid) {
    const u = await getUser();
    if (u && (await canOpenProject(u, pid))) projectCode = encodeHash("projects", pid);
  } else if (token && /^[0-9a-f]{20,64}$/.test(token)) {
    const [p] = await sql<{ hash: string }[]>`select hash from projects where connect_token = ${token} and status = 'active'`;
    projectCode = p?.hash ?? null;
  }

  const state = randomBytes(16).toString("hex");
  const redirectUri = `${process.env.APP_URL}/api/auth/instagram/callback`;

  const dialog = new URL("https://www.facebook.com/dialog/oauth");
  dialog.searchParams.set("client_id", process.env.META_APP_ID ?? "");
  dialog.searchParams.set("config_id", process.env.META_LOGIN_CONFIG_ID ?? "");
  dialog.searchParams.set("redirect_uri", redirectUri);
  dialog.searchParams.set("response_type", "code");
  dialog.searchParams.set("state", state);

  const jar = await cookies();
  jar.set("ig_oauth_state", state, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/" });
  if (projectCode) jar.set(PROJECT_COOKIE, projectCode, { httpOnly: true, sameSite: "lax", maxAge: 30 * 60, path: "/" });
  else jar.delete(PROJECT_COOKIE);

  return NextResponse.redirect(dialog);
}
