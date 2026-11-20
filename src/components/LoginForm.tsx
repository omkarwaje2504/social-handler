"use client";

import { useState } from "react";
import { Icon } from "./Icon";

const MESSAGES: Record<string, string> = {
  "1": "That email and password don't match. Check them and try again.",
  disabled: "This account has been disabled. Ask your admin to turn it back on.",
};

/** Email + password form (a plain POST, so it works without JavaScript too). */
export function LoginForm({ next, error, wait }: { next: string; error?: string; wait?: string }) {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const message = error === "rate"
    ? `Too many sign-in attempts. Try again in ${Math.max(1, Number(wait) || 15)} minute${Number(wait) === 1 ? "" : "s"}.`
    : error ? MESSAGES[error] ?? MESSAGES["1"] : null;

  return (
    <form method="post" action="/api/auth/login" onSubmit={() => setBusy(true)} noValidate={false}>
      <input type="hidden" name="next" value={next} />
      {message && <div className="error" role="alert"><Icon name="alert" size={16} /><span>{message}</span></div>}

      <label htmlFor="login-email">Email</label>
      <div className="input-wrap">
        <Icon name="mail" size={17} className="lead-ico" />
        <input id="login-email" type="email" name="email" placeholder="you@company.com" autoComplete="username" required autoFocus inputMode="email" />
      </div>

      <label htmlFor="login-password">Password</label>
      <div className="input-wrap">
        <Icon name="lock" size={17} className="lead-ico" />
        <input id="login-password" type={show ? "text" : "password"} name="password" placeholder="Your password" autoComplete="current-password" required minLength={1} style={{ paddingRight: 44 }} />
        <button type="button" className="reveal" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}>
          <Icon name={show ? "eyeOff" : "eye"} size={17} />
        </button>
      </div>

      <button type="submit" className="lg block" style={{ marginTop: 22 }} disabled={busy}>
        {busy ? "Signing in…" : <>Sign in<Icon name="chevronRight" size={17} /></>}
      </button>
      <p className="help">Forgot your password or need an account? Ask your admin.</p>
    </form>
  );
}
