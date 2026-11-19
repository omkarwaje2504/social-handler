import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Data deletion",
  description: "How to remove SMC's access and delete your data",
  robots: { index: true, follow: true },
  alternates: { canonical: "/data-deletion" },
};

// Public page for Meta's "Data deletion instructions URL" (App settings → Basic).
// Set SUPPORT_EMAIL in .env to show a contact address for deletion requests.
export default function DataDeletionPage() {
  const email = process.env.SUPPORT_EMAIL;
  return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ maxWidth: 680, lineHeight: 1.6 }}>
        <div className="brand brand-lockup" style={{ padding: "0 0 18px" }}><img src="/icon.svg" alt="" width={34} height={34} /><span>SMC<small>Social Management Center</small></span></div>
        <h1 style={{ marginBottom: 12 }}>Data deletion instructions</h1>

        <h2>What we store</h2>
        <p className="muted">
          When you connect an Instagram professional account, SMC (Social Management Center) stores: the account&apos;s public
          profile details (username, name, bio, profile picture, follower counts), your posts and their metrics,
          comments handled by keyword automations (comment text, commenter username and ID, the reply sent),
          scheduled posts, and the access tokens Meta issues to the app.
        </p>

        <h2>1. Remove the app&apos;s access</h2>
        <p className="muted">This stops SMC from reading or acting on your account immediately:</p>
        <ul className="muted">
          <li>
            <b>Facebook:</b> Settings &amp; privacy → Settings → <b>Business integrations</b> → select the app →
            <b> Remove</b>.
          </li>
          <li>
            <b>Instagram:</b> Settings → Website permissions → <b>Apps and websites</b> → Active → select the app →
            <b> Remove</b>.
          </li>
        </ul>

        <h2>2. Ask us to delete your data</h2>
        <p className="muted">
          {email ? (
            <>
              Email <a href={`mailto:${email}?subject=Data%20deletion%20request`}>{email}</a> with the subject
              &quot;Data deletion request&quot; and your Instagram username.
            </>
          ) : (
            <>Contact the business that sent you the connection link and ask for your data to be deleted, with your Instagram username.</>
          )}{" "}
          We delete the connected account and everything stored for it (profile, posts, metrics, automations,
          automation logs, scheduled posts and access tokens) within <b>30 days</b>, and confirm when it is done.
        </p>
        <p className="muted">Removing the app does not change or delete anything on your Instagram or Facebook account itself.</p>
      </div>
    </div>
  );
}

// The root layout reads cookies (admin sidebar), so this route renders per request like the others.
export const instant = false;
