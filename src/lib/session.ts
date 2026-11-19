// Signed admin session cookie. Uses Web Crypto so it works in the proxy and in server code.

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

/** Cookie value: "<expiry ms>.<hmac>" */
export async function createSessionValue() {
  const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  return `${exp}.${await hmac(`admin.${exp}`)}`;
}

export async function isValidSession(value: string | undefined | null) {
  if (!value) return false;
  const [expStr, sig] = value.split(".");
  const exp = Number(expStr);
  if (!exp || !sig || exp < Date.now()) return false;
  const expected = await hmac(`admin.${exp}`);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

/** Safe in-app redirect target: must be a local path, never another origin. */
export function safeNext(next: string | null | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

/** Redirect with a relative Location so it stays on whatever host the browser used (localhost or tunnel). */
export function relativeRedirect(path: string, status = 303) {
  return new Response(null, { status, headers: { Location: path } });
}
