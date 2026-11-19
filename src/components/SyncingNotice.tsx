"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Shown while a newly connected account has its first sync running; refreshes the page until it is done. */
export function SyncingNotice() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 6000);
    return () => clearInterval(t);
  }, [router]);
  return (
    <div className="notice sync-banner">
      <span className="sync-dot" />
      First sync in progress: posts, reels and insights are loading. This page updates by itself.
    </div>
  );
}
