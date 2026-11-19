import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What SMC (Social Management Center) collects from connected Instagram accounts and how it is used",
  robots: { index: true, follow: true },
  alternates: { canonical: "/privacy" },
};

// Public page for Meta's "Privacy policy URL" (App settings → Basic). Review the wording before relying on it.
export default function PrivacyPage() {
  const email = process.env.SUPPORT_EMAIL;
  return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ maxWidth: 760, lineHeight: 1.6 }}>
        <div className="brand brand-lockup" style={{ padding: "0 0 18px" }}><img src="/icon.svg" alt="" width={34} height={34} /><span>SMC<small>Social Management Center</small></span></div>
        <h1 style={{ marginBottom: 4 }}>Privacy policy</h1>
        <p className="muted">Last updated: 19 November 2026</p>

        <h2>Who we are</h2>
        <p className="muted">
          SMC (Social Management Center) is a tool that lets a business manage the Instagram professional accounts it connects:
          view posts and analytics, schedule posts, reply to comments and send automatic replies to comments that
          contain chosen keywords. It uses Meta&apos;s official Instagram and Facebook APIs.
        </p>

        <h2>Information we collect</h2>
        <ul className="muted">
          <li><b>Connected account details:</b> Instagram username, name, biography, website, profile picture, follower, following and media counts, and the linked Facebook Page ID.</li>
          <li><b>Content and metrics:</b> your posts and reels (captions, media links, dates), likes, comments, reach, views, saves, shares and account insights such as audience city, country, age and gender (aggregated by Meta, not per person).</li>
          <li><b>Comments and messages handled by automations:</b> the comment text, the commenter&apos;s Instagram user ID and username, whether they follow the account, and the reply or direct message sent.</li>
          <li><b>Scheduled posts</b> you create, including uploaded images or videos.</li>
          <li><b>Access tokens</b> issued by Meta so the app can act on your behalf.</li>
          <li><b>Webhook notifications</b> from Meta (for example, new comments), kept for up to 7 days for troubleshooting.</li>
        </ul>

        <h2>How we use it</h2>
        <ul className="muted">
          <li>To show your posts, analytics and growth over time.</li>
          <li>To publish posts you schedule and edit your profile when you ask.</li>
          <li>To send the automatic comment replies and direct messages you configure, only to people who commented on your content.</li>
        </ul>
        <p className="muted">
          We do not sell personal data, use it for advertising, or share it with third parties, except with Meta as
          needed to call its APIs and with our hosting and database providers, which store it for us.
        </p>

        <h2>Storage and retention</h2>
        <p className="muted">
          Data is stored in a managed PostgreSQL database with encrypted connections. It is kept while the account is
          connected. When an account is removed, everything stored for it is deleted. Webhook logs are removed after
          7 days.
        </p>

        <h2>Your choices</h2>
        <p className="muted">
          You can disconnect the app at any time from your Facebook or Instagram settings, and ask us to delete your
          data. See the <Link href="/data-deletion" className="profile-link">data deletion instructions</Link>.
        </p>

        <h2>Contact</h2>
        <p className="muted">
          {email
            ? <>Questions about this policy: <a className="profile-link" href={`mailto:${email}`}>{email}</a>.</>
            : <>Questions about this policy: contact the business that sent you the connection link.</>}
        </p>
        <p className="muted" style={{ marginTop: 16 }}><Link href="/terms" className="profile-link">Terms of service</Link></p>
      </div>
    </div>
  );
}

export const instant = false;
