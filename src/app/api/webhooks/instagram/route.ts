import { createHmac, timingSafeEqual } from "crypto";
import { after } from "next/server";
import { handleCommentEvent } from "@/lib/automation";
import { sql } from "@/lib/db";
import type { AccountDoc } from "@/lib/models";
import { lookupUsername, refreshFollowStatus, saveMessage } from "@/lib/inbox";

// Meta webhook verification (GET) — called once when you subscribe the webhook.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

function validSignature(rawBody: string, header: string | null) {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !header) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Incoming events (POST). Comment events trigger the keyword automations.
// Every delivery is saved to `webhook_events` (pruned after 7 days) so you can see whether
// Meta sent anything and what the automation did with it.
async function recordEvent(doc: { valid: boolean; object?: string; payload?: unknown; outcomes?: string[] }) {
  try {
    await sql`delete from webhook_events where received_at < now() - interval '7 days'`;
    await sql`
      insert into webhook_events (valid, object, payload, outcomes)
      values (${doc.valid}, ${doc.object ?? null},
              ${doc.payload === undefined ? null : sql.json(doc.payload as never)},
              ${doc.outcomes ? sql.json(doc.outcomes) : null})`;
  } catch (err) {
    console.error("webhook event log failed", err);
  }
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!validSignature(rawBody, req.headers.get("x-hub-signature-256"))) {
    after(() => recordEvent({ valid: false, payload: { body: rawBody.slice(0, 2000) } }));
    return new Response("Invalid signature", { status: 401 });
  }

  const payload = JSON.parse(rawBody) as {
    object: string;
    entry: {
      id: string;
      changes?: {
        field: string;
        value: {
          id: string;
          text?: string;
          from?: { id: string; username?: string };
          media?: { id: string };
          parent_id?: string;
        };
      }[];
      messaging?: MessagingEvent[];
    }[];
  };

  // Acknowledge quickly; do the work after the response is sent.
  after(async () => {
    const outcomes: string[] = [];
    for (const entry of payload.entry ?? []) {
      for (const m of entry.messaging ?? []) {
        try {
          outcomes.push(await handleMessaging(entry.id, m));
        } catch (err) {
          console.error("message webhook failed", err);
          outcomes.push(`message failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      for (const change of entry.changes ?? []) {
        if (change.field !== "comments") {
          outcomes.push(`ignored field ${change.field}`);
          continue;
        }
        const v = change.value;
        if (!v.text || !v.from?.id || !v.media?.id) {
          outcomes.push("comment without text/from/media");
          continue;
        }
        try {
          outcomes.push(await handleCommentEvent({
            igAccountId: entry.id,
            igMediaId: v.media.id,
            commentId: v.id,
            text: v.text,
            fromId: v.from.id,
            fromUsername: v.from.username,
            parentId: v.parent_id,
          }));
        } catch (err) {
          console.error("comment automation failed", err);
          outcomes.push(`failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
    await recordEvent({ valid: true, object: payload.object, payload, outcomes });
  });

  return new Response("EVENT_RECEIVED", { status: 200 });
}

type MessagingEvent = {
  sender: { id: string };
  recipient: { id: string };
  timestamp?: number;
  message?: { mid: string; text?: string; attachments?: unknown; is_echo?: boolean; is_deleted?: boolean };
  read?: { mid: string };
};

/** Stores DMs (incoming, and echoes of ones sent from Instagram itself) for the Messages inbox. */
async function handleMessaging(igAccountId: string, m: MessagingEvent): Promise<string> {
  const [account] = await sql<AccountDoc[]>`select * from accounts where ig_user_id = ${igAccountId}`;
  if (!account) return `no connected account with igUserId ${igAccountId}`;
  if (m.read) {
    await sql`update messages set read_at = now() where account_id = ${account.id} and direction = 'out' and read_at is null
              and thread_user_id = ${m.sender.id}`;
    return "seen";
  }
  if (!m.message) return "ignored messaging event";
  if (m.message.is_deleted) {
    await sql`delete from messages where ig_message_id = ${m.message.mid}`;
    return "message deleted";
  }
  const outgoing = !!m.message.is_echo || m.sender.id === igAccountId;
  const other = outgoing ? m.recipient.id : m.sender.id;
  await saveMessage({
    accountId: account.id,
    igMessageId: m.message.mid,
    threadUserId: other,
    threadUsername: await lookupUsername(account, other),
    direction: outgoing ? "out" : "in",
    text: m.message.text ?? "",
    attachments: m.message.attachments ?? null,
    source: "webhook",
    sentAt: m.timestamp ? new Date(m.timestamp) : new Date(),
  });
  if (outgoing) return "message echo saved";
  // Their message gives consent: now the follow status can be read and back-filled.
  const follows = await refreshFollowStatus(account, other);
  return `message saved${follows == null ? "" : `; follows: ${follows}`}`;
}
