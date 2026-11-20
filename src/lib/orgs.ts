import { sql } from "@/lib/db";
import { decodeHash, ensureHash } from "@/lib/hash";
import { checkOrgName, nameKey, similarTo } from "@/lib/names";

// Agencies, companies and brands that projects link to. Each workspace has its own directory:
// owner_id = the admin it belongs to, null = the super admins' (platform) directory. A project only
// links to entries of its own workspace, so one admin never sees another admin's clients.

export type OrgKind = "agency" | "company" | "brand";
export const ORG_KINDS: OrgKind[] = ["agency", "company", "brand"];
export const ORG_LABEL: Record<OrgKind, { one: string; many: string }> = {
  agency: { one: "Agency", many: "Agencies" },
  company: { one: "Company", many: "Companies" },
  brand: { one: "Brand", many: "Brands" },
};
export const isOrgKind = (k: unknown): k is OrgKind => typeof k === "string" && (ORG_KINDS as string[]).includes(k);
export const ORG_COLUMN: Record<OrgKind, "agency_id" | "company_id" | "brand_id"> = { agency: "agency_id", company: "company_id", brand: "brand_id" };

export type Org = { id: number; hash: string; kind: OrgKind; name: string; companyId?: number | null; ownerId?: number | null };

/** "is the same workspace" for a nullable owner column. */
const inWorkspace = (owner: number | null, column = "owner_id") =>
  sql`${sql.unsafe(column)} is not distinct from ${owner}`;

/** One workspace's directory (owner: an admin's id, or null for the super admins' own). */
export async function listOrgs(owner: number | null, kind?: OrgKind) {
  return sql<(Org & { projects: number; createdAt: Date; createdByName: string | null; companyName: string | null })[]>`
    select o.id, o.hash, o.kind, o.name, o.company_id, o.owner_id, c.name as company_name, o.created_at, u.name as created_by_name,
      (select count(*)::int from projects p where p.agency_id = o.id or p.company_id = o.id or p.brand_id = o.id) as projects
    from orgs o left join users u on u.id = o.created_by left join orgs c on c.id = o.company_id
    where ${inWorkspace(owner, "o.owner_id")} and ${kind ? sql`o.kind = ${kind}` : sql`true`}
    order by lower(o.name)`;
}

export type CreateResult =
  | { status: "created" | "existing"; org: Org }
  | { status: "similar"; similar: (Org & { score: number })[] }
  | { status: "invalid"; error: string };

/**
 * Add a name to a workspace's list. Same normalised name → the existing entry is returned (no duplicate).
 * Close match ("Acme" vs "Acme Pvt Ltd", "Nesle" vs "Nestle") → the similar ones are returned so the
 * person can pick one, unless `force` (they confirmed it's really different).
 */
export async function createOrg(
  kind: OrgKind, rawName: unknown, userId: number, owner: number | null, force = false, rawCompanyId?: unknown,
): Promise<CreateResult> {
  const check = checkOrgName(rawName, ORG_LABEL[kind].one);
  if (!check.ok) return { status: "invalid", error: check.error };
  // Brands can be created under a company of the same workspace.
  let companyId: number | null = null;
  if (kind === "brand" && rawCompanyId) {
    companyId = await companyIdOf(rawCompanyId, owner);
    if (!companyId) return { status: "invalid", error: "Unknown company" };
  }
  const key = nameKey(check.value);
  const all = await sql<Org[]>`select id, hash, kind, name, company_id from orgs where kind = ${kind} and ${inWorkspace(owner)}`;
  const same = all.find((o) => nameKey(o.name) === key);
  if (same) {
    // An existing brand with no company yet gets linked to the one it was picked under.
    if (companyId && !same.companyId) {
      await sql`update orgs set company_id = ${companyId} where id = ${same.id}`;
      same.companyId = companyId;
    }
    return { status: "existing", org: same };
  }
  if (!force) {
    const similar = similarTo(all, check.value, (o) => o.name).slice(0, 5).map(({ t, s }) => ({ ...t, score: Math.round(s * 100) / 100 }));
    if (similar.length) return { status: "similar", similar };
  }
  const [org] = await sql<Org[]>`
    insert into orgs (kind, name, name_key, created_by, company_id, owner_id)
    values (${kind}, ${check.value}, ${key}, ${userId}, ${companyId}, ${owner})
    on conflict on constraint orgs_owner_kind_name_key do nothing
    returning id, hash, kind, name, company_id`;
  if (org) return { status: "created", org: (await ensureHash("orgs", org))! };
  const [existing] = await sql<Org[]>`
    select id, hash, kind, name, company_id from orgs where kind = ${kind} and name_key = ${key} and ${inWorkspace(owner)}`;
  return { status: "existing", org: existing };
}

/**
 * Validate agencyId / companyId / brandId (codes) from a request body: each must exist, be the right
 * kind and belong to the project's workspace (`owner`).
 */
export async function orgLinks(b: Record<string, unknown>, owner: number | null): Promise<{ set: Record<string, number | null> } | { error: string }> {
  const set: Record<string, number | null> = {};
  const fields: [OrgKind, string][] = [["agency", "agencyId"], ["company", "companyId"], ["brand", "brandId"]];
  for (const [kind, field] of fields) {
    if (!(field in b)) continue;
    const v = b[field];
    if (v === null || v === "") { set[ORG_COLUMN[kind]] = null; continue; }
    const id = decodeHash("orgs", v);
    const [o] = id ? await sql`select 1 from orgs where id = ${id} and kind = ${kind} and ${inWorkspace(owner)}` : [];
    if (!o) return { error: `Unknown ${ORG_LABEL[kind].one.toLowerCase()}` };
    set[ORG_COLUMN[kind]] = id;
  }
  return { set };
}

/** The id of the company with this code in this workspace, or null. */
export async function companyIdOf(code: unknown, owner: number | null) {
  const id = decodeHash("orgs", code);
  if (!id) return null;
  const [o] = await sql`select 1 from orgs where id = ${id} and kind = 'company' and ${inWorkspace(owner)}`;
  return o ? id : null;
}

/**
 * Keep a project's brand and company consistent. `cur` is the project's saved links (none when creating),
 * `set` the validated changes. A brand that belongs to a company brings its company along (or is refused
 * if a different company is chosen); a brand without a company gets linked to the project's company.
 */
export async function reconcileBrand(
  set: Record<string, number | null>,
  cur: { companyId: number | null; brandId: number | null } = { companyId: null, brandId: null },
): Promise<{ error: string } | { link?: { brandId: number; companyId: number } }> {
  const brandId = "brand_id" in set ? set.brand_id : cur.brandId;
  const companyId = "company_id" in set ? set.company_id : cur.companyId;
  if (!brandId) return {};
  const [b] = await sql<{ name: string; companyId: number | null; companyName: string | null }[]>`
    select b.name, b.company_id, c.name as company_name from orgs b left join orgs c on c.id = b.company_id where b.id = ${brandId}`;
  if (!b) return {};
  if (b.companyId) {
    if (!companyId) { set.company_id = b.companyId; return {}; }
    if (companyId !== b.companyId) {
      // Changing only the company drops a brand that belongs elsewhere; picking both explicitly is an error.
      if (!("brand_id" in set)) { set.brand_id = null; return {}; }
      return { error: `${b.name} belongs to ${b.companyName}. Pick that company or another brand.` };
    }
    return {};
  }
  return companyId ? { link: { brandId, companyId } } : {};
}
