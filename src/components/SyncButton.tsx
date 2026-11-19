"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SyncButton({ accountId }: { accountId: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  async function sync() {
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/accounts/${accountId}/sync`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      setErr((await res.json()).error);
      return;
    }
    router.refresh();
  }

  return (
    <>
      <button className="secondary" onClick={sync} disabled={busy}>
        {busy ? "Syncing…" : "Sync from Instagram"}
      </button>
      {err && <span className="error" style={{ margin: 0 }}>{err}</span>}
    </>
  );
}
