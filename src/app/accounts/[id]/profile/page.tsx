import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { sql } from "@/lib/db";
import type { AccountDoc, PostDoc } from "@/lib/models";
import { EditProfileButton } from "@/components/EditProfileButton";
import { decodeHash } from "@/lib/hash";
import { Icon } from "@/components/Icon";

const TABS = [
  { key: "posts", label: "POSTS", icon: "▦" },
  { key: "reels", label: "REELS", icon: "▶" },
  { key: "boosted", label: "BOOSTED", icon: "🚀" },
] as const;

const fmt = (n: number | null | undefined) => (n == null ? "–" : n.toLocaleString());

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  await connection();
  const { id } = await params;
  const { tab = "posts" } = await searchParams;
  const aid = decodeHash("accounts", id); // id in the URL is the account's code
  if (!aid) notFound();
  const [account] = await sql<AccountDoc[]>`select * from accounts where id = ${aid}`;
  if (!account) notFound();

  const all = await sql<PostDoc[]>`
    select * from posts where account_id = ${aid} and not removed_from_app
    order by "timestamp" desc nulls last`;
  const shown = tab === "reels" ? all.filter((p) => p.mediaType === "REELS") : tab === "boosted" ? all.filter((p) => p.boosted) : all;

  return (
    <>
      <section className="ig-profile card">
        <div className="ig-avatar-wrap">
          {account.profilePictureUrl ? <img className="profile-pic" src={account.profilePictureUrl} alt="" /> : <div className="profile-pic" />}
        </div>
        <div className="ig-main">
          <div className="ig-top">
            <h1 className="ig-username">{account.username}</h1>
            <div className="ig-actions">
              <EditProfileButton
                accountId={id}
                username={account.username}
                pic={account.profilePictureUrl ?? null}
                initial={{ name: account.name ?? "", biography: account.biography ?? "", website: account.website ?? "" }}
              />
              <Link className="btn" href={`/accounts/${id}`}>View analytics</Link>
              <a className="btn secondary" href={`https://instagram.com/${account.username}`} target="_blank" rel="noreferrer" title="Open on Instagram" aria-label="Open on Instagram"><Icon name="external" size={16} /></a>
            </div>
          </div>
          {account.name && <div className="ig-name">{account.name}</div>}
          <div className="ig-stats">
            <span><b>{fmt(account.mediaCount ?? all.length)}</b> posts</span>
            <span><b>{fmt(account.followersCount)}</b> followers</span>
            <span><b>{fmt(account.followsCount)}</b> following</span>
          </div>
          {account.biography && <div className="profile-bio">{account.biography}</div>}
          {account.website && (
            <a href={account.website} target="_blank" rel="noreferrer" className="profile-link">
              <Icon name="link" size={14} /> {account.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
            </a>
          )}
        </div>
      </section>

      <nav className="profile-tabs">
        {TABS.map((t) => (
          <Link key={t.key} href={`/accounts/${id}/profile?tab=${t.key}`} className={tab === t.key ? "active" : ""}>
            {t.icon} {t.label}
          </Link>
        ))}
      </nav>

      {shown.length === 0 ? (
        <div className="card muted" style={{ textAlign: "center" }}>
          {tab === "boosted" ? "No boosted posts found in your Meta ad accounts." : "Nothing here yet."}
        </div>
      ) : (
        <div className="post-grid">
          {shown.map((p) => {
            const src = p.thumbnailUrl || p.mediaUrl;
            return (
              <Link key={p.id} href={`/posts/${p.hash}`} className="tile">
                {src ? <img src={src} alt="" /> : null}
                {p.mediaType === "REELS" && <span className="tile-badge">▶</span>}
                {p.mediaType === "CAROUSEL_ALBUM" && <span className="tile-badge">⧉</span>}
                {p.boosted && <span className="tile-badge" style={{ left: 8, right: "auto", width: "auto", padding: "0 8px", borderRadius: 999 }} title="Boosted">Ad</span>}
                <div className="tile-overlay">
                  <span><Icon name="heart" size={16} /> {p.likeCount}</span>
                  <span><Icon name="message" size={16} /> {p.commentsCount}</span>
                  {p.metrics?.views != null && <span>▶ {p.metrics.views}</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}


export const instant = false;
