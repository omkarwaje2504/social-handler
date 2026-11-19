import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of service",
  description: "Terms for using SMC (Social Management Center)",
  robots: { index: true, follow: true },
  alternates: { canonical: "/terms" },
};

// Public page for Meta's "Terms of Service URL" (App settings → Basic). Review the wording before relying on it.
export default function TermsPage() {
  const email = process.env.SUPPORT_EMAIL;
  return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ maxWidth: 760, lineHeight: 1.6 }}>
        <div className="brand brand-lockup" style={{ padding: "0 0 18px" }}><img src="/icon.svg" alt="" width={34} height={34} /><span>SMC<small>Social Management Center</small></span></div>
        <h1 style={{ marginBottom: 4 }}>Terms of service</h1>
        <p className="muted">Last updated: 19 November 2026</p>

        <h2>Using the service</h2>
        <p className="muted">
          SMC (Social Management Center) lets you manage Instagram professional accounts you own or are authorised to manage. By
          connecting an account you confirm you have that authority and that you will follow Instagram&apos;s Terms of
          Use, Community Guidelines and Meta&apos;s Platform Terms.
        </p>

        <h2>Automations</h2>
        <p className="muted">
          You are responsible for the content of automatic replies and direct messages you configure. They are only
          sent to people who comment on your content, and must not be spam, misleading or unlawful.
        </p>

        <h2>Availability</h2>
        <p className="muted">
          The service depends on Meta&apos;s APIs, which can change, limit or stop features at any time. The service is
          provided &quot;as is&quot; without warranties, and we are not liable for indirect losses from its use.
        </p>

        <h2>Ending use</h2>
        <p className="muted">
          You can disconnect at any time. See the <Link href="/privacy" className="profile-link">privacy policy</Link> and{" "}
          <Link href="/data-deletion" className="profile-link">data deletion instructions</Link>.
        </p>

        <h2>Contact</h2>
        <p className="muted">
          {email ? <a className="profile-link" href={`mailto:${email}`}>{email}</a> : "Contact the business that sent you the connection link."}
        </p>
      </div>
    </div>
  );
}

export const instant = false;
