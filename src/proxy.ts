import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isValidSession } from "@/lib/session";

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

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
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
