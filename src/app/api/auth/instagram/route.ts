import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

// Step 1: send the user to Meta's Unified login dialog (OAuth 2.0 authorization code flow).
// Permissions come from the saved Login Configuration (META_LOGIN_CONFIG_ID), not a scope list.
export async function GET() {
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

  return NextResponse.redirect(dialog);
}
