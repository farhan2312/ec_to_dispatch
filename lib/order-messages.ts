import { query } from "@/lib/db";
import { ALL_ROLES, isCentral, type Role } from "@/lib/roles";

/**
 * Per-SO discussion threads.
 *
 * There is no cross-department visibility: every message sits in a *lane*
 * named by a department role. A department user reads and writes only their
 * own lane; Admin / Central Visibility see every lane and choose which one
 * they are replying in. Messages are append-only — nothing here updates or
 * deletes them.
 */

export type OrderMessage = {
  id: string;
  dept_role: string;
  author_id: string | null;
  author_name: string;
  author_role: string;
  kind: string;
  body: string;
  created_at: string;
  mine: boolean;
};

/** A discussion entry is a plain note or a flagged delay. */
export type MessageKind = "note" | "delay";

export function isMessageKind(value: string): value is MessageKind {
  return value === "note" || value === "delay";
}

/** One department lane on an SO, with its activity summary. */
export type LaneSummary = {
  dept_role: Role;
  total: number;
  unread: number;
  last_at: string | null;
  last_body: string | null;
};

const ISO = `'YYYY-MM-DD"T"HH24:MI:SS"Z"'`;

// Every column the UI renders for a message, aliased consistently so the
// read and the insert-returning share one shape.
const MESSAGE_COLUMNS = `m.id, m.dept_role, m.author_id, m.author_name,
            m.author_role, m.kind, m.body,
            to_char(m.created_at AT TIME ZONE 'UTC', ${ISO}) AS created_at`;

export const MAX_MESSAGE_LENGTH = 2000;

/** The roles a lane can be named after — every role except the central ones. */
export const DEPARTMENT_LANES: Role[] = ALL_ROLES.filter((r) => !isCentral(r));

function isDepartmentLane(value: string): value is Role {
  return (DEPARTMENT_LANES as string[]).includes(value);
}

/**
 * Lanes the user may read on any SO: their own for a department user, all of
 * them for Admin / Central Visibility.
 */
export function lanesFor(role: string): Role[] {
  if (isCentral(role)) return DEPARTMENT_LANES;
  return isDepartmentLane(role) ? [role] : [];
}

/** Whether `role` may read and post in `lane`. */
export function canUseLane(role: string, lane: string): boolean {
  return isDepartmentLane(lane) && lanesFor(role).includes(lane);
}

/**
 * The lane a message from this author belongs in. A department user only ever
 * writes to their own lane, so their choice is ignored; Central must name one.
 */
