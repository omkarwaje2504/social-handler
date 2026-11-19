// Thin client for the Instagram Graph API (via graph.facebook.com).
// Docs: https://developers.facebook.com/docs/instagram-platform

const GRAPH_VERSION = process.env.IG_GRAPH_VERSION || "v23.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export class GraphError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: number,
  ) {
    super(message);
  }
}

async function graphRequest<T = any>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  token: string,
  opts: { params?: Record<string, string | number | boolean>; body?: unknown } = {},
): Promise<T> {
  const url = new URL(`${GRAPH}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(opts.params ?? {})) {
    url.searchParams.set(k, String(v));
  }

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    throw new GraphError(
      json.error?.message || `Graph API error (${res.status})`,
      res.status,
      json.error?.code,
    );
  }
  return json as T;
}

/* ----------------------------- Account ----------------------------- */

export async function fetchAccountProfile(igUserId: string, token: string) {
  return graphRequest<{
    id: string;
    username: string;
    name?: string;
    biography?: string;
    profile_picture_url?: string;
    website?: string;
    followers_count?: number;
    follows_count?: number;
    media_count?: number;
  }>(
    "GET",
    igUserId,
    token,
    {
      params: {
        fields:
          "id,username,name,biography,profile_picture_url,website,followers_count,follows_count,media_count",
      },
    },
  );
}

/** Account-level insights for the last 28 days (summed where daily). */
export async function fetchAccountInsights(igUserId: string, token: string) {
  const until = Math.floor(Date.now() / 1000);
  const since = until - 28 * 24 * 60 * 60;
  try {
    const res = await graphRequest<{
      data: { name: string; values: { value: number }[] }[];
    }>("GET", `${igUserId}/insights`, token, {
      params: {
        metric: "reach,profile_views,accounts_engaged",
        period: "day",
        since,
        until,
      },
    });
    const out: Record<string, number> = {};
    for (const metric of res.data) {
      out[metric.name] = metric.values.reduce((s, v) => s + (v.value || 0), 0);
    }
    return out;
  } catch {
    return {};
  }
}

/* ------------------------------ Media ------------------------------ */

export interface GraphMedia {
  id: string;
  caption?: string;
  media_type: string;
  media_product_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
}

export async function listMedia(igUserId: string, token: string, limit = 50) {
  const res = await graphRequest<{ data: GraphMedia[] }>(
    "GET",
    `${igUserId}/media`,
    token,
    {
      params: {
        fields:
          "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count",
        limit,
      },
    },
  );
  return res.data;
}

/** Per-post insights. Metric names differ between feed posts and reels, so try a few sets. */
export async function fetchMediaInsights(
  mediaId: string,
  token: string,
  productType?: string,
): Promise<Record<string, number>> {
  const sets =
    productType === "REELS"
      ? ["views,reach,saved,shares,total_interactions,likes,comments,reposts", "views,reach,saved,shares,total_interactions,likes,comments", "plays,reach,saved,shares,total_interactions"]
      : ["views,reach,saved,shares,total_interactions,likes,comments,reposts", "views,reach,saved,shares,total_interactions", "impressions,reach,saved,shares"];

  for (const metric of sets) {
    try {
      const res = await graphRequest<{ data: { name: string; values?: { value: number }[]; value?: number }[] }>(
        "GET",
        `${mediaId}/insights`,
        token,
        { params: { metric } },
      );
      const out: Record<string, number> = {};
      for (const m of res.data) out[m.name] = m.values?.[0]?.value ?? m.value ?? 0;
      return out;
    } catch {
      // try next metric set
    }
  }
  return {};
}

/** Publish a new image or reel. Instagram requires a publicly reachable media URL. */
export async function publishMedia(args: {
  igUserId: string;
  token: string;
  mediaUrl: string;
  mediaType: "IMAGE" | "REELS";
  caption?: string;
}) {
  const container = await graphRequest<{ id: string }>("POST", `${args.igUserId}/media`, args.token, {
    body:
      args.mediaType === "REELS"
        ? { media_type: "REELS", video_url: args.mediaUrl, caption: args.caption ?? "" }
        : { image_url: args.mediaUrl, caption: args.caption ?? "" },
  });

  // Videos/reels need processing time before they can be published.
  if (args.mediaType === "REELS") {
    for (let i = 0; i < 30; i++) {
      const st = await graphRequest<{ status_code: string }>("GET", container.id, args.token, {
        params: { fields: "status_code" },
      });
      if (st.status_code === "FINISHED") break;
      if (st.status_code === "ERROR" || st.status_code === "EXPIRED") {
        throw new GraphError(`Media processing failed: ${st.status_code}`, 400);
      }
      await new Promise((r) => setTimeout(r, 4000));
    }
  }

  const published = await graphRequest<{ id: string }>(
    "POST",
    `${args.igUserId}/media_publish`,
    args.token,
    { body: { creation_id: container.id } },
  );
  return published.id;
}

/** Edit caption of an existing post (Graph API supports caption updates). */
export async function updateMediaCaption(mediaId: string, token: string, caption: string) {
  await graphRequest("POST", mediaId, token, { params: { caption } });
}

/* ----------------------------- Comments ---------------------------- */

export async function listComments(mediaId: string, token: string) {
  const res = await graphRequest<{ data: any[] }>("GET", `${mediaId}/comments`, token, {
    params: {
      fields: "id,text,username,timestamp,like_count,hidden,from{id,username}",
      limit: 100,
    },
  });
  return res.data;
}

export async function replyToComment(commentId: string, token: string, message: string) {
  return graphRequest<{ id: string }>("POST", `${commentId}/replies`, token, {
    params: { message },
  });
}

export async function setCommentHidden(commentId: string, token: string, hide: boolean) {
  await graphRequest("POST", commentId, token, { params: { hide } });
}

export async function deleteComment(commentId: string, token: string) {
  await graphRequest("DELETE", commentId, token);
}

/* ---------------------------- Webhooks ----------------------------- */

/**
 * Install this app on the Facebook Page linked to the Instagram account. Meta only delivers
 * Instagram webhooks (comments → automations) for accounts whose Page has subscribed the app.
 * Idempotent; needs pages_manage_metadata and the Page access token.
 */
export async function subscribePageToApp(pageId: string, pageToken: string) {
  return graphRequest<{ success: boolean }>("POST", `${pageId}/subscribed_apps`, pageToken, {
    params: { subscribed_fields: "feed" },
  });
}

/**
 * Subscribe the Instagram account itself to this app. With the Instagram API (Unified login)
 * Meta delivers comment webhooks only for Instagram accounts subscribed here, in addition to
 * the Page subscription above. Idempotent.
 */
export async function subscribeInstagramToApp(igUserId: string, token: string) {
  return graphRequest<{ success: boolean }>("POST", `${igUserId}/subscribed_apps`, token, {
    params: { subscribed_fields: "comments,mentions,messages" },
  });
}

/* ---------------------------- Messaging ---------------------------- */

/**
 * Private reply (DM) to a comment. Allowed once per comment, within 7 days of it.
 * With Facebook Login (this app) Meta expects POST /{page-id}/messages with the Page token;
 * /{ig-user-id}/messages is the Instagram-Login endpoint and fails here with error #200.
 * Falls back to the IG id only for accounts connected without a Page.
 */
export async function sendPrivateReply(senderId: string, token: string, commentId: string, text: string) {
  return graphRequest<{ recipient_id: string; message_id: string }>(
    "POST",
    `${senderId}/messages`,
    token,
    { body: { recipient: { comment_id: commentId }, message: { text } } },
  );
}

/** Send a DM to someone who messaged the account (Meta allows replies within 24 hours of their last message). */
export async function sendDirectMessage(senderId: string, token: string, recipientIgsid: string, text: string) {
  return graphRequest<{ recipient_id: string; message_id: string }>("POST", `${senderId}/messages`, token, {
    body: { recipient: { id: recipientIgsid }, message: { text } },
  });
}

/** Instagram DM conversations of the Page-linked account, newest first, with their latest messages. */
export async function listConversations(pageId: string, token: string, limit = 25) {
  const res = await graphRequest<{
    data: {
      id: string;
      updated_time: string;
      participants?: { data: { id: string; username?: string }[] };
      messages?: { data: { id: string; created_time: string; from?: { id: string; username?: string }; to?: { data: { id: string; username?: string }[] }; message?: string }[] };
    }[];
  }>("GET", `${pageId}/conversations`, token, {
    params: {
      platform: "instagram",
      fields: "id,updated_time,participants,messages.limit(25){id,created_time,from,to,message}",
      limit,
    },
  });
  return res.data;
}

/** Whether a user (by IGSID) follows the business account. */
export async function getUserFollowStatus(igsid: string, token: string) {
  return graphRequest<{
    username?: string;
    name?: string;
    is_user_follow_business?: boolean;
    is_business_follow_user?: boolean;
  }>("GET", igsid, token, {
    params: { fields: "username,name,is_user_follow_business,is_business_follow_user" },
  });
}
