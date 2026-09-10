"use server";

import { getCurrentUser } from "@/lib/session";

import {
  canUseLane,
  insertMessage,
  isMessageKind,
  listDelayLogs,
  listDiscussionInbox,
  listLanes,
  lanesOf,
  listMessages,
  markLanesRead,
  resolveLane,
  resolveRecipient,
  MAX_MESSAGE_LENGTH,
  type DelayLogReport,
  type InboxEntry,
  type LaneSummary,
  type OrderMessage,
} from "@/lib/order-messages";

export type ThreadResult =
  | { ok: true; messages: OrderMessage[] }
  | { ok: false; error: string };

export type LanesResult =
  | { ok: true; lanes: LaneSummary[] }
  | { ok: false; error: string };

/**
 * Read one conversation on an SO and mark it read. The lane is authorized
 * against the caller's role, so a department user can only ever open their own
 * no matter what the browser asks for — but the thread also carries whatever
 * other departments have addressed to that lane.
 */
export async function openThreadAction(
  orderId: string,
  lane: string
): Promise<ThreadResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You are not signed in." };
  if (!canUseLane(user.role, lane)) {
    return { ok: false, error: "You don't have access to that conversation." };
  }

  try {
    const messages = await listMessages(orderId, lane, user.id);
    // A thread spans every lane it drew from, so mark them all read rather
    // than leaving another department's message showing unread forever.
    await markLanesRead(user.id, orderId, [lane, ...lanesOf(messages)]);
    return { ok: true, messages };
  } catch (error) {
    console.error("openThreadAction failed:", error);
    return { ok: false, error: "Could not load the conversation." };
  }
}

/** Lane summaries for one SO — a department user gets exactly one. */
export async function listLanesAction(orderId: string): Promise<LanesResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You are not signed in." };
  try {
    return { ok: true, lanes: await listLanes(orderId, user) };
  } catch (error) {
    console.error("listLanesAction failed:", error);
    return { ok: false, error: "Could not load the conversation." };
  }
}

/**
 * Post to a lane. Central Visibility / Admin name the department they are
 * replying to; a department user's message always lands in their own lane.
 *
 * `toRole` addresses another department: the message stays in the author's
 * lane and also shows up in that department's thread. Without it nothing
 * crosses a lane.
 */
export async function postMessageAction(
  orderId: string,
  requestedLane: string,
  body: string,
  kind = "note",
  toRole: string | null = null
): Promise<ThreadResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You are not signed in." };

  const lane = resolveLane(user.role, requestedLane);
  if (!lane) return { ok: false, error: "Pick a department to reply to." };

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
      lane,
      authorId: user.id,
      authorName: user.full_name,
      authorRole: user.role,
      body: text,
      kind: isMessageKind(kind) ? kind : "note",
      toRole: toRole ? resolveRecipient(lane, toRole) : null,
    });

    const messages = await listMessages(orderId, lane, user.id);
    await markLanesRead(user.id, orderId, [lane, ...lanesOf(messages)]);
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
    return { ok: false, error: "Could not load your discussions." };
  }
}

export type DelayLogsResult =
  | { ok: true; report: DelayLogReport }
  | { ok: false; error: string };

/** Every delay logged on one SO, for the delay-log table. */
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
