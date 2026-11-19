-- Social Handler — PostgreSQL schema (Neon).
-- Apply with:  bun run db:migrate      (idempotent: safe to run again)
-- Every table hangs off `accounts`; removing an account cascades to all of its data.

create extension if not exists pgcrypto; -- gen_random_uuid()

-- Connected Instagram professional accounts (one row per IG account).
create table if not exists accounts (
  id                  uuid primary key default gen_random_uuid(),
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

-- Instagram posts / reels, synced from the Graph API.
create table if not exists posts (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references accounts(id) on delete cascade,
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
create index if not exists posts_account_time_idx on posts (account_id, "timestamp" desc);

-- One row per account per day; powers today / yesterday / week / month growth.
create table if not exists snapshots (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references accounts(id) on delete cascade,
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
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references accounts(id) on delete cascade,
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
create index if not exists scheduled_due_idx on scheduled_posts (status, publish_at);
create index if not exists scheduled_account_idx on scheduled_posts (account_id, publish_at);

-- Comment-keyword → DM rules.
create table if not exists automations (
  id                   uuid primary key default gen_random_uuid(),
  account_id           uuid not null references accounts(id) on delete cascade,
  name                 text not null,
  keyword              text not null,                -- case-insensitive match in the comment
  ig_media_id          text,                         -- null = any post on the account
  enabled              boolean not null default true,
  follower_message     text not null,
  non_follower_message text not null,
  public_reply         text,
  created_at           timestamptz not null default now()
);
create index if not exists automations_account_idx on automations (account_id, enabled);

-- Every automation run (also prevents double-sending on webhook retries).
create table if not exists automation_logs (
  id                 uuid primary key default gen_random_uuid(),
  automation_id      uuid not null references automations(id) on delete cascade,
  account_id         uuid not null references accounts(id) on delete cascade,
  ig_media_id        text not null,
  comment_id         text not null,
  commenter_igsid    text not null,
  commenter_username text,
  comment_text       text not null,
  is_follower        boolean,                        -- null = follow status unavailable
  message_sent       text not null default '',
  status             text not null check (status in ('sent', 'error', 'skipped')),
  error              text,
  created_at         timestamptz not null default now(),
  unique (automation_id, comment_id)
);
create index if not exists automation_logs_account_idx on automation_logs (account_id, created_at desc);

-- Raw webhook deliveries, for debugging (pruned after 7 days by the app).
create table if not exists webhook_events (
  id          bigserial primary key,
  received_at timestamptz not null default now(),
  valid       boolean not null,
  object      text,
  payload     jsonb,
  outcomes    jsonb
);
create index if not exists webhook_events_time_idx on webhook_events (received_at);

-- Logins that reached several IG accounts, waiting for the person to choose (15 min).
create table if not exists pending_connections (
  id          text primary key,
  found       jsonb not null,
  user_token  text not null,
  created_at  timestamptz not null default now()
);

-- Comments on the account's posts (from webhooks and from the post page). Rows stay after a comment
-- is deleted on Instagram from the app (deleted_at set); "Delete permanently" removes the row.
create table if not exists comments (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references accounts(id) on delete cascade,
  ig_comment_id  text not null unique,
  ig_media_id    text not null,
  parent_id      text,                               -- set for replies
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
create index if not exists comments_account_idx on comments (account_id, commented_at desc);
create index if not exists comments_media_idx on comments (ig_media_id, commented_at desc);

-- Instagram direct messages, one row per message. thread_user_id is the other person's IGSID.
create table if not exists messages (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references accounts(id) on delete cascade,
  ig_message_id    text unique,
  thread_user_id   text not null,
  thread_username  text,
  direction        text not null check (direction in ('in', 'out')),
  text             text not null default '',
  attachments      jsonb,
  source           text not null default 'webhook' check (source in ('webhook', 'reply', 'automation', 'sync')),
  automation_id    uuid references automations(id) on delete set null,
  sent_at          timestamptz not null default now(),
  read_at          timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists messages_thread_idx on messages (account_id, thread_user_id, sent_at desc);
create index if not exists messages_account_idx on messages (account_id, sent_at desc);

-- Automation logs: whether the public reply under the comment was posted.
alter table automation_logs add column if not exists public_reply_sent boolean not null default false;

-- Automations can watch several posts: empty array = every post and reel.
alter table automations add column if not exists ig_media_ids text[] not null default '{}';
update automations set ig_media_ids = array[ig_media_id]
  where ig_media_id is not null and ig_media_id <> '' and cardinality(ig_media_ids) = 0;
