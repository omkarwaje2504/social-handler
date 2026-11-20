import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { activeAdminId, isAdminRole, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { ORG_COLUMN, ORG_KINDS, ORG_LABEL, isOrgKind } from "@/lib/orgs";
import { DirectoryManager, type DirRow } from "@/components/DirectoryManager";

export const metadata: Metadata = { title: "Directory" };

// Agencies, companies and brands that projects link to. Every workspace has its own directory:
// an admin sees and manages only theirs; a super admin picks which one to look at (?ws=<admin code>),
// the super admins' own by default.
export default async function DirectoryPage({ searchParams }: { searchParams: Promise<{ kind?: string; ws?: string }> }) {
  await connection();
  const user = await requireUser();
  if (!isAdminRole(user)) notFound();
  const { kind: k, ws } = await searchParams;
  const kind = isOrgKind(k) ? k : "agency";
  const isSuper = user.role === "super_admin";
  const owner = isSuper ? (ws ? await activeAdminId(ws) : null) : user.id;
  const inWs = (col: string) => sql`${sql.unsafe(col)} is not distinct from ${owner}`;

  const [rows, counts, companies, admins] = await Promise.all([
    sql<(Omit<DirRow, "createdAt"> & { createdAt: Date })[]>`
      select o.hash as id, o.name, o.created_at, u.name as created_by_name, c.hash as company_id, c.name as company_name,
        coalesce((select json_agg(json_build_object('id', b.hash, 'name', b.name) order by lower(b.name))
          from orgs b where b.company_id = o.id), '[]') as brands,
        coalesce((select json_agg(json_build_object('id', p.hash, 'name', p.name, 'status', p.status) order by p.name)
          from projects p where p.${sql(ORG_COLUMN[kind])} = o.id), '[]') as projects
      from orgs o left join users u on u.id = o.created_by left join orgs c on c.id = o.company_id
      where o.kind = ${kind} and ${inWs("o.owner_id")}
      order by lower(o.name)`,
    sql<{ kind: string; n: number }[]>`select kind, count(*)::int as n from orgs where ${inWs("owner_id")} group by kind`,
    kind === "brand" ? sql<{ id: string; name: string }[]>`select hash as id, name from orgs where kind = 'company' and ${inWs("owner_id")} order by lower(name)` : [],
    isSuper ? sql<{ id: string; name: string }[]>`select hash as id, coalesce(nullif(name, ''), email) as name from users where role = 'admin' and active order by name` : [],
  ]);
  const count = (x: string) => counts.find((c) => c.kind === x)?.n ?? 0;
  const wsCode = isSuper && owner ? ws! : "";
  const href = (patch: { kind?: string; ws?: string }) => {
    const q = new URLSearchParams({ kind, ...(wsCode ? { ws: wsCode } : {}), ...patch });
    if (!q.get("ws")) q.delete("ws");
    return `/directory?${q}`;
  };
  const wsName = isSuper ? (owner ? admins.find((a) => a.id === ws)?.name ?? "Admin" : "Super admins") : null;

  return (
    <div className="shell">
      <div className="page-head">
        <div>
          <div className="eyebrow">Directory{wsName ? ` · ${wsName}` : ""}</div>
          <h1>Agencies, companies &amp; brands</h1>
          <p className="page-sub">
            {isSuper
              ? "Each workspace keeps its own list. Pick one to review it; projects only link to entries of their own workspace."
              : "Your own list: projects pick from it in their settings, and typing a new name there adds it here. Other admins never see it. Similar names are flagged so duplicates don't creep in."}
          </p>
        </div>
        {isSuper && (
          <form method="get" className="page-actions">
            <input type="hidden" name="kind" value={kind} />
            <select name="ws" defaultValue={wsCode} aria-label="Workspace" style={{ minWidth: 220 }}>
              <option value="">Super admins&apos; directory</option>
              {admins.map((a) => <option key={a.id} value={a.id}>{a.name}&apos;s directory</option>)}
            </select>
            <button type="submit" className="secondary">Show</button>
          </form>
        )}
      </div>

      <div className="tabs" role="tablist" style={{ marginBottom: 14 }}>
        {ORG_KINDS.map((x) => (
          <Link key={x} href={href({ kind: x })} className={`tab${x === kind ? " on" : ""}`} role="tab" aria-selected={x === kind}>
            {ORG_LABEL[x].many} <em>{count(x)}</em>
          </Link>
        ))}
      </div>

      <DirectoryManager key={`${kind}-${wsCode}`} kind={kind} rows={rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))}
        companies={[...companies]} canManage workspace={wsCode || undefined} />
    </div>
  );
}

export const instant = false;
