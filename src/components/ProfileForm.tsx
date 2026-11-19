"use client";

import { useState } from "react";

export function ProfileForm({
  accountId,
  initial,
}: {
  accountId: string;
  initial: { name: string; biography: string; website: string };
}) {
  const [form, setForm] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/accounts/${accountId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setBusy(false);
    setMsg(res.ok ? { ok: true, text: data.note } : { ok: false, text: data.error });
  }

  return (
    <form onSubmit={save} className="form-row">
      <div>
        <label>Display name</label>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div>
        <label>Bio</label>
        <textarea value={form.biography} onChange={(e) => setForm({ ...form, biography: e.target.value })} />
      </div>
      <div>
        <label>Website</label>
        <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
      </div>
      <div className="row">
        <button disabled={busy}>{busy ? "Saving…" : "Save details"}</button>
        {msg && <span className={msg.ok ? "notice" : "error"} style={{ margin: 0 }}>{msg.text}</span>}
      </div>
    </form>
  );
}
