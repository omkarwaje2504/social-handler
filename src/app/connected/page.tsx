import { connection } from "next/server";

const MESSAGES: Record<string, string> = {
  oauth_state: "The login session expired. Please open the link again.",
  token: "Instagram did not return access. Please open the link again.",
  no_instagram_account:
    "We couldn't find an Instagram professional account. Make sure it is a Business/Creator account linked to a Facebook Page, then try the link again.",
};

// Public page shown to clients after they approve access via the shared link.
// It never shows dashboard data.
export default async function ConnectedPage({ searchParams }: { searchParams: Promise<{ error?: string; u?: string }> }) {
  await connection();
  const { error, u } = await searchParams;
  return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ textAlign: "center" }}>
        <div className="brand brand-lockup" style={{ padding: "0 0 18px" }}><img src="/icon.svg" alt="" width={34} height={34} /><span>SMC<small>Social Management Center</small></span></div>
        {error ? (
          <>
            <h1 style={{ marginBottom: 10 }}>Connection not completed</h1>
            <p className="muted">{MESSAGES[error] ?? "Something went wrong. Please try the link again."}</p>
          </>
        ) : (
          <>
            <h1 style={{ marginBottom: 10 }}>You&apos;re connected ✅</h1>
            <p className="muted">
              {u ? <>Instagram account <b>@{u}</b> is now linked.</> : "Your Instagram account is now linked."} You can close this page.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export const instant = false;
