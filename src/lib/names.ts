// Name rules and fuzzy matching. Used by the server (authoritative) and by forms (instant feedback).

export type NameCheck = { ok: true; value: string } | { ok: false; error: string };

/** Collapse whitespace, trim, normalise Unicode. */
export const cleanName = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim();

const ORG_CHARS = /^[\p{L}\p{M}\p{N} &.,'’()\-/+@#:!]+$/u;
const PERSON_CHARS = /^[\p{L}\p{M} .'’-]+$/u;
const REPEATED_PUNCT = /([&.,'’()\-/+@#:!])\1/u;

/**
 * Project / agency / company / brand names: 2–80 characters; letters, digits, spaces and & . , ' ( ) - / + @ # : !;
 * must contain a letter; no doubled punctuation ("--", ".."); can't start with punctuation.
 */
export function checkOrgName(raw: unknown, label = "Name", max = 80): NameCheck {
  const v = cleanName(typeof raw === "string" ? raw : "");
  if (!v) return { ok: false, error: `${label} is required` };
  if (v.length < 2) return { ok: false, error: `${label} must be at least 2 characters` };
  if (v.length > max) return { ok: false, error: `${label} must be ${max} characters or fewer` };
  if (!ORG_CHARS.test(v)) return { ok: false, error: `${label} can only use letters, numbers, spaces and & . , ' ( ) - / + @ # : !` };
  if (!/\p{L}/u.test(v)) return { ok: false, error: `${label} must contain at least one letter` };
  if (/^[^\p{L}\p{N}(]/u.test(v)) return { ok: false, error: `${label} must start with a letter or number` };
  if (REPEATED_PUNCT.test(v)) return { ok: false, error: `${label} has repeated punctuation` };
  return { ok: true, value: v };
}

/** People's names: 2–60 characters; letters, spaces and . ' - only. */
export function checkPersonName(raw: unknown, label = "Full name"): NameCheck {
  const v = cleanName(typeof raw === "string" ? raw : "");
  if (!v) return { ok: false, error: `${label} is required` };
  if (v.length < 2) return { ok: false, error: `${label} must be at least 2 characters` };
  if (v.length > 60) return { ok: false, error: `${label} must be 60 characters or fewer` };
  if (!PERSON_CHARS.test(v)) return { ok: false, error: `${label} can only use letters, spaces and . ' -` };
  if (!/\p{L}.*\p{L}/u.test(v)) return { ok: false, error: `${label} must contain letters` };
  if (REPEATED_PUNCT.test(v)) return { ok: false, error: `${label} has repeated punctuation` };
  return { ok: true, value: v };
}

/** Designations / job titles: optional, up to 60 characters, same characters as org names. */
export function checkDesignation(raw: unknown): NameCheck {
  const v = cleanName(typeof raw === "string" ? raw : "");
  if (!v) return { ok: true, value: "" };
  return checkOrgName(v, "Designation", 60);
}

// ---------------------------------------------------------------------------------------------
// Fuzzy matching

// Legal / filler words that don't make two names different ("Acme Pvt Ltd" = "Acme").
const SUFFIXES = new Set(["pvt", "private", "ltd", "limited", "llp", "llc", "inc", "incorporated", "corp", "corporation", "co", "plc", "gmbh", "the"]);

/** Canonical key: lower case, accents removed, & → and, punctuation and legal suffixes dropped. */
export function nameKey(s: string) {
  const words = cleanName(s)
    .toLowerCase()
    .normalize("NFD").replace(/\p{M}/gu, "")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const core = words.filter((w) => !SUFFIXES.has(w));
  return (core.length ? core : words).join(" ");
}

function bigrams(s: string) {
  const t = ` ${s.replace(/ /g, "")} `;
  const out = new Map<string, number>();
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}

function dice(a: string, b: string) {
  const A = bigrams(a), B = bigrams(b);
  let inter = 0, total = 0;
  for (const [g, n] of A) { inter += Math.min(n, B.get(g) ?? 0); total += n; }
  for (const n of B.values()) total += n;
  return total ? (2 * inter) / total : 0;
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** 0..1 how alike two names are (1 = same key). Typos, spacing, word order and suffixes are forgiven. */
export function similarity(a: string, b: string) {
  const ka = nameKey(a), kb = nameKey(b);
  if (!ka || !kb) return 0;
  if (ka === kb) return 1;
  const sa = ka.replace(/ /g, ""), sb = kb.replace(/ /g, "");
  if (sa === sb) return 0.98; // "Sun Pharma" vs "SunPharma"
  const lev = 1 - levenshtein(sa, sb) / Math.max(sa.length, sb.length);
  const sorted = (k: string) => k.split(" ").sort().join(" ");
  const order = sorted(ka) === sorted(kb) ? 0.95 : 0; // same words, different order
  const ta = ka.split(" "), tb = kb.split(" ");
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const contained = short.every((w) => long.includes(w)) ? 0.8 : 0; // "Apollo" vs "Apollo Hospitals"
  return Math.max(dice(ka, kb), lev, order, contained);
}

/** Similar enough to warn "this may be a duplicate". */
export const DUPLICATE_AT = 0.75;

/** Score a search query against a name for the picker (prefix > word-prefix > contains > fuzzy). */
export function searchScore(query: string, name: string) {
  const q = nameKey(query), k = nameKey(name);
  if (!q) return 0.5;
  if (k === q) return 1;
  if (k.startsWith(q)) return 0.95;
  if (k.split(" ").some((w) => w.startsWith(q))) return 0.9;
  if (k.includes(q)) return 0.85;
  // Typos: compare with the whole name and with each word ("apolo" → "Apollo Hospitals").
  const perWord = Math.max(0, ...k.split(" ").map((w) => similarity(q, w)));
  return Math.max(similarity(query, name), perWord) * 0.8;
}

/** Items ranked by how well they match the query (weak matches dropped). */
export function fuzzyFilter<T>(items: T[], query: string, get: (t: T) => string, min = 0.4) {
  if (!cleanName(query)) return items;
  return items
    .map((t) => ({ t, s: searchScore(query, get(t)) }))
    .filter((x) => x.s >= min)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.t);
}

/** Existing items that look like duplicates of `name`, most similar first. */
export function similarTo<T>(items: T[], name: string, get: (t: T) => string, at = DUPLICATE_AT) {
  return items
    .map((t) => ({ t, s: similarity(name, get(t)) }))
    .filter((x) => x.s >= at)
    .sort((a, b) => b.s - a.s);
}
