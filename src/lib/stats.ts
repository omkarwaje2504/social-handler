import type { PendingQuery, Row } from "postgres";
import { sql } from "@/lib/db";
import { dayKey, type SnapshotDoc } from "@/lib/models";

type Where = PendingQuery<Row[]>;

export const PERIODS = ["today", "yesterday", "week", "month"] as const;
export type Period = (typeof PERIODS)[number];
export const PERIOD_LABEL: Record<Period, string> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "Last 7 days",
  month: "Last 30 days",
};

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** [from, to) for each period, in server local time. */
export function periodRange(p: Period, now = new Date()): { from: Date; to: Date } {
  const today = startOfDay(now);
  switch (p) {
    case "today": return { from: today, to: addDays(today, 1) };
    case "yesterday": return { from: addDays(today, -1), to: today };
    case "week": return { from: addDays(today, -6), to: addDays(today, 1) };
    case "month": return { from: addDays(today, -29), to: addDays(today, 1) };
  }
}

/**
 * Count rows per period for a date column, in one query.
 * e.g. countByPeriod("posts", "timestamp", sql`account_id = ${id} and media_type = 'REELS'`)
 */
export async function countByPeriod(
  table: "accounts" | "posts" | "automation_logs" | "scheduled_posts" | "comments" | "messages",
  dateColumn: string,
  where: Where = sql`true`,
) {
  const r = Object.fromEntries(PERIODS.map((p) => [p, periodRange(p)])) as Record<Period, { from: Date; to: Date }>;
  const col = sql(dateColumn);
  const [row] = await sql<Record<Period, number>[]>`
    select
      count(*) filter (where ${col} >= ${r.today.from} and ${col} < ${r.today.to})::int as today,
      count(*) filter (where ${col} >= ${r.yesterday.from} and ${col} < ${r.yesterday.to})::int as yesterday,
      count(*) filter (where ${col} >= ${r.week.from} and ${col} < ${r.week.to})::int as week,
      count(*) filter (where ${col} >= ${r.month.from} and ${col} < ${r.month.to})::int as month
    from ${sql(table)} where ${where}`;
  return row;
}

/** Latest snapshot on or before a given day. */
async function snapshotOnOrBefore(accountId: string, day: Date) {
  const [row] = await sql<SnapshotDoc[]>`
    select * from snapshots where account_id = ${accountId} and day <= ${dayKey(day)}
    order by day desc limit 1`;
  return row ?? null;
}

/**
 * Growth of a snapshot field per period (e.g. new followers).
 * null when there is no earlier snapshot to compare against yet.
 */
export async function snapshotDeltas(accountId: string, field: "followers" | "likes" | "comments" | "mediaCount") {
  const today = startOfDay(new Date());
  const pairs: Record<Period, [Date, Date]> = {
    today: [today, addDays(today, -1)],
    yesterday: [addDays(today, -1), addDays(today, -2)],
    week: [today, addDays(today, -7)],
    month: [today, addDays(today, -30)],
  };
  const out = {} as Record<Period, number | null>;
  await Promise.all(
    PERIODS.map(async (p) => {
      const [endDay, startDay] = pairs[p];
      const [end, start] = await Promise.all([snapshotOnOrBefore(accountId, endDay), snapshotOnOrBefore(accountId, startDay)]);
      out[p] = end && start && end.day !== start.day ? end[field] - start[field] : null;
    }),
  );
  return out;
}

/** Snapshot series for the last `days` days (one point per stored day). */
export async function snapshotSeries(accountId: string, field: "followers" | "likes" | "comments", days = 30) {
  const from = dayKey(addDays(new Date(), -days + 1));
  const rows = await sql<SnapshotDoc[]>`
    select * from snapshots where account_id = ${accountId} and day >= ${from} order by day`;
  return rows.map((r) => ({ label: r.day.slice(5), value: r[field] }));
}

/** Posts per day for the last `days` days (zero-filled). Optional filter, e.g. sql`account_id = ${id}`. */
export async function postsPerDay(where: Where = sql`true`, days = 30) {
  const from = addDays(startOfDay(new Date()), -days + 1);
  const posts = await sql<{ timestamp: Date }[]>`
    select "timestamp" from posts where "timestamp" >= ${from} and ${where}`;
  const counts = new Map<string, number>();
  for (const p of posts) counts.set(dayKey(p.timestamp), (counts.get(dayKey(p.timestamp)) ?? 0) + 1);
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(from, i);
    return { label: dayKey(d).slice(5), value: counts.get(dayKey(d)) ?? 0 };
  });
}

/** Posts per month for the last `months` months (zero-filled). */
export function postsPerMonth(posts: { timestamp?: Date | null }[], months = 6) {
  const now = new Date();
  const keys = Array.from({ length: months }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const counts = new Map(keys.map((k) => [k, 0]));
  for (const p of posts) {
    if (!p.timestamp) continue;
    const k = `${p.timestamp.getFullYear()}-${String(p.timestamp.getMonth() + 1).padStart(2, "0")}`;
    if (counts.has(k)) counts.set(k, counts.get(k)! + 1);
  }
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return keys.map((k) => ({ label: names[Number(k.slice(5)) - 1], value: counts.get(k)! }));
}
