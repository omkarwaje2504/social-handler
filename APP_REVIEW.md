# Meta App Review — Social Handler ("Business API", app 424803723388625)

Status (19 Nov 2026): app is **Live**, Business Verification is **Verified**, the submission draft has
Verification, App settings, Data handling and Reviewer instructions complete. Only **Allowed usage** is left:
for each permission, a description, a screencast, the API test calls (some permissions) and the
"comply with allowed usage" checkbox.

Path: developers.facebook.com → Business API → Review → App Review → Next → Allowed usage → Get started.

## First: drop the two Instagram-Login permissions
`instagram_business_basic` and `instagram_business_manage_messages` belong to "API setup with Instagram
login", which Social Handler does not use (it connects through Facebook Login). Remove them from the
submission (App Review page → "remove" next to each) so you don't need screencasts for them.

## Screencasts (record once, reuse)
Record at 1080p, English UI, no sound needed; add captions or on-screen notes for each step.
Reviewers must see the Meta login dialog and the permission being used.

1. **Login + accounts (pages_show_list, instagram_basic, pages_read_engagement)**
   Open https://social-handler.informatia.ai → log in → "+ Connect Instagram" → Facebook Login dialog
   (show the permissions screen) → choose the Page and Instagram account → back in the app the account
   appears in the sidebar → open it → Profile & posts shows the posts.
2. **Insights (instagram_manage_insights)**
   Open the account Dashboard → scroll through reach, views, audience by city/country/age/gender charts.
3. **Publishing (instagram_content_publish)**
   Create post → upload an image, caption → Publish now (or schedule 1–2 minutes ahead) → show the post
   live on Instagram.
4. **Comments + auto-DM (instagram_manage_comments, instagram_manage_messages, pages_manage_metadata)**
   Automations (auto-DM) → create rule keyword "info" with follower/non-follower message and public reply →
   from a second (tester/admin) Instagram account comment "info" on a post → show the public reply under
   the comment and the DM arriving in that account's inbox → back in the app show the automation log.
   Also open a post → Comments panel → reply to a comment from the app.

## Descriptions to paste

**instagram_basic**
Social Handler lets a business manage the Instagram professional accounts it connects. We use
instagram_basic to read the connected account's profile (username, name, picture, follower counts) and
its media (images, reels, captions, like and comment counts) to show the profile grid, per-post pages
and the dashboard. Data is shown only to the business that connected the account.

**pages_show_list**
After the business logs in with Facebook Login, we list the Facebook Pages they manage so they can choose
which Page's linked Instagram professional account to connect. We only store the Page ID of the chosen
Page.

**pages_read_engagement**
Needed with pages_show_list to read the selected Page's basic details and its linked Instagram business
account ID, and to obtain the Page access token used for the Instagram API calls made on the business's
behalf.

**pages_manage_metadata**
We subscribe the connected Page/Instagram account to our app's webhooks so we receive real-time
notifications of new comments and messages. These notifications drive the keyword automations
(automatic reply to people who comment a chosen keyword) configured by the business.

**instagram_manage_insights**
We read account and media insights (reach, views, accounts engaged, profile views, saves, shares,
audience city/country/age/gender) to show the business dashboard with day, week and month comparisons
and charts. Insights are shown only to the business that owns the account.

**instagram_content_publish**
The business can create and schedule image and reel posts from Social Handler. At the chosen time the
app publishes the media to the connected Instagram professional account using the content publishing API.

**instagram_manage_comments**
We read comments on the business's own posts to show them in the app, let the business reply to or
hide comments, and power keyword automations: when someone comments a keyword the business chose (for
example "info"), the app posts the business's configured public reply under that comment.

**instagram_manage_messages**
For keyword automations, after a person comments the chosen keyword on the business's post, we send
that person one private reply (direct message) with the information they asked for, using Instagram's
private replies to comments. Messages are only sent in response to the person's own comment, at most once
per comment, with text written by the business.

## API test calls
Permissions marked "Ensure you have performed required API test calls" need at least one successful call
in the last 30 days. Using the app normally covers them: Sync an account (instagram_basic,
pages_read_engagement, instagram_manage_insights), publish one post (instagram_content_publish), reply to
one comment from the post page (instagram_manage_comments), and connect an account (pages_manage_metadata
webhook subscription). The counters update within ~24 hours.

## Checkbox
"Agree that you will comply with allowed usage" is a legal certification: the account owner ticks it.
