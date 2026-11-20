import { NextResponse, type NextRequest } from "next/server";
import { LIMITS, clientIp, rateLimit, tooMany } from "@/lib/ratelimit";
import { SESSION_COOKIE, isValidSession, readSession } from "@/lib/session";

// Paths anyone can open: the login page, the client "connected" page, the shared OAuth link and its
// callback, Meta's webhook, and uploaded media (Instagram downloads it when publishing).
const PUBLIC = [
  "/login",
  "/connected",
  "/connect/choose", // pick accounts when one login reaches several (guarded by its own cookie)
  "/data-deletion", // Meta app setting: Data deletion instructions URL
  "/privacy", // Meta app setting: Privacy policy URL
  "/terms", // Meta app setting: Terms of Service URL
  "/api/auth/login",
  "/api/auth/instagram", // also covers /api/auth/instagram/callback and /choose
  "/api/webhooks",
  "/uploads",
  // SEO / PWA assets: crawlers, link previews and "add to home screen" fetch these without a login.
  "/icon.svg",
  "/icons",
  "/social",
  "/apple-icon",
  "/opengraph-image",
  "/twitter-image",
  "/manifest.webmanifest",
  "/robots.txt",
  "/sitemap.xml",
];

function isPublic(path: string) {
  return PUBLIC.some((p) => path === p || path.startsWith(`${p}/`));
}

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const MAX_JSON_BYTES = 1024 * 1024; // 1 MB for ordinary API bodies
const MAX_UPLOAD_BYTES = 110 * 1024 * 1024; // media uploads (videos up to 100 MB + form overhead)

/** Hosts our own pages are served from (the browser's host, the tunnel / proxy host, APP_URL). */
function ownHosts(req: NextRequest) {
  const hosts = new Set<string>([req.nextUrl.host]);
  const h = req.headers.get("host");
  const fh = req.headers.get("x-forwarded-host");
  if (h) hosts.add(h);
  if (fh) hosts.add(fh.split(",")[0].trim());
  try { if (process.env.APP_URL) hosts.add(new URL(process.env.APP_URL).host); } catch {}
  return hosts;
}

/**
 * API protections, before any route runs:
 *   1. body size cap (413)
 *   2. cross-site check: data-changing calls must come from our own pages (403), on top of the
 *      SameSite=Lax session cookie
 *   3. rate limits per signed-in user (or per IP when signed out), tighter for expensive endpoints (429)
 * Meta's webhook is exempt (it's verified by its signature in the route, and Meta retries on errors).
 * The login route applies its own per-IP and per-email limits.
 */
async function protectApi(req: NextRequest, path: string): Promise<NextResponse | null> {
  if (path.startsWith("/api/webhooks")) return null;
  const method = req.method.toUpperCase();
  const unsafe = UNSAFE.has(method);

  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > (path === "/api/uploads" ? MAX_UPLOAD_BYTES : MAX_JSON_BYTES)) {
    return NextResponse.json({ error: "Request is too large" }, { status: 413 });
  }

  if (unsafe) {
    const origin = req.headers.get("origin");
    const site = req.headers.get("sec-fetch-site");
    let foreign = site === "cross-site";
    if (origin && origin !== "null") {
      try { foreign = !ownHosts(req).has(new URL(origin).host); } catch { foreign = true; }
    }
    if (foreign) return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
  }

  if (path === "/api/auth/login" || path === "/api/auth/logout") return null;
  const ip = clientIp(req.headers);
  if (path.startsWith("/api/auth/instagram")) {
    const r = await rateLimit(`connect:${ip}`, LIMITS.connectPerIp);
    return r.ok ? null : tooMany(r, "Too many connection attempts. Please wait a few minutes.");
  }

  const uid = await readSession(req.cookies.get(SESSION_COOKIE)?.value);
  const who = uid ? `u:${uid}` : `ip:${ip}`;
  const general = await rateLimit(`api:${unsafe ? "w" : "r"}:${who}`, !uid ? LIMITS.apiAnon : unsafe ? LIMITS.apiWrite : LIMITS.apiRead);
  if (!general.ok) return tooMany(general);

  // Expensive endpoints get their own, smaller budgets.
  let special: [string, typeof LIMITS.heavySync] | null = null;
  if (method === "POST" && /^\/api\/accounts\/[^/]+\/(sync|messages\/sync)$/.test(path)) special = ["sync", LIMITS.heavySync];
  else if (method === "POST" && path === "/api/uploads") special = ["upload", LIMITS.upload];
  else if (method === "POST" && path === "/api/users") special = ["newuser", LIMITS.createUser];
  if (special) {
    const r = await rateLimit(`${special[0]}:${who}`, special[1]);
    if (!r.ok) return tooMany(r);
  }
  return null;
}

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (path.startsWith("/api/")) {
    const blocked = await protectApi(req, path);
    if (blocked) return blocked;
  }
  if (isPublic(path)) return NextResponse.next();

  if (await isValidSession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  if (path.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  // Absolute URL on the same host the browser used (localhost or the tunnel).
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  const next = encodeURIComponent(path + req.nextUrl.search);
  return NextResponse.redirect(`${proto}://${host}/login?next=${next}`, 307);
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico).*)"],
};
