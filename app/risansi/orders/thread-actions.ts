"use server";

import { getCurrentUser } from "@/lib/session";

import {
  canLogDelay,
  canUsePeer,
  insertMessage,
  isMessageKind,
  listConversations,
  listDelayLogs,
  listDiscussionInbox,
  listMessages,
  markConversationRead,
  sidesFor,
  MAX_MESSAGE_LENGTH,
  type ConversationSummary,
  type DelayLogReport,
  type InboxEntry,
  type OrderMessage,
} from "@/lib/order-messages";

export type ThreadResult =
  | { ok: true; messages: OrderMessage[] }
  | { ok: false; error: string };

export type ConversationsResult =
  | { ok: true; conversations: ConversationSummary[] }
  | { ok: false; error: string };

/**
 * Read one conversation on an SO and mark it read. The peer is authorized
 * against the caller's role, so a department can only ever open a conversation
 * it is part of, no matter what the browser asks for.
 */
export async function openThreadAction(
  orderId: string,
  peer: string
): Promise<ThreadResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You are not signed in." };
  if (!canUsePeer(user.role, peer)) {
    return { ok: false, error: "You don't have access to that conversation." };
  }

  try {
    const messages = await listMessages(orderId, peer, user);
    await markConversationRead(user.id, orderId, peer);
    return { ok: true, messages };
  } catch (error) {
    console.error("openThreadAction failed:", error);
    return { ok: false, error: "Could not load the conversation." };
  }
}

/** Every conversation the caller may hold on one SO, with its unread count. */
export async function listConversationsAction(
  orderId: string
): Promise<ConversationsResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You are not signed in." };
  try {
    return { ok: true, conversations: await listConversations(orderId, user) };
  } catch (error) {
    console.error("listConversationsAction failed:", error);
    return { ok: false, error: "Could not load the conversation." };
  }
}

/**
 * Post into one conversation. The peer names the other side: a department for
 * Central, and for a department either another department or Central
 * Visibility. Which columns that lands in is sidesFor's business.
 */
export async function postMessageAction(
  orderId: string,
  peer: string,
  body: string,
  kind = "note"
): Promise<ThreadResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You are not signed in." };

  const sides = sidesFor(user.role, peer);
  if (!sides) return { ok: false, error: "Pick who to send this to." };

  const text = body.trim();
  if (text === "") return { ok: false, error: "Type a message first." };
  if (text.length > MAX_MESSAGE_LENGTH) {
    return {
      ok: false,
      error: `Messages are limited to ${MAX_MESSAGE_LENGTH} characters.`,
    };
  }

  try {
    await insertMessage({
      orderId,
      deptRole: sides.deptRole,
      toRole: sides.toRole,
      authorId: user.id,
      authorName: user.full_name,
      authorRole: user.role,
      body: text,
      // The UI hides the delay toggle outside the conversation with Central,
      // but this is a public endpoint, so the rule is enforced here too.
      kind:
        isMessageKind(kind) && canLogDelay(user.role, peer) ? kind : "note",
    });
    await markConversationRead(user.id, orderId, peer);

    const messages = await listMessages(orderId, peer, user);
    return { ok: true, messages };
  } catch (error) {
    console.error("postMessageAction failed:", error);
    return { ok: false, error: "Could not send that message." };
  }
}

export type InboxResult =
  | { ok: true; entries: InboxEntry[] }
  | { ok: false; error: string };

/** Unread discussion entries for the header icon. */
export async function discussionInboxAction(): Promise<InboxResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You are not signed in." };
  try {
    return { ok: true, entries: await listDiscussionInbox(user) };
  } catch (error) {
    console.error("discussionInboxAction failed:", error);
    return { ok: false, error: "Could not load discussions." };
  }
}

export type DelayLogsResult =
  | { ok: true; report: DelayLogReport }
  | { ok: false; error: string };

/** The delay log of one SO, for the modal and the PDF. */
export async function delayLogsAction(
  orderId: string
): Promise<DelayLogsResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You are not signed in." };
  try {
    return { ok: true, report: await listDelayLogs(orderId, user) };
  } catch (error) {
    console.error("delayLogsAction failed:", error);
    return { ok: false, error: "Could not load the delay log." };
  }
}
