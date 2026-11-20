// What can be exported from a project. Shared by the export builder (client) and the exporter (server).
// kind: "dim" = text/date you can group by (pivot rows/columns), "num" = a measure you can add up.

export type ColKind = "dim" | "num";
export interface ExportCol { key: string; label: string; kind: ColKind }
export interface ExportDataset { key: DatasetKey; label: string; hint: string; cols: ExportCol[]; dated: boolean }

export type DatasetKey = "accounts" | "posts" | "daily" | "comments" | "messages" | "automations";
export type Agg = "sum" | "avg" | "count" | "min" | "max";
export const AGGS: { key: Agg; label: string }[] = [
  { key: "sum", label: "Sum" },
  { key: "avg", label: "Average" },
  { key: "count", label: "Count" },
  { key: "min", label: "Min" },
  { key: "max", label: "Max" },
];

const d = (key: string, label: string): ExportCol => ({ key, label, kind: "dim" });
const n = (key: string, label: string): ExportCol => ({ key, label, kind: "num" });

export const DATASETS: ExportDataset[] = [
  {
    key: "accounts", label: "Accounts summary", dated: false,
    hint: "One row per linked social account with totals across all synced content.",
    cols: [
      d("account", "Account"), d("name", "Name"), d("account_type", "Account type"), d("designation", "Designation"),
      n("followers", "Followers"), n("following", "Following"), n("media_count", "Media count"),
      n("posts", "Posts"), n("reels", "Reels"), n("views", "Views"), n("reach", "Reach"), n("likes", "Likes"),
      n("comments", "Comments"), n("shares", "Shares"), n("saves", "Saves"), n("reposts", "Reposts"),
      n("engagement", "Engagement"), n("engagement_rate", "Engagement rate %"), n("auto_dms", "Auto-DMs sent"),
      n("inbox_messages", "Inbox messages"), d("last_synced", "Last synced"),
    ],
  },
  {
    key: "posts", label: "Posts & reels", dated: true,
    hint: "Every post and reel with its insights. Pivot by account, type or month.",
    cols: [
      d("account", "Account"), d("account_type", "Account type"), d("designation", "Designation"),
      d("type", "Type"), d("posted_at", "Posted at"), d("day", "Day"), d("week", "Week"), d("month", "Month"),
      d("caption", "Caption"), d("permalink", "Link"), d("boosted", "Boosted"),
      n("views", "Views"), n("reach", "Reach"), n("likes", "Likes"), n("comments", "Comments"),
      n("shares", "Shares"), n("saves", "Saves"), n("reposts", "Reposts"), n("engagement", "Engagement"),
      n("count", "Posts (1 per row)"),
    ],
  },
  {
    key: "daily", label: "Daily account growth", dated: true,
    hint: "One row per account per day: followers and totals as recorded by the daily sync.",
    cols: [
      d("account", "Account"), d("designation", "Designation"), d("day", "Day"), d("week", "Week"), d("month", "Month"),
      n("followers", "Followers"), n("following", "Following"), n("media_count", "Media count"),
      n("likes", "Likes"), n("comments", "Comments"),
    ],
  },
  {
    key: "comments", label: "Comments", dated: true,
    hint: "Comments received on the project's posts (including ones deleted in the app).",
    cols: [
      d("account", "Account"), d("post_id", "Post id"), d("from_username", "From"), d("text", "Comment"),
      d("own", "By the account"), d("hidden", "Hidden"), d("deleted", "Deleted"),
      d("commented_at", "Commented at"), d("day", "Day"), d("month", "Month"),
      n("likes", "Likes"), n("count", "Comments (1 per row)"),
    ],
  },
  {
    key: "messages", label: "Direct messages", dated: true,
    hint: "Instagram DMs sent and received, with where they came from.",
    cols: [
      d("account", "Account"), d("thread", "Conversation with"), d("direction", "Direction"), d("source", "Source"),
      d("text", "Text"), d("sent_at", "Sent at"), d("day", "Day"), d("month", "Month"), d("read", "Read"),
      n("count", "Messages (1 per row)"),
    ],
  },
  {
    key: "automations", label: "Auto-DM runs", dated: true,
    hint: "Each time a comment triggered an automation, and what happened.",
    cols: [
      d("account", "Account"), d("automation", "Automation"), d("keyword", "Keyword"), d("commenter", "Commenter"),
      d("comment", "Comment"), d("follower", "Follows the account"), d("status", "Status"),
      d("public_reply", "Public reply posted"), d("at", "At"), d("day", "Day"), d("month", "Month"),
      n("count", "Runs (1 per row)"),
    ],
  },
];

export const datasetByKey = (k: string) => DATASETS.find((x) => x.key === k);

export interface ExportRequest {
  dataset: DatasetKey;
  from?: string; // YYYY-MM-DD
  to?: string;
  accountIds?: string[];
  columns?: string[]; // raw export: which columns (default all)
  sort?: string;
  dir?: "asc" | "desc";
  pivot?: { rows: string[]; cols?: string; measure: string; agg: Agg } | null;
}
