import Link from "next/link";

// Rendered inside the root layout, which reads the session cookie, so it can't be prerendered.
export default function NotFound() {
  return (
    <div className="auth-wrap">
      <div className="choose-card" style={{ textAlign: "center" }}>
        <h1>Page not found</h1>
        <p className="lead">This page doesn&apos;t exist or was moved.</p>
        <Link className="btn" href="/">Go to the dashboard</Link>
      </div>
    </div>
  );
}

export const instant = false;
