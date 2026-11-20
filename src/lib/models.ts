// Row types for the Postgres tables in db/schema.sql (columns are snake_case there;
// the sql client converts them to camelCase). Nullable columns come back as null.

export interface AccountDoc {
  id: number;
  hash: string;
  projectId: number | null;
  accountType: string;
  designation: string;
  igUserId: string; // Instagram Business/Creator account id
  pageId: string; // linked Facebook Page id
  username: string;
  name?: string | null;
  biography?: string | null;
  profilePictureUrl?: string | null;
  website?: string | null;
  followersCount?: number | null;
  followsCount?: number | null;
  mediaCount?: number | null;
  accessToken: string; // Page access token used for Graph API calls
  userToken?: string | null; // Facebook user token (Marketing API lookups, e.g. boosted posts)
  insights?: Record<string, number> | null;
  lastSyncedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PostDoc {
  id: number;
  hash: string;
  accountId: number;
  igMediaId: string;
  mediaType: string; // IMAGE | VIDEO | CAROUSEL_ALBUM | REELS
  mediaUrl?: string | null;
  thumbnailUrl?: string | null;
  permalink?: string | null;
  caption?: string | null;
  timestamp?: Date | null;
  likeCount: number;
  commentsCount: number;
  metrics: Record<string, number>; // reach, saved, views, shares, ...
  syncedAt: Date;
  removedFromApp?: boolean | null;
  boosted?: boolean | null; // promoted via Meta ads
}

/** One row per account per day, written on every sync; powers today/yesterday/week/month deltas. */
export interface SnapshotDoc {
  id: number;
  accountId: number;
  day: string; // YYYY-MM-DD (server local time)
  followers: number;
  follows: number;
  mediaCount: number;
  likes: number; // total likes across synced posts
  comments: number; // total comments across synced posts
  takenAt: Date;
}

export interface ScheduledPostDoc {
  id: number;
  hash: string;
  accountId: number;
  mediaUrl: string;
  mediaType: "IMAGE" | "REELS";
  caption: string;
  publishAt: Date;
  status: "pending" | "publishing" | "published" | "failed" | "cancelled";
  igMediaId?: string | null;
  error?: string | null;
  createdAt: Date;
}

export interface AutomationDoc {
  id: number;
  hash: string;
  accountId: number;
  name: string;
  keyword: string; // case-insensitive match against comment text
  igMediaId?: string | null; // legacy single post (kept in sync with igMediaIds[0])
  igMediaIds: string[]; // posts this rule watches; empty = every post and reel
  enabled: boolean;
  followerMessage: string; // sent (as a DM) when the commenter follows the account
  nonFollowerMessage: string; // sent (as a DM) when the commenter does not follow
  publicReply?: string | null; // optional public reply under the comment
  createdAt: Date;
}

export interface AutomationLogDoc {
  id: number;
  automationId: number;
  accountId: number;
  igMediaId: string;
  commentId: string;
  commenterIgsid: string;
  commenterUsername?: string | null;
  commentText: string;
  isFollower: boolean | null;
  messageSent: string;
  status: "sent" | "error" | "skipped";
  error?: string | null;
  publicReplySent: boolean;
  createdAt: Date;
}

export interface CommentDoc {
  id: number;
  hash: string;
  accountId: number;
  igCommentId: string;
  igMediaId: string;
  parentId: string | null;
  fromId: string | null;
  fromUsername: string | null;
  text: string;
  likeCount: number;
  hidden: boolean;
  isOwn: boolean;
  commentedAt: Date;
  deletedAt: Date | null;
  createdAt: Date;
}

export interface MessageDoc {
  id: number;
  hash: string;
  accountId: number;
  igMessageId: string | null;
  threadUserId: string; // the other person's IGSID
  threadUsername: string | null;
  direction: "in" | "out";
  text: string;
  attachments: unknown;
  source: "webhook" | "reply" | "automation" | "sync";
  automationId: number | null;
  sentAt: Date;
  readAt: Date | null;
  createdAt: Date;
}

/** YYYY-MM-DD in server local time. */
export function dayKey(d: Date = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
