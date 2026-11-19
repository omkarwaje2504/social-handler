# Connecting Instagram accounts

App: **sai-tester** (Meta app `1474674394637190`), Facebook Login for Business,
login configuration `META_LOGIN_CONFIG_ID` (system-user token, never expires).
Public address: `https://social-handler.informatia.ai` (Cloudflare tunnel, see the complete-ai-platform panel).

## What every account needs (both methods)

1. An **Instagram Professional account** (Business or Creator): Instagram → Settings →
   Account type and tools → Switch to professional account.
2. That Instagram account **linked to a Facebook Page**: Instagram → Edit profile → Page → connect
   (or Meta Business Suite → Settings → Instagram accounts → Connect).
3. For DMs: Instagram → Settings → Messages and story replies → Message controls →
   Connected tools → **Allow access to messages** = ON.
4. While the app is unpublished (development mode): the person who comments must have a role on
   sai-tester (App roles → Roles → Add People; Instagram Testers must accept the invite in
   Instagram → Settings → Website permissions → Apps and websites → Tester invites).

The login configuration must contain: `instagram_basic`, `instagram_manage_comments`,
`instagram_manage_messages`, `instagram_content_publish`, `pages_show_list`,
`pages_read_engagement`, `pages_manage_metadata`, `pages_messaging`
(+ `instagram_manage_insights` for reach/audience, `business_management` for portfolio lookups).

## Method A: client connects with the shared link

1. Dashboard → **Connect Instagram** (or **Share via WhatsApp** to send the link).
2. The client logs in to Facebook, selects their **Page and its Instagram account**, approves.
3. They land on `/connected`; the account appears in the dashboard and is synced.
   The sync also subscribes their Page to the app, so comment automations work at once.
4. To refresh permissions later: open the account → **Reconnect**.

## Method B: direct, through your Business portfolio (no client login)

The stored token belongs to the business **system user**, so it can use every Page / Instagram
account assigned to that system user.

1. **Client gives your business access** (once):
   - You: Meta Business Suite → Settings → **Pages** / **Instagram accounts** → Add → *Request access*
     → enter the client's Page / Instagram account → choose permissions (content, messages, comments,
     insights).
   - Client: approves the request in their Business Suite (Settings → Requests), or adds your
     business as a **Partner** with those permissions.
2. **Assign the assets to the system user**: Business settings → Users → **System users** →
   *sai-tester System User* → **Assign assets** → pick the Page and the Instagram account →
   give full control (or at least content, messages, comments, insights).
3. **Assign the app**: same system user → make sure the **sai-tester** app is assigned.
4. In this app: open any account → **Reconnect** (or **Connect Instagram**) and log in once.
   Every Page the system user can reach is imported, with its Instagram account.

## Going live for real clients

Until these are done only accounts/people with a role on sai-tester work:

1. **Business verification** of your business (Business Suite → Security center).
2. **App Review** for Advanced Access to `instagram_basic`, `instagram_manage_comments`,
   `instagram_manage_messages`, `instagram_content_publish`, `pages_show_list`,
   `pages_read_engagement`, `pages_manage_metadata`, `pages_messaging`
   (and `instagram_manage_insights`, `business_management` if needed). Each needs a screencast
   of the feature and a privacy policy URL.
3. App dashboard → **Publish** (switch to Live).

## Quick checks when something doesn't work

| Symptom | Check |
|---|---|
| "no_instagram_account" after login | Instagram not Professional, not linked to a Page, or the Page not selected in the login dialog |
| Comments arrive, no DM | "Allow access to messages" off; commenter has no role on the app (dev mode) |
| Nothing in Recent activity | Meta webhook (`instagram` → `comments`) on the app; Page subscribed (runs on every Sync) |
| Insights show "needs permission" | `instagram_manage_insights` missing from the login configuration |

Every webhook delivery and its outcome is stored for 7 days in the Postgres table `webhook_events`.
