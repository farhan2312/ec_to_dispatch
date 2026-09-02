"use server";

import { getCurrentUser } from "@/lib/session";
import { getOrderLabel } from "@/lib/orders";
import { emitNotification } from "@/lib/notifications";
import { roleLabel } from "@/lib/roles";
import {
  canUseLane,
  insertMessage,
  listLanes,
  listMessages,
  markLaneRead,
  resolveLane,
  MAX_MESSAGE_LENGTH,
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
 * Read one lane of an SO thread and mark it read. The lane is authorized
 * against the caller's role, so a department user can only ever open their
 * own lane no matter what the browser asks for.
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
    await markLaneRead(user.id, orderId, lane);
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
 * The other side of the lane is notified.
 */
export async function postMessageAction(
  orderId: string,
  requestedLane: string,
  body: string
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
    });
    await markLaneRead(user.id, orderId, lane);

    // Notify the far side of this lane: the department when Central posts,
    // Central when the department posts. Never a third department — the lane
    // is the whole audience.
    const isFromCentral = user.role === "admin" || user.role === "central_visibility";
    const recipients = isFromCentral ? [lane] : ["central_visibility", "admin"];
    const label = (await getOrderLabel(orderId)) ?? "an order";
    await emitNotification({
      roles: recipients,
      orderId,
      type: "dept_update",
      message: `${user.full_name} (${roleLabel(user.role)}) commented on ${label}: ${
        text.length > 120 ? `${text.slice(0, 120)}…` : text
      }`,
    });

    const messages = await listMessages(orderId, lane, user.id);
    return { ok: true, messages };
  } catch (error) {
    console.error("postMessageAction failed:", error);
    return { ok: false, error: "Could not send that message." };
  }
}
