import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { LIMITS, clientIp, rateLimit } from "@/lib/ratelimit";
import { SESSION_COOKIE, SESSION_DAYS, createSessionValue, safeNext } from "@/lib/session";
import { setHash } from "@/lib/hash";

const digest = (s: string) => createHash("sha256").update(s).digest();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Plain HTML form post: email + password + optional next path.
// First run: while no users exist, signing in with any email and ADMIN_PASSWORD (from the env)
// creates that email as the first super admin.
export async function POST(req: Request) {
  const form = await req.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = safeNext(String(form.get("next") ?? "/"));
  const fail = async (code = "1") => {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return new NextResponse(null, {
      status: 303,
      headers: { Location: `/login?error=${code}&next=${encodeURIComponent(next)}` },
    });
  };
  // Brute-force protection: limited attempts per address and per account (every attempt counts).
  const ip = clientIp(req.headers);
  const [byIp, byEmail] = await Promise.all([
    rateLimit(`login:ip:${ip}`, LIMITS.loginPerIp),
    rateLimit(`login:email:${email}`, LIMITS.loginPerEmail),
  ]);
  if (!byIp.ok || !byEmail.ok) {
    const wait = Math.ceil(Math.max(byIp.ok ? 0 : byIp.retryAfter, byEmail.ok ? 0 : byEmail.retryAfter) / 60);
    return new NextResponse(null, {
      status: 303,
      headers: { Location: `/login?error=rate&wait=${wait}&next=${encodeURIComponent(next)}`, "Retry-After": String(wait * 60) },
    });
  }
  if (!EMAIL.test(email) || !password) return fail();

  let [user] = await sql<{ id: number; hash: string | null; passwordHash: string; active: boolean }[]>`
    select id, hash, password_hash, active from users where email = ${email}`;

  if (!user) {
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from users`;
    const bootstrap = process.env.ADMIN_PASSWORD ?? "";
    const firstRun = n === 0 && bootstrap.length > 0 && timingSafeEqual(digest(password), digest(bootstrap));
    if (!firstRun) return fail();
    [user] = await sql<{ id: number; hash: string | null; passwordHash: string; active: boolean }[]>`
      insert into users (email, name, designation, role, password_hash)
      values (${email}, ${email.split("@")[0]}, 'Owner', 'super_admin', ${await hashPassword(password)})
      returning id, hash, password_hash, active`;
  } else if (!(await verifyPassword(password, user.passwordHash))) {
    return fail();
  }
  if (!user.active) return fail("disabled");

  await sql`update users set last_login_at = now() where id = ${user.id}`;
  const code = user.hash ?? (await setHash("users", user.id));
  const https = req.headers.get("x-forwarded-proto") === "https" || new URL(req.url).protocol === "https:";
  const res = new NextResponse(null, { status: 303, headers: { Location: next } });
  res.cookies.set(SESSION_COOKIE, await createSessionValue(code), {
    httpOnly: true,
    sameSite: "lax",
    secure: https,
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  return res;
}
