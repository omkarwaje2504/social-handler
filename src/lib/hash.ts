import { createHmac } from "crypto";
import Hashids from "hashids";
import { sql } from "@/lib/db";

// Public ids. Every table the browser can address has an integer `id` (internal, never sent out)
// and a `hash`: a 7-character code made from the id with Hashids, using a salt per table
// (HMAC of the table name with HASHID_SALT), so a project's code is meaningless as an account's code and codes
// can't be counted up or guessed. URLs, API bodies and JSON responses carry only hashes.
// Same scheme as the Laravel platform's HasHash trait (lowercase letters + digits, length 7).

export type HashTable =
  | "users" | "orgs" | "projects" | "accounts" | "posts" | "scheduled_posts"
  | "automations" | "comments" | "messages" | "exports";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz1234567890";
const LENGTH = 7;
const coders = new Map<HashTable, Hashids>();

function coder(table: HashTable) {
  let c = coders.get(table);
  if (!c) {
    const salt = process.env.HASHID_SALT;
    if (!salt) throw new Error("HASHID_SALT is not set in .env");
    // Hashids only reads the start of a salt (about as many characters as the alphabet), so
    // "<secret>:<table>" would give every table the same codes. Derive a distinct salt per table.
    const tableSalt = createHmac("sha256", salt).update(table).digest("hex");
    c = new Hashids(tableSalt, LENGTH, ALPHABET);
    coders.set(table, c);
  }
  return c;
}

/** id → public code. */
export const encodeHash = (table: HashTable, id: number) => coder(table).encode(id);

/**
 * Public code → id, or null for anything that isn't a valid code of this table (wrong table,
 * edited by hand, an old UUID, a plain number). Never throws.
 */
export function decodeHash(table: HashTable, hash: unknown): number | null {
  if (typeof hash !== "string" || !/^[a-z0-9]{7,32}$/.test(hash)) return null;
  try {
    const [n] = coder(table).decode(hash);
    const id = Number(n);
    if (!Number.isSafeInteger(id) || id <= 0) return null;
    return coder(table).encode(id) === hash ? id : null;
  } catch {
    return null;
  }
}

/** Decode a list of codes; invalid ones are dropped. */
export const decodeHashes = (table: HashTable, v: unknown): number[] =>
  Array.isArray(v) ? v.map((h) => decodeHash(table, h)).filter((n): n is number => n !== null) : [];

// Columns that point at another table's row (camelCase, as the sql client returns them).
const LINKS = {
  accountId: "accounts", projectId: "projects", userId: "users", postId: "posts",
  automationId: "automations", exportId: "exports",
  agencyId: "orgs", companyId: "orgs", brandId: "orgs",
  createdBy: "users", closedBy: "users", addedBy: "users",
} as const satisfies Record<string, HashTable>;
type LinkKey = keyof typeof LINKS;

/**
 * Make data safe to send to the browser (JSON responses and client component props):
 *   - a row with a `hash` gets `id = hash` (the hash field itself is dropped);
 *   - a row with a numeric `id` and no hash (internal tables) loses its id;
 *   - numeric links (accountId, projectId, userId, createdBy, …) become that table's code.
 * So the browser sees the same shapes as before, with codes wherever there were ids.
 */
export function toPublic<T>(data: T): Public<T> {
  return walk(data) as Public<T>;
}
function walk(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(walk);
  if (v === null || typeof v !== "object" || v instanceof Date) return v;
  if (Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) return v;
  const src = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(src)) {
    if (k === "hash") continue;
    if (k === "id") {
      if (typeof src.hash === "string") out.id = src.hash;
      else if (typeof val !== "number") out.id = val; // already public (e.g. a string code)
      continue;
    }
    const table = (LINKS as Record<string, HashTable>)[k];
    if (table && typeof val === "number") out[k] = encodeHash(table, val);
    else out[k] = walk(val);
  }
  return out;
}

/** Type of toPublic's result: ids and links become strings. */
export type Public<T> =
  T extends Date ? T
  : T extends (infer U)[] ? Public<U>[]
  : T extends object ? { [K in keyof T as K extends "hash" ? never : K]: K extends "id" | LinkKey ? (T[K] extends number ? string : T[K] extends number | null ? string | null : T[K] extends number | null | undefined ? string | null | undefined : Public<T[K]>) : Public<T[K]> }
  : T;

/** Store the code of a new row (call right after the insert). Returns the code. */
export async function setHash(table: HashTable, id: number) {
  const hash = encodeHash(table, id);
  await sql`update ${sql(table)} set hash = ${hash} where id = ${id} and hash is null`;
  return hash;
}

/** For `insert … returning id, hash` (also upserts): give the row its code if it has none yet. */
export async function ensureHash<R extends { id: number; hash: string | null }>(table: HashTable, row: R | undefined) {
  if (row && !row.hash) row.hash = await setHash(table, row.id);
  return row as (R & { hash: string }) | undefined;
}

/** Fill in codes for rows inserted in bulk (upserts) that don't have one yet. */
export async function fillHashes(table: HashTable) {
  const rows = await sql<{ id: number }[]>`select id from ${sql(table)} where hash is null`;
  if (!rows.length) return;
  const pairs = rows.map((r) => [r.id, encodeHash(table, r.id)] as [number, string]);
  await sql`
    update ${sql(table)} as t set hash = v.hash
    from (values ${sql(pairs)}) as v(id, hash)
    where t.id = v.id::int and t.hash is null`;
}
