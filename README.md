# Social Handler

Next.js + PostgreSQL (Neon) dashboard for an Instagram Business/Creator account:
connect accounts, sync posts and analytics, publish/edit posts, moderate comments,
and run keyword comment → DM automations.

Database: `social_handler` on the `vercel-sample` cluster (set in `.env.local`).

## Run

```bash
npm install
npm run dev        # http://localhost:4345
```

## Meta / Instagram setup (required for live data)

1. Create a Meta app at https://developers.facebook.com → type "Business".
2. Add the products: Facebook Login for Business, Instagram (API), Webhooks.
3. Put the Meta App ID / Secret into `.env.local` (`META_APP_ID`, `META_APP_SECRET`).
4. `APP_URL` is `https://social-handler.informatia.ai` — a Cloudflare named tunnel to
   `localhost:4345`, switched on/off from the complete-ai-platform panel ("Social Handler
   tunnel"; one-time setup: `F:\complete-ai-platform\manager\setup_social_tunnel.ps1`).
   Add `${APP_URL}/api/auth/instagram/callback` to Valid OAuth Redirect URIs.
5. Webhooks → Instagram: callback URL `${APP_URL}/api/webhooks/instagram`,
   verify token = `META_WEBHOOK_VERIFY_TOKEN`, subscribe to the `comments` field.
6. Open the app → **Connect Instagram** and log in with the Instagram account
   (must be Business/Creator and linked to a Facebook Page).

## Important limits of the Instagram API

- **Publishing** needs a public media URL (photos JPG/PNG, reels MP4). Local file uploads need a storage bucket (S3, Cloudinary, Vercel Blob).
- **Delete post**: the API cannot delete media. "Remove from app" hides it locally only.
- **Profile edits** (name, bio, website, picture) cannot be pushed through the API; they are saved in the app.
- **Follow check** uses the commenter's `is_user_follow_business` field from the Messaging API.
  If Meta does not return it for a user, they are treated as a non-follower.
- **Auto DMs** are sent as private replies to the comment: one per comment, within 7 days.
  Follow events are not available via API, so "message when someone follows" is handled by the comment flow only.
- Accounts must be authorized with the app (App Review needed for accounts other than your own test users).

## Layout

- `src/lib/graph.ts` – Instagram Graph API client
- `src/lib/sync.ts` – pulls profile, insights and posts into Postgres
- `db/schema.sql` – database schema (8 tables); apply with `bun run db:migrate` (safe to re-run)
- `src/lib/automation.ts` – keyword match → follow check → DM, with idempotent logs
- `src/app/api/webhooks/instagram` – signed webhook receiver
- `src/app/api/auth/instagram/*` – OAuth connect
- `src/app/*` – dashboard, account, post and automation pages
