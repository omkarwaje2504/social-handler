// Instagram account insights in the shapes the dashboards need.
// Every call degrades to { ok: false, error } so pages render even without instagram_manage_insights.

const GRAPH = `https://graph.facebook.com/${process.env.IG_GRAPH_VERSION || "v23.0"}`;

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function get(path: string, token: string, params: Record<string, string | number>) {
  const url = new URL(`${GRAPH}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
  return json;
}

const now = () => Math.floor(Date.now() / 1000);
const DAY = 86400;

export const TOTAL_METRICS = [
  "reach",
  "views",
  "accounts_engaged",
  "total_interactions",
  "likes",
  "comments",
  "shares",
  "saves",
  "replies",
  "profile_views",
  "profile_links_taps",
  "follows_and_unfollows",
] as const;

/** Totals for the last `days` days (max 30 per Instagram). */
export async function accountTotals(igId: string, token: string, days = 28): Promise<Result<Record<string, number>>> {
  const until = now();
  const since = until - Math.min(days, 30) * DAY;
  const base = { period: "day", metric_type: "total_value", since, until };
  const parse = (json: { data?: { name: string; total_value?: { value: number } }[] }) =>
    Object.fromEntries((json.data ?? []).map((m) => [m.name, m.total_value?.value ?? 0]));
  try {
    return { ok: true, data: parse(await get(`${igId}/insights`, token, { ...base, metric: TOTAL_METRICS.join(",") })) };
  } catch (batchErr) {
    // Some metrics may be unavailable; salvage the ones that work.
    const out: Record<string, number> = {};
    await Promise.all(
      TOTAL_METRICS.map(async (m) => {
        try {
          Object.assign(out, parse(await get(`${igId}/insights`, token, { ...base, metric: m })));
        } catch {}
      }),
    );
    return Object.keys(out).length ? { ok: true, data: out } : { ok: false, error: (batchErr as Error).message };
  }
}

/** Daily series for one metric (e.g. reach) over the last `days` days. */
export async function dailySeries(
  igId: string,
  token: string,
  metric = "reach",
  days = 30,
): Promise<Result<{ day: string; value: number }[]>> {
  try {
    const until = now();
    const since = until - Math.min(days, 30) * DAY;
    const json = await get(`${igId}/insights`, token, { metric, period: "day", since, until });
    const values: { value: number; end_time: string }[] = json.data?.[0]?.values ?? [];
    return { ok: true, data: values.map((v) => ({ day: v.end_time.slice(0, 10), value: v.value ?? 0 })) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Audience breakdown: city / country / age / gender for followers or engaged audience. */
export async function demographics(
  igId: string,
  token: string,
  breakdown: "city" | "country" | "age" | "gender",
  metric: "follower_demographics" | "engaged_audience_demographics" = "follower_demographics",
): Promise<Result<{ key: string; value: number }[]>> {
  try {
    const json = await get(`${igId}/insights`, token, {
      metric,
      period: "lifetime",
      metric_type: "total_value",
      breakdown,
      timeframe: "this_month",
    });
    const results: { dimension_values: string[]; value: number }[] =
      json.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? [];
    return {
      ok: true,
      data: results
        .map((r) => ({ key: r.dimension_values.join(" "), value: r.value }))
        .sort((a, b) => b.value - a.value),
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
