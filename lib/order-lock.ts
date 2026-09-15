// Sections and lists an order carries no work for, and so accepts no entries
// into. Distinct from a department's status reading N/A: that is a statement
// about progress, this refuses the data.
//
// Plain module (no server imports): the forms hide what the actions refuse,
// and both read this so they cannot disagree.

import type { ChildTable, OrderTable } from "@/lib/order-schema";

/** The order columns the rules below look at. */
export type LockFacts = {
  /** Every payment term counted from receipt — see isAfterReceiptOnly. */
  after_receipt_only?: unknown;
  bill_type?: unknown;
};

/**
 * Why this section or list takes no entries on this order, or null when it
 * does. Paid after receipt means no proforma to raise and no receipt to
 * confirm, so the PI list and the Accounts section are closed — while the
 * dispatch invoice, which is a different record, carries on as normal.
 */
export function lockReason(
  table: OrderTable | ChildTable,
  order: LockFacts | null | undefined
): string | null {
  if (!order) return null;
  if (order.after_receipt_only !== true) return null;
  if (table === "order_billing_docs") {
    return "This order is paid after receipt, so there is no PI to raise.";
  }
  if (table === "order_accounts") {
    return "This order is paid after receipt, so there is no payment to confirm here.";
  }
  return null;
}

/** Shorthand for the places that only need the yes/no. */
export function isLocked(
  table: OrderTable | ChildTable,
  order: LockFacts | null | undefined
): boolean {
  return lockReason(table, order) !== null;
}
