import { sql } from "@/lib/db";
import { checkOrgName, cleanName, nameKey } from "@/lib/names";
import { orgLinks, reconcileBrand } from "@/lib/orgs";

// Project fields that come from forms (create popup and settings page). Server only.

export { BRAND_COLORS } from "@/lib/projects-client";

/**
 * Validated column values from a request body: name, description, brand colour and the
 * agency / company / brand links. `requireName` for creation. `owner` is the project's workspace
 * (an admin's id, or null for the super admins): names must be unique inside it (ignoring case,
 * punctuation and suffixes like "Pvt Ltd"), and links must point at its own directory. Other
 * workspaces are never consulted, so nothing about them leaks through an error message.
 */
export async function projectFields(
  b: Record<string, unknown>,
  opts: { requireName?: boolean; projectId?: number; owner: number | null },
): Promise<{ set: Record<string, string | number | null> } | { error: string }> {
  const set: Record<string, string | number | null> = {};
  if (opts.requireName || "name" in b) {
    const check = checkOrgName(b.name, "Project name");
    if (!check.ok) return { error: check.error };
    const key = nameKey(check.value);
    const others = await sql<{ id: number; name: string }[]>`select id, name from projects where owner_id is not distinct from ${opts.owner}`;
    const clash = others.find((p) => p.id !== opts.projectId && nameKey(p.name) === key);
    if (clash) return { error: `A project called “${clash.name}” already exists` };
    set.name = check.value;
  }
  if (typeof b.description === "string") {
    const d = cleanName(b.description);
    if (d.length > 600) return { error: "Description must be 600 characters or fewer" };
    set.description = d;
  }
  if (typeof b.brandColor === "string" && (b.brandColor === "" || /^#[0-9a-f]{6}$/i.test(b.brandColor))) set.brand_color = b.brandColor;
  const links = await orgLinks(b, opts.owner);
  if ("error" in links) return links;
  Object.assign(set, links.set);
  if ("brand_id" in set || "company_id" in set) {
    const [cur] = opts.projectId
      ? await sql<{ companyId: number | null; brandId: number | null }[]>`select company_id, brand_id from projects where id = ${opts.projectId}`
      : [];
    const r = await reconcileBrand(set as Record<string, number | null>, cur);
    if ("error" in r) return r;
    if (r.link) await sql`update orgs set company_id = ${r.link.companyId} where id = ${r.link.brandId} and company_id is null`;
  }
  return { set };
}
