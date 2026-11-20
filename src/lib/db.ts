import postgres from "postgres";

// One pooled Postgres client (Neon), cached across hot reloads in development.
// Column names are converted snake_case ⇄ camelCase, so rows match the types in models.ts.
// The client is created on first use (and re-created if DATABASE_URL changes), so a module
// evaluated before .env was loaded never gets stuck with an empty connection string.
const g = globalThis as unknown as { __sql?: postgres.Sql; __sqlUrl?: string };

function client(): postgres.Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set in .env");
  if (!g.__sql || g.__sqlUrl !== url) {
    g.__sql?.end({ timeout: 5 }).catch(() => {});
    g.__sql = postgres(url, {
      max: 5,
      idle_timeout: 20,
      prepare: false, // Neon's pooler (PgBouncer, transaction mode) does not keep prepared statements
      transform: postgres.camel,
      onnotice: () => {},
    });
    g.__sqlUrl = url;
  }
  return g.__sql;
}

/** Tagged-template SQL client: sql`select * from accounts where id = ${id}`, sql(obj), sql.json(v). */
export const sql = new Proxy(function () {} as unknown as postgres.Sql, {
  apply: (_t, _this, args: unknown[]) => (client() as unknown as (...a: unknown[]) => unknown)(...args),
  get: (_t, prop) => {
    const c = client() as unknown as Record<string | symbol, unknown>;
    const v = c[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(c) : v;
  },
});

// Row ids are integers used only on the server; the browser sees 7-character codes (src/lib/hash.ts).
