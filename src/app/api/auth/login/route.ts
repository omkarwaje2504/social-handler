import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_DAYS, createSessionValue, safeNext } from "@/lib/session";

const digest = (s: string) => createHash("sha256").update(s).digest();

// Plain HTML form post: password + optional next path.
export async function POST(req: Request) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const next = safeNext(String(form.get("next") ?? "/"));
  const expected = process.env.ADMIN_PASSWORD ?? "";

  const ok = expected.length > 0 && timingSafeEqual(digest(password), digest(expected));
  if (!ok) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return new NextResponse(null, {
      status: 303,
      headers: { Location: `/login?error=1&next=${encodeURIComponent(next)}` },
    });
  }

  const https =
    req.headers.get("x-forwarded-proto") === "https" || new URL(req.url).protocol === "https:";
  const res = new NextResponse(null, { status: 303, headers: { Location: next } });
  res.cookies.set(SESSION_COOKIE, await createSessionValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: https,
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  return res;
}
