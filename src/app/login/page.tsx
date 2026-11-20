import type { Metadata } from "next";
import { connection } from "next/server";
import { Icon } from "@/components/Icon";
import { LoginForm } from "@/components/LoginForm";
import { SocialNetworkBg } from "@/components/SocialNetworkBg";
import { safeNext } from "@/lib/session";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to SMC (Social Management Center): Instagram analytics, comment-to-DM automations, inbox and scheduling.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/login" },
};

// Split screen: the SMC story with the social-network hub (large screens), and the sign-in form.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; wait?: string }>;
}) {
  await connection();
  const { error, next, wait } = await searchParams;
  return (
    <div className="login">
      <aside className="login-art" aria-hidden="true">
        <div className="brand brand-lockup"><img src="/icon.svg" alt="" width={36} height={36} /><span>SMC<small>Social Management Center</small></span></div>
        <div className="login-net"><SocialNetworkBg /></div>
        <div className="login-copy">
          <h2>Every social account your team manages, in one place.</h2>
          <p>Analytics, inbox, comment-to-DM automations, scheduling and exports for each client, with access kept to the people who need it.</p>
          <div className="login-points">
            <div><Icon name="chart" size={18} />Follower growth, reach and top content per project</div>
            <div><Icon name="message" size={18} />Shared inbox with auto-DMs on comment keywords</div>
            <div><Icon name="lock" size={18} />Separate workspaces for every admin and their team</div>
          </div>
        </div>
      </aside>

      <main className="login-panel">
        <div className="login-card">
          <div className="brand brand-lockup"><img src="/icon.svg" alt="" width={36} height={36} /><span>SMC<small>Social Management Center</small></span></div>
          <h1>Sign in</h1>
          <p className="lead">Welcome back. Use the email your admin set up for you.</p>
          <LoginForm next={safeNext(next)} error={error} wait={wait} />
        </div>
        <div className="login-foot"><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/data-deletion">Data deletion</a></div>
      </main>
    </div>
  );
}

export const instant = false;
