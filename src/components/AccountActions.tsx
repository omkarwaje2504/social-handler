"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Reconnect: runs the Meta login again (same Login Configuration), which refreshes the stored
// tokens and permissions for this account. Remove: deletes the account and all its data from the app.
export function AccountActions({ accountId, username }: { accountId: string; username: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  
  async function remove() {
    if (
      !confirm(
        `Remove @${username} from the app?\n\nThis deletes its synced posts, automations, automation logs, ` +
          `scheduled posts and history from this app. Nothing is changed on Instagram. This cannot be undone.`,
      )
    )
      return;
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/accounts/${accountId}`, { method: "DELETE" });
    if (!res.ok) {
      setBusy(false);
      setErr((await res.json().catch(() => ({}))).error ?? "Remove failed");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <>
      {/* Plain link: the route redirects to Facebook, so it must be a full page navigation. */}
      <a className="btn secondary" href="/api/auth/instagram" title={`Log in to Meta again as @${username} to refresh its access and permissions`}>
        Reconnect
      </a>
      <button className="danger" onClick={remove} disabled={busy}>
        {busy ? "Removing…" : "Remove account"}
      </button>
      {err && <span className="error" style={{ margin: 0 }}>{err}</span>}
    </>
  );
}
