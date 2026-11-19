"use client";

import { useState } from "react";

export type ChoosableAccount = { igId: string; username: string; name?: string; pic?: string; pageId: string; pageName?: string };

/** Pick which Instagram accounts from one login to connect. Posts to /api/auth/instagram/choose. */
export function ChooseAccountsForm({ accounts, error }: { accounts: ChoosableAccount[]; error?: string }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const all = picked.length === accounts.length;
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <form
      className="choose-card"
      method="post"
      action="/api/auth/instagram/choose"
      onSubmit={(e) => {
        if (!picked.length) return e.preventDefault();
        setBusy(true);
      }}
    >
      <div className="choose-steps">
        <span className="done">1 · Log in with Facebook</span>
        <span className="now">2 · Choose accounts</span>
        <span>3 · Done</span>
      </div>
      <h1>Choose accounts to connect</h1>
      <p className="lead">
        Your login gives access to <b>{accounts.length} Instagram account{accounts.length > 1 ? "s" : ""}</b>. Select the
        ones to connect; the others are left out.
      </p>
      {error === "none" && <div className="error">Select at least one account.</div>}

      <div className="row" style={{ marginBottom: 10 }}>
        <span className="muted">{picked.length} of {accounts.length} selected</span>
        <div className="spacer" />
        <button type="button" className="secondary" onClick={() => setPicked(all ? [] : accounts.map((a) => a.igId))}>
          {all ? "Clear" : "Select all"}
        </button>
      </div>

      <div className="choose-list">
        {accounts.map((f) => (
          <label key={f.igId} className="acct-option">
            <input type="checkbox" name="ig" value={f.igId} checked={picked.includes(f.igId)} onChange={() => toggle(f.igId)} />
            {f.pic ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="acct-pic" src={f.pic} alt="" />
            ) : (
              <span className="acct-pic">{(f.username || "?").charAt(0).toUpperCase()}</span>
            )}
            <span className="acct-text">
              <b>@{f.username || f.igId}</b>
              {f.pageId ? (
                <span>{[f.name, f.pageName && `Page: ${f.pageName}`].filter(Boolean).join(" · ") || "Facebook Page linked"}</span>
              ) : (
                <span className="warn">No Facebook Page linked: auto-DM automations won&apos;t work</span>
              )}
            </span>
            <span className="acct-check" aria-hidden />
          </label>
        ))}
      </div>

      <button type="submit" className="choose-submit" disabled={busy || !picked.length}>
        {busy
          ? "Connecting…"
          : picked.length
            ? `Connect ${picked.length} account${picked.length > 1 ? "s" : ""}`
            : "Select an account"}
      </button>
      <p className="choose-hint">
        {busy ? "Saving the accounts. Posts and insights keep syncing in the background." : "You can connect the others later with the same link."}
      </p>
    </form>
  );
}
