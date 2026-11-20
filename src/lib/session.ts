// Signed user session cookie. Uses Web Crypto so it works in the proxy and in server code.

export const SESSION_COOKIE = "sh_session";
export const SESSION_DAYS = 7;

const enc = new TextEncoder();

async function hmac(data: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Buffer.from(sig).toString("hex");
}

/**
 * Cookie value: "<user code>.<expiry ms>.<hmac>" (the user's public code, never the integer id).
 * Signed, so the proxy can trust it without the database.
 */
export async function createSessionValue(userId: string) {
  const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  return `${userId}.${exp}.${await hmac(`u.${userId}.${exp}`)}`;
}

/** The user code in a valid, unexpired session cookie; null otherwise. */
export async function readSession(value: string | undefined | null): Promise<string | null> {
  if (!value) return null;
  const [userId, expStr, sig] = value.split(".");
  const exp = Number(expStr);
  if (!userId || !exp || !sig || exp < Date.now()) return null;
  const expected = await hmac(`u.${userId}.${exp}`);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? userId : null;
}

export async function isValidSession(value: string | undefined | null) {
  return (await readSession(value)) !== null;
}

/** Safe in-app redirect target: must be a local path, never another origin. */
export function safeNext(next: string | null | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

/** Redirect with a relative Location so it stays on whatever host the browser used (localhost or tunnel). */
export function relativeRedirect(path: string, status = 303) {
  return new Response(null, { status, headers: { Location: path } });
}
