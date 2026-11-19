import { cookies } from "next/headers";
import Link from "next/link";
import { connection } from "next/server";
import { loadPending } from "@/lib/connect";
import { SESSION_COOKIE, isValidSession } from "@/lib/session";
import { ChooseAccountsForm } from "@/components/ChooseAccountsForm";

// Shown when one Meta login reaches several Instagram accounts: connect only the ones picked here.
// Public (clients use the shared link too); it only lists accounts from this browser's own login.
// Always a centered card with no sidebar; admins also get a "Cancel" back to the dashboard.
export default async function ChooseAccountsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await connection();
  const { error } = await searchParams;
  const [pending, admin] = await Promise.all([
    loadPending(),
    cookies().then((c) => isValidSession(c.get(SESSION_COOKIE)?.value)),
  ]);

  return (
    <div className="auth-wrap">
      <div className="choose">
        <div className="brand brand-lockup center" style={{ padding: "0 0 18px" }}><img src="/icon.svg" alt="" width={34} height={34} /><span>SMC<small>Social Management Center</small></span></div>
        {!pending ? (
          <div className="choose-card">
            <h1>Login expired</h1>
            <p className="lead">This step is only valid for 15 minutes. Please open the connection link again.</p>
            <a className="btn choose-submit" href="/api/auth/instagram" style={{ display: "block", textAlign: "center" }}>
              Connect Instagram again
            </a>
          </div>
        ) : (
          <ChooseAccountsForm accounts={pending.found} error={error} />
        )}
        {admin && (
          <div style={{ textAlign: "center", marginTop: 14 }}>
            <Link className="muted" href="/">← Cancel and go back to the dashboard</Link>
          </div>
        )}
      </div>
    </div>
  );
}

export const instant = false;
