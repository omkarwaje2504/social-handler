import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

// Fixed-window rate limiting stored in Postgres, so every server instance (local, Vercel functions)
// shares the same counters. One upsert per checked request. If the database is unreachable the
// request is allowed (fail open) rather than locking everyone out.

export type Limit = { limit: number; windowSec: number };
export type LimitResult = { ok: boolean; remaining: number; retryAfter: number; limit: number };

export async function rateLimit(key: string, { limit, windowSec }: Limit): Promise<LimitResult> {
  const windowMs = windowSec * 1000;
  const start = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const retryAfter = Math.max(1, Math.ceil((start.getTime() + windowMs - Date.now()) / 1000));
  try {
    const [row] = await sql<{ count: number }[]>`
      insert into rate_limits (key, window_start, count) values (${key}, ${start}, 1)
      on conflict (key) do update set
        count = case when rate_limits.window_start = excluded.window_start then rate_limits.count + 1 else 1 end,
        window_start = excluded.window_start
      returning count`;
    if (Math.random() < 0.01) {
      // Occasional cleanup of old windows.
      sql`delete from rate_limits where window_start < now() - interval '1 day'`.catch(() => {});
    }
    return { ok: row.count <= limit, remaining: Math.max(0, limit - row.count), retryAfter, limit };
  } catch (e) {
    console.error("rate limit check failed (allowing request)", (e as Error).message);
    return { ok: true, remaining: limit, retryAfter: 0, limit };
  }
}

/** 429 JSON response with Retry-After. */
export function tooMany(r: LimitResult, message = "Too many requests. Please wait and try again.") {
  return NextResponse.json(
    { error: message, retryAfter: r.retryAfter },
    { status: 429, headers: { "Retry-After": String(r.retryAfter), "X-RateLimit-Limit": String(r.limit), "X-RateLimit-Remaining": "0" } },
  );
}

/** Best-effort client IP: Cloudflare, then the platform's proxy headers. */
export function clientIp(h: Headers) {
  return (
    h.get("cf-connecting-ip") ??
    h.get("x-real-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

// Budgets. Per signed-in user where possible, else per IP.
export const LIMITS = {
  loginPerIp: { limit: 20, windowSec: 15 * 60 },       // all login attempts from one address
  loginPerEmail: { limit: 6, windowSec: 15 * 60 },     // attempts on one account
  connectPerIp: { limit: 30, windowSec: 10 * 60 },     // Instagram connect flow (public)
  apiRead: { limit: 600, windowSec: 60 },              // GET requests
  apiWrite: { limit: 120, windowSec: 60 },             // POST / PATCH / PUT / DELETE
  apiAnon: { limit: 60, windowSec: 60 },               // API calls without a session
  heavySync: { limit: 6, windowSec: 60 },              // Instagram sync (many Graph API calls)
  exportFile: { limit: 10, windowSec: 60 },            // CSV built and uploaded to R2
  exportPreview: { limit: 90, windowSec: 60 },         // live preview while building an export
  createUser: { limit: 30, windowSec: 60 * 60 },       // new people per admin per hour
  upload: { limit: 30, windowSec: 10 * 60 },           // media uploads
} satisfies Record<string, Limit>;
