import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { type FoundAccount, finish, saveAccounts, savePending } from "@/lib/connect";

const GRAPH = `https://graph.facebook.com/${process.env.IG_GRAPH_VERSION || "v23.0"}`;
const app = () => process.env.APP_URL!;

// Step 2: exchange the code, find Instagram accounts linked to the user's Pages, store and sync them.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const jar = await cookies();

  if (!code || !state || state !== jar.get("ig_oauth_state")?.value) {
    return finish({ error: "oauth_state" });
  }
  jar.delete("ig_oauth_state");

  const redirectUri = `${app()}/api/auth/instagram/callback`;

  // Short-lived user token
  const short = new URL(`${GRAPH}/oauth/access_token`);
  short.search = new URLSearchParams({
    client_id: process.env.META_APP_ID ?? "",
    client_secret: process.env.META_APP_SECRET ?? "",
    redirect_uri: redirectUri,
    code,
  }).toString();
  const shortRes = await fetch(short).then((r) => r.json());
  if (!shortRes.access_token) {
    console.error("token exchange failed", shortRes);
    return finish({ error: "token" });
  }

  // Long-lived user token (~60 days)
  const long = new URL(`${GRAPH}/oauth/access_token`);
  long.search = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: process.env.META_APP_ID ?? "",
    client_secret: process.env.META_APP_SECRET ?? "",
    fb_exchange_token: shortRes.access_token,
  }).toString();
  const longRes = await fetch(long).then((r) => r.json());
  const userToken: string = longRes.access_token ?? shortRes.access_token;

  // Pages you manage, each with its linked Instagram account
  const pages = new URL(`${GRAPH}/me/accounts`);
  pages.search = new URLSearchParams({
    fields: "id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}",
    access_token: userToken,
  }).toString();
  const pagesRes = await fetch(pages).then((r) => r.json());
  if (pagesRes.error) console.error("me/accounts failed", pagesRes.error);

  const found: FoundAccount[] = [];

  // 1) Instagram accounts linked to your Facebook Pages
  for (const page of pagesRes.data ?? []) {
    const ig = page.instagram_business_account;
    if (ig?.id)
      found.push({
        igId: ig.id,
        username: ig.username ?? "",
        pageId: page.id,
        token: page.access_token,
        name: ig.name,
        pic: ig.profile_picture_url,
        pageName: page.name,
      });
  }

  // 2) Instagram accounts assigned to your Business portfolios (no Page link needed)
  // Needs business_management; without it (not approved yet) this is skipped and the next step runs.
  if (found.length === 0) {
    const biz = await fetch(
      `${GRAPH}/me/businesses?fields=id,name,instagram_business_accounts{id,username}&access_token=${encodeURIComponent(userToken)}`,
    )
      .then((r) => r.json())
      .catch((e: Error) => ({ error: { message: e.message } }));
    if (biz.error) console.warn("me/businesses skipped:", biz.error.message ?? biz.error);
    for (const b of biz.data ?? []) {
      for (const ig of b.instagram_business_accounts?.data ?? []) {
        found.push({ igId: ig.id, username: ig.username ?? "", pageId: "", token: userToken });
      }
    }
  }

  // 3) Instagram user endpoint with the same token
  if (found.length === 0) {
    const me = await fetch(
      `https://graph.instagram.com/me?fields=user_id,username&access_token=${encodeURIComponent(userToken)}`,
    ).then((r) => r.json());
    if (me.error) console.error("graph.instagram.com/me failed", me.error);
    const igId = me.user_id ?? me.id;
    if (igId) found.push({ igId: String(igId), username: me.username ?? "", pageId: "", token: userToken });
  }

  // One login can reach several accounts (every Page / asset the token covers). Only connect
  // what the person picks: a single account connects directly, several go to /connect/choose.
  const unique = [...new Map(found.map((f) => [f.igId, f])).values()];
  if (!unique.length) return finish({ error: "no_instagram_account" });
  if (unique.length > 1) {
    await savePending(unique, userToken);
    return NextResponse.redirect(`${app()}/connect/choose`, 303);
  }

  const linked = await saveAccounts(unique, userToken);
  if (!linked.length) return finish({ error: "no_instagram_account" });
  return finish({ accountId: linked[0].hash, username: linked[0].username });
}
