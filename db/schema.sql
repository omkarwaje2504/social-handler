-- Social Handler — PostgreSQL schema (Neon).
-- Apply with:  bun run db:migrate      (idempotent: safe to run again)
--
-- Ids: every table has an integer `id` (identity, primary key) used only inside the database and
-- for links between tables. Tables the app shows or accepts from the browser also have a `hash`:
-- a 7-character code (a–z, 0–9) made from the id with Hashids and a per-table salt (see
-- src/lib/hash.ts). URLs and APIs only ever carry the hash; the integer id never leaves the server.
-- The hash is a plain indexed column (not a key), filled in by the app right after the insert.

create extension if not exists pgcrypto; -- gen_random_bytes() for connect links

-- ============================================================================
-- People, projects and access.
--   super_admin → every project;  admin / user → only active projects they are members of.
-- ============================================================================
create table if not exists users (
  id             integer generated always as identity primary key,
  hash           varchar(32),
  email          text not null unique,               -- stored lower-case
  name           text not null default '',
  designation    text not null default '',
  role           text not null default 'user' check (role in ('super_admin', 'admin', 'user')),
  password_hash  text not null,                      -- scrypt$<salt>$<hash>
  active         boolean not null default true,
  created_by     integer references users(id) on delete set null,
  last_login_at  timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists users_hash_index on users (hash);

-- Agencies, companies and brands: one shared list per kind, picked on projects (type-to-create).
-- name_key is the normalised name (lower case, no punctuation or legal suffixes) so "Acme Pvt. Ltd."
-- and "ACME" can't both exist; near-duplicates are caught in the app with fuzzy matching.
-- A brand belongs to (at most) one company.
create table if not exists orgs (
  id          integer generated always as identity primary key,
  hash        varchar(32),
  kind        text not null check (kind in ('agency', 'company', 'brand')),
  name        text not null,
  name_key    text not null,
  company_id  integer references orgs(id) on delete set null,
  created_by  integer references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (kind, name_key)
);
create index if not exists orgs_hash_index on orgs (hash);
create index if not exists orgs_company_idx on orgs (company_id);

-- A closed project is hidden from its admins and users (they see it greyed out as Closed);
-- only super admins can open or reopen it. Projects are never deleted.
create table if not exists projects (
  id             integer generated always as identity primary key,
  hash           varchar(32),
  name           text not null,
  description    text not null default '',
  status         text not null default 'active' check (status in ('active', 'closed')),
  connect_token  text not null unique default encode(gen_random_bytes(18), 'hex'), -- public connect link
  agency_id      integer references orgs(id) on delete set null,
  company_id     integer references orgs(id) on delete set null,
  brand_id       integer references orgs(id) on delete set null,
  brand_color    text not null default '',
  closed_at      timestamptz,
  closed_by      integer references users(id) on delete set null,
  closed_reason  text not null default '',
  created_by     integer references users(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists projects_hash_index on projects (hash);

-- Who can open which project. role: 'admin' manages the project, 'user' works in it.
create table if not exists project_members (
  project_id  integer not null references projects(id) on delete cascade,
  user_id     integer not null references users(id) on delete cascade,
  role        text not null default 'user' check (role in ('admin', 'user')),
  added_by    integer references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index if not exists project_members_user_idx on project_members (user_id);

-- ============================================================================
-- Social accounts and their data. Removing an account cascades to all of its data.
-- ============================================================================
create table if not exists accounts (
  id                  integer generated always as identity primary key,
  hash                varchar(32),
  project_id          integer references projects(id) on delete set null,
  account_type        text not null default 'instagram',
  designation         text not null default '',
  ig_user_id          text not null unique,          -- Instagram business/creator account id
  page_id             text not null default '',      -- linked Facebook Page id ('' when none)
  username            text not null,
  name                text,
  biography           text,
  profile_picture_url text,
  website             text,
  followers_count     integer,
  follows_count       integer,
  media_count         integer,
  access_token        text not null,                 -- Page token used for Graph API calls
  user_token          text,                          -- Facebook user token (Marketing API lookups)
  insights            jsonb not null default '{}',   -- 28-day account insights {reach, profile_views, ...}
  last_synced_at      timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists accounts_hash_index on accounts (hash);
create index if not exists accounts_project_idx on accounts (project_id);

-- Instagram posts / reels, synced from the Graph API.
create table if not exists posts (
  id               integer generated always as identity primary key,
  hash             varchar(32),
  account_id       integer not null references accounts(id) on delete cascade,
  ig_media_id      text not null unique,
  media_type       text not null,                    -- IMAGE | VIDEO | CAROUSEL_ALBUM | REELS
  media_url        text,
  thumbnail_url    text,
  permalink        text,
  caption          text,
  "timestamp"      timestamptz,                      -- when it was posted on Instagram
  like_count       integer not null default 0,
  comments_count   integer not null default 0,
  metrics          jsonb not null default '{}',      -- {reach, views, saved, shares, ...}
  synced_at        timestamptz not null default now(),
  removed_from_app boolean not null default false,
  boosted          boolean not null default false
);
create index if not exists posts_hash_index on posts (hash);
create index if not exists posts_account_time_idx on posts (account_id, "timestamp" desc);

-- One row per account per day; powers today / yesterday / week / month growth. Internal only.
create table if not exists snapshots (
  id          integer generated always as identity primary key,
  account_id  integer not null references accounts(id) on delete cascade,
  day         text not null,                         -- YYYY-MM-DD (server local time)
  followers   integer not null default 0,
  follows     integer not null default 0,
  media_count integer not null default 0,
  likes       integer not null default 0,
  comments    integer not null default 0,
  taken_at    timestamptz not null default now(),
  unique (account_id, day)
);

-- Posts queued to publish later.
create table if not exists scheduled_posts (
  id           integer generated always as identity primary key,
  hash         varchar(32),
  account_id   integer not null references accounts(id) on delete cascade,
  media_url    text not null,
  media_type   text not null check (media_type in ('IMAGE', 'REELS')),
  caption      text not null default '',
  publish_at   timestamptz not null,
  status       text not null default 'pending'
               check (status in ('pending', 'publishing', 'published', 'failed', 'cancelled')),
  ig_media_id  text,
  error        text,
  created_at   timestamptz not null default now()
);
create index if not exists scheduled_posts_hash_index on scheduled_posts (hash);
create index if not exists scheduled_due_idx on scheduled_posts (status, publish_at);
create index if not exists scheduled_account_idx on scheduled_posts (account_id, publish_at);

-- Comment-keyword → DM rules. ig_media_ids empty = every post and reel.
create table if not exists automations (
  id                   integer generated always as identity primary key,
  hash                 varchar(32),
  account_id           integer not null references accounts(id) on delete cascade,
  name                 text not null,
  keyword              text not null,                -- case-insensitive match in the comment
  ig_media_id          text,                         -- legacy single post (kept = ig_media_ids[0])
  ig_media_ids         text[] not null default '{}',
  enabled              boolean not null default true,
  follower_message     text not null,
  non_follower_message text not null,
  public_reply         text,
  created_at           timestamptz not null default now()
);
create index if not exists automations_hash_index on automations (hash);
create index if not exists automations_account_idx on automations (account_id, enabled);

-- Every automation run (also prevents double-sending on webhook retries). Internal only.
create table if not exists automation_logs (
  id                 integer generated always as identity primary key,
  automation_id      integer not null references automations(id) on delete cascade,
  account_id         integer not null references accounts(id) on delete cascade,
  ig_media_id        text not null,
  comment_id         text not null,
  commenter_igsid    text not null,
  commenter_username text,
  comment_text       text not null,
  is_follower        boolean,                        -- null = follow status unavailable
  message_sent       text not null default '',
  status             text not null check (status in ('sent', 'error', 'skipped')),
  error              text,
  public_reply_sent  boolean not null default false,
  created_at         timestamptz not null default now(),
  unique (automation_id, comment_id)
);
create index if not exists automation_logs_account_idx on automation_logs (account_id, created_at desc);

-- Comments on the account's posts (from webhooks and from the post page). Rows stay after a comment
-- is deleted on Instagram from the app (deleted_at set); "Delete permanently" removes the row.
create table if not exists comments (
  id             integer generated always as identity primary key,
  hash           varchar(32),
  account_id     integer not null references accounts(id) on delete cascade,
  ig_comment_id  text not null unique,
  ig_media_id    text not null,
  parent_id      text,                               -- Instagram id of the parent comment (replies)
  from_id        text,
  from_username  text,
  text           text not null default '',
  like_count     integer not null default 0,
  hidden         boolean not null default false,
  is_own         boolean not null default false,     -- written by the account itself
  commented_at   timestamptz not null default now(),
  deleted_at     timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists comments_hash_index on comments (hash);
create index if not exists comments_account_idx on comments (account_id, commented_at desc);
create index if not exists comments_media_idx on comments (ig_media_id, commented_at desc);

-- Instagram direct messages, one row per message. thread_user_id is the other person's IGSID.
create table if not exists messages (
  id               integer generated always as identity primary key,
  hash             varchar(32),
  account_id       integer not null references accounts(id) on delete cascade,
  ig_message_id    text unique,
  thread_user_id   text not null,
  thread_username  text,
  direction        text not null check (direction in ('in', 'out')),
  text             text not null default '',
  attachments      jsonb,
  source           text not null default 'webhook' check (source in ('webhook', 'reply', 'automation', 'sync')),
  automation_id    integer references automations(id) on delete set null,
  sent_at          timestamptz not null default now(),
  read_at          timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists messages_hash_index on messages (hash);
create index if not exists messages_thread_idx on messages (account_id, thread_user_id, sent_at desc);
create index if not exists messages_account_idx on messages (account_id, sent_at desc);

-- CSV exports saved to Cloudflare R2.
create table if not exists exports (
  id          integer generated always as identity primary key,
  hash        varchar(32),
  project_id  integer not null references projects(id) on delete cascade,
  user_id     integer references users(id) on delete set null,
  dataset     text not null,
  params      jsonb not null default '{}',
  r2_key      text not null,
  file_name   text not null,
  row_count   integer not null default 0,
  bytes       integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists exports_hash_index on exports (hash);
create index if not exists exports_project_idx on exports (project_id, created_at desc);

-- ============================================================================
-- Internal tables (never addressed from the browser).
-- ============================================================================

-- Raw webhook deliveries, for debugging (pruned after 7 days by the app).
create table if not exists webhook_events (
  id          bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  valid       boolean not null,
  object      text,
  payload     jsonb,
  outcomes    jsonb
);
create index if not exists webhook_events_time_idx on webhook_events (received_at);

-- Logins that reached several IG accounts, waiting for the person to choose (15 min).
-- id is a random token kept in a cookie.
create table if not exists pending_connections (
  id          text primary key,
  found       jsonb not null,
  user_token  text not null,
  created_at  timestamptz not null default now()
);

-- Rate limiting: one counter per key per fixed window (shared by every server instance).
create table if not exists rate_limits (
  key           text primary key,
  window_start  timestamptz not null,
  count         integer not null default 0
);
create index if not exists rate_limits_window_idx on rate_limits (window_start);

-- ============================================================================
-- Workspaces. Every project belongs to one admin (owner_id) or to the super admins (owner_id null).
-- An admin sees only their own projects, their own users (users.created_by) and their own directory
-- (orgs.owner_id); super admins see and manage everything. project_members holds only people with
-- the "user" role: owners and super admins don't need a membership.
-- One-time conversion from "project admins" (members with role 'admin') to owners.
-- ============================================================================
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'projects' and column_name = 'owner_id') then
    alter table projects add column owner_id integer references users(id) on delete set null;
    update projects p set owner_id = m.user_id from (
      select distinct on (m.project_id) m.project_id, m.user_id
      from project_members m join users u on u.id = m.user_id
      where m.role = 'admin' and u.role = 'admin'
      order by m.project_id, m.created_at) m
    where p.id = m.project_id;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'orgs' and column_name = 'owner_id') then
    alter table orgs add column owner_id integer references users(id) on delete cascade;
    -- Entries used only by one admin's projects move into that admin's directory.
    update orgs o set owner_id = x.owner from (
      select o2.id, min(p.owner_id) as owner, count(distinct coalesce(p.owner_id, 0)) as n
      from orgs o2 join projects p on o2.id in (p.agency_id, p.company_id, p.brand_id)
      group by o2.id) x
    where o.id = x.id and x.n = 1 and x.owner is not null;
    alter table orgs drop constraint if exists orgs_kind_name_key_key;
    alter table orgs add constraint orgs_owner_kind_name_key unique nulls not distinct (owner_id, kind, name_key);
  end if;
end $$;
delete from project_members m using users u where u.id = m.user_id and u.role <> 'user';
update project_members set role = 'user' where role <> 'user';
create index if not exists projects_owner_idx on projects (owner_id);
create index if not exists orgs_owner_idx on orgs (owner_id);