export function resolveLane(role: string, requested: string): Role | null {
  if (!isCentral(role)) return isDepartmentLane(role) ? role : null;
  return isDepartmentLane(requested) ? requested : null;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listMessages(
  orderId: string,
  lane: string,
  viewerId: string
): Promise<OrderMessage[]> {
  const result = await query<OrderMessage>(
    `SELECT ${MESSAGE_COLUMNS},
            (m.author_id = $3) AS mine
       FROM order_messages m
      WHERE m.order_id = $1 AND m.dept_role = $2
      ORDER BY m.created_at ASC`,
    [orderId, lane, viewerId]
  );
  return result.rows;
}

/**
 * Every lane the viewer may see on one SO, including the empty ones, so
 * Central can start a conversation with a department that has not posted yet.
 */
export async function listLanes(
  orderId: string,
  viewer: { id: string; role: string }
): Promise<LaneSummary[]> {
  const lanes = lanesFor(viewer.role);
  if (lanes.length === 0) return [];

  const result = await query<{
    dept_role: string;
    total: string;
    unread: string;
    last_at: string | null;
    last_body: string | null;
  }>(
    `SELECT m.dept_role,
            COUNT(*)::text AS total,
            COUNT(*) FILTER (
              WHERE m.author_id <> $3
                AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)
            )::text AS unread,
            to_char(MAX(m.created_at) AT TIME ZONE 'UTC', ${ISO}) AS last_at,
            (ARRAY_AGG(m.body ORDER BY m.created_at DESC))[1] AS last_body
       FROM order_messages m
       LEFT JOIN order_message_reads r
              ON r.user_id = $3
             AND r.order_id = m.order_id
             AND r.dept_role = m.dept_role
      WHERE m.order_id = $1 AND m.dept_role = ANY($2)
      GROUP BY m.dept_role`,
    [orderId, lanes, viewer.id]
  );

  const bySlug = new Map(result.rows.map((r) => [r.dept_role, r]));
  return lanes.map((dept_role) => {
    const row = bySlug.get(dept_role);
    return {
      dept_role,
      total: row ? Number(row.total) : 0,
      unread: row ? Number(row.unread) : 0,
      last_at: row?.last_at ?? null,
      last_body: row?.last_body ?? null,
    };
  });
}

/**
 * Unread counts keyed by order id, for badging a list of SOs. Counts only the
 * lanes the viewer can see, and never their own messages.
 */
export async function unreadByOrder(
  orderIds: string[],
  viewer: { id: string; role: string }
): Promise<Record<string, number>> {
  const lanes = lanesFor(viewer.role);
  if (lanes.length === 0 || orderIds.length === 0) return {};

  const result = await query<{ order_id: string; unread: string }>(
    `SELECT m.order_id, COUNT(*)::text AS unread
       FROM order_messages m
       LEFT JOIN order_message_reads r
              ON r.user_id = $3
             AND r.order_id = m.order_id
             AND r.dept_role = m.dept_role
      WHERE m.order_id = ANY($1)
        AND m.dept_role = ANY($2)
        AND m.author_id <> $3
        AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)
      GROUP BY m.order_id`,
    [orderIds, lanes, viewer.id]
  );

  const counts: Record<string, number> = {};
  for (const row of result.rows) counts[row.order_id] = Number(row.unread);
  return counts;
}

/** One unread discussion entry, for the header inbox. */
export type InboxEntry = {
  id: string;
  order_id: string;
  so_no: string | null;
  sl_no: number;
  dept_role: string;
  author_name: string;
  author_role: string;
  kind: string;
  body: string;
  created_at: string;
};

/**
 * Unread discussion entries across every SO, newest first — what the
 * header's discussion icon shows. Same lane rule as everywhere else, and a
 * user never sees their own messages here.
 */
export async function listDiscussionInbox(
  viewer: { id: string; role: string },
  limit = 20
): Promise<InboxEntry[]> {
  const lanes = lanesFor(viewer.role);
  if (lanes.length === 0) return [];
  const result = await query<InboxEntry>(
    `SELECT m.id, m.order_id, o.so_no, o.sl_no::int AS sl_no, m.dept_role,
            m.author_name, m.author_role, m.kind, m.body,
            to_char(m.created_at AT TIME ZONE 'UTC', ${ISO}) AS created_at
       FROM order_messages m
       JOIN orders o ON o.id = m.order_id
       LEFT JOIN order_message_reads r
              ON r.user_id = $1
             AND r.order_id = m.order_id
             AND r.dept_role = m.dept_role
      WHERE m.dept_role = ANY($2)
        AND m.author_id <> $1
        AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)
      ORDER BY m.created_at DESC
      LIMIT $3`,
    [viewer.id, lanes, limit]
  );
  return result.rows;
}

/** How many unread discussion entries the viewer has, in total. */
export async function countDiscussionUnread(viewer: {
  id: string;
  role: string;
}): Promise<number> {
  const lanes = lanesFor(viewer.role);
  if (lanes.length === 0) return 0;
  const result = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n
       FROM order_messages m
       LEFT JOIN order_message_reads r
              ON r.user_id = $1
             AND r.order_id = m.order_id
             AND r.dept_role = m.dept_role
      WHERE m.dept_role = ANY($2)
        AND m.author_id <> $1
        AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)`,
    [viewer.id, lanes]
  );
  return Number(result.rows[0]?.n ?? 0);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function insertMessage(input: {
  orderId: string;
  lane: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  body: string;
  // 'delay' flags the entry as a delay; the date it happened is its
  // created_at, so nothing else is stored.
  kind?: MessageKind;
}): Promise<OrderMessage> {
  const result = await query<OrderMessage>(
    `INSERT INTO order_messages
        (order_id, dept_role, author_id, author_name, author_role, body, kind)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, dept_role, author_id, author_name, author_role, kind, body,
               to_char(created_at AT TIME ZONE 'UTC', ${ISO}) AS created_at,
               true AS mine`,
    [
      input.orderId,
      input.lane,
      input.authorId,
      input.authorName,
      input.authorRole,
      input.body,
      input.kind ?? "note",
    ]
  );
  return result.rows[0];
}
/** Mark one lane read up to now for this user. */
export async function markLaneRead(
  userId: string,
  orderId: string,
  lane: string
): Promise<void> {
  await query(
    `INSERT INTO order_message_reads (user_id, order_id, dept_role, last_read_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (user_id, order_id, dept_role)
     DO UPDATE SET last_read_at = now()`,
    [userId, orderId, lane]
  );
}
