// Detect which Instagram posts were boosted (promoted) by looking at the user's Meta ad accounts.
// Needs the Facebook user token with ads_read. Returns null when the lookup isn't possible.

const GRAPH = `https://graph.facebook.com/${process.env.IG_GRAPH_VERSION || "v23.0"}`;

async function get(path: string, token: string, params: Record<string, string>) {
  const url = new URL(`${GRAPH}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
  return json;
}

const warned = new Set<string>();

export async function boostedMediaIds(userToken: string): Promise<Set<string> | null> {
  try {
    const ids = new Set<string>();
    const accounts = await get("me/adaccounts", userToken, { fields: "id", limit: "50" });
    for (const acct of accounts.data ?? []) {
      const ads = await get(`${acct.id}/ads`, userToken, {
        fields: "creative{effective_instagram_media_id,source_instagram_media_id}",
        limit: "300",
      });
      for (const ad of ads.data ?? []) {
        const c = ad.creative ?? {};
        if (c.effective_instagram_media_id) ids.add(String(c.effective_instagram_media_id));
        if (c.source_instagram_media_id) ids.add(String(c.source_instagram_media_id));
      }
    }
    return ids;
  } catch (e) {
    // Usually "(#200) Missing Permissions": the login has no ads_read. Harmless (boosted flags just
    // aren't updated), so say it once per server run instead of on every sync.
    const msg = (e as Error).message;
    if (!warned.has(msg)) {
      warned.add(msg);
      console.warn(`boosted lookup skipped: ${msg} (add ads_read to the Facebook Login configuration to detect boosted posts; shown once)`);
    }
    return null;
  }
}
