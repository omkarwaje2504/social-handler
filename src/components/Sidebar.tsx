"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

export type SidebarAccount = { id: string; username: string; name?: string; pic?: string };

function NavLink({ href, icon, label, active }: { href: string; icon: string; label: string; active: boolean }) {
  return (
    <Link href={href} className={active ? "active" : ""}>
      <span className="ico">{icon}</span>
      <span>{label}</span>
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

export function Sidebar({ accounts }: { accounts: SidebarAccount[] }) {
  const path = usePathname() ?? "/";
  // Account ids are UUIDs (Postgres). Any /accounts/<id>/... page shows that account's menu.
  const match = path.match(/^\/accounts\/([0-9a-f-]{36})(\/.*)?$/i);
  const current = match ? accounts.find((a) => a.id === match[1]) : undefined;
  const sub = match?.[2] ?? "";
  const base = current ? `/accounts/${current.id}` : "";

  // Only account and post pages have the sidebar; the home screen and the connect flow are full width.
  if (!path.startsWith("/accounts/") && !path.startsWith("/posts/")) return null;

  return (
    <aside className="sidebar">
      <Link href="/" className="brand brand-lockup" title="SMC · Social Management Center"><img src="/icon.svg" alt="" width={32} height={32} /><span>SMC<small>Social Management Center</small></span></Link>

      <nav className="side-nav">
        {current ? (
          <>
            <Link href="/" className="side-back"><span className="ico">←</span><span>All users</span></Link>
            <Link
              href={`${base}/profile`}
              className={`side-user${sub.startsWith("/profile") ? " active" : ""}`}
              title="Open profile & posts"
            >
              <Avatar pic={current.pic} size={40} />
              <div style={{ minWidth: 0 }}>
                <div className="side-user-name">{current.username}</div>
                {current.name && <div className="muted">{current.name}</div>}
              </div>
            </Link>
            <div className="side-sub-heading">Overview</div>
            <NavLink href={base} icon="📊" label="Dashboard & analytics" active={sub === "" || sub === "/analytics"} />
            <div className="side-sub-heading">Content</div>
            <NavLink href={`${base}/create`} icon="⊕" label="Create post" active={sub === "/create"} />
            <NavLink href={`${base}/scheduled`} icon="🗓" label="Scheduled" active={sub === "/scheduled"} />
            <div className="side-sub-heading">Engage</div>
            <NavLink href={`${base}/messages`} icon="💬" label="Messages" active={sub.startsWith("/messages")} />
            <NavLink href={`${base}/automations`} icon="⚡" label="Automations (auto-DM)" active={sub === "/automations"} />
          </>
        ) : (
          <NavLink href="/" icon="⌂" label="Dashboard" active={path === "/"} />
        )}
      </nav>

      <div className="side-bottom">
        <ThemeToggle />
        <form method="post" action="/api/auth/logout">
          <button type="submit" className="side-logout"><span className="ico">⎋</span><span>Log out</span></button>
        </form>
      </div>
    </aside>
  );
}
