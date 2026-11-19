# Meta app settings for Social Handler

Copied from the working test app **"testing"** (App ID `29335963502680953`) on 19 Nov 2026, where
comment → public reply → DM is confirmed working. Repeat these in the main app, then update `.env`.

---

## 1. App settings → Basic

| Field | Value |
|---|---|
| Display name | your choice (e.g. `Social Handler`) |
| App domains | `social-handler.informatia.ai` |
| Contact email | a monitored email address |
| Privacy policy URL | `https://social-handler.informatia.ai/privacy` |
| Terms of Service URL | `https://social-handler.informatia.ai/terms` |
| User data deletion | **Data deletion instructions URL** → `https://social-handler.informatia.ai/data-deletion` |
| App icon | 1024×1024 PNG/JPG |
| Category | Business and pages (needed to publish) |

Click **Save changes**.

---

## 2. Use cases (Dashboard → Use cases → Add use cases)

Required for Social Handler:

| Use case | Why |
|---|---|
| **Manage messaging & content on Instagram** | posts, comments, DMs, insights, publishing |
| **Manage everything on your Page** | `pages_manage_metadata` (webhook subscription) |

Optional (present in the test app, only used for boosted-post detection / ads):
Create & manage ads with Marketing API · Measure ad performance data with Marketing API ·
Capture & manage ad leads with Marketing API.

### 2a. Instagram use case → Customize → Permissions and features
Click **+ Add** (or "Add to App Review") so each shows **Ready for testing**:

- `instagram_basic`
- `instagram_manage_comments`
- `instagram_manage_messages`
- `instagram_content_publish`
- `instagram_manage_insights`
- `pages_show_list`
- `pages_read_engagement`
- `business_management`
- optional: `ads_read` (boosted posts), `instagram_manage_contents`, `instagram_manage_engagement`

(The test app also has `instagram_business_*` and `ads_management` ready; Social Handler does not need them.)

### 2b. Pages use case → Customize → Permissions and features
- `pages_manage_metadata` → **Add** (Meta may say it also adds it to another use case → **Add**)
- `pages_show_list`, `pages_read_engagement`, `business_management` (usually already ready)

---

## 3. Facebook Login for Business → Settings → Client OAuth settings

| Setting | Value |
|---|---|
| Client OAuth login | **Yes** |
| Web OAuth login | **Yes** |
| Enforce HTTPS | **Yes** |
| Force Web OAuth reauthentication | No |
| Embedded browser OAuth login | No |
| Use Strict Mode for redirect URIs | **Yes** |
| Valid OAuth Redirect URIs | `https://social-handler.informatia.ai/api/auth/instagram/callback` |
| Login from devices | No |
| Login with the JavaScript SDK | No |
| Deauthorize callback URL | (empty) |
| Data Deletion Request URL | (empty — the instructions URL in Basic is used) |

Click **Save changes**.

---

## 4. Facebook Login for Business → Configurations → Create configuration

Do **not** use "Create new configuration" on the Instagram *Unified login* page (that one makes a
system-user token, which Social Handler does not support).

| Step | Value |
|---|---|
| Name | `instgram-connect` (any name) |
| Login variation | **General** |
| Access token | **User access token** (no expiry choice; assets are not selectable with user tokens) |
| Permissions (15 in the test app) | `instagram_basic`, `instagram_manage_comments`, `instagram_manage_messages`, `instagram_content_publish`, `instagram_manage_insights`, `instagram_manage_contents`, `instagram_manage_engagement`, `pages_show_list`, `pages_read_engagement`, **`pages_manage_metadata`**, `business_management`, `ads_read`, `ads_management`, `pages_manage_ads`, `leads_retrieval` |

Minimum that Social Handler needs: the first 5 Instagram ones + `pages_show_list`,
`pages_read_engagement`, `pages_manage_metadata`, `business_management` (+ `ads_read` for boosted posts).
A permission only appears in this list after it is **Ready for testing** in a use case (step 2).

Save → copy the **Configuration ID**.

---

## 5. Webhooks (Instagram use case → Customize → Webhooks, product **Instagram**)

| Field | Value |
|---|---|
| Callback URL | `https://social-handler.informatia.ai/api/webhooks/instagram` |
| Verify token | same value as `META_WEBHOOK_VERIFY_TOKEN` in `.env` |
| API version | v27.0 |
| Subscribed fields | **comments**, **messages**, live_comments, message_edit, messaging_postbacks, messaging_seen |

Only the **Instagram** object is needed (no Page / User object subscriptions).

---

## 6. App roles

Test app: 1 Administrator. In Development mode only people with a role can connect accounts —
add teammates under **App roles → Roles** (Administrator / Developer / Tester).

## 7. App mode

Test app is **Unpublished (Development)** and comment webhooks + DMs still worked for the connected
accounts. For accounts outside the team, publish the app and get **Advanced Access** through App Review
(see `APP_REVIEW.md`).

---

## 8. Instagram app setting (on each connected business account)

Instagram → Settings → **Messages and story replies → Message controls → Connected tools →
Allow access to messages: On**. Without it the DM fails with
`(#200) The account owner has disabled access to instagram direct messages.`

---

## 9. `.env` in `F:\social-handler` (update for the main app, then restart the dev server)

| Key | Value |
|---|---|
| `META_APP_ID` | main app's App ID |
| `META_APP_SECRET` | main app's secret (App settings → Basic → Show) |
| `META_LOGIN_CONFIG_ID` | Configuration ID from step 4 |
| `META_WEBHOOK_VERIFY_TOKEN` | the verify token used in step 5 |

Unchanged: `DATABASE_URL`, `APP_URL`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `SUPPORT_EMAIL`.

After switching apps, reconnect every account with **+ Connect Instagram** (tokens from the old app
stop working), and recreate the automations if the accounts are re-added.
