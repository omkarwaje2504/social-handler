import { sql } from "@/lib/db";

const EDITABLE = ["name", "biography", "website"] as const;

/**
 * Saves profile details. Instagram's Graph API does not allow editing name, bio or website,
 * so the app stores the values and reports that they still need to be applied in the Instagram app.
 */
export async function updateProfileDetails(id: string, input: Record<string, unknown>) {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of EDITABLE) {
    if (typeof input[key] === "string") set[key] = input[key];
  }
  const res = await sql`update accounts set ${sql(set)} where id = ${id}`;
  if (!res.count) throw new Error("Account not found");
  return { ok: true, appliedOnInstagram: false, note: "Saved in the app. Instagram profile edits must be made in the Instagram app." };
}
