# Social Handler — project handoff

Context for continuing this project in a new Claude session. The full chat transcript is in
`chat-transcript/` inside this zip.

## What it is
Next.js 16 (App Router, Turbopack, `cacheComponents` on) + PostgreSQL (Neon) app that manages Instagram
professional accounts ("doctors") for one admin:
connect accounts via a shareable OAuth link, sync profile/posts/metrics, publish or schedule posts
(file upload or public link), edit captions, moderate comments, keyword comment → follower check → DM
automations, global and per-user dashboards with day/week/month counts and SVG charts.

## Run locally
```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev                  # http://localhost:4345, log in with ADMIN_PASSWORD
```
A public HTTPS address (tunnel or hosting) is required for: Meta OAuth callback, webhooks, and
Instagram fetching uploaded media. Use a **fixed** address (ngrok static domain or a Cloudflare
named tunnel) — quick `trycloudflare.com` tunnels change on every restart. Use **localhost** for the
admin UI: through the tunnel the dev-mode page did not hydrate (HMR websocket fails), so client
buttons didn't work there.

## Meta setup that finally worked
- App `myanalytics` (ID 1454458710203756) uses **Facebook Login for Business / Unified login**
  ("API setup with Instagram login is not available for newer apps").
- Login is via `https://www.facebook.com/dialog/oauth?client_id=…&config_id=1804753707107970&redirect_uri=…`
  (`src/app/api/auth/instagram/route.ts`). Scope lists are rejected — permissions come from the configuration.
- Configuration 1804753707107970 **must include the Pages asset (required)** alongside the Instagram
  account; without the Page, `/me/accounts` returns no Instagram account ("no_instagram_account").
- Callback exchanges the code at graph.facebook.com, finds IG accounts via the user's Pages
  (`instagram_business_account`), stores the Page token (`accessToken`) and the user token (`userToken`).
- Connected: `mr_omi_2504` (Page "Mromi2504"), `__bhoir_gaurav__`.
- App is in development mode: only app admins/testers can connect ("App not active" for others) until App Review.
- `business_management` and `instagram_manage_insights` are NOT granted (insights not even offered in
  the config's permission list). So reach/views/audience/demographics show "needs permission".
- Boosted detection uses the Marketing API with `userToken` (ads_read). Accounts connected before
  `userToken` was stored must reconnect once.

## Security model
- `src/proxy.ts` (Next 16 renamed middleware → proxy) protects everything with a signed cookie
  (`src/lib/session.ts`, HMAC via Web Crypto). Public: `/login`, `/connected`, `/api/auth/login`,
  `/api/auth/instagram*`, `/api/webhooks*`, `/uploads*`.
- Clients finishing the shared link land on public `/connected`; only a signed-in admin is redirected
  into the dashboard.

## Key files
- `src/lib/graph.ts` Graph API client (publish, media, comments, private replies, follow status)
- `src/lib/sync.ts` profile + posts + per-post insights, boosted flags, daily snapshot
- `src/lib/insights.ts` account totals, daily series, demographics (graceful when unpermitted)
- `src/lib/stats.ts` today/yesterday/7d/30d counts and snapshot deltas
- `src/lib/scheduler.ts` + `src/instrumentation.ts` every 60s: publish due scheduled posts; sync accounts older than 6h
- `src/lib/automation.ts` + `src/app/api/webhooks/instagram` keyword DM automation
- `src/components/charts.tsx` server-rendered SVG charts (single series, #3987e5 validated on #121212)
- Pages: `/` global dashboard, `/accounts/[id]` user dashboard, `/profile`, `/analytics`, `/create`,
  `/scheduled`, `/automations`, `/edit`, `/posts/[id]`, `/login`, `/connected`

## Known gaps / next steps
- Get a fixed tunnel/hosting address; update `APP_URL` and the Meta redirect URL once.
- Request `instagram_manage_insights` (App Review) for reach, views, repeat views, local/global audience.
- Reconnect accounts so `userToken` is stored (boosted counts).
- Instagram API can't delete posts or edit bio/name/picture — app only stores those edits.
- Follow events aren't available via API; "message new followers" only works through comment automation.
- Uploaded files are stored in `public/uploads` (move to cloud storage for production).
- Insights/permissions were tested; a real publish/schedule to Instagram has not been tested yet.
