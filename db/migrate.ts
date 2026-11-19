// Creates / updates the tables in db/schema.sql. Idempotent.  Run: bun run db:migrate
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set in .env");

const sql = postgres(url, { prepare: false, onnotice: () => {} });
await sql.file(new URL("./schema.sql", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const tables = await sql<{ tablename: string }[]>`
  select tablename from pg_tables where schemaname = 'public' order by tablename`;
console.log("tables:", tables.map((t) => t.tablename).join(", "));
await sql.end();
