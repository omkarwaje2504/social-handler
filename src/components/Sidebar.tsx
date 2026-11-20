"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "./Icon";
import { ThemeToggle } from "./ThemeToggle";

export type SidebarAccount = { id: string; username: string; name?: string; pic?: string; projectId?: string; projectName?: string };
export type SidebarProject = { id: string; name: string; accounts: number };
export type SidebarUser = { name: string; email: string; role: "super_admin" | "admin" | "user"; designation: string };

const ROLE: Record<SidebarUser["role"], string> = { super_admin: "Super admin", admin: "Admin", user: "User" };
const MAX_PROJECTS = 6;

function NavLink({ href, icon, label, active, badge }: { href: string; icon: IconName; label: string; active: boolean; badge?: number }) {
  return (
    <Link href={href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
      <Icon name={icon} size={18} />
      <span>{label}</span>
      {badge != null && <em className="side-count">{badge}</em>}
    </Link>
  );
}

function Avatar({ pic, size = 24 }: { pic?: string; size?: number }) {
  return pic ? (
    <img src={pic} alt="" className="side-avatar" style={{ width: size, height: size }} />
  ) : (
    <span className="side-avatar" style={{ width: size, height: size }} />
  );
}

// Workspace menu (dashboard, projects, users, directory) on the workspace pages; the account menu on
// /accounts/<code>/… and post pages. Below 1024px the menu is a drawer opened from the top bar.
const WORKSPACE = /^\/($|projects(\/|$)|accounts\/?$|users(\/|$)|directory(\/|$))/;
const ACCOUNT = /^\/accounts\/([a-z0-9]{7,32})(\/.*)?$/;

export function Sidebar({ accounts, projects, user }: { accounts: SidebarAccount[]; projects: SidebarProject[]; user: SidebarUser }) {
  const path = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  // Close the drawer whenever the page changes, and on Escape.
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const match = path.match(ACCOUNT);
  const current = match ? accounts.find((a) => a.id === match[1]) : undefined;
  const sub = match?.[2] ?? "";
  const base = current ? `/accounts/${current.id}` : "";
  const isAccountArea = !!match || path.startsWith("/posts/");
  if (!isAccountArea && !WORKSPACE.test(path)) return null;
  const canManagePeople = user.role !== "user";
  const currentProject = path.match(/^\/projects\/([a-z0-9]{7,32})/)?.[1];
  const title = current ? `@${current.username}` : path === "/" ? "Dashboard" : path.startsWith("/projects") ? "Projects"
    : path.startsWith("/users") ? "Users" : path.startsWith("/directory") ? "Directory" : path.startsWith("/accounts") ? "Accounts" : "";

  return (
    <>
      <header className="topbar-mobile">
        <button type="button" className="ghost icon-only" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
          <Icon name="menu" size={20} />
        </button>
        <Link href="/" className="brand brand-lockup" aria-label="SMC home"><img src="/icon.svg" alt="" width={28} height={28} /><span>SMC</span></Link>
        <span className="topbar-title">{title}</span>
        <span className="me-avatar" title={`${user.name || user.email} · ${ROLE[user.role]}`}>{(user.name || user.email).slice(0, 1).toUpperCase()}</span>
      </header>
      <div className="drawer-backdrop" data-open={open} onClick={() => setOpen(false)} />

      <aside className="sidebar" data-open={open} aria-label="Main menu">
        <div className="row" style={{ flexWrap: "nowrap", gap: 4 }}>
          <Link href="/" className="brand brand-lockup" title="SMC · Social Management Center">
            <img src="/icon.svg" alt="" width={34} height={34} /><span>SMC<small>Social Management Center</small></span>
          </Link>
          <button type="button" className="ghost icon-only drawer-close" aria-label="Close menu" onClick={() => setOpen(false)}>
            <Icon name="x" size={18} />
          </button>
        </div>

        <nav className="side-nav">
          {isAccountArea ? (
            <>
              <Link href={current?.projectId ? `/projects/${current.projectId}` : "/projects"} className="side-back">
                <Icon name="chevronLeft" size={16} /><span>{current?.projectName ?? "All projects"}</span>
              </Link>
              {current && (
                <>
                  <Link href={`${base}/profile`} className={`side-user${sub.startsWith("/profile") ? " active" : ""}`} title="Open profile & posts">
                    <Avatar pic={current.pic} size={38} />
                    <div style={{ minWidth: 0 }}>
                      <div className="side-user-name">@{current.username}</div>
                      {current.name && <div className="muted" style={{ fontSize: 12 }}>{current.name}</div>}
                    </div>
                  </Link>
                  <div className="side-sub-heading">Overview</div>
                  <NavLink href={base} icon="chart" label="Analytics" active={sub === "" || sub === "/analytics"} />
                  <div className="side-sub-heading">Content</div>
                  <NavLink href={`${base}/create`} icon="plus" label="Create post" active={sub === "/create"} />
                  <NavLink href={`${base}/scheduled`} icon="calendar" label="Scheduled" active={sub === "/scheduled"} />
                  <div className="side-sub-heading">Engage</div>
                  <NavLink href={`${base}/messages`} icon="message" label="Messages" active={sub.startsWith("/messages")} />
                  <NavLink href={`${base}/automations`} icon="zap" label="Auto-DM automations" active={sub === "/automations"} />
                </>
              )}
            </>
          ) : (
            <>
              <NavLink href="/" icon="dashboard" label="Dashboard" active={path === "/"} />
              <NavLink href="/projects" icon="folder" label={user.role === "user" ? "My projects" : "Projects"} active={path === "/projects" || (path.startsWith("/projects") && !currentProject)} badge={projects.length} />
              <NavLink href="/accounts" icon="instagram" label="Accounts" active={path === "/accounts"} />
              {canManagePeople && <NavLink href="/users" icon="users" label={user.role === "admin" ? "My team" : "Users"} active={path.startsWith("/users")} />}
              {canManagePeople && <NavLink href="/directory" icon="building" label="Directory" active={path.startsWith("/directory")} />}

              {projects.length > 0 && (
                <div className="side-projects">
                  <div className="side-sub-heading">{user.role === "user" ? "Your projects" : "Recent projects"}</div>
                  {projects.slice(0, MAX_PROJECTS).map((p) => (
                    <Link key={p.id} href={`/projects/${p.id}`} className={currentProject === p.id ? "active" : ""} title={p.name}>
                      <span className="side-proj">{p.name.slice(0, 1).toUpperCase()}</span>
                      <span className="side-proj-name">{p.name}</span>
                      <em className="side-count">{p.accounts}</em>
                    </Link>
                  ))}
                  {projects.length > MAX_PROJECTS && <Link href="/projects" className="side-more">View all {projects.length} projects</Link>}
                </div>
              )}
            </>
          )}
        </nav>

        <div className="side-bottom">
          <div className="side-me" title={user.email}>
            <span className="me-avatar">{(user.name || user.email).slice(0, 1).toUpperCase()}</span>
            <div className="side-me-text">
              <b>{user.name || user.email}</b>
              <span>{ROLE[user.role]}{user.designation ? ` · ${user.designation}` : ""}</span>
            </div>
          </div>
          <ThemeToggle />
          <form method="post" action="/api/auth/logout">
            <button type="submit" className="side-logout"><Icon name="logout" size={18} /><span>Log out</span></button>
          </form>
        </div>
      </aside>
    </>
  );
}
