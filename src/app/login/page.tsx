import type { Metadata } from "next";
import { connection } from "next/server";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to SMC (Social Management Center): Instagram analytics, comment-to-DM automations, inbox and scheduling.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/login" },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  await connection();
  const { error, next } = await searchParams;
  return (
    <div className="auth-wrap">
      <form className="auth-card" method="post" action="/api/auth/login">
        <div className="brand brand-lockup center" style={{ padding: "0 0 18px" }}><img src="/icon.svg" alt="" width={34} height={34} /><span>SMC<small>Social Management Center</small></span></div>
        <input type="hidden" name="next" value={next ?? "/"} />
        <input type="password" name="password" placeholder="Admin password" required autoFocus />
        {error && <div className="error">Wrong password.</div>}
        <button type="submit" style={{ width: "100%", marginTop: 12 }}>Log in</button>
        <p className="muted" style={{ marginTop: 14, textAlign: "center" }}>Only the account owner can open the dashboard.</p>
      </form>
    </div>
  );
}

export const instant = false;
