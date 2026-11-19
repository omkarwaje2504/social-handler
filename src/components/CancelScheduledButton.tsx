"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CancelScheduledButton({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function cancel() {
    if (!confirm("Cancel this scheduled post?")) return;
    setBusy(true);
    const res = await fetch(`/api/scheduled/${id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) alert((await res.json()).error);
    router.refresh();
  }
  return (
    <button className="secondary" onClick={cancel} disabled={busy}>
      {busy ? "Cancelling…" : "Cancel"}
    </button>
  );
}
