import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextResponse, after } from "next/server";
import { sql } from "@/lib/db";
import { decodeHash, ensureHash } from "@/lib/hash";
import type { AccountDoc } from "@/lib/models";
import { syncAccount } from "@/lib/sync";
import { SESSION_COOKIE, isValidSession } from "@/lib/session";

// Shared by the OAuth callback and the "choose accounts" step.

export interface FoundAccount {
  igId: string;
  username: string;
  pageId: string;
  token: string; // Page token (or user token when there is no Page)
  name?: string; // shown on the "choose accounts" step
  pic?: string;
  pageName?: string;
}

const app = () => process.env.APP_URL!;
export const PENDING_COOKIE = "ig_pending";
/** Project the accounts from this login join (set by /api/auth/instagram). */
export const PROJECT_COOKIE = "ig_project";
const PENDING_MINUTES = 15;

/**
 * End of the connect flow. Clients (shared link) only ever see the public /connected page;
 * a signed-in admin goes back to the dashboard. 303 so a POST (choose step) becomes a GET.
 */
export async function finish(target: { error?: string; accountId?: string; username?: string }) {
  const jar = await cookies();
  const admin = await isValidSession(jar.get(SESSION_COOKIE)?.value);
  const go = (path: string) => NextResponse.redirect(`${app()}${path}`, 303);
  if (target.error) return go(`/connected?error=${target.error}`);
  if (admin && target.accountId) return go(`/accounts/${target.accountId}`);
  return go(`/connected${target.username ? `?u=${encodeURIComponent(target.username)}` : ""}`);
}

/**
 * Store (or refresh) the given accounts and start their first sync in the background.
 * The sync (every post + its insights) can take a minute, so the browser is not kept waiting.
 */
export async function saveAccounts(found: FoundAccount[], userToken: string) {
  const linked: AccountDoc[] = [];
  const pid = (await cookies()).get(PROJECT_COOKIE)?.value;
  const projectId = decodeHash("projects", pid); // the cookie holds the project's code
  for (const f of found) {
    // Reconnecting keeps the account's project unless this login was for a specific project.
    const [doc] = await sql<AccountDoc[]>`
      insert into accounts (ig_user_id, page_id, username, access_token, user_token, project_id)
      values (${f.igId}, ${f.pageId}, ${f.username}, ${f.token}, ${userToken}, ${projectId})
      on conflict (ig_user_id) do update set
        page_id = excluded.page_id, username = excluded.username, access_token = excluded.access_token,
        user_token = excluded.user_token, project_id = coalesce(excluded.project_id, accounts.project_id),
        updated_at = now()
      returning *`;
    if (doc) linked.push((await ensureHash("accounts", doc))!);
  }
  after(async () => {
    for (const acc of linked) {
      await syncAccount(acc.id).catch((e) => console.error("initial sync failed", e));
    }
  });
  return linked;
}

/** Park a login that reached several accounts until the person picks which ones to connect. */
export async function savePending(found: FoundAccount[], userToken: string) {
  const id = randomBytes(24).toString("hex");
  await sql`delete from pending_connections where created_at < now() - make_interval(mins => ${PENDING_MINUTES})`;
  await sql`insert into pending_connections (id, found, user_token) values (${id}, ${sql.json(found as never)}, ${userToken})`;
  (await cookies()).set(PENDING_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: app().startsWith("https"),
    path: "/",
    maxAge: PENDING_MINUTES * 60,
  });
}

/** The parked login for this browser, or null if missing/expired. */
export async function loadPending(): Promise<{ found: FoundAccount[]; userToken: string } | null> {
  const id = (await cookies()).get(PENDING_COOKIE)?.value;
  if (!id) return null;
  const [doc] = await sql<{ found: FoundAccount[]; userToken: string; createdAt: Date }[]>`
    select found, user_token, created_at from pending_connections where id = ${id}`;
  if (!doc || Date.now() - doc.createdAt.getTime() > PENDING_MINUTES * 60_000) return null;
  return { found: doc.found, userToken: doc.userToken };
}

export async function clearPending() {
  const jar = await cookies();
  const id = jar.get(PENDING_COOKIE)?.value;
  jar.delete(PENDING_COOKIE);
  if (id) await sql`delete from pending_connections where id = ${id}`;
}
