import { query } from "@/lib/db";
import { isCentral } from "@/lib/roles";
import { SECTION_BY_TABLE, type OrderTable } from "@/lib/order-schema";

type Row = Record<string, unknown> | null;

export type NotificationType =
  | "payment_terms"
  | "target_date"
  | "dept_update"
  // No longer emitted — department saves are all reported as "dept_update"
  // now. Kept so notifications already stored still render.
  | "dept_complete";

export type NotificationRow = {
  id: string;
  order_id: string | null;
  type: NotificationType;
  message: string;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Recipient targeting
// ---------------------------------------------------------------------------

/**
 * Which recipient_role values a user should see. Admin also sees the Central
 * Visibility feed (department-completion events); everyone else sees only
 * notifications addressed to their own role.
 */
export function recipientRolesForUser(role: string): string[] {
  if (role === "admin") return ["admin", "central_visibility"];
  return [role];
}

// ---------------------------------------------------------------------------
// Reads (for the bell)
// ---------------------------------------------------------------------------

export async function listNotifications(
  roles: string[],
  limit = 30
): Promise<NotificationRow[]> {
  if (roles.length === 0) return [];
  const result = await query<NotificationRow>(
    `SELECT id, order_id, type, message,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
       FROM notifications
      WHERE recipient_role = ANY($1)
      ORDER BY created_at DESC
      LIMIT $2`,
    [roles, limit]
  );
  return result.rows;
}

export async function countUnread(
  roles: string[],
  seenAt: string | null
): Promise<number> {
  if (roles.length === 0) return 0;
  const result = await query<{ count: string }>(
    `SELECT count(*)::text AS count
       FROM notifications
      WHERE recipient_role = ANY($1)
        AND ($2::timestamptz IS NULL OR created_at > $2)`,
    [roles, seenAt]
  );
  return Number(result.rows[0]?.count ?? 0);
}

// ---------------------------------------------------------------------------
// Emitting
// ---------------------------------------------------------------------------

/** Insert one notification row per recipient role. */
async function emit(
  roles: string[],
  input: { orderId: string; type: NotificationType; message: string }
): Promise<void> {
  const unique = [...new Set(roles)];
  if (unique.length === 0) return;
  // One INSERT with a row per role.
  const values = unique
    .map((_, i) => `($${i + 1}, $${unique.length + 1}, $${unique.length + 2}, $${unique.length + 3})`)
    .join(", ");
  await query(
    `INSERT INTO notifications (recipient_role, order_id, type, message)
     VALUES ${values}`,
    [...unique, input.orderId, input.type, input.message]
  );
}

/** True when any field in the section actually differs after the save. */
function sectionChanged(table: OrderTable, before: Row, after: Row): boolean {
  const norm = (row: Row, col: string) => {
    const v = row?.[col];
    return v === null || v === undefined ? "" : String(v).trim();
  };
  const fields = SECTION_BY_TABLE.get(table)?.fields ?? [];
  return fields.some((f) => norm(before, f.column) !== norm(after, f.column));
}

// A target-date column → the departments that should be told it's now set.
const TARGET_DATE_RECIPIENTS: Partial<
  Record<OrderTable, { column: string; label: string; roles: string[] }[]>
> = {
  orders: [
    { column: "drg_target_date", label: "DRG target date", roles: ["drawing"] },
    // Order-level dispatch target is what Planning works to; the dispatch team
    // has its own target date (below, in order_assembly_dispatch).
    {
      column: "dispatch_target_date",
      label: "Dispatch target date",
      roles: ["planning"],
    },
    // A revision matters just as much to Planning as the original date.
    {
      column: "dispatch_target_revised_date",
      label: "Revised dispatch target date",
      roles: ["planning"],
    },
  ],
  order_planning: [
    {
      column: "purchase_target_date",
      label: "Purchase target date",
      roles: ["purchase"],
    },
  ],
  order_qc: [
    {
      column: "qc_doc_target_date",
      label: "QC document target date",
      roles: ["qc"],
    },
  ],
  order_assembly_dispatch: [
    {
      column: "dispatch_team_target_date",
      label: "Dispatch team target date",
      roles: ["dispatch"],
    },
  ],
};

/**
 * Emit any notifications triggered by a section being saved:
 *  - payment terms filled → Billing & Operations + Accounts
 *  - a target date newly set → the department that works to it
 *  - ANY department edit → Central Visibility (flagged as "completed" when the
 *    save is what finished that department's work)
 *
 * Field triggers fire only on an empty→filled transition, and the Central
 * Visibility notice only when a field actually changed, so re-saving an
 * unchanged section is silent. Central's own edits don't notify Central.
 * Never throws — notification failures must not break the save.
 */
export async function notifySectionSaved(params: {
  orderId: string;
  orderLabel: string;
  table: OrderTable;
  actorRole: string;
  before: Row;
  after: Row;
}): Promise<void> {
  const { orderId, orderLabel, table, actorRole, before, after } = params;
  try {
    const val = (row: Row, col: string) => {
      const v = row?.[col];
      return v === null || v === undefined ? "" : String(v).trim();
    };
    // Fires when a trigger field ends up with a value it didn't have before —
    // so both first-time entry and a later revision notify, while re-saving an
    // unchanged field stays silent. On order creation `before` is null, so
    // anything filled in on the create form notifies too.
    const setOrChanged = (col: string) => {
      const now = val(after, col);
      return now !== "" && now !== val(before, col);
    };

    // Payment terms → Billing & Operations + Accounts.
    if (table === "orders" && setOrChanged("payment_terms")) {
      await emit(["operations", "accounts"], {
        orderId,
        type: "payment_terms",
        message: `Payment terms set for ${orderLabel}`,
      });
    }

    // Target dates → the departments that work to them.
    for (const t of TARGET_DATE_RECIPIENTS[table] ?? []) {
      if (setOrChanged(t.column)) {
        await emit(t.roles, {
          orderId,
          type: "target_date",
          message: `${t.label} set for ${orderLabel}`,
        });
      }
    }

    // Any department edit → Central Visibility, reported uniformly as an
    // update (no special-casing for the save that completes a section).
    if (!isCentral(actorRole) && sectionChanged(table, before, after)) {
      const dept = SECTION_BY_TABLE.get(table)?.title ?? "A department";
      await emit(["central_visibility"], {
        orderId,
        type: "dept_update",
        message: `${dept} updated ${orderLabel}`,
      });
    }
  } catch (error) {
    console.error("notifySectionSaved failed:", error);
  }
}
