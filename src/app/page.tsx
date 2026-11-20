import Link from "next/link";
import { connection } from "next/server";
import { ROLE_LABEL, type UserDoc, isAdminRole, projectIdsFor, requireUser, scopeSql } from "@/lib/auth";
import { sql } from "@/lib/db";
import { type Attention, contentPerWeek, followerTrend, headline, needsAttention, projectSummaries, timeAgo, topContent } from "@/lib/dashboard";
import { ColumnChart, Kpi, SegmentedBar, TrendChart } from "@/components/charts";
import { fmtCompact } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { ProjectFormButton, type PersonOption } from "@/components/ProjectForm";

const pct = (now: number, before: number) => (before ? Math.round(((now - before) / before) * 100) : null);
const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

// Dashboard, by role. Everything is computed for the accounts of the projects the viewer can open:
//   super admin → the whole platform (plus admins / users / projects health)
//   admin       → their own workspace (or a "create your first project" start when they have none)
//   user        → the projects they were given, with what needs a reply or a fix first
export default async function Dashboard() {
  await connection();
  const user = await requireUser();
  const ids = await projectIdsFor(user);
  const isSuper = user.role === "super_admin";
  const isAdmin = isAdminRole(user);

  if (ids !== null && ids.length === 0) {
    return user.role === "admin" ? <AdminStart user={user} /> : <NoAccess user={user} />;
  }

  const accIds = (await sql<{ id: number }[]>`select a.id from accounts a where ${scopeSql(ids, "a.project_id")}`).map((r) => r.id);
  const [h, trend, weekly, attention, top, projects, platform, admins] = await Promise.all([
    headline(accIds),
    followerTrend(accIds, 30),
    contentPerWeek(accIds, 12),
    needsAttention(accIds, { projectIds: ids, isSuper, isAdmin }),
    topContent(accIds, 5),
    projectSummaries(ids, isSuper ? 8 : 12),
    isSuper ? platformCounts() : Promise.resolve(null),
    isSuper
      ? sql<PersonOption[]>`select hash as id, name, email, designation, role from users where role = 'admin' and active order by name`
      : Promise.resolve([] as PersonOption[]),
  ]);
  const week = trend.delta7;
  const projectCount = ids === null ? platform!.projects : ids.length;

  return (
    <div className="shell">
      <div className="page-head">
        <div>
          <div className="eyebrow">{isSuper ? "Platform overview" : user.role === "admin" ? "Your workspace" : "Your work"}</div>
          <h1>{greeting()}{user.name ? `, ${user.name.split(" ")[0]}` : ""}</h1>
          <p className="page-sub">
            {isSuper
              ? `Everything across ${projectCount} project${projectCount === 1 ? "" : "s"} and ${accIds.length} connected account${accIds.length === 1 ? "" : "s"}.`
              : `${ROLE_LABEL[user.role]}${user.designation ? ` · ${user.designation}` : ""} · ${projectCount} project${projectCount === 1 ? "" : "s"}, ${accIds.length} account${accIds.length === 1 ? "" : "s"}. Numbers cover the last 30 days.`}
          </p>
        </div>
        {isAdmin && (
          <div className="page-actions">
            <Link className="btn secondary" href="/users?new=1"><Icon name="user" size={16} />Add user</Link>
            <ProjectFormButton label="New project" admins={admins} isSuper={isSuper} />
          </div>
        )}
      </div>

      {isSuper && platform && (
        <div className="kpis k4">
          <Kpi label="Active projects" value={platform.projects} sub={platform.closed ? `${platform.closed} closed` : "none closed"} href="/projects" />
          <Kpi label="Admins" value={platform.admins} sub={`${platform.idleAdmins} without a project`} href="/users" />
          <Kpi label="Users" value={platform.users} sub={`${platform.usersNoAccess} without project access`} href="/users" />
          <Kpi label="Connected accounts" value={accIds.length} sub={platform.unassigned ? `${platform.unassigned} without a project` : "all assigned"} href="/accounts" />
        </div>
      )}

      {user.role === "user" && <ProjectCards projects={projects} />}

      {accIds.length === 0 ? (
        <div className="dash-grid">
          <section className="panel span-8">
            <div className="empty">
              <span className="empty-ico"><Icon name="instagram" size={24} /></span>
              <b>No Instagram accounts connected yet</b>
              <span className="muted">
                {isAdmin
                  ? "Open a project and use “Connect Instagram”, or send the account owner the project's connect link. Analytics, the inbox and automations appear here after the first sync."
                  : "Your admin connects the Instagram accounts of your projects. Analytics, the inbox and automations appear here after the first sync."}
              </span>
              {isAdmin && <div className="row"><Link className="btn" href="/projects"><Icon name="folder" size={16} />Go to projects</Link></div>}
            </div>
          </section>
          <AttentionPanel items={attention} />
        </div>
      ) : (<>
      <div className="kpis k6">
        <Kpi label="Followers" value={h.followers} delta={week} sub={week == null ? "change shows after a week of syncs" : "in 7 days"} spark={trend.values.slice(-14)} hint="All accounts together" />
        <Kpi label="Posts & reels published" value={h.posts30} delta={pct(h.posts30, h.postsPrev)} deltaSuffix="%" sub="vs previous 30 days" />
        <Kpi label="Views on new content" value={fmtCompact(h.views30)} delta={pct(h.views30, h.viewsPrev)} deltaSuffix="%" sub="vs previous 30 days" hint="Views of posts and reels published in the last 30 days" />
        <Kpi label="Engagement rate" value={h.engagementRate == null ? null : `${h.engagementRate.toFixed(2)}%`} sub="likes + comments per post ÷ followers" />
        <Kpi label="Auto-DMs sent" value={h.dms30} delta={pct(h.dms30, h.dmsPrev)} deltaSuffix="%" sub="vs previous 30 days" />
        <Kpi label="Unanswered chats" value={h.unread} sub={h.scheduled ? `${h.scheduled} post(s) scheduled` : "nothing scheduled"} hint="Conversations with unread messages" />
      </div>

      <div className="dash-grid">
        <section className="panel span-8">
          <div className="panel-body">
            <TrendChart
              title="Follower growth"
              subtitle="Total followers across your accounts, last 30 days"
              labels={trend.labels}
              series={[{ name: "Followers", values: trend.values }]}
              hero={fmtCompact(h.followers)}
              empty="Follower history builds up from the daily sync. Connect an account and check back tomorrow."
            />
          </div>
        </section>
        <AttentionPanel items={attention} />
      </div>

      <div className="dash-grid">
        <section className="panel span-8">
          <div className="panel-body">
            <ColumnChart
              title="Content published per week"
              subtitle="Posts and reels, last 12 weeks"
              labels={weekly.labels}
              series={[{ name: "Posts", values: weekly.posts }, { name: "Reels", values: weekly.reels }]}
              empty="Nothing published in the last 12 weeks."
            />
          </div>
        </section>
        <section className="panel span-4">
          <div className="panel-head"><div><h3>Content mix</h3><p>All synced posts by format</p></div></div>
          <div className="panel-body">
            <SegmentedBar parts={[{ label: "Reels & videos", value: h.mix.reels }, { label: "Photos", value: h.mix.posts }, { label: "Carousels", value: h.mix.carousels }]} empty="No posts synced yet." />
          </div>
        </section>
      </div>

      <div className="dash-grid">
        <section className="panel span-7">
          <div className="panel-head">
            <div><h3>{user.role === "user" ? "Your projects" : "Projects"}</h3><p>{isSuper ? "Largest audiences first" : "Where your accounts live"}</p></div>
            <Link className="link" href="/projects">View all</Link>
          </div>
          <div className="panel-body flush">
            {projects.length ? (
              <div className="mini-list">
                {projects.map((p) => (
                  <Link key={p.hash} href={`/projects/${p.hash}`} className="mini-row">
                    <span className="proj-avatar" style={p.brandColor ? { background: p.brandColor } : undefined}>{(p.brand || p.name).slice(0, 1).toUpperCase()}</span>
                    <span className="grow">
                      <b>{p.name}</b>
                      <span>{[p.brand, isSuper ? (p.ownerName ? `Owner: ${p.ownerName}` : "Owner: super admins") : null, `${p.accounts} account${p.accounts === 1 ? "" : "s"}`, `${p.members} user${p.members === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="val">{fmtCompact(Number(p.followers))}<small>followers</small></span>
                    <span className="val" style={{ minWidth: 58 }}>{p.posts30}<small>posts 30d</small></span>
                  </Link>
                ))}
              </div>
            ) : <div className="chart-empty">No active projects.</div>}
          </div>
        </section>
        <section className="panel span-5">
          <div className="panel-head"><div><h3>Top content</h3><p>Most viewed in the last 30 days</p></div></div>
          <div className="panel-body flush">
            {top.length ? (
              <div className="mini-list">
                {top.map((p, i) => (
                  <Link key={p.hash} href={`/posts/${p.hash}`} className="mini-row">
                    <span className="muted num" style={{ width: 16 }}>{i + 1}</span>
                    {p.thumbnailUrl || p.mediaUrl ? <img className="mini-thumb" src={p.thumbnailUrl || p.mediaUrl || undefined} alt="" /> : <span className="mini-thumb" />}
                    <span className="grow">
                      <b>{p.caption?.trim() ? p.caption.trim().slice(0, 80) : p.mediaType === "REELS" ? "Reel" : "Post"}</b>
                      <span>@{p.username}{p.timestamp ? ` · ${timeAgo(p.timestamp)}` : ""}</span>
                    </span>
                    <span className="val">{fmtCompact(Number(p.views))}<small>views</small></span>
                  </Link>
                ))}
              </div>
            ) : <div className="chart-empty">Nothing published in the last 30 days.</div>}
          </div>
        </section>
      </div>
      </>)}
    </div>
  );
}

/** A user's projects as cards: open the project or export its data in one click. */
function ProjectCards({ projects }: { projects: Awaited<ReturnType<typeof projectSummaries>> }) {
  if (!projects.length) return null;
  return (
    <div className="project-cards">
      {projects.map((p) => (
        <div key={p.hash} className="project-card">
          <div className="project-card-head">
            <span className="proj-avatar" style={p.brandColor ? { background: p.brandColor } : undefined}>{(p.brand || p.name).slice(0, 1).toUpperCase()}</span>
            <span style={{ minWidth: 0 }}><b>{p.name}</b><span>{p.brand || (p.ownerName ? `Managed by ${p.ownerName}` : "Your project")}</span></span>
          </div>
          <div className="project-card-stats">
            <div><b>{p.accounts}</b><span>accounts</span></div>
            <div><b>{fmtCompact(Number(p.followers))}</b><span>followers</span></div>
            <div><b>{p.posts30}</b><span>posts 30d</span></div>
          </div>
          <div className="project-card-actions">
            <Link className="btn sm" href={`/projects/${p.hash}`}>Open project</Link>
            <Link className="btn secondary sm" href={`/projects/${p.hash}/export`}><Icon name="download" size={15} />Export</Link>
          </div>
        </div>
      ))}
    </div>
  );
}

async function platformCounts() {
  const [r] = await sql<{ projects: number; closed: number; admins: number; idleAdmins: number; users: number; usersNoAccess: number; unassigned: number }[]>`
    select
      (select count(*)::int from projects where status = 'active') as projects,
      (select count(*)::int from projects where status = 'closed') as closed,
      (select count(*)::int from users where role = 'admin' and active) as admins,
      (select count(*)::int from users u where u.role = 'admin' and u.active and not exists (select 1 from projects p where p.owner_id = u.id)) as idle_admins,
      (select count(*)::int from users where role = 'user' and active) as users,
      (select count(*)::int from users u where u.role = 'user' and u.active and not exists (select 1 from project_members m where m.user_id = u.id)) as users_no_access,
      (select count(*)::int from accounts where project_id is null) as unassigned`;
  return r;
}

function AttentionPanel({ items }: { items: Attention[] }) {
  const ICON = { bad: "alert", warn: "clock", info: "info" } as const;
  return (
    <section className="panel span-4">
      <div className="panel-head"><div><h3>Needs attention</h3><p>{items.length ? `${items.length} thing${items.length === 1 ? "" : "s"} to look at` : "Everything is on track"}</p></div></div>
      <div className="panel-body flush">
        {items.length ? (
          <div className="attention">
            {items.slice(0, 7).map((a, i) => (
              <div key={i} className="attention-item">
                <span className={`attention-ico ${a.level}`}><Icon name={ICON[a.level]} size={16} /></span>
                <span className="attention-text"><b>{a.title}</b><span>{a.detail}</span></span>
                <Link className="btn secondary sm" href={a.href}>{a.action}</Link>
              </div>
            ))}
          </div>
        ) : (
          <div className="all-good"><Icon name="check" size={18} />No overdue replies, failed posts or stale accounts.</div>
        )}
      </div>
    </section>
  );
}

/** An admin without projects: their workspace is empty until they create one. */
function AdminStart({ user }: { user: UserDoc }) {
  return (
    <div className="shell">
      <div className="page-head">
        <div>
          <div className="eyebrow">Your workspace</div>
          <h1>Welcome{user.name ? `, ${user.name.split(" ")[0]}` : ""}</h1>
          <p className="page-sub">Your workspace is empty. Projects, people and directory entries you add here are visible only to you, your team and the super admins.</p>
        </div>
      </div>
      <section className="panel">
        <div className="onboard">
          <div>
            <h2>Create your first project</h2>
            <p className="muted" style={{ fontSize: 14, marginBottom: 18 }}>A project groups the Instagram accounts of one client or brand, with its analytics, inbox, automations and exports.</p>
            <ProjectFormButton label="Create a project" className="btn lg" />
          </div>
          <div className="onboard-steps">
            <div className="onboard-step"><div><b>Create a project</b><span>Name it after the client or brand; agency, company and brand are optional.</span></div></div>
            <div className="onboard-step"><div><b>Connect Instagram</b><span>Connect the account yourself or send the owner the project&apos;s connect link.</span></div></div>
            <div className="onboard-step"><div><b>Add your team</b><span>Create users under My team and give them access to the project.</span></div></div>
          </div>
        </div>
      </section>
    </div>
  );
}

/** A user who hasn't been given a project yet. */
function NoAccess({ user }: { user: UserDoc }) {
  return (
    <div className="shell">
      <div className="page-head">
        <div>
          <h1>Welcome{user.name ? `, ${user.name.split(" ")[0]}` : ""}</h1>
          <p className="page-sub">You&apos;re signed in as a user.</p>
        </div>
      </div>
      <section className="panel">
        <div className="empty">
          <span className="empty-ico"><Icon name="lock" size={24} /></span>
          <b>No projects yet</b>
          <span className="muted">You&apos;ll see a project here as soon as your admin gives you access to it. Ask them to add you from the project&apos;s page.</span>
        </div>
      </section>
    </div>
  );
}

export const instant = false;
